// Model definitions and prompt templates for built-in AI summary generation
// Designed for easy extension - just add new entries to get_available_models()

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ============================================================================
// Model Definitions
// ============================================================================

/// Sampling parameters supported by the built-in AI -> llama-helper pipeline.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SamplingParams {
    /// Temperature - 0.0 triggers greedy decoding in llama-helper.
    pub temperature: f32,

    /// Top-K sampling - limits vocabulary to top K tokens.
    pub top_k: i32,

    /// Top-P (nucleus) sampling - cumulative probability threshold.
    pub top_p: f32,

    /// Presence penalty - discourages reusing tokens that already appeared in the generated output.
    pub presence_penalty: f32,

    /// Frequency penalty - discourages repeated token frequency in the generated output.
    pub frequency_penalty: f32,

    /// Repeat penalty - llama.cpp repeat penalty, 1.0 disables it.
    pub repeat_penalty: f32,

    /// Number of recent generated tokens to apply penalties over, 0 disables penalties.
    pub penalty_last_n: i32,

    /// Stop tokens - generation stops when any of these appear in output
    pub stop_tokens: Vec<String>,
}

impl SamplingParams {
    /// Restrained near-greedy preset for fuller but still conservative output.
    pub fn tight_structured(stop_tokens: Vec<String>) -> Self {
        Self {
            temperature: 0.1,
            top_k: 20,
            top_p: 0.88,
            presence_penalty: 0.0,
            frequency_penalty: 0.0,
            repeat_penalty: 1.0,
            penalty_last_n: 0,
            stop_tokens,
        }
    }

    /// Summary-tuned Qwen 3.5 preset: non-greedy with mild repetition controls.
    pub fn qwen35_summary(stop_tokens: Vec<String>) -> Self {
        Self {
            temperature: 0.5,
            top_k: 20,
            top_p: 0.8,
            presence_penalty: 0.3,
            frequency_penalty: 0.0,
            repeat_penalty: 1.05,
            penalty_last_n: 256,
            stop_tokens,
        }
    }

    /// Gemma 3 instruct preset, matching the prior Gemma sampling behavior.
    pub fn gemma3_instruct(stop_tokens: Vec<String>) -> Self {
        Self {
            temperature: 1.0,
            top_k: 64,
            top_p: 0.95,
            presence_penalty: 0.0,
            frequency_penalty: 0.0,
            repeat_penalty: 1.0,
            penalty_last_n: 0,
            stop_tokens,
        }
    }

    /// Gemma 4 instruct preset (same recommended sampling as Gemma 3).
    pub fn gemma4_instruct(stop_tokens: Vec<String>) -> Self {
        Self::gemma3_instruct(stop_tokens)
    }

    /// Liquid AI's recommended LFM 2.5 sampling: low temperature, top-k 80, mild repeat penalty.
    pub fn lfm25_instruct(stop_tokens: Vec<String>) -> Self {
        Self {
            temperature: 0.2,
            top_k: 80,
            top_p: 1.0,
            presence_penalty: 0.0,
            frequency_penalty: 0.0,
            repeat_penalty: 1.05,
            penalty_last_n: 256,
            stop_tokens,
        }
    }

    /// Liquid AI's recommended sampling for LFM 2.5 350M (extraction and structured output).
    pub fn lfm25_extract(stop_tokens: Vec<String>) -> Self {
        Self {
            temperature: 0.1,
            top_k: 50,
            top_p: 1.0,
            presence_penalty: 0.0,
            frequency_penalty: 0.0,
            repeat_penalty: 1.05,
            penalty_last_n: 256,
            stop_tokens,
        }
    }

    /// Normalize built-in presets to the subset supported by llama-helper.
    pub fn sanitize_for_llama_helper(&self) -> Self {
        let temperature = if self.temperature.is_finite() {
            self.temperature.max(0.0)
        } else {
            0.0
        };
        let top_k = self.top_k.max(0);
        let top_p = if self.top_p.is_finite() && self.top_p > 0.0 && self.top_p <= 1.0 {
            self.top_p
        } else {
            1.0
        };
        let presence_penalty = if self.presence_penalty.is_finite() {
            self.presence_penalty.max(0.0)
        } else {
            0.0
        };
        let frequency_penalty = if self.frequency_penalty.is_finite() {
            self.frequency_penalty.max(0.0)
        } else {
            0.0
        };
        let repeat_penalty = if self.repeat_penalty.is_finite() && self.repeat_penalty > 0.0 {
            self.repeat_penalty
        } else {
            1.0
        };
        let penalty_last_n = self.penalty_last_n.max(0);

        Self {
            temperature,
            top_k,
            top_p,
            presence_penalty,
            frequency_penalty,
            repeat_penalty,
            penalty_last_n,
            stop_tokens: self.stop_tokens.clone(),
        }
    }
}

