use super::provider::{TranscriptResult, TranscriptionError, TranscriptionProvider};
use async_trait::async_trait;
use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::{Client, StatusCode};
use serde_json::{json, Value};
use std::time::Duration;

const FILE_ENDPOINT: &str = "https://ai-gateway.vercel.sh/v4/ai/transcription-model";
const PROTOCOL_VERSION: &str = "0.0.1";
const SPEC_VERSION: &str = "4";
const MIN_TRANSCRIPTION_SAMPLES: usize = 1_600;
const MAX_ATTEMPTS: usize = 3;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum AudioRoute {
    File,
    Chat,
}

enum AudioDispatch {
    Catalog,
    Fixed(AudioRoute),
}

pub struct GatewayTranscriptionProvider {
    client: Client,
    api_key: String,
    model: String,
    file_endpoint: String,
    chat_endpoint: String,
    dispatch: AudioDispatch,
    /// Set by tests. Production reads the interface language at request time.
    ui_locale: Option<String>,
}

impl GatewayTranscriptionProvider {
    pub fn new(api_key: String, model: String) -> Result<Self, TranscriptionError> {
        let model = crate::config::approved_gateway_transcription_model(&model);
        Self::build(
            api_key,
            model,
            FILE_ENDPOINT.to_string(),
            crate::summary::llm_client::GATEWAY_CHAT_URL.to_string(),
            AudioDispatch::Catalog,
        )
    }

    /// Pins the file transcription endpoint. Tests use this so a missing catalog is not fetched.
    pub fn with_endpoints(
        api_key: String,
        model: String,
        file_endpoint: String,
        chat_endpoint: String,
    ) -> Result<Self, TranscriptionError> {
        Self::build(
            api_key,
            model,
            file_endpoint,
            chat_endpoint,
            AudioDispatch::Fixed(AudioRoute::File),
        )
    }

    fn build(
        api_key: String,
        model: String,
        file_endpoint: String,
        chat_endpoint: String,
        dispatch: AudioDispatch,
    ) -> Result<Self, TranscriptionError> {
        if api_key.trim().is_empty() {
            return Err(TranscriptionError::Configuration(
                "Vercel AI Gateway API key is required".into(),
            ));
        }
        if model.trim().is_empty() {
            return Err(TranscriptionError::Configuration(
                "A Vercel AI Gateway transcription model is required".into(),
            ));
        }
        let client = Client::builder()
            .timeout(Duration::from_secs(90))
            .build()
            .map_err(|e| TranscriptionError::Configuration(e.to_string()))?;
        Ok(Self {
            client,
            api_key,
            model,
            file_endpoint,
            chat_endpoint,
            dispatch,
            ui_locale: None,
        })
    }

    /// Pins the interface language. Tests use this so they do not share process state.
    pub(crate) fn with_ui_locale(mut self, locale: impl Into<String>) -> Self {
        self.ui_locale = Some(locale.into());
        self
    }

    async fn route(&self) -> Result<AudioRoute, TranscriptionError> {
        if let AudioDispatch::Fixed(route) = self.dispatch {
            return Ok(route);
        }
        // The allowlist is routed before the live catalog so a missing modality flag
        // cannot send MAI through chat or the Gemini models through the file endpoint.
        if let Some(route) = forced_recorded_audio_route(&self.model) {
            return Ok(route);
        }
        let found = crate::desktop::providers::find_gateway_model(&self.model)
            .await
            .ok()
            .flatten();
        recorded_audio_route(found.as_ref()).map_err(TranscriptionError::Configuration)
    }

    async fn transcribe_once(
        &self,
        wav: &[u8],
        language: Option<&str>,
    ) -> Result<String, TranscriptionError> {
        let audio = STANDARD.encode(wav);
        match self.route().await? {
            AudioRoute::File => self.post_file(&audio, language).await,
            AudioRoute::Chat => self.post_chat(&audio, language).await,
        }
    }

