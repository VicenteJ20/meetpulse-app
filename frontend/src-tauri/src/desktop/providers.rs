use crate::{database::repositories::setting::SettingsRepository, state::AppState};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{hash_map::DefaultHasher, HashMap},
    hash::{Hash, Hasher},
    time::{Duration, Instant},
};
use tauri::Manager;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderModel {
    pub id: String,
    pub name: String,
    pub text: Option<bool>,
    pub audio: Option<bool>,
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
}
#[derive(Clone, Serialize)]
pub struct Catalog {
    pub models: Vec<ProviderModel>,
    pub cached: bool,
    pub stale: bool,
    pub error: Option<String>,
}
static CACHE: Lazy<Mutex<HashMap<u64, (Instant, Vec<ProviderModel>)>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

pub async fn context_limit(provider: &str, model: &str) -> usize {
    if provider == "builtin-ai" {
        return crate::summary::summary_engine::models::get_model_by_name(model)
            .map(|m| m.context_size as usize)
            .unwrap_or(8192)
            .min(32768);
    }
    CACHE
        .lock()
        .await
        .values()
        .flat_map(|(_, models)| models)
        .filter(|m| m.id == model)
        .filter_map(|m| m.input_tokens)
        .min()
        .unwrap_or(8192)
        .min(32768) as usize
}

pub async fn credential(state: &AppState, provider: &str, purpose: &str) -> Result<String, String> {
    let pool = state.db_manager.pool();
    let key = if purpose == "transcription" {
        SettingsRepository::get_transcript_api_key(pool, provider).await
    } else {
        SettingsRepository::get_api_key(pool, provider).await
    }
    .map_err(|e| e.to_string())?;
    Ok(key.unwrap_or_default())
}

