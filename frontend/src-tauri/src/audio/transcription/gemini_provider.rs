use super::provider::{TranscriptResult, TranscriptionError, TranscriptionProvider};
use async_trait::async_trait;
use reqwest::{Client, StatusCode};
use serde_json::{json, Value};
use std::time::Duration;

const GEMINI_ENDPOINT: &str = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_ATTEMPTS: usize = 3;
// Keep individual Gemini requests below the VAD's 30-second boundary. VAD
// padding and frame rounding can otherwise produce 30.0s segments that are a
// handful of samples over the hard limit.
const SAFE_REQUEST_SECONDS: usize = 28;
const MIN_TRANSCRIPTION_SAMPLES: usize = 1_600;
const MAX_OUTPUT_TOKENS: usize = 8_192;

pub struct GeminiTranscriptionProvider {
    client: Client,
    api_key: String,
    model: String,
}

impl GeminiTranscriptionProvider {
    pub fn new(api_key: String, model: String) -> Result<Self, TranscriptionError> {
        if api_key.trim().is_empty() {
            return Err(TranscriptionError::Configuration("Gemini API key is required".into()));
        }
        if model.trim().is_empty() {
            return Err(TranscriptionError::Configuration("Gemini model is required".into()));
        }
        let client = Client::builder()
            .timeout(Duration::from_secs(90))
            .build()
            .map_err(|e| TranscriptionError::Configuration(e.to_string()))?;
        Ok(Self { client, api_key, model })
    }

    fn prompt(language: Option<&str>) -> String {
        let language_instruction = match language {
            Some("es") => concat!(
                "Transcribe literalmente cada palabra. El idioma predominante es español, ",
                "pero puede haber algunas frases en inglés. Conserva cada cambio de idioma ",
                "tal como fue pronunciado y no traduzcas nada."
            )
            .to_string(),
            Some("en") => concat!(
                "You must transcribe every spoken word literally. The predominant language is ",
                "English, but there may be some phrases in Spanish. Preserve every language ",
                "switch exactly as spoken and do not translate anything."
            )
            .to_string(),
            None | Some("auto") => concat!(
                "First identify the predominant spoken language, then transcribe every spoken ",
                "word literally in its original language. The conversation may switch between ",
                "Spanish and English. Preserve every language switch exactly as spoken and do ",
                "not translate anything."
            )
            .to_string(),
            Some(value) => format!(
                "Transcribe every spoken word literally in the original language. The expected language is '{}'. Do not translate anything.",
                value
            ),
        };
        format!(
            "{} Return plain text only. Do not summarize, explain, add Markdown, timestamps, speaker labels, or commentary. If there is no intelligible speech, return an empty string.",
            language_instruction
        )
    }

    async fn request(&self, wav: &[u8], language: Option<&str>) -> Result<String, TranscriptionError> {
        let body = json!({
            "contents": [{"parts": [
                {"text": Self::prompt(language)},
                {"inline_data": {"mime_type": "audio/wav", "data": base64_encode(wav)}}
            ]}],
            // A 30-second speech window cannot require 65k output tokens. A
            // realistic cap prevents a model-specific output-limit failure.
            "generationConfig": {"temperature": 0.0, "maxOutputTokens": MAX_OUTPUT_TOKENS}
        });
        let url = format!("{}/{}:generateContent", GEMINI_ENDPOINT, self.model);

        for attempt in 0..MAX_ATTEMPTS {
            let response = self.client.post(&url)
                .header("x-goog-api-key", &self.api_key)
                .json(&body)
                .send().await;
            let response = match response {
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
                    Err(TranscriptionError::Network(format!("Gemini returned HTTP {}", status)))
                };
            }
            if !status.is_success() {
                return Err(TranscriptionError::InvalidResponse(format!("Gemini returned HTTP {}", status)));
            }
            let payload: Value = response.json().await
                .map_err(|e| TranscriptionError::InvalidResponse(e.to_string()))?;
            if payload.get("promptFeedback").and_then(|v| v.get("blockReason")).is_some() {
                return Err(TranscriptionError::InvalidResponse("request was blocked by Gemini safety filters".into()));
            }
            let text = payload.get("candidates").and_then(|v| v.as_array()).and_then(|v| v.first())
                .and_then(|v| v.get("content")).and_then(|v| v.get("parts")).and_then(|v| v.as_array())
                .and_then(|parts| parts.iter().find_map(|part| part.get("text").and_then(|v| v.as_str())))
                .ok_or_else(|| TranscriptionError::InvalidResponse("Gemini returned no text candidate".into()))?;
            return Ok(text.trim().to_string());
        }
        Err(TranscriptionError::Network("Gemini request failed after retries".into()))
    }
}

