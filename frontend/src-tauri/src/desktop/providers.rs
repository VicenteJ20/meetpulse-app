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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProviderModel {
    pub id: String,
    pub name: String,
    pub text: Option<bool>,
    pub audio: Option<bool>,
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    #[serde(default)]
    pub model_type: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub input_modalities: Vec<String>,
    #[serde(default)]
    pub output_modalities: Vec<String>,
    #[serde(default)]
    pub zdr: Option<String>,
    #[serde(default)]
    pub no_training: Option<String>,
    #[serde(default)]
    pub price_input: Option<String>,
    #[serde(default)]
    pub price_output: Option<String>,
    #[serde(default)]
    pub transcription_per_second: Option<String>,
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

/// Catalog window for the chat path. Zero or a missing value falls back to 8192.
/// The chat model is not clamped at 32768: cloud models report 128k and, in some cases, 1M.
pub fn catalog_window_tokens(reported: Option<u64>) -> usize {
    reported
        .filter(|tokens| *tokens > 0)
        .map(|tokens| tokens as usize)
        .unwrap_or(8192)
}

fn model_window(models: &[ProviderModel], model: &str) -> Option<usize> {
    models
        .iter()
        .find(|item| item.id == model)
        .map(|item| catalog_window_tokens(item.input_tokens))
}

pub async fn context_limit(provider: &str, model: &str) -> usize {
    if provider == "builtin-ai" {
        return crate::summary::summary_engine::models::get_model_by_name(model)
            .map(|model| model.context_size as usize)
            .filter(|tokens| *tokens > 0)
            .unwrap_or(8192);
    }
    // Gateway listings are not stored in CACHE, so a cloud chat model must be read from its catalog.
    if provider == "vercel-gateway" {
        if let Ok((models, _)) = gateway_catalog(false).await {
            if let Some(window) = model_window(&models, model) {
                return window;
            }
        }
    }
    let reported = CACHE
        .lock()
        .await
        .values()
        .flat_map(|(_, models)| models)
        .filter(|item| item.id == model)
        .filter_map(|item| item.input_tokens)
        .min();
    catalog_window_tokens(reported)
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
    if provider == "vercel-gateway" {
        let (models, cached) = gateway_catalog(refresh.unwrap_or(false)).await?;
        return Ok(Catalog {
            models,
            cached,
            stale: false,
            error: None,
        });
    }
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
                model_type: "language".into(),
                ..Default::default()
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
                ..Default::default()
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

const GATEWAY_MODELS_URL: &str = "https://ai-gateway.vercel.sh/v1/models";
static GATEWAY_CATALOG: Lazy<Mutex<Option<(Instant, Vec<ProviderModel>)>>> =
    Lazy::new(|| Mutex::new(None));

/// Public model list. The API key is not sent: the catalog does not require one.
pub async fn gateway_catalog(refresh: bool) -> Result<(Vec<ProviderModel>, bool), String> {
    if !refresh {
        if let Some((at, models)) = GATEWAY_CATALOG.lock().await.as_ref() {
            if at.elapsed() < Duration::from_secs(300) {
                return Ok((models.clone(), true));
            }
        }
    }
    match fetch_gateway_catalog_http(GATEWAY_MODELS_URL).await {
        Ok(models) => {
            *GATEWAY_CATALOG.lock().await = Some((Instant::now(), models.clone()));
            Ok((models, false))
        }
        Err(error) => match GATEWAY_CATALOG.lock().await.clone() {
            Some((_, models)) => Ok((models, true)),
            None => Err(error),
        },
    }
}

pub async fn find_gateway_model(id: &str) -> Result<Option<ProviderModel>, String> {
    let (models, _) = gateway_catalog(false).await?;
    Ok(models.into_iter().find(|model| model.id == id))
}

/// A recorded WAV can be posted when the model accepts audio and is not websocket-only.
pub fn accepts_recorded_audio(model: &ProviderModel) -> bool {
    let socket = model.tags.iter().any(|tag| {
        tag == "websocket-transcription" || tag == "websocket-realtime"
    });
    !socket && model.input_modalities.iter().any(|item| item == "audio")
}

pub fn is_file_transcription_model(model: &ProviderModel) -> bool {
    accepts_recorded_audio(model) && model.model_type == "transcription"
}

async fn fetch_gateway_catalog_http(url: &str) -> Result<Vec<ProviderModel>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let response = client.get(url).send().await.map_err(|e| {
        format!(
            "Model catalog connection failed: {}",
            if e.is_timeout() { "timeout" } else { "network" }
        )
    })?;
    if !response.status().is_success() {
        return Err(format!("Model catalog: HTTP {}", response.status()));
    }
    let value: Value = response.json().await.map_err(|_| "Invalid model catalog")?;
    parse_gateway_catalog(&value)
}

pub fn parse_gateway_catalog(value: &Value) -> Result<Vec<ProviderModel>, String> {
    let items = value
        .get("data")
        .and_then(Value::as_array)
        .ok_or("Invalid model list")?;
    let mut models = Vec::new();
    for item in items {
        let Some(id) = item.get("id").and_then(Value::as_str).map(str::trim) else {
            continue;
        };
        if id.is_empty() {
            continue;
        }
        let tags = string_list(item.get("tags"));
        let input_modalities = string_list(item.pointer("/modalities/input"));
        let output_modalities = string_list(item.pointer("/modalities/output"));
        let model_type = item
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let pricing = item.get("pricing");
        models.push(ProviderModel {
            id: id.to_string(),
            name: item
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or(id)
                .to_string(),
            text: Some(
                output_modalities.iter().any(|item| item == "text") || model_type == "language",
            ),
            audio: Some(input_modalities.iter().any(|item| item == "audio")),
            input_tokens: item.get("context_window").and_then(Value::as_u64),
            output_tokens: item.get("max_tokens").and_then(Value::as_u64),
            model_type,
            tags,
            input_modalities,
            output_modalities,
            zdr: compliance_flag(item.get("zdr")),
            no_training: compliance_flag(item.get("no_training")),
            price_input: pricing
                .and_then(|value| value.get("input"))
                .and_then(Value::as_str)
                .map(str::to_string),
            price_output: pricing
                .and_then(|value| value.get("output"))
                .and_then(Value::as_str)
                .map(str::to_string),
            transcription_per_second: pricing
                .and_then(|value| value.get("transcription_duration_cost_per_second"))
                .and_then(Value::as_str)
                .map(str::to_string),
        });
    }
    Ok(models)
}

fn string_list(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn compliance_flag(value: Option<&Value>) -> Option<String> {
    match value.and_then(Value::as_str) {
        Some(flag @ ("all" | "some" | "none")) => Some(flag.to_string()),
        _ => None,
    }
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

/// Resultado de comprobar una clave del Vercel AI Gateway.
fn classify_gateway_key_status(status: u16) -> &'static str {
    match status {
        200..=299 => "valid",
        401 => "invalid",
        // 403 y errores del servidor no permiten afirmar nada sobre la clave.
        _ => "unverified",
    }
}

/// Comprueba una clave del Vercel AI Gateway con una consulta de solo lectura (`GET /v1/credits`).
/// Devuelve "valid", "invalid" o "unverified" (no se pudo confirmar); un fallo de red es un error.
#[tauri::command]
pub async fn desktop_validate_gateway_key(api_key: String) -> Result<String, String> {
    let key = api_key.trim();
    if key.is_empty() {
        return Ok("invalid".to_string());
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let response = client
        .get("https://ai-gateway.vercel.sh/v1/credits")
        .bearer_auth(key)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(classify_gateway_key_status(response.status().as_u16()).to_string())
}

#[cfg(test)]
mod tests {
    #[test]
    fn gateway_key_status_is_classified() {
        assert_eq!(super::classify_gateway_key_status(200), "valid");
        assert_eq!(super::classify_gateway_key_status(401), "invalid");
        assert_eq!(super::classify_gateway_key_status(403), "unverified");
        assert_eq!(super::classify_gateway_key_status(503), "unverified");
    }

    use super::*;

    #[test]
    fn chat_window_keeps_the_catalog_size() {
        assert_eq!(catalog_window_tokens(Some(128_000)), 128_000);
        assert_eq!(catalog_window_tokens(Some(1_000_000)), 1_000_000);
        assert_eq!(catalog_window_tokens(None), 8192);
        assert_eq!(catalog_window_tokens(Some(0)), 8192);
        let models = vec![ProviderModel {
            id: "amazon/nova-micro".into(),
            input_tokens: Some(128_000),
            ..ProviderModel::default()
        }];
        assert_eq!(model_window(&models, "amazon/nova-micro"), Some(128_000));
        assert_eq!(model_window(&models, "missing"), None);
    }

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

    #[test]
    fn gateway_catalog_keeps_prices_compliance_and_drops_blank_ids() {
        let models = parse_gateway_catalog(&serde_json::json!({
            "data": [
                {"name": "missing id", "type": "language"},
                {"id": "  ", "type": "language"},
                {
                    "id": "microsoft/mai-transcribe-2",
                    "name": "MAI-Transcribe-2",
                    "type": "transcription",
                    "zdr": "all",
                    "no_training": "all",
                    "tags": [],
                    "modalities": {"input": ["audio"], "output": ["text"]},
                    "pricing": {"input": "0", "transcription_duration_cost_per_second": "0.00002778"}
                },
                {
                    "id": "openai/gpt-6",
                    "name": "GPT",
                    "type": "language",
                    "zdr": "some",
                    "no_training": "none",
                    "tags": ["file-input", "reasoning"],
                    "modalities": {"input": ["text", "image"], "output": ["text"]},
                    "context_window": 128000,
                    "pricing": {"input": "0.000002", "output": "0.000012"}
                },
                {
                    "id": "microsoft/mai-transcribe-2-streaming",
                    "type": "transcription",
                    "tags": ["websocket-transcription"],
                    "modalities": {"input": ["audio"], "output": ["text"]}
                }
            ]
        }))
        .unwrap();
        assert_eq!(models.len(), 3);
        assert_eq!(models[0].transcription_per_second.as_deref(), Some("0.00002778"));
        assert_eq!(models[0].zdr.as_deref(), Some("all"));
        assert_eq!(models[0].no_training.as_deref(), Some("all"));
        assert!(is_file_transcription_model(&models[0]));
        assert_eq!(models[1].price_input.as_deref(), Some("0.000002"));
        assert_eq!(models[1].price_output.as_deref(), Some("0.000012"));
        assert_eq!(models[1].zdr.as_deref(), Some("some"));
        assert_eq!(models[1].no_training.as_deref(), Some("none"));
        assert_eq!(models[1].input_tokens, Some(128000));
        assert!(!accepts_recorded_audio(&models[1]));
        assert!(!accepts_recorded_audio(&models[2]));
    }
}