    async fn post_file(&self, audio: &str, language: Option<&str>) -> Result<String, TranscriptionError> {
        let mut body = json!({
            "audio": audio,
            "mediaType": "audio/wav",
        });
        if is_mai_transcribe_2(&self.model) {
            // Azure rejects a singular `locale` or `language` key on this file model.
            // `locales` must be a one-element ISO-639-1 array.
            body["providerOptions"] = json!({
                "azure": {
                    "locales": [self.interface_locale()]
                }
            });
        } else if let Some(code) = language_code(language) {
            body["language"] = json!(code);
        }
        let value = self
            .send(
                &self.file_endpoint,
                body,
                &[
                    ("ai-gateway-protocol-version", PROTOCOL_VERSION),
                    ("ai-transcription-model-specification-version", SPEC_VERSION),
                    ("ai-model-id", self.model.as_str()),
                ],
            )
            .await?;
        value
            .get("text")
            .and_then(Value::as_str)
            .map(|text| text.trim().to_string())
            .ok_or_else(|| {
                TranscriptionError::InvalidResponse(
                    "AI Gateway transcription returned no text".into(),
                )
            })
    }

    async fn post_chat(&self, audio: &str, language: Option<&str>) -> Result<String, TranscriptionError> {
        let instruction = match language_code(language) {
            Some(code) => format!(
                "Transcribe every spoken word literally. Expected language: {code}. Return only the spoken words."
            ),
            None => "Transcribe every spoken word literally in its original language. Return only the spoken words.".to_string(),
        };
        let body = json!({
            "model": self.model,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": instruction},
                    {"type": "input_audio", "input_audio": {"data": audio, "format": "wav"}}
                ]
            }]
        });
        let value = self.send(&self.chat_endpoint, body, &[]).await?;
        value
            .pointer("/choices/0/message/content")
            .and_then(Value::as_str)
            .map(|text| text.trim().to_string())
            .ok_or_else(|| {
                TranscriptionError::InvalidResponse("AI Gateway chat returned no transcript".into())
            })
    }

    async fn send(
        &self,
        url: &str,
        body: Value,
        extra_headers: &[(&str, &str)],
    ) -> Result<Value, TranscriptionError> {
        for attempt in 0..MAX_ATTEMPTS {
            let mut request = self
                .client
                .post(url)
                .bearer_auth(&self.api_key)
                .header(reqwest::header::CONTENT_TYPE, "application/json");
            for (name, value) in extra_headers {
                request = request.header(*name, *value);
            }
            let response = match request.json(&body).send().await {
                Ok(value) => value,
                Err(error) if error.is_timeout() => return Err(TranscriptionError::Timeout),
                Err(error) => return Err(TranscriptionError::Network(error.to_string())),
            };
            let status = response.status();
            if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
                return Err(TranscriptionError::Authentication);
            }
            if status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error() {
                if attempt + 1 < MAX_ATTEMPTS {
                    tokio::time::sleep(Duration::from_millis(500 * (1 << attempt))).await;
                    continue;
                }
                return if status == StatusCode::TOO_MANY_REQUESTS {
                    Err(TranscriptionError::RateLimited)
                } else {
                    Err(TranscriptionError::Network(format!(
                        "AI Gateway returned HTTP {}",
                        status
                    )))
                };
            }
            if !status.is_success() {
                return Err(TranscriptionError::InvalidResponse(format!(
                    "AI Gateway returned HTTP {}",
                    status
                )));
            }
            return response
                .json()
                .await
                .map_err(|e| TranscriptionError::InvalidResponse(e.to_string()));
        }
        Err(TranscriptionError::Network(
            "AI Gateway request failed after retries".into(),
        ))
    }
}

fn is_mai_transcribe_2(model: &str) -> bool {
    model
        .trim()
        .rsplit('/')
        .next()
        .unwrap_or("")
        .eq_ignore_ascii_case("mai-transcribe-2")
}

fn interface_locale_code(value: &str) -> String {
    if value.trim().eq_ignore_ascii_case("es") {
        "es".to_string()
    } else {
        "en".to_string()
    }
}