/// Ciclo de vida de un modelo: permite jubilar modelos sin dejar de servir a quien ya los usa.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum Lifecycle {
    /// Vigente.
    #[default]
    Current,
    /// Sigue funcionando, pero existe un sucesor más nuevo.
    Legacy,
    /// Tiene fecha de retiro (`retire_after`).
    Retiring,
}

/// Definition of a built-in AI model with all metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelDef {
    /// Model name in format "family:variant" (e.g., "gemma3:1b")
    /// This is what's stored in database as model field when provider="builtin-ai"
    pub name: String,

    /// Display name for UI (e.g., "Gemma 3 1B (Fast)")
    pub display_name: String,

    /// GGUF filename on disk (e.g., "gemma-3-1b-it-q4_0.gguf")
    pub gguf_file: String,

    /// Template name for prompt formatting (e.g., "gemma3")
    pub template: String,

    /// Download URL (HuggingFace or other source)
    pub download_url: String,

    /// File size in MiB. The field name is kept for API compatibility.
    pub size_mb: u64,

    /// Context window size in tokens (configurable per model!)
    /// This is used for chunking in processor.rs
    pub context_size: u32,

    /// Model layer count (for GPU offloading calculation)
    pub layer_count: u32,

    /// Sampling parameters for this model
    pub sampling: SamplingParams,

    /// Short description for UI
    pub description: String,

    /// Vigente, anterior o con fecha de retiro
    pub lifecycle: Lifecycle,

    /// Modelo que lo reemplaza (nombre "familia:variante")
    pub successor: Option<String>,

    /// Fecha tentativa de retiro "YYYY-MM-DD"
    pub retire_after: Option<String>,
}

#[derive(Deserialize)]
struct SamplingSpec {
    preset: String,
    stop_tokens: Vec<String>,
}

#[derive(Deserialize)]
struct ManifestEntry {
    name: String,
    display_name: String,
    gguf_file: String,
    template: String,
    download_url: String,
    size_mb: u64,
    context_size: u32,
    layer_count: u32,
    sampling: SamplingSpec,
    description: String,
    #[serde(default)]
    lifecycle: Lifecycle,
    #[serde(default)]
    successor: Option<String>,
    #[serde(default)]
    retire_after: Option<String>,
}

#[derive(Deserialize)]
struct Manifest {
    models: Vec<ManifestEntry>,
}

/// El catálogo vive en `models/builtin_models.json` y se incrusta al compilar.
const MANIFEST: &str = include_str!("../../../models/builtin_models.json");

fn sampling_from_spec(spec: SamplingSpec) -> Result<SamplingParams> {
    match spec.preset.as_str() {
        "qwen35_summary" => Ok(SamplingParams::qwen35_summary(spec.stop_tokens)),
        "gemma3_instruct" => Ok(SamplingParams::gemma3_instruct(spec.stop_tokens)),
        "gemma4_instruct" => Ok(SamplingParams::gemma4_instruct(spec.stop_tokens)),
        "lfm25_instruct" => Ok(SamplingParams::lfm25_instruct(spec.stop_tokens)),
        "lfm25_extract" => Ok(SamplingParams::lfm25_extract(spec.stop_tokens)),
        "tight_structured" => Ok(SamplingParams::tight_structured(spec.stop_tokens)),
        other => Err(anyhow!("Unknown sampling preset: {}", other)),
    }
}

fn parse_manifest(json: &str) -> Result<Vec<ModelDef>> {
    let manifest: Manifest = serde_json::from_str(json)?;
    manifest
        .models
        .into_iter()
        .map(|entry| {
            Ok(ModelDef {
                name: entry.name,
                display_name: entry.display_name,
                gguf_file: entry.gguf_file,
                template: entry.template,
                download_url: entry.download_url,
                size_mb: entry.size_mb,
                context_size: entry.context_size,
                layer_count: entry.layer_count,
                sampling: sampling_from_spec(entry.sampling)?,
                description: entry.description,
                lifecycle: entry.lifecycle,
                successor: entry.successor,
                retire_after: entry.retire_after,
            })
        })
        .collect()
}

