/// Application configuration constants
///
/// Centralized definitions for default models and settings.
/// Used across database initialization, import, and retranscription.

/// Default Whisper model for transcription when no preference is configured.
/// This is the recommended balance of accuracy and speed.
pub const DEFAULT_WHISPER_MODEL: &str = "large-v3-turbo";

/// Default Parakeet model for transcription when no preference is configured.
/// This is the quantized version optimized for speed.
pub const DEFAULT_PARAKEET_MODEL: &str = "parakeet-tdt-0.6b-v3-int8";

/// Default Vercel AI Gateway transcription model.
/// MAI-Transcribe-2 stays first so a missing or retired gateway id falls back here.
pub const DEFAULT_GATEWAY_TRANSCRIPTION_MODEL: &str = "microsoft/mai-transcribe-2";

const GATEWAY_TRANSCRIPTION_MODELS: &[&str] = &[
    DEFAULT_GATEWAY_TRANSCRIPTION_MODEL,
    "google/gemini-3.1-flash-lite",
    "google/gemini-3.5-flash-lite",
];

fn without_models_prefix(model: &str) -> &str {
    let trimmed = model.trim();
    if trimmed.len() > 7 && trimmed[..7].eq_ignore_ascii_case("models/") {
        &trimmed[7..]
    } else {
        trimmed
    }
}

/// Exact id match for gateway transcription. Preview, image, TTS, and streaming ids do not match.
pub fn canonical_gateway_transcription_model(model: &str) -> Option<&'static str> {
    let bare = without_models_prefix(model);
    GATEWAY_TRANSCRIPTION_MODELS
        .iter()
        .copied()
        .find(|id| id.eq_ignore_ascii_case(bare))
}

/// Allowlisted gateway transcription id, or MAI-Transcribe-2 when the saved id is not allowed.
pub fn approved_gateway_transcription_model(model: &str) -> String {
    canonical_gateway_transcription_model(model)
        .unwrap_or(DEFAULT_GATEWAY_TRANSCRIPTION_MODEL)
        .to_string()
}

/// Whisper model catalog with metadata for all supported models.
/// Used by both WhisperEngine::discover_models() and discover_models_standalone().
///
/// Format: (name, filename, size_mb, accuracy, speed, description)
pub const WHISPER_MODEL_CATALOG: &[(&str, &str, u32, &str, &str, &str)] = &[
    // Standard f16 models (full precision)
    ("tiny", "ggml-tiny.bin", 74, "Decent", "Very Fast", "Fastest processing, good for real-time use"),
    ("base", "ggml-base.bin", 142, "Good", "Fast", "Good balance of speed and accuracy"),
    ("small", "ggml-small.bin", 466, "Good", "Medium", "Better accuracy, moderate speed"),
    ("medium", "ggml-medium.bin", 1463, "High", "Slow", "High accuracy for professional use"),
    ("large-v3-turbo", "ggml-large-v3-turbo.bin", 1549, "High", "Medium", "Best accuracy with improved speed"),
    ("large-v3", "ggml-large-v3.bin", 2951, "High", "Slow", "Most Accurate, latest large model"),

    // Q5_1 quantized models (balanced speed/accuracy, slightly better quality than Q5_0)
    ("tiny-q5_1", "ggml-tiny-q5_1.bin", 31, "Decent", "Very Fast", "Quantized tiny model, ~50% faster processing"),
    ("base-q5_1", "ggml-base-q5_1.bin", 57, "Good", "Fast", "Quantized base model, good speed/accuracy balance"),
    ("small-q5_1", "ggml-small-q5_1.bin", 181, "Good", "Fast", "Quantized small model, faster than f16 version"),

    // Q5_0 quantized models (balanced speed/accuracy)
    ("medium-q5_0", "ggml-medium-q5_0.bin", 514, "High", "Medium", "Quantized medium model, professional quality"),
    ("large-v3-turbo-q5_0", "ggml-large-v3-turbo-q5_0.bin", 547, "High", "Medium", "Quantized large model, best balance"),
    ("large-v3-q5_0", "ggml-large-v3-q5_0.bin", 1031, "High", "Slow", "Quantized large model, high accuracy"),
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gateway_transcription_allowlist_keeps_mai_as_default() {
        assert_eq!(
            approved_gateway_transcription_model(""),
            DEFAULT_GATEWAY_TRANSCRIPTION_MODEL
        );
        assert_eq!(
            approved_gateway_transcription_model("openai/whisper-1"),
            "microsoft/mai-transcribe-2"
        );
        assert_eq!(
            approved_gateway_transcription_model("microsoft/mai-transcribe-2-streaming"),
            "microsoft/mai-transcribe-2"
        );
        assert_eq!(
            approved_gateway_transcription_model("google/gemini-3.1-flash-lite-preview"),
            "microsoft/mai-transcribe-2"
        );
        assert_eq!(
            approved_gateway_transcription_model("google/gemini-3.1-flash-lite-image"),
            "microsoft/mai-transcribe-2"
        );
        assert_eq!(
            canonical_gateway_transcription_model("google/gemini-3.8-flash-lite-tts"),
            None
        );
        assert_eq!(
            approved_gateway_transcription_model("Models/Google/Gemini-3.5-Flash-Lite"),
            "google/gemini-3.5-flash-lite"
        );
        assert_eq!(
            approved_gateway_transcription_model("  microsoft/MAI-Transcribe-2  "),
            "microsoft/mai-transcribe-2"
        );
        assert_eq!(
            canonical_gateway_transcription_model("models/google/gemini-3.1-flash-lite"),
            Some("google/gemini-3.1-flash-lite")
        );
    }
}