impl GatewayTranscriptionProvider {
    fn interface_locale(&self) -> String {
        match self.ui_locale.as_deref() {
            Some(locale) => interface_locale_code(locale),
            None => crate::get_ui_locale(),
        }
    }
}

fn language_code(language: Option<&str>) -> Option<&str> {
    match language.map(str::trim).filter(|value| !value.is_empty()) {
        None | Some("auto") => None,
        Some(code) => Some(code),
    }
}

fn forced_recorded_audio_route(model: &str) -> Option<AudioRoute> {
    let canonical = crate::config::canonical_gateway_transcription_model(model)?;
    if canonical == crate::config::DEFAULT_GATEWAY_TRANSCRIPTION_MODEL {
        Some(AudioRoute::File)
    } else {
        Some(AudioRoute::Chat)
    }
}

fn recorded_audio_route(
    model: Option<&crate::desktop::providers::ProviderModel>,
) -> Result<AudioRoute, String> {
    let Some(model) = model else {
        return Ok(AudioRoute::File);
    };
    if crate::desktop::providers::is_file_transcription_model(model) {
        return Ok(AudioRoute::File);
    }
    if model.model_type == "language" && crate::desktop::providers::accepts_recorded_audio(model) {
        return Ok(AudioRoute::Chat);
    }
    Err(format!(
        "Model '{}' does not accept a recorded audio file",
        model.id
    ))
}

pub(crate) fn pcm_f32_to_wav(samples: &[f32], sample_rate: u32) -> Vec<u8> {
    let data_len = (samples.len() * 2) as u32;
    let mut wav = Vec::with_capacity(44 + data_len as usize);
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + data_len).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&sample_rate.to_le_bytes());
    wav.extend_from_slice(&(sample_rate * 2).to_le_bytes());
    wav.extend_from_slice(&2u16.to_le_bytes());
    wav.extend_from_slice(&16u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_len.to_le_bytes());
    for sample in samples {
        let pcm = (sample.clamp(-1.0, 1.0) * i16::MAX as f32).round() as i16;
        wav.extend_from_slice(&pcm.to_le_bytes());
    }
    wav
}

#[async_trait]
impl TranscriptionProvider for GatewayTranscriptionProvider {
    async fn transcribe(
        &self,
        audio: Vec<f32>,
        language: Option<String>,
    ) -> Result<TranscriptResult, TranscriptionError> {
        if audio.len() < MIN_TRANSCRIPTION_SAMPLES {
            return Err(TranscriptionError::AudioTooShort {
                samples: audio.len(),
                minimum: MIN_TRANSCRIPTION_SAMPLES,
            });
        }
        let wav = pcm_f32_to_wav(&audio, 16_000);
        let text = self.transcribe_once(&wav, language.as_deref()).await?;
        Ok(TranscriptResult {
            text,
            confidence: None,
            is_partial: false,
        })
    }

    async fn is_model_loaded(&self) -> bool {
        !self.api_key.is_empty() && !self.model.is_empty()
    }

    async fn get_current_model(&self) -> Option<String> {
        Some(self.model.clone())
    }

    fn provider_name(&self) -> &'static str {
        "Vercel AI Gateway"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::desktop::providers::ProviderModel;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    #[test]
    fn thirty_second_wav_is_one_pcm16_buffer() {
        let samples = vec![0.0_f32; 16_000 * 30];
        let wav = pcm_f32_to_wav(&samples, 16_000);
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(u32::from_le_bytes(wav[24..28].try_into().unwrap()), 16_000);
        assert_eq!(wav.len(), 44 + samples.len() * 2);
    }

