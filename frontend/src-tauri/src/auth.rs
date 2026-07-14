use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{io::{Read, Write}, net::TcpListener, time::{SystemTime, UNIX_EPOCH}};
use tauri::Manager;
use url::Url;
use uuid::Uuid;

const SERVICE: &str = "MeetPulse";
const ACCOUNT: &str = "google-oauth";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleSession { pub id_token: String, pub refresh_token: String, pub email: String, pub name: Option<String>, pub expires_at: u64, pub client_id: String }
#[derive(Deserialize)] struct TokenResponse { id_token: String, refresh_token: Option<String>, expires_in: u64 }

fn entry() -> Result<Entry, String> { Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string()) }
fn now() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() }
fn load() -> Result<Option<GoogleSession>, String> { match entry()?.get_password() { Ok(value) => serde_json::from_str(&value).map(Some).map_err(|e| e.to_string()), Err(keyring::Error::NoEntry) => Ok(None), Err(e) => Err(e.to_string()) } }
fn save(session: &GoogleSession) -> Result<(), String> { entry()?.set_password(&serde_json::to_string(session).map_err(|e| e.to_string())?).map_err(|e| e.to_string()) }
fn claims(token: &str) -> Result<(String, Option<String>), String> { let payload = token.split('.').nth(1).ok_or("Invalid ID token")?; let decoded = URL_SAFE_NO_PAD.decode(payload).map_err(|_| "Invalid ID token")?; let value: serde_json::Value = serde_json::from_slice(&decoded).map_err(|_| "Invalid ID token")?; Ok((value.get("email").and_then(|v| v.as_str()).ok_or("Google did not return an email")?.to_string(), value.get("name").and_then(|v| v.as_str()).map(str::to_string))) }

fn exchange(params: Vec<(&str, String)>) -> Result<TokenResponse, String> {
  let response = reqwest::blocking::Client::new().post("https://oauth2.googleapis.com/token").form(&params).send().map_err(|e| e.to_string())?;
  if !response.status().is_success() {
    let status = response.status();
    let detail = response.text().unwrap_or_else(|_| "Google returned no error detail".to_string());
    return Err(format!("Google token exchange failed ({status}): {detail}"));
  }
  response.json().map_err(|e| e.to_string())
}

fn refresh(mut session: GoogleSession, client_id: &str, client_secret: Option<String>) -> Result<GoogleSession, String> {
  let mut params = vec![("client_id", client_id.to_string()), ("refresh_token", session.refresh_token.clone()), ("grant_type", "refresh_token".to_string())];
  if let Some(secret) = client_secret.filter(|value| !value.is_empty()) { params.push(("client_secret", secret)); }
  let token = exchange(params)?;
  session.id_token = token.id_token;
  session.expires_at = now() + token.expires_in.saturating_sub(30);
  session.client_id = client_id.to_string();
  let (email, name) = claims(&session.id_token)?;
  session.email = email;
  session.name = name;
  save(&session)?;
  Ok(session)
}

fn callback_page(success: bool) -> &'static str {
  if success {
    r#"<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MeetPulse</title><style>html,body{height:100%;margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:#f8fafc;color:#0f172a}body{display:grid;place-items:center}.message{max-width:420px;padding:32px;text-align:center}h1{margin:0;font-size:28px;letter-spacing:-.03em}p{margin:12px 0 0;color:#64748b;line-height:1.6;font-size:15px}</style></head><body><main class="message"><h1>Sign-in complete</h1><p>Returning to MeetPulse…</p></main><script>setTimeout(()=>window.close(),900)</script></body></html>"#
  } else {
    r#"<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MeetPulse sign-in</title><style>html,body{height:100%;margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:#f8fafc;color:#0f172a}body{display:grid;place-items:center}.message{max-width:420px;padding:32px;text-align:center}h1{margin:0;font-size:28px;letter-spacing:-.03em}p{margin:12px 0 0;color:#64748b;line-height:1.6;font-size:15px}</style></head><body><main class="message"><h1>Sign-in wasn’t completed</h1><p>Return to MeetPulse and try again.</p></main></body></html>"#
  }
}

