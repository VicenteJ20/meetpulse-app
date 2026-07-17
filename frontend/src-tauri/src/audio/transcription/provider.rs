// audio/transcription/provider.rs
//
// Defines the unified TranscriptionProvider trait and common types for all
// transcription engines (Whisper, Parakeet, future providers).

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::audio::AudioChunk;

/// User-facing language modes supported during live recording.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TranscriptionLanguageMode {
    Auto,
    #[serde(rename = "es")]
    Spanish,
    #[serde(rename = "en")]
    English,
}

impl Default for TranscriptionLanguageMode {
    fn default() -> Self {
        Self::Auto
    }
}

impl TranscriptionLanguageMode {
    pub fn from_preference(value: &str) -> Result<Self, String> {
        match value.trim().to_ascii_lowercase().as_str() {
            "auto" | "auto-translate" => Ok(Self::Auto),
            "es" | "spanish" => Ok(Self::Spanish),
            "en" | "english" => Ok(Self::English),
            other => Err(format!(
                "Unsupported live transcription language '{}'. Expected auto, es, or en.",
                other
            )),
        }
    }

    pub fn language_hint(self) -> Option<String> {
        match self {
            Self::Auto => None,
            Self::Spanish => Some("es".to_string()),
            Self::English => Some("en".to_string()),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::Spanish => "es",
            Self::English => "en",
        }
    }
}

/// A transcription queue item snapshots the language mode when speech is
/// captured, so changing the UI cannot reinterpret audio already in the queue.
#[derive(Debug, Clone)]
pub struct TranscriptionJob {
    pub chunk: AudioChunk,
    pub language_mode: TranscriptionLanguageMode,
}

// ============================================================================
// TRANSCRIPTION PROVIDER TRAIT & ERROR TYPES
// ============================================================================

/// Granular error types for transcription operations
#[derive(Debug, Clone)]
pub enum TranscriptionError {
    ModelNotLoaded,
    Configuration(String),
    Authentication,
    RateLimited,
    Network(String),
    Timeout,
    InvalidResponse(String),
    AudioTooShort { samples: usize, minimum: usize },
    EngineFailed(String),
    UnsupportedLanguage(String),
}

impl std::fmt::Display for TranscriptionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ModelNotLoaded => write!(f, "No transcription model is loaded"),
            Self::Configuration(msg) => write!(f, "Invalid transcription configuration: {}", msg),
            Self::Authentication => write!(f, "Transcription provider authentication failed"),
            Self::RateLimited => write!(f, "Transcription provider rate limit exceeded"),
            Self::Network(msg) => write!(f, "Transcription network error: {}", msg),
            Self::Timeout => write!(f, "Transcription request timed out"),
            Self::InvalidResponse(msg) => write!(f, "Invalid transcription response: {}", msg),
            Self::AudioTooShort { samples, minimum } => write!(
                f,
                "Audio too short: {} samples (minimum {})",
                samples, minimum
            ),
            Self::EngineFailed(msg) => write!(f, "Transcription engine failed: {}", msg),
            Self::UnsupportedLanguage(lang) => {
                write!(f, "Language '{}' is not supported by this provider", lang)
            }
        }
    }
}

impl std::error::Error for TranscriptionError {}

/// Unified transcription result across all providers
#[derive(Debug, Clone)]
pub struct TranscriptResult {
    pub text: String,
    pub confidence: Option<f32>, // None if provider doesn't support confidence scores
    pub is_partial: bool,
}

/// Trait for transcription providers (Whisper, Parakeet, future providers)
#[async_trait]
pub trait TranscriptionProvider: Send + Sync {
    /// Transcribe audio samples to text
    ///
    /// # Arguments
    /// * `audio` - Audio samples (16kHz mono, f32 format)
    /// * `language` - Optional language hint (e.g., "en", "es", "fr")
    ///
    /// # Returns
    /// * `TranscriptResult` with text, optional confidence, and partial flag
    async fn transcribe(
        &self,
        audio: Vec<f32>,
        language: Option<String>,
    ) -> std::result::Result<TranscriptResult, TranscriptionError>;

    /// Check if a model is currently loaded
    async fn is_model_loaded(&self) -> bool;

    /// Get the name of the currently loaded model
    async fn get_current_model(&self) -> Option<String>;

    /// Get the provider name (for logging/debugging)
    fn provider_name(&self) -> &'static str;
}

impl TranscriptionError {
    /// Errors that make subsequent chunks impossible to process without a
    /// configuration change. Network and provider-response failures are
    /// recoverable and must not stop an active recording.
    pub fn is_fatal(&self) -> bool {
        matches!(
            self,
            Self::ModelNotLoaded | Self::Configuration(_) | Self::Authentication
        )
    }
}

#[cfg(test)]
mod tests {
    use super::TranscriptionLanguageMode;

    #[test]
    fn live_language_mode_accepts_only_supported_values() {
        assert_eq!(
            TranscriptionLanguageMode::from_preference("auto").unwrap(),
            TranscriptionLanguageMode::Auto
        );
        assert_eq!(
            TranscriptionLanguageMode::from_preference("es").unwrap(),
            TranscriptionLanguageMode::Spanish
        );
        assert_eq!(
            TranscriptionLanguageMode::from_preference("en").unwrap(),
            TranscriptionLanguageMode::English
        );
        assert!(TranscriptionLanguageMode::from_preference("zh").is_err());
    }

    #[test]
    fn legacy_auto_translate_migrates_to_auto_without_translation() {
        assert_eq!(
            TranscriptionLanguageMode::from_preference("auto-translate").unwrap(),
            TranscriptionLanguageMode::Auto
        );
    }
}
