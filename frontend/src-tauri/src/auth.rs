use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
  io::{Read, Write},
  net::TcpListener,
  sync::{Mutex, OnceLock},
  time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::Manager;
use url::Url;
use uuid::Uuid;

const SERVICE: &str = "MeetPulse";
const ACCOUNT: &str = "google-oauth";
const REFRESH_SKEW_SECS: u64 = 60;
const TOKEN_EXCHANGE_TIMEOUT: Duration = Duration::from_secs(15);
const PERMANENT_GOOGLE_AUTH_ERRORS: &[&str] = &[
  "invalid_grant",
  "invalid_client",
  "unauthorized_client",
  "access_denied",
];

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredGoogleSession {
  #[serde(default, skip_serializing)]
  pub id_token: String,
  pub refresh_token: String,
  pub email: String,
  pub name: Option<String>,
  pub expires_at: u64,
  pub client_id: String,
}

#[derive(Clone)]
struct LiveIdToken {
  id_token: String,
  expires_at: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleSession {
  pub id_token: String,
  pub email: String,
  pub name: Option<String>,
  pub expires_at: u64,
  pub stale: bool,
  pub reauth_required: bool,
}

#[derive(Deserialize)]
struct TokenResponse {
  #[serde(default)]
  id_token: Option<String>,
  refresh_token: Option<String>,
  expires_in: u64,
}

fn entry() -> Result<Entry, String> { Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string()) }
fn now() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() }
fn load() -> Result<Option<StoredGoogleSession>, String> {
  match entry()?.get_password() {
    Ok(value) => serde_json::from_str(&value).map(Some).map_err(|e| e.to_string()),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(e) => Err(e.to_string()),
  }
}
fn live_id_token() -> &'static Mutex<Option<LiveIdToken>> {
  static LIVE: OnceLock<Mutex<Option<LiveIdToken>>> = OnceLock::new();
  LIVE.get_or_init(|| Mutex::new(None))
}

fn remember_live_id_token(id_token: &str, expires_at: u64) {
  if id_token.is_empty() { return; }
  *live_id_token().lock().unwrap_or_else(|error| error.into_inner()) = Some(LiveIdToken {
    id_token: id_token.to_string(),
    expires_at,
  });
}

fn attach_live_id_token(session: &mut StoredGoogleSession) {
  if !session.id_token.is_empty() { return; }
  if let Some(live) = live_id_token().lock().unwrap_or_else(|error| error.into_inner()).as_ref() {
    session.id_token = live.id_token.clone();
  }
}

fn save(session: &StoredGoogleSession) -> Result<(), String> {
  remember_live_id_token(&session.id_token, session.expires_at);
  let payload = serde_json::to_string(session).map_err(|e| e.to_string())?;
  let utf16_len = payload.encode_utf16().count();
  if utf16_len > 2560 {
    return Err(format!("Google session payload is too large for the Windows credential store ({utf16_len} UTF-16 chars)"));
  }
  entry()?.set_password(&payload).map_err(|e| e.to_string())?;
  match load()? {
    Some(stored) if stored.refresh_token == session.refresh_token => {
      log::info!("Google auth store: persisted identity for {} ({} UTF-16 chars)", stored.email, utf16_len);
      Ok(())
    }
    Some(_) => Err("Google session was written but the stored refresh token did not match".into()),
    None => Err("Google session was written but could not be read back from the OS credential store".into()),
  }
}
fn claims(token: &str) -> Result<(String, Option<String>), String> { let payload = token.split('.').nth(1).ok_or("Invalid ID token")?; let decoded = URL_SAFE_NO_PAD.decode(payload).map_err(|_| "Invalid ID token")?; let value: serde_json::Value = serde_json::from_slice(&decoded).map_err(|_| "Invalid ID token")?; Ok((value.get("email").and_then(|v| v.as_str()).ok_or("Google did not return an email")?.to_string(), value.get("name").and_then(|v| v.as_str()).map(str::to_string))) }