fn write_callback_response(stream: &mut std::net::TcpStream, status: &str, page: &str) -> Result<(), String> {
  let response = format!("HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{page}", page.len());
  stream.write_all(response.as_bytes()).map_err(|e| e.to_string())?;
  stream.flush().map_err(|e| e.to_string())
}

fn focus_main_window(app: &tauri::AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
  }
}

#[tauri::command]
pub fn get_google_auth_token(client_id: String, client_secret: Option<String>) -> Result<Option<GoogleSession>, String> {
  let Some(session) = load()? else { return Ok(None) };
  if session.expires_at > now() { return Ok(Some(session)); }
  if client_id.is_empty() { return Err("Google OAuth client ID is not configured".into()); }
  refresh(session, &client_id, client_secret).map(Some)
}

#[tauri::command]
pub fn sign_in_with_google(app: tauri::AppHandle, client_id: String, client_secret: Option<String>) -> Result<GoogleSession, String> {
  if client_id.trim().is_empty() { return Err("Google OAuth client ID is not configured".into()); }
  let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
  let redirect = format!("http://{}", listener.local_addr().map_err(|e| e.to_string())?);
  let state = Uuid::new_v4().to_string();
  let verifier = Uuid::new_v4().simple().to_string() + &Uuid::new_v4().simple().to_string();
  let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
  let mut url = Url::parse("https://accounts.google.com/o/oauth2/v2/auth").unwrap();
  url.query_pairs_mut().append_pair("client_id", &client_id).append_pair("redirect_uri", &redirect).append_pair("response_type", "code").append_pair("scope", "openid email profile").append_pair("access_type", "offline").append_pair("prompt", "consent").append_pair("code_challenge", &challenge).append_pair("code_challenge_method", "S256").append_pair("state", &state).append_pair("nonce", &Uuid::new_v4().to_string());
  webbrowser::open(url.as_str()).map_err(|e| e.to_string())?;
  let (mut stream, _) = listener.accept().map_err(|e| e.to_string())?;
  let mut request = [0; 8192];
  let size = stream.read(&mut request).map_err(|e| e.to_string())?;
  let first = String::from_utf8_lossy(&request[..size]);
  let path = first.split_whitespace().nth(1).ok_or("Invalid OAuth callback")?;
  let callback = Url::parse(&format!("http://localhost{path}")).map_err(|e| e.to_string())?;
  let pairs: std::collections::HashMap<_, _> = callback.query_pairs().into_owned().collect();
  let code = pairs.get("code").ok_or_else(|| pairs.get("error").cloned().unwrap_or_else(|| "Google login cancelled".to_string()))?;
  if pairs.get("state") != Some(&state) { return Err("Invalid OAuth state".into()); }
  let result = (|| -> Result<GoogleSession, String> {
    let mut params = vec![("code", code.clone()), ("client_id", client_id.clone()), ("redirect_uri", redirect.clone()), ("grant_type", "authorization_code".to_string()), ("code_verifier", verifier.clone())];
    if let Some(secret) = client_secret.clone().filter(|value| !value.is_empty()) { params.push(("client_secret", secret)); }
    let token = exchange(params)?;
    let (email, name) = claims(&token.id_token)?;
    let session = GoogleSession { id_token: token.id_token, refresh_token: token.refresh_token.ok_or("Google did not return a refresh token")?, email, name, expires_at: now() + token.expires_in.saturating_sub(30), client_id };
    save(&session)?;
    Ok(session)
  })();
  match result {
    Ok(session) => { write_callback_response(&mut stream, "200 OK", callback_page(true))?; focus_main_window(&app); Ok(session) }
    Err(error) => { let _ = write_callback_response(&mut stream, "400 Bad Request", callback_page(false)); Err(error) }
  }
}

#[tauri::command]
pub fn sign_out_google() -> Result<(), String> { match entry()?.delete_credential() { Ok(()) | Err(keyring::Error::NoEntry) => Ok(()), Err(e) => Err(e.to_string()) } }