    #[test]
    fn missing_catalog_uses_the_file_endpoint_and_sockets_are_rejected() {
        assert_eq!(recorded_audio_route(None).unwrap(), AudioRoute::File);
        let file = ProviderModel {
            id: "microsoft/mai-transcribe-2".into(),
            model_type: "transcription".into(),
            input_modalities: vec!["audio".into()],
            output_modalities: vec!["text".into()],
            ..Default::default()
        };
        assert_eq!(recorded_audio_route(Some(&file)).unwrap(), AudioRoute::File);
        let language = ProviderModel {
            id: "meta/muse-spark-open".into(),
            model_type: "language".into(),
            input_modalities: vec!["text".into(), "audio".into()],
            ..Default::default()
        };
        assert_eq!(
            recorded_audio_route(Some(&language)).unwrap(),
            AudioRoute::Chat
        );
        let socket = ProviderModel {
            id: "microsoft/mai-transcribe-2-streaming".into(),
            model_type: "transcription".into(),
            tags: vec!["websocket-transcription".into()],
            input_modalities: vec!["audio".into()],
            ..Default::default()
        };
        assert!(recorded_audio_route(Some(&socket)).is_err());
    }

    #[test]
    fn approved_gateway_models_use_fixed_routes_and_new_rewrites_the_rest() {
        assert_eq!(
            forced_recorded_audio_route("microsoft/mai-transcribe-2"),
            Some(AudioRoute::File)
        );
        assert_eq!(
            forced_recorded_audio_route("google/gemini-3.1-flash-lite"),
            Some(AudioRoute::Chat)
        );
        assert_eq!(
            forced_recorded_audio_route("google/gemini-3.5-flash-lite"),
            Some(AudioRoute::Chat)
        );
        assert_eq!(
            forced_recorded_audio_route("microsoft/mai-transcribe-2-streaming"),
            None
        );
        assert_eq!(forced_recorded_audio_route("openai/whisper-1"), None);

        let rewritten = GatewayTranscriptionProvider::new("test-key".into(), "openai/whisper-1".into())
            .unwrap();
        assert_eq!(rewritten.model, "microsoft/mai-transcribe-2");
        let kept = GatewayTranscriptionProvider::new(
            "test-key".into(),
            "google/gemini-3.1-flash-lite".into(),
        )
        .unwrap();
        assert_eq!(kept.model, "google/gemini-3.1-flash-lite");
    }