fn refresh_lock() -> &'static Mutex<()> {
  static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
  LOCK.get_or_init(|| Mutex::new(()))
}

impl GoogleSession {
  fn from_stored(session: &StoredGoogleSession, stale: bool, reauth_required: bool) -> Self {
    Self {
      id_token: session.id_token.clone(),
      email: session.email.clone(),
      name: session.name.clone(),
      expires_at: session.expires_at,
      stale,
      reauth_required,
    }
  }
}

fn should_refresh(expires_at: u64, current_time: u64, force_refresh: bool) -> bool {
  force_refresh || expires_at <= current_time.saturating_add(REFRESH_SKEW_SECS)
}

fn is_permanent_google_auth_error(reason: &str) -> bool {
  let message = reason.to_ascii_lowercase();
  PERMANENT_GOOGLE_AUTH_ERRORS.iter().any(|code| message.contains(code))
}

fn google_session_after_refresh_attempt(
  stored: &StoredGoogleSession,
  refresh_result: Result<StoredGoogleSession, String>,
) -> GoogleSession {
  match refresh_result {
    Ok(updated) => GoogleSession::from_stored(&updated, false, false),
    Err(error) => {
      log::warn!("Google session refresh failed: {error}");
      GoogleSession::from_stored(stored, true, is_permanent_google_auth_error(&error))
    }
  }
}

fn nonempty(value: Option<String>) -> Option<String> {
  value.and_then(|item| {
    let trimmed = item.trim().to_string();
    if trimmed.is_empty() { None } else { Some(trimmed) }
  })
}

fn apply_token_response(
  mut session: StoredGoogleSession,
  token: TokenResponse,
  client_id: &str,
  issued_at: u64,
) -> Result<(StoredGoogleSession, bool), String> {
  if let Some(refresh_token) = nonempty(token.refresh_token) {
    session.refresh_token = refresh_token;
  }
  session.client_id = client_id.to_string();
  let Some(id_token) = nonempty(token.id_token) else {
    return Ok((session, false));
  };
  let (email, name) = claims(&id_token)?;
  session.id_token = id_token;
  session.email = email;
  session.name = name;
  session.expires_at = issued_at.saturating_add(token.expires_in);
  Ok((session, true))
}

fn exchange(params: Vec<(&str, String)>) -> Result<TokenResponse, String> {
  let client = reqwest::blocking::Client::builder()
    .timeout(TOKEN_EXCHANGE_TIMEOUT)
    .build()
    .map_err(|e| e.to_string())?;
  let response = client.post("https://oauth2.googleapis.com/token").form(&params).send().map_err(|e| e.to_string())?;
  if !response.status().is_success() {
    let status = response.status();
    let detail = response.text().unwrap_or_else(|_| "Google returned no error detail".to_string());
    return Err(format!("Google token exchange failed ({status}): {detail}"));
  }
  response.json().map_err(|e| e.to_string())
}