/// Get all available built-in AI models
/// Edit `models/builtin_models.json` to add, retire or replace models.
pub fn get_available_models() -> Vec<ModelDef> {
    parse_manifest(MANIFEST).expect("models/builtin_models.json is invalid")
}

/// Get a specific model by name
pub fn get_model_by_name(name: &str) -> Option<ModelDef> {
    get_available_models().into_iter().find(|m| m.name == name)
}

/// Get the default model (first in list)
pub fn get_default_model() -> ModelDef {
    get_available_models()
        .into_iter()
        .next()
        .expect("At least one model must be defined")
}

/// Resolve model name to full file path in the models directory
pub fn get_model_path(app_data_dir: &PathBuf, model_name: &str) -> Result<PathBuf> {
    let model = get_model_by_name(model_name)
        .ok_or_else(|| anyhow!("Unknown model: {}", model_name))?;

    let models_dir = get_models_directory(app_data_dir);
    let model_path = models_dir.join(&model.gguf_file);

    Ok(model_path)
}

/// Get the models directory path for built-in AI
pub fn get_models_directory(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join("models").join("summary")
}

// ============================================================================
// Prompt Templates (Model-Specific Formatting)
// ============================================================================

/// Gemma 3 chat template format
pub const GEMMA3_TEMPLATE: &str = "\
<start_of_turn>user
{system_prompt}<end_of_turn>
<start_of_turn>user
{user_prompt}<end_of_turn>
<start_of_turn>model
";

/// Gemma 4 chat template (thinking disabled: the empty thought channel starts the reply).
pub const GEMMA4_TEMPLATE: &str = "<|turn>system
{system_prompt}<turn|>
<|turn>user
{user_prompt}<turn|>
<|turn>model
<|channel>thought
<channel|>";

/// Qwen 3.5 non-thinking chat template format.
/// This starts the assistant turn with an empty think block so generation begins
/// in direct-response mode for summaries.
pub const QWEN35_NONTHINKING_TEMPLATE: &str = "\
<|im_start|>system
{system_prompt}<|im_end|>
<|im_start|>user
{user_prompt}<|im_end|>
<|im_start|>assistant
<think>

</think>

";

/// LFM 2.5 ChatML-style template. The BOS token is added by llama-helper when tokenizing.
pub const LFM2_TEMPLATE: &str = "\
<|im_start|>system
{system_prompt}<|im_end|>
<|im_start|>user
{user_prompt}<|im_end|>
<|im_start|>assistant
";

fn escape_user_prompt_control_markers(user_prompt: &str) -> String {
    user_prompt
        .replace("<|im_start|>", "< |im_start| >")
        .replace("<|im_end|>", "< |im_end| >")
        .replace("<|turn>", "< |turn> ")
        .replace("<turn|>", "< turn| >")
        .replace("<|channel>", "< |channel> ")
        .replace("<channel|>", "< channel| >")
        .replace("<start_of_turn>", "< start_of_turn >")
        .replace("<end_of_turn>", "< end_of_turn >")
        .replace("<think>", "< think >")
        .replace("</think>", "< /think >")
}

/// Format a prompt using the specified template
///
/// # Arguments
/// * `template_name` - Template identifier (e.g., "gemma3", "chatml", "llama3")
/// * `system_prompt` - System message (instructions for the model)
/// * `user_prompt` - User message (actual task/question)
///
/// # Returns
/// Formatted prompt string ready to send to llama-helper
pub fn format_prompt(
    template_name: &str,
    system_prompt: &str,
    user_prompt: &str,
) -> Result<String> {
    let template = match template_name {
        "gemma3" => GEMMA3_TEMPLATE,
        "gemma4" => GEMMA4_TEMPLATE,
        "qwen3.5_nonthinking" => QWEN35_NONTHINKING_TEMPLATE,
        "lfm2" => LFM2_TEMPLATE,
        _ => return Err(anyhow!("Unknown template: {}", template_name)),
    };

    let escaped_user_prompt = escape_user_prompt_control_markers(user_prompt);

    let formatted = template
        .replace("{system_prompt}", system_prompt)
        .replace("{user_prompt}", &escaped_user_prompt);

    Ok(formatted)
}

// ============================================================================
// Configuration Constants
// ============================================================================

/// Default max tokens for generation (increased for better summary quality)
pub const DEFAULT_MAX_TOKENS: i32 = 4096;

/// Idle timeout for sidecar (seconds) - can be overridden via LLAMA_IDLE_TIMEOUT env var
pub const DEFAULT_IDLE_TIMEOUT_SECS: u64 = 300; // 5 minutes