    #[tokio::test]
    async fn thirty_seconds_is_one_wav_post() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let task = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut bytes = Vec::new();
            let mut chunk = [0u8; 16_384];
            loop {
                let n = stream.read(&mut chunk).await.unwrap();
                if n == 0 {
                    break;
                }
                bytes.extend_from_slice(&chunk[..n]);
                if let Some(header_end) = bytes.windows(4).position(|window| window == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&bytes[..header_end]).to_string();
                    let length = headers
                        .lines()
                        .find_map(|line| {
                            let (name, value) = line.split_once(':')?;
                            (name.eq_ignore_ascii_case("content-length"))
                                .then(|| value.trim().parse::<usize>().ok())
                                .flatten()
                        })
                        .unwrap_or(0);
                    if bytes.len() >= header_end + 4 + length {
                        let body = bytes[header_end + 4..header_end + 4 + length].to_vec();
                        let response_body = r#"{"text":"hola"}"#;
                        let response = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            response_body.len(),
                            response_body
                        );
                        stream.write_all(response.as_bytes()).await.unwrap();
                        return (headers, body);
                    }
                }
            }
            panic!("request ended before the body");
        });

        let provider = GatewayTranscriptionProvider::with_endpoints(
            "test-key".into(),
            "test/wav-model".into(),
            format!("http://{address}/v4/ai/transcription-model"),
            format!("http://{address}/v1/chat/completions"),
        )
        .unwrap();
        let result = provider
            .transcribe(vec![0.0; 16_000 * 30], None)
            .await
            .unwrap();
        assert_eq!(result.text, "hola");
        assert!(!result.is_partial);

        let (headers, body) = task.await.unwrap();
        let lower = headers.to_lowercase();
        assert!(lower.contains("post /v4/ai/transcription-model"));
        assert!(lower.contains("authorization: bearer test-key"));
        assert!(lower.contains("ai-model-id: test/wav-model"));
        assert!(lower.contains("ai-gateway-protocol-version: 0.0.1"));
        assert!(lower.contains("ai-transcription-model-specification-version: 4"));
        let payload: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(payload["mediaType"], "audio/wav");
        assert!(payload.get("language").is_none());
        assert!(payload.get("providerOptions").is_none());
        let audio = STANDARD
            .decode(payload["audio"].as_str().unwrap())
            .unwrap();
        assert_eq!(&audio[0..4], b"RIFF");
        assert_eq!(u32::from_le_bytes(audio[24..28].try_into().unwrap()), 16_000);
        assert_eq!(audio.len(), 44 + 16_000 * 30 * 2);
        assert!(!headers.contains("test-key\""));
    }

    #[test]
    fn mai_transcribe_2_match_ignores_the_streaming_model() {
        assert!(is_mai_transcribe_2("microsoft/mai-transcribe-2"));
        assert!(is_mai_transcribe_2(" MAI-Transcribe-2 "));
        assert!(!is_mai_transcribe_2("microsoft/mai-transcribe-2-streaming"));
        assert!(!is_mai_transcribe_2("openai/whisper-1"));
    }

    async fn posted_transcription_body(
        model: &str,
        locale: &str,
        language: Option<String>,
    ) -> Value {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let task = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut bytes = Vec::new();
            let mut chunk = [0u8; 8192];
            loop {
                let n = stream.read(&mut chunk).await.unwrap();
                if n == 0 {
                    break;
                }
                bytes.extend_from_slice(&chunk[..n]);
                if let Some(header_end) = bytes.windows(4).position(|window| window == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&bytes[..header_end]).to_string();
                    let length = headers
                        .lines()
                        .find_map(|line| {
                            let (name, value) = line.split_once(':')?;
                            name.eq_ignore_ascii_case("content-length")
                                .then(|| value.trim().parse::<usize>().ok())
                                .flatten()
                        })
                        .unwrap_or(0);
                    if bytes.len() >= header_end + 4 + length {
                        let body = bytes[header_end + 4..header_end + 4 + length].to_vec();
                        let response_body = r#"{"text":"ok"}"#;
                        let response = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            response_body.len(),
                            response_body
                        );
                        stream.write_all(response.as_bytes()).await.unwrap();
                        return body;
                    }
                }
            }
            panic!("request ended before the body");
        });

        let provider = GatewayTranscriptionProvider::with_endpoints(
            "test-key".into(),
            model.into(),
            format!("http://{address}/v4/ai/transcription-model"),
            format!("http://{address}/v1/chat/completions"),
        )
        .unwrap()
        .with_ui_locale(locale);
        provider
            .transcribe(vec![0.0; 1_600], language)
            .await
            .unwrap();
        let body = task.await.unwrap();
        serde_json::from_slice(&body).unwrap()
    }

    #[tokio::test]
    async fn mai_transcribe_2_sends_the_spanish_interface_locale() {
        let payload =
            posted_transcription_body("microsoft/mai-transcribe-2", "es", Some("en".into())).await;
        assert_eq!(payload["providerOptions"]["azure"]["locales"], json!(["es"]));
        assert!(payload["providerOptions"]["azure"].get("locale").is_none());
        assert!(payload["providerOptions"]["azure"].get("language").is_none());
        assert!(payload.get("language").is_none());
    }

    #[tokio::test]
    async fn mai_transcribe_2_sends_the_english_interface_locale() {
        let payload =
            posted_transcription_body("microsoft/mai-transcribe-2", "en", None).await;
        assert_eq!(payload["providerOptions"]["azure"]["locales"], json!(["en"]));
    }

    #[tokio::test]
    async fn other_gateway_models_do_not_send_azure_locales() {
        let payload =
            posted_transcription_body("openai/whisper-1", "es", Some("en".into())).await;
        assert!(payload.get("providerOptions").is_none());
        assert_eq!(payload["language"], "en");
    }
}