#[async_trait]
impl TranscriptionProvider for GeminiTranscriptionProvider {
    async fn transcribe(&self, audio: Vec<f32>, language: Option<String>) -> Result<TranscriptResult, TranscriptionError> {
        if audio.len() < MIN_TRANSCRIPTION_SAMPLES {
            return Err(TranscriptionError::AudioTooShort {
                samples: audio.len(),
                minimum: MIN_TRANSCRIPTION_SAMPLES,
            });
        }

        let mut transcriptions = Vec::new();
        for range in gemini_request_ranges(audio.len()) {
            let wav = pcm_f32_to_wav(&audio[range], 16000);
            let text = self.request(&wav, language.as_deref()).await?;
            if !text.is_empty() {
                transcriptions.push(text);
            }
        }

        Ok(TranscriptResult {
            text: transcriptions.join(" "),
            confidence: None,
            is_partial: false,
        })
    }

    async fn is_model_loaded(&self) -> bool { !self.api_key.is_empty() && !self.model.is_empty() }
    async fn get_current_model(&self) -> Option<String> { Some(self.model.clone()) }
    fn provider_name(&self) -> &'static str { "Gemini" }
}

fn gemini_request_ranges(total_samples: usize) -> Vec<std::ops::Range<usize>> {
    let maximum_samples = 16_000 * SAFE_REQUEST_SECONDS;
    if total_samples <= maximum_samples {
        return vec![0..total_samples];
    }

    let mut ranges = Vec::new();
    let mut start = 0;
    while total_samples - start > maximum_samples {
        let remaining_after_full_chunk = total_samples - start - maximum_samples;
        let end = if remaining_after_full_chunk < MIN_TRANSCRIPTION_SAMPLES {
            total_samples - MIN_TRANSCRIPTION_SAMPLES
        } else {
            start + maximum_samples
        };
        ranges.push(start..end);
        start = end;
    }
    ranges.push(start..total_samples);
    ranges
}

fn pcm_f32_to_wav(samples: &[f32], sample_rate: u32) -> Vec<u8> {
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

fn base64_encode(data: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let value = ((chunk[0] as u32) << 16)
            | ((chunk.get(1).copied().unwrap_or(0) as u32) << 8)
            | chunk.get(2).copied().unwrap_or(0) as u32;
        output.push(TABLE[((value >> 18) & 63) as usize] as char);
        output.push(TABLE[((value >> 12) & 63) as usize] as char);
        output.push(if chunk.len() > 1 { TABLE[((value >> 6) & 63) as usize] as char } else { '=' });
        output.push(if chunk.len() > 2 { TABLE[(value & 63) as usize] as char } else { '=' });
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wav_encoder_writes_valid_header_and_pcm_length() {
        let wav = pcm_f32_to_wav(&[0.0, 1.0, -1.0], 16000);
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
        assert_eq!(u32::from_le_bytes(wav[40..44].try_into().unwrap()), 6);
        assert_eq!(wav.len(), 50);
    }

    #[test]
    fn base64_encoder_handles_padding() {
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
    }

    #[test]
    fn prompt_is_plain_transcription_and_includes_language() {
        let prompt = GeminiTranscriptionProvider::prompt(Some("es"));
        assert!(prompt.contains("idioma predominante es español"));
        assert!(prompt.contains("frases en inglés"));
        assert!(prompt.contains("no traduzcas nada"));
        assert!(prompt.contains("plain text only"));
    }

    #[test]
    fn english_prompt_preserves_spanish_code_switching() {
        let prompt = GeminiTranscriptionProvider::prompt(Some("en"));
        assert!(prompt.contains("predominant language is English"));
        assert!(prompt.contains("phrases in Spanish"));
        assert!(prompt.contains("do not translate anything"));
    }

    #[test]
    fn auto_prompt_detects_and_never_translates() {
        let prompt = GeminiTranscriptionProvider::prompt(None);
        assert!(prompt.contains("identify the predominant spoken language"));
        assert!(prompt.contains("Spanish and English"));
        assert!(prompt.contains("do not translate anything"));
    }

    #[test]
    fn exact_thirty_second_audio_is_split_below_the_request_limit() {
        let ranges = gemini_request_ranges(16_000 * 30);
        assert_eq!(ranges, vec![0..16_000 * 28, 16_000 * 28..16_000 * 30]);
        assert!(ranges.iter().all(|range| range.len() <= 16_000 * SAFE_REQUEST_SECONDS));
    }

    #[test]
    fn sample_over_thirty_seconds_is_not_rejected() {
        let ranges = gemini_request_ranges(16_000 * 30 + 1);
        assert_eq!(ranges.iter().map(|range| range.len()).sum::<usize>(), 16_000 * 30 + 1);
        assert!(ranges.iter().all(|range| range.len() >= MIN_TRANSCRIPTION_SAMPLES));
    }

    #[test]
    fn long_audio_is_partitioned_without_gaps_or_short_tail() {
        let total = 16_000 * 90 + 317;
        let ranges = gemini_request_ranges(total);
        assert_eq!(ranges.first().unwrap().start, 0);
        assert_eq!(ranges.last().unwrap().end, total);
        assert!(ranges.windows(2).all(|pair| pair[0].end == pair[1].start));
        assert!(ranges.iter().all(|range| {
            range.len() >= MIN_TRANSCRIPTION_SAMPLES
                && range.len() <= 16_000 * SAFE_REQUEST_SECONDS
        }));
    }
}