fn refresh(session: StoredGoogleSession, client_id: &str, client_secret: Option<String>) -> Result<StoredGoogleSession, String> {
  let mut params = vec![("client_id", client_id.to_string()), ("refresh_token", session.refresh_token.clone()), ("grant_type", "refresh_token".to_string())];
  if let Some(secret) = client_secret.filter(|value| !value.is_empty()) { params.push(("client_secret", secret)); }
  let token = exchange(params)?;
  let (session, got_id_token) = apply_token_response(session, token, client_id, now())?;
  save(&session)?;
  if !got_id_token {
    return Err("Google token refresh did not return an ID token".into());
  }
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

fn stored_to_renderer(session: &StoredGoogleSession) -> GoogleSession {
  let mut session = session.clone();
  attach_live_id_token(&mut session);
  let stale = session.id_token.is_empty() || should_refresh(session.expires_at, now(), false);
  GoogleSession::from_stored(&session, stale, false)
}

#[tauri::command]
pub fn peek_google_auth_session() -> Result<Option<GoogleSession>, String> {
  let session = load()?;
  log::info!("Google auth peek: present={}", session.is_some());
  Ok(session.as_ref().map(stored_to_renderer))
}

#[tauri::command]
pub fn get_google_auth_token(client_id: String, client_secret: Option<String>, force_refresh: bool) -> Result<Option<GoogleSession>, String> {
  let _guard = refresh_lock().lock().unwrap_or_else(|error| error.into_inner());
  let Some(mut session) = load()? else {
    log::info!("Google auth token: no stored credential");
    return Ok(None);
  };
  attach_live_id_token(&mut session);
  if !session.id_token.is_empty() && !should_refresh(session.expires_at, now(), force_refresh) {
    log::info!("Google auth token: reusing live identity for {}", session.email);
    return Ok(Some(GoogleSession::from_stored(&session, false, false)));
  }
  let client_id = if client_id.is_empty() { session.client_id.clone() } else { client_id };
  if client_id.is_empty() {
    log::warn!("Google auth token: missing client id, returning stale identity");
    return Ok(Some(GoogleSession::from_stored(&session, true, false)));
  }
  log::info!("Google auth token: refreshing identity for {} (force={force_refresh})", session.email);
  let next = google_session_after_refresh_attempt(&session, refresh(session.clone(), &client_id, client_secret));
  log::info!(
    "Google auth token: refresh finished stale={} reauthRequired={}",
    next.stale,
    next.reauth_required
  );
  Ok(Some(next))
}

#[tauri::command]
pub fn debug_expire_google_session() -> Result<GoogleSession, String> {
  if !cfg!(debug_assertions) {
    return Err("debug_expire_google_session is only available in development builds".into());
  }
  let Some(mut session) = load()? else { return Err("No Google session is stored".into()); };
  session.expires_at = now();
  save(&session)?;
  log::warn!("Google auth debug: marked stored session as expired");
  Ok(stored_to_renderer(&session))
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
    let id_token = nonempty(token.id_token).ok_or("Google did not return an ID token")?;
    let refresh_token = nonempty(token.refresh_token).ok_or("Google did not return a refresh token")?;
    let (email, name) = claims(&id_token)?;
    let session = StoredGoogleSession { id_token, refresh_token, email, name, expires_at: now() + token.expires_in, client_id };
    save(&session)?;
    Ok(GoogleSession::from_stored(&session, false, false))
  })();
  match result {
    Ok(session) => { write_callback_response(&mut stream, "200 OK", callback_page(true))?; focus_main_window(&app); Ok(session) }
    Err(error) => { let _ = write_callback_response(&mut stream, "400 Bad Request", callback_page(false)); Err(error) }
  }
}

#[tauri::command]
pub fn sign_out_google() -> Result<(), String> { match entry()?.delete_credential() { Ok(()) | Err(keyring::Error::NoEntry) => Ok(()), Err(e) => Err(e.to_string()) } }

#[cfg(test)]
mod tests {
  use super::*;

  fn stored_session() -> StoredGoogleSession {
    StoredGoogleSession {
      id_token: "header.payload.signature".into(),
      refresh_token: "refresh-secret".into(),
      email: "user@example.com".into(),
      name: Some("Test User".into()),
      expires_at: 4_000,
      client_id: "desktop-client".into(),
    }
  }

  fn token_response(id_token: Option<&str>, refresh_token: Option<&str>, expires_in: u64) -> TokenResponse {
    TokenResponse {
      id_token: id_token.map(str::to_string),
      refresh_token: refresh_token.map(str::to_string),
      expires_in,
    }
  }