/// Generation timeout (how long to wait for a response)
pub const GENERATION_TIMEOUT_SECS: u64 = 900; // 15 minutes

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_parses_and_successors_exist() {
        let models = parse_manifest(MANIFEST).expect("manifest must parse");
        assert!(!models.is_empty());
        for model in &models {
            if let Some(successor) = &model.successor {
                assert!(models.iter().any(|m| &m.name == successor), "successor {} of {} is not in the catalog", successor, model.name);
            }
            assert!(format_prompt(&model.template, "s", "u").is_ok(), "unknown template for {}", model.name);
        }
        assert_eq!(get_default_model().lifecycle, Lifecycle::Current);
    }

    #[test]
    fn qwen35_models_are_registered_with_expected_metadata() {
        let qwen_2b = get_model_by_name("qwen3.5:2b").expect("qwen 2b model should exist");
        assert_eq!(qwen_2b.display_name, "Qwen 3.5 2B (Balanced)");
        assert_eq!(qwen_2b.gguf_file, "Qwen3.5-2B-Q4_K_M.gguf");
        assert_eq!(qwen_2b.template, "qwen3.5_nonthinking");
        assert_eq!(
            qwen_2b.download_url,
            "https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/main/Qwen3.5-2B-Q4_K_M.gguf"
        );
        assert_eq!(qwen_2b.size_mb, 1221);
        assert_eq!(qwen_2b.context_size, 32768);
        assert_eq!(qwen_2b.layer_count, 24);
        assert_eq!(qwen_2b.sampling, SamplingParams::qwen35_summary(vec!["<|im_end|>".to_string()]));

        let qwen_4b = get_model_by_name("qwen3.5:4b").expect("qwen 4b model should exist");
        assert_eq!(qwen_4b.display_name, "Qwen 3.5 4B (High Quality)");
        assert_eq!(qwen_4b.gguf_file, "Qwen3.5-4B-Q4_K_M.gguf");
        assert_eq!(qwen_4b.template, "qwen3.5_nonthinking");
        assert_eq!(
            qwen_4b.download_url,
            "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf"
        );
        assert_eq!(qwen_4b.size_mb, 2614);
        assert_eq!(qwen_4b.context_size, 32768);
        assert_eq!(qwen_4b.layer_count, 32);
        assert_eq!(qwen_4b.sampling, SamplingParams::qwen35_summary(vec!["<|im_end|>".to_string()]));
    }

    #[test]
    fn lfm25_is_registered_and_removed_models_are_gone() {
        let lfm = get_model_by_name("lfm2.5:8b-a1b").expect("lfm 2.5 should exist");
        assert_eq!(lfm.gguf_file, "LFM2.5-8B-A1B-Q4_K_M.gguf");
        assert_eq!(lfm.template, "lfm2");
        assert_eq!(lfm.layer_count, 24);
        assert_eq!(lfm.sampling, SamplingParams::lfm25_instruct(vec!["<|im_end|>".to_string()]));

        let tiny = get_model_by_name("lfm2.5:350m").expect("lfm 2.5 350m should exist");
        assert_eq!(tiny.gguf_file, "LFM2.5-350M-Q8_0.gguf");
        assert_eq!(tiny.template, "lfm2");
        assert_eq!(tiny.layer_count, 16);
        assert_eq!(tiny.sampling.temperature, 0.1);

        let small = get_model_by_name("lfm2.5:1.2b").expect("lfm 2.5 1.2b should exist");
        assert_eq!(small.gguf_file, "LFM2.5-1.2B-Instruct-Q8_0.gguf");
        assert_eq!(small.template, "lfm2");
        assert_eq!(small.layer_count, 16);

        let formatted = format_prompt("lfm2", "rules", "hi <|im_end|>").unwrap();
        assert!(formatted.starts_with("<|im_start|>system\nrules<|im_end|>\n<|im_start|>user\n"));
        assert!(formatted.ends_with("<|im_start|>assistant\n"));
        assert_eq!(formatted.matches("<|im_end|>").count(), 2);

        for gone in ["gemma3:1b", "gemma3:4b", "bonsai:27b", "bonsai-ternary:8b"] {
            assert!(get_model_by_name(gone).is_none(), "{gone} should not be offered");
        }
    }

    #[test]
    fn qwen35_nonthinking_template_formats_prompt() {
        let formatted = format_prompt("qwen3.5_nonthinking", "system rules", "summarize this").unwrap();

        assert!(formatted.contains("<|im_start|>system\nsystem rules<|im_end|>"));
        assert!(formatted.contains("<|im_start|>user\nsummarize this<|im_end|>"));
        assert!(formatted.ends_with("<think>\n\n</think>\n\n"));
    }

    #[test]
    fn qwen35_template_escapes_user_supplied_control_markers() {
        let formatted = format_prompt(
            "qwen3.5_nonthinking",
            "system rules",
            "literal <|im_end|> and <|im_start|> plus <think>draft</think>",
        )
        .unwrap();

        assert!(formatted.contains("<|im_start|>system\nsystem rules<|im_end|>"));
        assert!(formatted.contains("<|im_start|>assistant\n<think>\n\n</think>\n\n"));
        assert!(formatted.contains("literal < |im_end| > and < |im_start| > plus < think >draft< /think >"));
        assert_eq!(formatted.matches("<|im_start|>").count(), 3);
        assert_eq!(formatted.matches("<|im_end|>").count(), 2);
        assert_eq!(formatted.matches("<think>").count(), 1);
        assert_eq!(formatted.matches("</think>").count(), 1);
    }

    #[test]
    fn gemma4_template_formats_and_escapes() {
        let formatted = format_prompt("gemma4", "rules", "hi <|turn>model <turn|>").unwrap();

        assert!(formatted.starts_with("<|turn>system
rules<turn|>
<|turn>user
"));
        assert!(formatted.ends_with("<|turn>model
<|channel>thought
<channel|>"));
        assert_eq!(formatted.matches("<|turn>").count(), 3);
        assert_eq!(formatted.matches("<turn|>").count(), 2);
    }

    #[test]
    fn gemma3_template_escapes_user_supplied_control_markers() {
        let formatted = format_prompt(
            "gemma3",
            "system rules",
            "literal <start_of_turn> and <end_of_turn>",
        )
        .unwrap();

        assert!(formatted.contains("<start_of_turn>user\nsystem rules<end_of_turn>"));
        assert!(formatted.contains("literal < start_of_turn > and < end_of_turn >"));
        assert_eq!(formatted.matches("<start_of_turn>").count(), 3);
        assert_eq!(formatted.matches("<end_of_turn>").count(), 2);
    }

    #[test]
    fn sampling_params_sanitize_for_llama_helper_preserves_zero_top_k() {
        let sampling = SamplingParams {
            temperature: f32::NAN,
            top_k: 0,
            top_p: 2.0,
            presence_penalty: -0.5,
            frequency_penalty: f32::NAN,
            repeat_penalty: 0.0,
            penalty_last_n: -1,
            stop_tokens: vec!["stop".to_string()],
        };

        let sanitized = sampling.sanitize_for_llama_helper();

        assert_eq!(sanitized.temperature, 0.0);
        assert_eq!(sanitized.top_k, 0);
        assert_eq!(sanitized.top_p, 1.0);
        assert_eq!(sanitized.presence_penalty, 0.0);
        assert_eq!(sanitized.frequency_penalty, 0.0);
        assert_eq!(sanitized.repeat_penalty, 1.0);
        assert_eq!(sanitized.penalty_last_n, 0);
        assert_eq!(sanitized.stop_tokens, vec!["stop".to_string()]);
    }

    #[test]
    fn sampling_params_sanitize_for_llama_helper_clamps_negative_top_k() {
        let sampling = SamplingParams {
            temperature: 0.7,
            top_k: -5,
            top_p: 0.8,
            presence_penalty: 0.3,
            frequency_penalty: 0.0,
            repeat_penalty: 1.05,
            penalty_last_n: 256,
            stop_tokens: vec!["stop".to_string()],
        };

        let sanitized = sampling.sanitize_for_llama_helper();

        assert_eq!(sanitized.top_k, 0);
        assert_eq!(sanitized.temperature, 0.7);
        assert_eq!(sanitized.top_p, 0.8);
        assert_eq!(sanitized.presence_penalty, 0.3);
        assert_eq!(sanitized.repeat_penalty, 1.05);
        assert_eq!(sanitized.penalty_last_n, 256);
    }

    #[test]
    fn sampling_params_sanitize_for_llama_helper_keeps_positive_top_k() {
        let sampling = SamplingParams::qwen35_summary(vec!["stop".to_string()]);

        let sanitized = sampling.sanitize_for_llama_helper();

        assert_eq!(sanitized.top_k, 20);
    }
}