#[tauri::command]
pub async fn desktop_list_models(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    provider: String,
    purpose: String,
    api_key: Option<String>,
    endpoint: Option<String>,
    refresh: Option<bool>,
) -> Result<Catalog, String> {
    if provider == "builtin-ai" {
        let root = app.path().app_data_dir().map_err(|e| e.to_string())?;
        let models = crate::summary::summary_engine::models::get_available_models()
            .into_iter()
            .filter(|m| {
                crate::summary::summary_engine::models::get_model_path(&root, &m.name)
                    .map(|p| p.exists())
                    .unwrap_or(false)
            })
            .map(|m| ProviderModel {
                id: m.name.clone(),
                name: m.name,
                text: Some(true),
                audio: Some(false),
                input_tokens: Some(m.context_size as u64),
                output_tokens: None,
            })
            .collect();
        return Ok(Catalog {
            models,
            cached: false,
            stale: false,
            error: None,
        });
    }
    let endpoint = if provider == "custom-openai" && endpoint.is_none() {
        SettingsRepository::get_custom_openai_config(state.db_manager.pool())
            .await
            .map_err(|e| e.to_string())?
            .map(|c| c.endpoint)
    } else {
        endpoint
    };
    let key = match api_key {
        Some(k) => k,
        None => credential(&state, &provider, &purpose).await?,
    };
    let mut hasher = DefaultHasher::new();
    (&provider, &key, &endpoint).hash(&mut hasher);
    let hash = hasher.finish();
    let cached = CACHE.lock().await.get(&hash).cloned();
    if let Some((at, models)) = &cached {
        if !refresh.unwrap_or(false) && at.elapsed() < Duration::from_secs(300) {
            return Ok(Catalog {
                models: models.clone(),
                cached: true,
                stale: false,
                error: None,
            });
        }
    }
    match fetch_models(&provider, &key, endpoint.as_deref()).await {
        Ok(models) => {
            let mut cache = CACHE.lock().await;
            if cache.len() > 32 {
                cache.clear();
            }
            cache.insert(hash, (Instant::now(), models.clone()));
            Ok(Catalog {
                models,
                cached: false,
                stale: false,
                error: None,
            })
        }
        Err(error) => match cached {
            Some((_, models)) => Ok(Catalog {
                models,
                cached: true,
                stale: true,
                error: Some(error),
            }),
            None => Err(error),
        },
    }
}
async fn fetch_models(
    provider: &str,
    key: &str,
    endpoint: Option<&str>,
) -> Result<Vec<ProviderModel>, String> {
    let base = match provider {
        "gemini" => "https://generativelanguage.googleapis.com/v1beta/models".into(),
        "openai" => "https://api.openai.com/v1/models".into(),
        "groq" => "https://api.groq.com/openai/v1/models".into(),
        "claude" => "https://api.anthropic.com/v1/models".into(),
        "openrouter" => "https://openrouter.ai/api/v1/models".into(),
        "ollama" => format!(
            "{}/api/tags",
            endpoint
                .unwrap_or("http://localhost:11434")
                .trim_end_matches('/')
        ),
        "custom-openai" => format!(
            "{}/models",
            endpoint
                .ok_or("Configure endpoint first")?
                .trim_end_matches('/')
        ),
        _ => return Err("This provider uses its installed model manager".into()),
    };
    fetch_models_at(provider, key, &base).await
}
async fn fetch_models_at(
    provider: &str,
    key: &str,
    base: &str,
) -> Result<Vec<ProviderModel>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let mut models = Vec::new();
    let mut page = String::new();
    let mut seen = std::collections::HashSet::new();
    for _ in 0..100 {
        let mut req = client.get(base);
        if provider == "gemini" {
            req = req
                .header("x-goog-api-key", key)
                .query(&[("pageSize", "1000")]);
            if !page.is_empty() {
                req = req.query(&[("pageToken", &page)]);
            }
        } else if provider == "claude" {
            req = req
                .header("x-api-key", key)
                .header("anthropic-version", "2023-06-01");
            if !page.is_empty() {
                req = req.query(&[("after_id", &page)]);
            }
        } else if !key.is_empty() {
            req = req.bearer_auth(key);
        }
        let response = req.send().await.map_err(|e| {
            format!(
                "Model catalog connection failed: {}",
                if e.is_timeout() { "timeout" } else { "network" }
            )
        })?;
        if !response.status().is_success() {
            return Err(format!("Model catalog: HTTP {}", response.status()));
        }
        let value: Value = response.json().await.map_err(|_| "Invalid model catalog")?;
        let items = value
            .get(if provider == "gemini" || provider == "ollama" {
                "models"
            } else {
                "data"
            })
            .and_then(Value::as_array)
            .ok_or("Invalid model list")?;
        for m in items {
            let id = m
                .get("id")
                .or_else(|| m.get("name"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim_start_matches("models/")
                .to_string();
            if id.is_empty() {
                continue;
            }
            let text = provider != "gemini"
                || m["supportedGenerationMethods"]
                    .as_array()
                    .map(|a| a.iter().any(|v| v == "generateContent"))
                    .unwrap_or(false);
            if !text {
                continue;
            }
            models.push(ProviderModel {
                name: m
                    .get("displayName")
                    .or_else(|| m.get("display_name"))
                    .or_else(|| m.get("name"))
                    .and_then(Value::as_str)
                    .unwrap_or(&id)
                    .to_string(),
                id,
                text: if provider == "gemini" || provider == "claude" {
                    Some(true)
                } else {
                    m.pointer("/architecture/output_modalities")
                        .and_then(Value::as_array)
                        .map(|items| items.iter().any(|v| v == "text"))
                },
                audio: m
                    .pointer("/architecture/input_modalities")
                    .and_then(Value::as_array)
                    .map(|items| items.iter().any(|v| v == "audio")),
                input_tokens: m
                    .get("inputTokenLimit")
                    .or_else(|| m.get("context_length"))
                    .and_then(Value::as_u64),
                output_tokens: m.get("outputTokenLimit").and_then(Value::as_u64),
            });
        }
        let next = if provider == "claude" && value["has_more"] == true {
            value["last_id"].as_str()
        } else {
            value["nextPageToken"].as_str()
        };
        match next.filter(|s| !s.is_empty()) {
            Some(n) if seen.insert(n.to_string()) => page = n.to_string(),
            _ => break,
        }
    }
    models.sort_by(|a, b| a.id.cmp(&b.id));
    models.dedup_by(|a, b| a.id == b.id);
    Ok(models)
}

#[tauri::command]
pub async fn desktop_test_gemini_audio(
    state: tauri::State<'_, AppState>,
    model: String,
    api_key: Option<String>,
) -> Result<bool, String> {
    // A bundled PCM tone checks the audio MIME request path without sending private recordings.
    use crate::audio::transcription::provider::TranscriptionProvider;
    let key = match api_key {
        Some(k) => k,
        None => credential(&state, "gemini", "transcription").await?,
    };
    let engine = crate::audio::transcription::gemini_provider::GeminiTranscriptionProvider::new(
        key,
        model.trim_start_matches("models/").to_string(),
    )
    .map_err(|e| e.to_string())?;
    engine
        .transcribe(vec![0.0; 16000], Some("es".into()))
        .await
        .map_err(|e| e.to_string())?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    async fn server(
        responses: Vec<(u16, Value)>,
    ) -> (String, tokio::task::JoinHandle<Vec<String>>) {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}/models", listener.local_addr().unwrap());
        let task = tokio::spawn(async move {
            let mut requests = vec![];
            for (status, body) in responses {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut bytes = vec![0; 8192];
                let n = stream.read(&mut bytes).await.unwrap();
                requests.push(String::from_utf8_lossy(&bytes[..n]).to_string());
                let data = body.to_string();
                let response=format!("HTTP/1.1 {} OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",status,data.len(),data);
                stream.write_all(response.as_bytes()).await.unwrap();
            }
            requests
        });
        (url, task)
    }
    #[tokio::test]
    async fn gemini_catalog_pages_filters_methods_and_normalizes_ids() {
        let(url,task)=server(vec![(200,serde_json::json!({"models":[{"name":"models/text-a","displayName":"A","supportedGenerationMethods":["generateContent"],"inputTokenLimit":32000},{"name":"models/embed","supportedGenerationMethods":["embedContent"]}],"nextPageToken":"second"})),(200,serde_json::json!({"models":[{"name":"models/text-b","supportedGenerationMethods":["generateContent"]}]}))]).await;
        let models = fetch_models_at("gemini", "mock-key", &url).await.unwrap();
        assert_eq!(
            models.iter().map(|m| m.id.as_str()).collect::<Vec<_>>(),
            vec!["text-a", "text-b"]
        );
        assert_eq!(models[0].input_tokens, Some(32000));
        assert_eq!(models[0].audio, None);
        let requests = task.await.unwrap();
        assert!(requests[0]
            .to_lowercase()
            .contains("x-goog-api-key: mock-key"));
        assert!(requests[1].contains("pageToken=second"));
    }
    #[tokio::test]
    async fn auth_and_rate_limit_errors_are_not_successful_fallback_catalogs() {
        for status in [401, 429] {
            let (url, task) =
                server(vec![(status, serde_json::json!({"error":"unavailable"}))]).await;
            assert!(fetch_models_at("gemini", "bad", &url)
                .await
                .unwrap_err()
                .contains(&status.to_string()));
            task.await.unwrap();
        }
    }
}