  fn signed_id_token(email: &str, name: &str) -> String {
    let payload = URL_SAFE_NO_PAD.encode(format!(r#"{{"email":"{email}","name":"{name}"}}"#));
    format!("header.{payload}.signature")
  }

  #[test]
  fn refreshes_inside_the_expiration_skew() {
    assert!(!should_refresh(4_000, 3_900, false));
    assert!(should_refresh(4_000, 3_940, false));
    assert!(should_refresh(4_000, 4_001, false));
  }

  #[test]
  fn forced_refresh_ignores_remaining_token_lifetime() {
    assert!(should_refresh(4_000, 1_000, true));
  }

  #[test]
  fn persisted_session_omits_the_id_token_and_fits_windows_limit() {
    let payload = serde_json::to_string(&stored_session()).unwrap();
    assert!(!payload.contains("header.payload.signature"));
    assert!(payload.contains("refresh-secret"));
    assert!(payload.encode_utf16().count() < 2560);
  }

  #[test]
  fn renderer_session_does_not_serialize_refresh_credentials() {
    let value = serde_json::to_value(GoogleSession::from_stored(&stored_session(), false, false)).unwrap();
    assert_eq!(value["idToken"], "header.payload.signature");
    assert_eq!(value["stale"], false);
    assert_eq!(value["reauthRequired"], false);
    assert!(value.get("refreshToken").is_none());
    assert!(value.get("clientId").is_none());
  }

  #[test]
  fn persists_rotated_refresh_token_without_extending_a_missing_id_token() {
    let (session, got_id_token) = apply_token_response(
      stored_session(),
      token_response(None, Some("rotated-refresh"), 3_600),
      "desktop-client",
      10_000,
    ).unwrap();
    assert!(!got_id_token);
    assert_eq!(session.refresh_token, "rotated-refresh");
    assert_eq!(session.id_token, "header.payload.signature");
    assert_eq!(session.expires_at, 4_000);
  }

  #[test]
  fn applies_a_new_id_token_and_lifetime() {
    let id_token = signed_id_token("new@example.com", "New User");
    let (session, got_id_token) = apply_token_response(
      stored_session(),
      token_response(Some(&id_token), None, 3_600),
      "desktop-client",
      10_000,
    ).unwrap();
    assert!(got_id_token);
    assert_eq!(session.id_token, id_token);
    assert_eq!(session.email, "new@example.com");
    assert_eq!(session.name.as_deref(), Some("New User"));
    assert_eq!(session.expires_at, 13_600);
    assert_eq!(session.refresh_token, "refresh-secret");
  }

  #[test]
  fn keeps_existing_refresh_token_when_google_omits_a_new_one() {
    let (session, got_id_token) = apply_token_response(
      stored_session(),
      token_response(None, None, 3_600),
      "desktop-client",
      10_000,
    ).unwrap();
    assert!(!got_id_token);
    assert_eq!(session.refresh_token, "refresh-secret");
  }

  #[test]
  fn classifies_only_terminal_oauth_errors_as_permanent() {
    assert!(is_permanent_google_auth_error(r#"Google token exchange failed (400): {"error":"invalid_grant"}"#));
    assert!(is_permanent_google_auth_error("invalid_client"));
    assert!(!is_permanent_google_auth_error("error decoding response body: missing field `id_token`"));
    assert!(!is_permanent_google_auth_error("error sending request for url"));
  }

  #[test]
  fn failed_refresh_keeps_stored_identity_instead_of_signing_out() {
    let transient = google_session_after_refresh_attempt(&stored_session(), Err("network request timed out".into()));
    assert!(transient.stale);
    assert!(!transient.reauth_required);
    assert_eq!(transient.email, "user@example.com");

    let permanent = google_session_after_refresh_attempt(
      &stored_session(),
      Err(r#"Google token exchange failed (400): {"error":"invalid_grant"}"#.into()),
    );
    assert!(permanent.stale);
    assert!(permanent.reauth_required);
    assert_eq!(permanent.id_token, "header.payload.signature");
  }
}
