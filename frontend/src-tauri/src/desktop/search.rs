//! Local, rebuildable hybrid index. No transcript or embedding leaves this process.
use super::assistant::Source;
use futures_util::StreamExt;
use once_cell::sync::Lazy;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::{Row, SqlitePool};
use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};
use tauri::{Emitter, Manager};
use tokio::io::AsyncWriteExt;

const REVISION: &str = "614241f622f53c4eeff9890bdc4f31cfecc418b3";
/// Stored on each vector. Bumped when the embedded text gains meeting metadata, so old vectors are rebuilt.
const EMBEDDING_REVISION: &str = "614241f622f53c4eeff9890bdc4f31cfecc418b3+meta1";
const FILES: [(&str, &str, u64); 2] = [
    (
        "onnx/model.onnx",
        "ca456c06b3a9505ddfd9131408916dd79290368331e7d76bb621f1cba6bc8665",
        470268510,
    ),
    (
        "tokenizer.json",
        "0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39",
        17082730,
    ),
];
static DOWNLOAD_RUNNING: AtomicBool = AtomicBool::new(false);
static DOWNLOAD_CANCEL: AtomicBool = AtomicBool::new(false);
static DOWNLOAD_PAUSED: AtomicBool = AtomicBool::new(false);
static INDEX_RUNNING: AtomicBool = AtomicBool::new(false);
static INDEX_CANCEL: AtomicBool = AtomicBool::new(false);
static LAST_ERROR: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));
struct Embedder {
    session: ort::session::Session,
    tokenizer: tokenizers::Tokenizer,
}
static ENGINE: Lazy<Mutex<Option<Embedder>>> = Lazy::new(|| Mutex::new(None));
fn directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("models")
        .join("multilingual-e5-small")
        .join(REVISION))
}
fn ready(path: &Path) -> bool {
    FILES.iter().all(|(name, _, size)| {
        std::fs::metadata(path.join(name))
            .map(|m| m.len() == *size)
            .unwrap_or(false)
    }) && path.join("verified").exists()
}

fn embed(path: &Path, text: &str, query: bool) -> Result<Vec<f32>, String> {
    let mut engine = ENGINE.lock().map_err(|e| e.to_string())?;
    if engine.is_none() {
        let session = ort::session::Session::builder()
            .map_err(|e| e.to_string())?
            .with_intra_threads(2)
            .map_err(|e| e.to_string())?
            .commit_from_file(path.join("onnx/model.onnx"))
            .map_err(|e| e.to_string())?;
        let tokenizer = tokenizers::Tokenizer::from_file(path.join("tokenizer.json"))
            .map_err(|e| e.to_string())?;
        *engine = Some(Embedder { session, tokenizer });
    }
    let engine = engine.as_mut().ok_or("Embedding engine unavailable")?;
    let encoding = engine
        .tokenizer
        .encode(
            format!("{}: {}", if query { "query" } else { "passage" }, text),
            true,
        )
        .map_err(|e| e.to_string())?;
    let ids: Vec<i64> = encoding
        .get_ids()
        .iter()
        .take(512)
        .map(|v| *v as i64)
        .collect();
    let len = ids.len();
    if len == 0 {
        return Err("Empty embedding input".into());
    }
    let mask = vec![1i64; len];
    let types = vec![0i64; len];
    let output=engine.session.run(ort::inputs!["input_ids"=>ort::value::Tensor::from_array((vec![1usize,len],ids)).map_err(|e|e.to_string())?,"attention_mask"=>ort::value::Tensor::from_array((vec![1usize,len],mask)).map_err(|e|e.to_string())?,"token_type_ids"=>ort::value::Tensor::from_array((vec![1usize,len],types)).map_err(|e|e.to_string())?]).map_err(|e|e.to_string())?;
    let (_, values) = output[0]
        .try_extract_tensor::<f32>()
        .map_err(|e| e.to_string())?;
    if values.len() != len * 384 {
        return Err("Unexpected embedding dimensions".into());
    }
    let mut pooled = vec![0f32; 384];
    for row in values.chunks_exact(384) {
        for (a, b) in pooled.iter_mut().zip(row) {
            *a += *b / len as f32;
        }
    }
    let norm = pooled.iter().map(|v| v * v).sum::<f32>().sqrt().max(1e-12);
    for v in &mut pooled {
        *v /= norm;
    }
    Ok(pooled)
}
fn encode_vector(v: &[f32]) -> Vec<u8> {
    v.iter().flat_map(|f| f.to_le_bytes()).collect()
}
fn cosine(blob: &[u8], query: &[f32]) -> f32 {
    blob.chunks_exact(4)
        .zip(query)
        .map(|(b, q)| f32::from_le_bytes([b[0], b[1], b[2], b[3]]) * q)
        .sum()
}
/// True for passages that come from a meeting's summary rather than from its transcript.
pub fn is_summary_chunk(id: &str) -> bool {
    id.rsplit(':')
        .next()
        .is_some_and(|tail| tail.len() > 1 && tail.starts_with('s') && tail[1..].chars().all(|c| c.is_ascii_digit()))
}
/// Plain text lines of a stored summary: its markdown, or the English cache when only that is present.
fn summary_lines(result: &str) -> Vec<String> {
    let Ok(value) = serde_json::from_str::<Value>(result) else {
        return vec![];
    };
    let markdown = value
        .get("markdown")
        .and_then(Value::as_str)
        .or_else(|| value.pointer("/english_cache/markdown").and_then(Value::as_str))
        .unwrap_or_default();
    markdown
        .lines()
        .map(|line| {
            line.replace(['#', '*', '`', '>', '|'], " ")
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
                .trim_matches(|c: char| c.is_whitespace() || c == '-')
                .to_string()
        })
        .filter(|line| !line.is_empty())
        .collect()
}
const WINDOW_CHARS: usize = 800;
const WINDOW_OVERLAP: usize = 150;
/// Transcript segments are a few words each, too short to embed meaningfully. Merge consecutive segments into
/// passages of about 800 characters (150 of overlap) and keep the time of the segment each passage starts at.
fn merged_windows(rows: &[(String, f64, Option<f64>)]) -> Vec<(String, f64, Option<f64>)> {
    let mut text = String::new();
    let mut spans: Vec<(usize, f64, Option<f64>)> = Vec::new();
    let mut len = 0usize;
    for (segment, start, end) in rows {
        let segment = segment.trim();
        if segment.is_empty() {
            continue;
        }
        if len > 0 {
            text.push(' ');
            len += 1;
        }
        spans.push((len, *start, *end));
        text.push_str(segment);
        len += segment.chars().count();
    }
    let chars: Vec<char> = text.chars().collect();
    let mut out = Vec::new();
    let mut start = 0;
    while start < chars.len() {
        let end = (start + WINDOW_CHARS).min(chars.len());
        let first = spans.iter().rev().find(|(offset, ..)| *offset <= start).unwrap_or(&spans[0]);
        let last = spans.iter().rev().find(|(offset, ..)| *offset < end).unwrap_or(&spans[0]);
        out.push((chars[start..end].iter().collect(), first.1, last.2));
        if end == chars.len() {
            break;
        }
        start = end.saturating_sub(WINDOW_OVERLAP);
    }
    out
}
pub async fn ensure_text_index(pool: &SqlitePool) -> Result<(), String> {
    ensure_scoped_text_index(pool, None, None).await
}
async fn ensure_scoped_text_index(
    pool: &SqlitePool,
    client: Option<&str>,
    project: Option<&str>,
) -> Result<(), String> {
    // Earlier versions indexed every transcript segment on its own; drop those so they are rebuilt as passages.
    sqlx::query("DELETE FROM assistant_chunks WHERE id NOT GLOB '*:w[0-9]*' AND id NOT GLOB '*:s[0-9]*'")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    let meetings=sqlx::query_scalar::<_,String>("SELECT id FROM meetings WHERE (? IS NULL OR client=?) AND (? IS NULL OR project=?) AND EXISTS(SELECT 1 FROM transcripts WHERE meeting_id=meetings.id) AND NOT EXISTS(SELECT 1 FROM assistant_chunks WHERE meeting_id=meetings.id AND id GLOB '*:w[0-9]*')").bind(client).bind(client).bind(project).bind(project).fetch_all(pool).await.map_err(|e|e.to_string())?;
    for meeting in meetings {
        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
        let rows=sqlx::query("SELECT transcript,COALESCE(audio_start_time,0) AS start,audio_end_time AS end FROM transcripts WHERE meeting_id=? ORDER BY COALESCE(audio_start_time,0),rowid").bind(&meeting).fetch_all(&mut *tx).await.map_err(|e|e.to_string())?;
        let segments: Vec<(String, f64, Option<f64>)> = rows
            .iter()
            .map(|row| (row.get("transcript"), row.get("start"), row.get("end")))
            .collect();
        for (i, (text, start, end)) in merged_windows(&segments).into_iter().enumerate() {
            sqlx::query("INSERT OR IGNORE INTO assistant_chunks(id,meeting_id,text,start,end) VALUES(?,?,?,?,?)").bind(format!("{}:w{}",meeting,i)).bind(&meeting).bind(text).bind(start).bind(end).execute(&mut *tx).await.map_err(|e|e.to_string())?;
        }
        tx.commit().await.map_err(|e| e.to_string())?;
    }
    // A completed summary ("insights") is far shorter and denser than the transcript it comes from, so it is indexed too.
    let summaries = sqlx::query("SELECT m.id AS id, s.result AS result FROM meetings m JOIN summary_processes s ON s.meeting_id=m.id WHERE s.status='completed' AND s.result IS NOT NULL AND (? IS NULL OR m.client=?) AND (? IS NULL OR m.project=?) AND NOT EXISTS(SELECT 1 FROM assistant_chunks c WHERE c.meeting_id=m.id AND c.id GLOB '*:s[0-9]*')").bind(client).bind(client).bind(project).bind(project).fetch_all(pool).await.map_err(|e|e.to_string())?;
    for row in summaries {
        let meeting: String = row.get("id");
        let result: String = row.get("result");
        let segments: Vec<(String, f64, Option<f64>)> = summary_lines(&result)
            .into_iter()
            .map(|line| (line, 0.0, None))
            .collect();
        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
        for (i, (text, start, end)) in merged_windows(&segments).into_iter().enumerate() {
            sqlx::query("INSERT OR IGNORE INTO assistant_chunks(id,meeting_id,text,start,end) VALUES(?,?,?,?,?)").bind(format!("{}:s{}",meeting,i)).bind(&meeting).bind(text).bind(start).bind(end).execute(&mut *tx).await.map_err(|e|e.to_string())?;
        }
        tx.commit().await.map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
pub async fn desktop_search_status(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<Value, String> {
    let pool = state.db_manager.pool();
    let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM assistant_chunks")
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let indexed: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM assistant_chunks WHERE embedding IS NOT NULL AND revision=?",
    )
    .bind(EMBEDDING_REVISION)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    let missing:i64=sqlx::query_scalar("SELECT COUNT(*) FROM meetings WHERE EXISTS(SELECT 1 FROM transcripts WHERE meeting_id=meetings.id) AND NOT EXISTS(SELECT 1 FROM assistant_chunks WHERE meeting_id=meetings.id)").fetch_one(pool).await.map_err(|e|e.to_string())?;
    let path = directory(&app)?;
    let downloaded: u64 = FILES
        .iter()
        .map(|(n, _, _)| {
            std::fs::metadata(path.join(n))
                .or_else(|_| std::fs::metadata(path.join(format!("{}.part", n))))
                .map(|m| m.len())
                .unwrap_or(0)
        })
        .sum();
    Ok(
        json!({"ready":ready(&path),"downloading":DOWNLOAD_RUNNING.load(Ordering::Relaxed),"paused":DOWNLOAD_PAUSED.load(Ordering::Relaxed),"downloaded":downloaded,"totalBytes":487351240u64,"indexing":INDEX_RUNNING.load(Ordering::Relaxed),"indexed":indexed,"total":total,"missingMeetings":missing,"error":LAST_ERROR.lock().map_err(|e|e.to_string())?.clone()}),
    )
}
#[tauri::command]
pub async fn desktop_search_download(app: tauri::AppHandle, action: String) -> Result<(), String> {
    if action == "pause" {
        DOWNLOAD_PAUSED.store(true, Ordering::Relaxed);
        return Ok(());
    }
    if action == "cancel" {
        DOWNLOAD_CANCEL.store(true, Ordering::Relaxed);
        DOWNLOAD_PAUSED.store(true, Ordering::Relaxed);
        if !DOWNLOAD_RUNNING.load(Ordering::SeqCst) {
            clear_partial_downloads(&app).await?;
            DOWNLOAD_PAUSED.store(false, Ordering::Relaxed);
        }
        return Ok(());
    }
    if action != "start" {
        return Err("Invalid download action".into());
    }
    if DOWNLOAD_RUNNING.swap(true, Ordering::SeqCst) {
        return Err("Download already running".into());
    }
    if let Ok(mut error) = LAST_ERROR.lock() {
        *error = None;
    }
    DOWNLOAD_CANCEL.store(false, Ordering::Relaxed);
    DOWNLOAD_PAUSED.store(false, Ordering::Relaxed);
    let task_app = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = download(&task_app).await;
        let result = if DOWNLOAD_CANCEL.load(Ordering::Relaxed) {
            DOWNLOAD_PAUSED.store(false, Ordering::Relaxed);
            clear_partial_downloads(&task_app).await
        } else {
            result
        };
        if let Ok(mut error) = LAST_ERROR.lock() {
            *error = result.err();
        }
        DOWNLOAD_RUNNING.store(false, Ordering::SeqCst);
        let _ = task_app.emit("desktop-search-progress", json!({"done":true}));
    });
    Ok(())
}
async fn clear_partial_downloads(app: &tauri::AppHandle) -> Result<(), String> {
    let path = directory(app)?;
    for (name, _, _) in FILES {
        let partial = path.join(format!("{}.part", name));
        if partial.exists() {
            tokio::fs::remove_file(partial)
                .await
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
async fn download(app: &tauri::AppHandle) -> Result<(), String> {
    let path = directory(app)?;
    tokio::fs::create_dir_all(path.join("onnx"))
        .await
        .map_err(|e| e.to_string())?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(1800))
        .build()
        .map_err(|e| e.to_string())?;
    for (name, hash, size) in FILES {
        let target = path.join(name);
        if tokio::fs::metadata(&target)
            .await
            .map(|m| m.len() == size)
            .unwrap_or(false)
        {
            verify(&target, hash).await?;
            continue;
        }
        let part = path.join(format!("{}.part", name));
        let mut offset = tokio::fs::metadata(&part)
            .await
            .map(|m| m.len())
            .unwrap_or(0);
        if offset > size {
            tokio::fs::remove_file(&part)
                .await
                .map_err(|e| e.to_string())?;
            offset = 0;
        }
        if offset < size {
            let url = format!(
                "https://huggingface.co/intfloat/multilingual-e5-small/resolve/{}/{}",
                REVISION, name
            );
            let mut req = client.get(url);
            if offset > 0 {
                req = req.header(reqwest::header::RANGE, format!("bytes={}-", offset));
            }
            let response = req.send().await.map_err(|e| e.to_string())?;
            if !response.status().is_success() {
                return Err(format!("Model download HTTP {}", response.status()));
            }
            if offset > 0 && response.status() != reqwest::StatusCode::PARTIAL_CONTENT {
                offset = 0;
            }
            let mut file = tokio::fs::OpenOptions::new()
                .create(true)
                .write(true)
                .truncate(offset == 0)
                .append(offset > 0)
                .open(&part)
                .await
                .map_err(|e| e.to_string())?;
            let mut stream = response.bytes_stream();
            let mut last = std::time::Instant::now();
            loop {
                let chunk = tokio::select! {chunk=stream.next()=>chunk,_=tokio::time::sleep(std::time::Duration::from_millis(250))=>{if DOWNLOAD_PAUSED.load(Ordering::Relaxed){file.flush().await.map_err(|e|e.to_string())?;return Ok(());}continue;}};
                let Some(chunk) = chunk else {
                    break;
                };
                if DOWNLOAD_PAUSED.load(Ordering::Relaxed) {
                    file.flush().await.map_err(|e| e.to_string())?;
                    return Ok(());
                }
                let bytes = chunk.map_err(|e| e.to_string())?;
                file.write_all(&bytes).await.map_err(|e| e.to_string())?;
                offset += bytes.len() as u64;
                if offset > size {
                    return Err("Invalid model download size".into());
                }
                if last.elapsed().as_millis() > 300 {
                    let _ = app.emit(
                        "desktop-search-progress",
                        json!({"file":name,"downloaded":offset,"size":size}),
                    );
                    last = std::time::Instant::now();
                }
            }
            file.flush().await.map_err(|e| e.to_string())?;
        }
        if let Err(error) = verify(&part, hash).await {
            let _ = tokio::fs::remove_file(&part).await;
            return Err(error);
        }
        tokio::fs::rename(&part, &target)
            .await
            .map_err(|e| e.to_string())?;
    }
    tokio::fs::write(path.join("verified"), REVISION)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
async fn verify(path: &Path, hash: &str) -> Result<(), String> {
    let path = path.to_path_buf();
    let expected = hash.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::Read;
        let mut file = std::fs::File::open(path).map_err(|e| e.to_string())?;
        let mut digest = Sha256::new();
        let mut bytes = vec![0; 1024 * 1024];
        loop {
            let n = file.read(&mut bytes).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            digest.update(&bytes[..n]);
        }
        if format!("{:x}", digest.finalize()) != expected {
            return Err("Model checksum mismatch; retry the download".into());
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn desktop_search_index(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::state::AppState>,
    cancel: Option<bool>,
) -> Result<(), String> {
    if cancel.unwrap_or(false) {
        INDEX_CANCEL.store(true, Ordering::Relaxed);
        return Ok(());
    }
    if INDEX_RUNNING.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    INDEX_CANCEL.store(false, Ordering::Relaxed);
    let pool = state.db_manager.pool().clone();
    tauri::async_runtime::spawn(async move {
        let result = index(&app, &pool).await;
        if let Ok(mut e) = LAST_ERROR.lock() {
            *e = result.err();
        }
        INDEX_RUNNING.store(false, Ordering::SeqCst);
    });
    Ok(())
}

#[tauri::command]
pub async fn desktop_search_query(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::state::AppState>,
    query: String,
) -> Result<Value, String> {
    let query = query.trim().to_string();
    if query.len() < 3 {
        return Ok(json!({"sources": [], "partial": false}));
    }
    if query.len() > 500 {
        return Err("Search query is too long".into());
    }

    let pool = state.db_manager.pool();
    let (sources, partial) = search_relevant(&app, pool, &query).await?;
    Ok(json!({"sources": sources, "partial": partial}))
}

/// Chat across every meeting. Same ranking as the library, with at most two passages per meeting.
pub async fn retrieve_all(
    app: &tauri::AppHandle,
    pool: &SqlitePool,
    query: &str,
) -> Result<(Vec<Source>, bool), String> {
    search_scoped(app, pool, query, None, None, None, None, 2).await
}

const STOPWORDS: [&str; 40] = [
    "que", "del", "los", "las", "una", "uno", "con", "por", "para", "como", "pero", "sus", "les", "este", "esta",
    "esto", "ese", "esa", "muy", "mas", "hay", "fue", "son", "sobre", "entre", "the", "and", "for", "with", "that",
    "this", "are", "was", "you", "not", "from", "have", "about", "what", "when",
];

/// Meaningful query words, lowercased and without accents, so "qué" is the stopword "que".
fn content_terms(query: &str) -> Vec<String> {
    query
        .split(|c: char| !c.is_alphanumeric())
        .map(|word| {
            word.to_lowercase()
                .chars()
                .map(|c| match c {
                    'á' => 'a',
                    'é' => 'e',
                    'í' => 'i',
                    'ó' => 'o',
                    'ú' | 'ü' => 'u',
                    other => other,
                })
                .collect::<String>()
        })
        .filter(|word| word.chars().count() > 2 && !STOPWORDS.contains(&word.as_str()))
        .take(12)
        .collect()
}

fn and_keywords(query: &str) -> String {
    content_terms(query)
        .into_iter()
        .map(|word| format!("\"{}\"", word.replace('"', "")))
        .collect::<Vec<_>>()
        .join(" AND ")
}

/// Keeps the best passages, but not more than `per_meeting` from the same meeting.
fn take_diverse(ranked: Vec<(String, String)>, limit: usize, per_meeting: usize) -> Vec<String> {
    let mut counts = std::collections::HashMap::<String, usize>::new();
    let mut kept = Vec::new();
    for (id, meeting) in ranked {
        let count = counts.entry(meeting).or_default();
        if *count >= per_meeting {
            continue;
        }
        *count += 1;
        kept.push(id);
        if kept.len() == limit {
            break;
        }
    }
    kept
}
/// Minimum cosine similarity, and how far above the query's own score distribution a passage must sit.
/// multilingual-e5 scores cluster between 0.75 and 0.88 for everything, so absolute values alone do not
/// separate relevant from unrelated text: the passage must also stand out from all the others.
const MIN_SEMANTIC_SCORE: f32 = 0.82;
const MIN_SEMANTIC_Z: f32 = 2.2;
const MAX_GAP_FROM_BEST: f32 = 0.04;

const SUMMARY_WEIGHT: f32 = 1.6;

/// Keeps only the passages whose similarity clearly stands out from the rest of their kind.
/// `scores` must be sorted best first.
fn gate_semantic(scores: Vec<(String, f32)>) -> Vec<(String, f32)> {
    let Some(best) = scores.first().map(|(_, score)| *score) else {
        return scores;
    };
    let n = scores.len() as f32;
    let mean = scores.iter().map(|(_, s)| s).sum::<f32>() / n;
    let sd = (scores.iter().map(|(_, s)| (s - mean).powi(2)).sum::<f32>() / n).sqrt();
    // With very few passages the spread is not meaningful, so only the absolute floor applies.
    let floor = if scores.len() >= 10 {
        MIN_SEMANTIC_SCORE.max(mean + MIN_SEMANTIC_Z * sd)
    } else {
        MIN_SEMANTIC_SCORE + 0.02
    };
    scores
        .into_iter()
        .filter(|(_, score)| *score >= floor && *score >= best - MAX_GAP_FROM_BEST)
        .collect()
}

/// Search for the library and the palette: only passages that are actually relevant to the query come back.
/// A passage qualifies by matching every meaningful word of the query, or by a similarity that clearly stands out.
pub async fn search_relevant(
    app: &tauri::AppHandle,
    pool: &SqlitePool,
    query: &str,
) -> Result<(Vec<Source>, bool), String> {
    search_scoped(app, pool, query, None, None, None, None, usize::MAX).await
}

/// Shared ranking for the library and the general chat.
/// Insights and transcript passages are both eligible. `per_meeting` limits how many passages of one meeting survive.
async fn search_scoped(
    app: &tauri::AppHandle,
    pool: &SqlitePool,
    query: &str,
    client: Option<&str>,
    project: Option<&str>,
    from: Option<&str>,
    to: Option<&str>,
    per_meeting: usize,
) -> Result<(Vec<Source>, bool), String> {
    if let Some(client) = client.filter(|value| !value.is_empty()) {
        ensure_scoped_text_index(pool, Some(client), project.filter(|value| !value.is_empty())).await?;
    } else {
        ensure_text_index(pool).await?;
    }
    let path = directory(app)?;
    let available = ready(&path);
    let query_vector = if available {
        let text = query.to_string();
        Some(
            tauri::async_runtime::spawn_blocking(move || embed(&path, &text, true))
                .await
                .map_err(|e| e.to_string())??,
        )
    } else {
        None
    };
    let rows = sqlx::query(
        "SELECT c.id,c.meeting_id,c.text,c.start,c.end,c.embedding,m.title FROM assistant_chunks c JOIN meetings m ON m.id=c.meeting_id WHERE (? IS NULL OR m.client=?) AND (? IS NULL OR ?='' OR m.project=?) AND (? IS NULL OR date(m.created_at)>=date(?)) AND (? IS NULL OR date(m.created_at)<=date(?)) ORDER BY m.created_at DESC LIMIT 50000",
    )
    .bind(client)
    .bind(client)
    .bind(project)
    .bind(project)
    .bind(project)
    .bind(from)
    .bind(from)
    .bind(to)
    .bind(to)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    let partial = !available
        || rows
            .iter()
            .any(|row| row.get::<Option<Vec<u8>>, _>("embedding").is_none());
    let lexical = lexical_ids(pool, &and_keywords(query), client, project, from, to).await?;

    let mut semantic: Vec<(String, f32)> = rows
        .iter()
        .filter_map(|row| {
            Some((
                row.get("id"),
                cosine(&row.get::<Option<Vec<u8>>, _>("embedding")?, query_vector.as_ref()?),
            ))
        })
        .collect();
    semantic.sort_by(|a, b| b.1.total_cmp(&a.1));
    // Summaries and transcripts score on different scales, so each is judged against its own distribution.
    let (summary_scores, transcript_scores): (Vec<_>, Vec<_>) =
        semantic.into_iter().partition(|(id, _)| is_summary_chunk(id));
    let semantic: Vec<(String, f32)> = [gate_semantic(summary_scores), gate_semantic(transcript_scores)].concat();

    let mut scores = std::collections::HashMap::<String, f32>::new();
    // A summary passage is a distilled answer, so for open questions it ranks above the raw transcript.
    let weight = |id: &str| if is_summary_chunk(id) { SUMMARY_WEIGHT } else { 1.0 };
    for (rank, id) in lexical.iter().take(30).enumerate() {
        *scores.entry(id.clone()).or_default() += weight(id) / (60 + rank) as f32;
    }
    let mut by_score = semantic.clone();
    by_score.sort_by(|a, b| b.1.total_cmp(&a.1));
    for (rank, (id, _)) in by_score.iter().take(30).enumerate() {
        *scores.entry(id.clone()).or_default() += weight(id) / (60 + rank) as f32;
    }
    let mut ranked: Vec<_> = scores.into_iter().collect();
    ranked.sort_by(|a, b| b.1.total_cmp(&a.1));
    let ranked_ids = take_diverse(
        ranked
            .into_iter()
            .filter_map(|(id, _)| {
                let meeting = rows.iter().find(|row| row.get::<String, _>("id") == id)?.get::<String, _>("meeting_id");
                Some((id, meeting))
            })
            .collect(),
        12,
        per_meeting,
    );
    let sources = ranked_ids
        .into_iter()
        .filter_map(|id| {
            let row = rows.iter().find(|row| row.get::<String, _>("id") == id)?;
            Some(Source {
                id,
                meeting_id: Some(row.get("meeting_id")),
                session_id: None,
                title: row.get("title"),
                text: row.get("text"),
                start: row.get("start"),
                end: row.get("end"),
                date: None,
            })
        })
        .collect();
    Ok((sources, partial))
}

async fn lexical_ids(
    pool: &SqlitePool,
    keywords: &str,
    client: Option<&str>,
    project: Option<&str>,
    from: Option<&str>,
    to: Option<&str>,
) -> Result<Vec<String>, String> {
    if keywords.is_empty() {
        return Ok(vec![]);
    }
    sqlx::query_scalar::<_, String>(
        "SELECT c.id FROM assistant_fts f JOIN assistant_chunks c ON c.id=f.id JOIN meetings m ON m.id=c.meeting_id WHERE assistant_fts MATCH ? AND (? IS NULL OR m.client=?) AND (? IS NULL OR ?='' OR m.project=?) AND (? IS NULL OR date(m.created_at)>=date(?)) AND (? IS NULL OR date(m.created_at)<=date(?)) ORDER BY bm25(assistant_fts) LIMIT 60",
    )
    .bind(keywords)
    .bind(client)
    .bind(client)
    .bind(project)
    .bind(project)
    .bind(project)
    .bind(from)
    .bind(from)
    .bind(to)
    .bind(to)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

async fn index(app: &tauri::AppHandle, pool: &SqlitePool) -> Result<(), String> {
    while super::assistant::RECORDING.load(Ordering::Relaxed) {
        if INDEX_CANCEL.load(Ordering::Relaxed) {
            return Ok(());
        }
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    }
    ensure_text_index(pool).await?;
    let path = directory(app)?;
    if !ready(&path) {
        return Ok(());
    }
    loop {
        if INDEX_CANCEL.load(Ordering::Relaxed) {
            break;
        }
        if super::assistant::RECORDING.load(Ordering::Relaxed) {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            continue;
        }
        let rows = next_embedding_batch(pool).await?;
        if rows.is_empty() {
            break;
        }
        for row in rows {
            if INDEX_CANCEL.load(Ordering::Relaxed)
                || super::assistant::RECORDING.load(Ordering::Relaxed)
            {
                break;
            }
            let id = row.id.clone();
            let text = embed_passage(&row.id, &row.title, &row.client, &row.project, &row.created_at, &row.text);
            let root = path.clone();
            let vector = tauri::async_runtime::spawn_blocking(move || embed(&root, &text, false))
                .await
                .map_err(|e| e.to_string())??;
            sqlx::query("UPDATE assistant_chunks SET embedding=?,revision=? WHERE id=?")
                .bind(encode_vector(&vector))
                .bind(EMBEDDING_REVISION)
                .bind(id)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
        }
        tokio::task::yield_now().await;
    }
    Ok(())
}
const RECENCY_HALF_LIFE_DAYS: f32 = 45.0;
const RECENCY_WEIGHT: f32 = 0.12;
const LEXICAL_WEIGHT: f32 = 0.04;
const AND_BONUS: f32 = 0.04;
const INSIGHT_BONUS: f32 = 0.03;
const METADATA_BONUS: f32 = 0.25;
const SHORTLIST: usize = 40;
const COSINE_FLOOR: f32 = 0.78;
const COSINE_GAP: f32 = 0.06;

/// How much of the chat model's window the first search should fill.
#[derive(Clone, Copy, Debug)]
pub struct ChatLimits {
    pub max_meetings: usize,
    pub windows_per_meeting: usize,
    pub insight_chars: usize,
    pub window_chars: usize,
    pub char_budget: usize,
}

/// One meeting the chat agent can cite. Passages are the insight, then transcript windows.
#[derive(Clone, Debug)]
pub struct ChatMeeting {
    pub id: String,
    pub title: String,
    pub client: String,
    pub project: String,
    pub date: String,
    pub passages: Vec<Source>,
}

pub struct ChatSearch {
    pub meetings: Vec<ChatMeeting>,
    pub partial: bool,
}

struct ChatCandidate {
    id: String,
    meeting_id: String,
    age_days: f32,
    cosine: Option<f32>,
    lexical_rank: Option<usize>,
    and_match: bool,
    metadata: bool,
    recent_insight: bool,
    insight: bool,
}

struct ChunkRow {
    id: String,
    meeting_id: String,
    text: String,
    start: f64,
    end: Option<f64>,
    embedding: Option<Vec<u8>>,
    title: String,
    client: String,
    project: String,
    created_at: String,
}

struct EmbedJob {
    id: String,
    text: String,
    title: String,
    client: String,
    project: String,
    created_at: String,
}

pub fn chat_limits_for(context_tokens: usize) -> ChatLimits {
    let usable = context_tokens.saturating_sub(4096).max(1024);
    // Half of the usable window, counted in characters. The rest stays for history and the answer.
    let char_budget = usable.saturating_mul(3) / 2;
    let max_meetings = if char_budget < 12_000 {
        2
    } else if char_budget < 24_000 {
        4
    } else {
        8
    };
    let windows = if char_budget < 12_000 { 2 } else { 4 };
    let insight_chars = (char_budget / max_meetings / 2).clamp(1_200, 8_000);
    ChatLimits {
        max_meetings,
        windows_per_meeting: windows,
        insight_chars,
        window_chars: 800,
        char_budget,
    }
}

/// Listing questions name the calendar, not a topic. "recientes" would otherwise match meetings that talk about meetings.
fn asks_for_recent_meetings(query: &str) -> bool {
    const MARKERS: [&str; 8] = [
        "reciente", "recientes", "ultima", "ultimas", "ultimo", "ultimos", "recent", "latest",
    ];
    content_terms(query)
        .iter()
        .any(|term| MARKERS.contains(&term.as_str()))
}

fn or_keywords(query: &str) -> String {
    content_terms(query)
        .into_iter()
        .map(|word| format!("\"{}\"", word.replace('"', "")))
        .collect::<Vec<_>>()
        .join(" OR ")
}

fn day_label(created_at: &str) -> String {
    created_at.chars().take(10).collect()
}

fn meeting_age_days(created_at: &str) -> f32 {
    let today = chrono::Utc::now().date_naive();
    let Ok(date) = chrono::NaiveDate::parse_from_str(&day_label(created_at), "%Y-%m-%d") else {
        return 0.0;
    };
    (today - date).num_days().max(0) as f32
}

/// Text actually embedded. The stored passage stays unchanged.
fn embed_passage(id: &str, title: &str, client: &str, project: &str, created_at: &str, text: &str) -> String {
    let kind = if is_summary_chunk(id) { "insight" } else { "transcript" };
    format!("{title}. {client}. {project}. {}. {kind}. {text}", day_label(created_at))
}

fn passage_score(candidate: &ChatCandidate) -> f32 {
    let mut score = candidate.cosine.unwrap_or(0.0);
    if let Some(rank) = candidate.lexical_rank {
        let closeness = 1.0 - (rank as f32 / SHORTLIST as f32).min(1.0);
        score += LEXICAL_WEIGHT * closeness;
    }
    if candidate.and_match {
        score += AND_BONUS;
    }
    if candidate.insight {
        score += INSIGHT_BONUS;
    }
    if candidate.metadata {
        score += METADATA_BONUS;
    }
    score
}

fn meeting_score(best_passage: f32, age_days: f32) -> f32 {
    best_passage + RECENCY_WEIGHT * (-age_days / RECENCY_HALF_LIFE_DAYS).exp()
}

/// Picks meetings by score. Recency breaks close calls. The cosine gate runs on the shortlist, not on the whole corpus.
fn select_chat_meetings(candidates: &[ChatCandidate], limit: usize) -> Vec<(String, f32)> {
    let mut semantic: Vec<(usize, f32)> = candidates
        .iter()
        .enumerate()
        .filter_map(|(index, candidate)| candidate.cosine.map(|score| (index, score)))
        .collect();
    semantic.sort_by(|a, b| b.1.total_cmp(&a.1));
    let best = semantic.first().map(|(_, score)| *score).unwrap_or(0.0);
    let floor = if semantic.is_empty() {
        f32::MAX
    } else {
        COSINE_FLOOR.max(best - COSINE_GAP)
    };
    let mut chosen = std::collections::HashSet::new();
    for (index, score) in semantic.iter().take(SHORTLIST) {
        if *score >= floor {
            chosen.insert(*index);
        }
    }
    for (index, candidate) in candidates.iter().enumerate() {
        if chosen.contains(&index) {
            continue;
        }
        if candidate.lexical_rank.is_some() || candidate.and_match || candidate.metadata {
            chosen.insert(index);
            continue;
        }
        if candidate.recent_insight && candidate.cosine.is_some_and(|score| score >= floor) {
            chosen.insert(index);
        }
    }
    let mut best_of = std::collections::HashMap::<String, (f32, f32)>::new();
    for index in chosen {
        let candidate = &candidates[index];
        let score = passage_score(candidate);
        let entry = best_of
            .entry(candidate.meeting_id.clone())
            .or_insert((f32::MIN, candidate.age_days));
        if score > entry.0 {
            *entry = (score, candidate.age_days);
        }
    }
    let mut ranked: Vec<(String, f32)> = best_of
        .into_iter()
        .map(|(id, (score, age))| (id, meeting_score(score, age)))
        .collect();
    ranked.sort_by(|a, b| b.1.total_cmp(&a.1));
    ranked.truncate(limit);
    ranked
}

fn take_chars(text: &str, max_chars: usize) -> String {
    text.chars().take(max_chars).collect()
}

fn scope_clause(alias: &str) -> String {
    format!(
        "(? IS NULL OR {alias}.client=?) AND (? IS NULL OR ?='' OR {alias}.project=?) AND (? IS NULL OR date({alias}.created_at)>=date(?)) AND (? IS NULL OR date({alias}.created_at)<=date(?))"
    )
}

macro_rules! bind_scope {
    ($query:expr, $client:expr, $project:expr, $from:expr, $to:expr) => {
        $query
            .bind($client)
            .bind($client)
            .bind($project)
            .bind($project)
            .bind($project)
            .bind($from)
            .bind($from)
            .bind($to)
            .bind($to)
    };
}

async fn load_scoped_chunks(
    pool: &SqlitePool,
    client: Option<&str>,
    project: Option<&str>,
    from: Option<&str>,
    to: Option<&str>,
) -> Result<Vec<ChunkRow>, String> {
    let sql = format!(
        "SELECT c.id AS id, c.meeting_id AS meeting_id, c.text AS text, c.start AS start, c.end AS end, c.embedding AS embedding, COALESCE(m.title,'') AS title, COALESCE(m.client,'') AS client, COALESCE(m.project,'') AS project, COALESCE(m.created_at,'') AS created_at FROM assistant_chunks c JOIN meetings m ON m.id=c.meeting_id WHERE {} ORDER BY m.created_at DESC LIMIT 50000",
        scope_clause("m")
    );
    let rows = bind_scope!(sqlx::query(&sql), client, project, from, to)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows
        .iter()
        .map(|row| ChunkRow {
            id: row.get("id"),
            meeting_id: row.get("meeting_id"),
            text: row.get("text"),
            start: row.get("start"),
            end: row.get("end"),
            embedding: row.get("embedding"),
            title: row.get("title"),
            client: row.get("client"),
            project: row.get("project"),
            created_at: row.get("created_at"),
        })
        .collect())
}

async fn metadata_meeting_ids(
    pool: &SqlitePool,
    query: &str,
    client: Option<&str>,
    project: Option<&str>,
    from: Option<&str>,
    to: Option<&str>,
) -> Result<Vec<String>, String> {
    let terms = content_terms(query);
    if terms.is_empty() {
        return Ok(vec![]);
    }
    let mut sql = format!("SELECT id FROM meetings WHERE {} AND (", scope_clause("meetings"));
    for index in 0..terms.len() {
        if index > 0 {
            sql.push_str(" OR ");
        }
        sql.push_str("(instr(lower(COALESCE(title,'')), lower(?))>0 OR instr(lower(COALESCE(client,'')), lower(?))>0 OR instr(lower(COALESCE(project,'')), lower(?))>0)");
    }
    sql.push(')');
    let mut request = bind_scope!(sqlx::query_scalar(&sql), client, project, from, to);
    for term in &terms {
        request = request.bind(term).bind(term).bind(term);
    }
    request.fetch_all(pool).await.map_err(|e| e.to_string())
}

async fn recent_meeting_ids(
    pool: &SqlitePool,
    client: Option<&str>,
    project: Option<&str>,
    from: Option<&str>,
    to: Option<&str>,
) -> Result<Vec<String>, String> {
    let sql = format!(
        "SELECT id FROM meetings WHERE {} AND (EXISTS(SELECT 1 FROM transcripts t WHERE t.meeting_id=meetings.id) OR EXISTS(SELECT 1 FROM assistant_chunks c WHERE c.meeting_id=meetings.id) OR EXISTS(SELECT 1 FROM summary_processes s WHERE s.meeting_id=meetings.id AND s.status='completed')) ORDER BY created_at DESC LIMIT 8",
        scope_clause("meetings")
    );
    bind_scope!(sqlx::query_scalar(&sql), client, project, from, to)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())
}

async fn missing_embeddings(
    pool: &SqlitePool,
    client: Option<&str>,
    project: Option<&str>,
    from: Option<&str>,
    to: Option<&str>,
) -> Result<bool, String> {
    let sql = format!(
        "SELECT COUNT(*) FROM assistant_chunks c JOIN meetings m ON m.id=c.meeting_id WHERE {} AND (c.embedding IS NULL OR c.revision!=?)",
        scope_clause("m")
    );
    let count: i64 = bind_scope!(sqlx::query_scalar(&sql), client, project, from, to)
        .bind(EMBEDDING_REVISION)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(count > 0)
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum InsightKind {
    Summary,
    Decisions,
    Actions,
    Topics,
    Questions,
}

fn fold_accents(text: &str) -> String {
    text.chars()
        .map(|c| match c {
            'á' | 'Á' => 'a',
            'é' | 'É' => 'e',
            'í' | 'Í' => 'i',
            'ó' | 'Ó' => 'o',
            'ú' | 'Ú' | 'ü' | 'Ü' => 'u',
            other => other.to_ascii_lowercase(),
        })
        .collect()
}

/// Same sections the meeting view shows. Metadata and unknown headings are left out.
fn insight_kind(title: &str) -> Option<InsightKind> {
    let folded = fold_accents(title);
    let title: String = folded
        .chars()
        .map(|c| if c.is_ascii_alphabetic() || c == ' ' { c } else { ' ' })
        .collect();
    let title = title.split_whitespace().collect::<Vec<_>>().join(" ");
    if title.starts_with("metadatos") || title.starts_with("metadata") {
        return None;
    }
    if title.starts_with("resumen") || title.starts_with("summary") || title.starts_with("objetivo") || title.starts_with("contexto") {
        return Some(InsightKind::Summary);
    }
    if title.contains("decision") {
        return Some(InsightKind::Decisions);
    }
    if title.starts_with("acciones")
        || title.starts_with("compromisos")
        || title.starts_with("tareas")
        || title.starts_with("action")
        || title.starts_with("proximos pasos")
        || title.starts_with("next steps")
    {
        return Some(InsightKind::Actions);
    }
    if title.starts_with("temas") || title.starts_with("topics") || title.starts_with("puntos clave") || title.starts_with("key points") {
        return Some(InsightKind::Topics);
    }
    if title.contains("pregunta") || title.contains("riesgo") || title.contains("bloqueo") || title.contains("sin resolver") || title.contains("open question") {
        return Some(InsightKind::Questions);
    }
    None
}

fn split_insight(markdown: &str) -> Vec<(InsightKind, String)> {
    let mut sections: Vec<(InsightKind, String)> = Vec::new();
    let mut kind: Option<InsightKind> = None;
    let mut body = String::new();
    let flush = |kind: &mut Option<InsightKind>, body: &mut String, sections: &mut Vec<(InsightKind, String)>| {
        if let Some(current) = kind.take() {
            let text = body.trim().to_string();
            if !text.is_empty() {
                if let Some((_, existing)) = sections.iter_mut().find(|(kept, _)| *kept == current) {
                    existing.push('\n');
                    existing.push_str(&text);
                } else {
                    sections.push((current, text));
                }
            }
        }
        body.clear();
    };
    for line in markdown.lines() {
        let trimmed = line.trim();
        if let Some(title) = trimmed.strip_prefix("## ") {
            flush(&mut kind, &mut body, &mut sections);
            kind = insight_kind(title);
            continue;
        }
        if trimmed.starts_with("# ") || kind.is_none() {
            continue;
        }
        body.push_str(line);
        body.push('\n');
    }
    flush(&mut kind, &mut body, &mut sections);
    sections
}

fn wants_insight_kind(query: &str, kind: InsightKind) -> bool {
    let query = fold_accents(query);
    match kind {
        InsightKind::Summary => false,
        InsightKind::Decisions => query.contains("decision") || query.contains("decid") || query.contains("acuerdo") || query.contains("acord"),
        InsightKind::Actions => query.contains("accion") || query.contains("tarea") || query.contains("compromiso"),
        InsightKind::Topics => query.contains("tema"),
        InsightKind::Questions => query.contains("pregunta") || query.contains("riesgo") || query.contains("bloqueo"),
    }
}

/// The first packet. Recent questions get the summary paragraph. A topical question also gets the one matching section.
fn insight_card(markdown: &str, query: &str) -> String {
    let sections = split_insight(markdown);
    if sections.is_empty() {
        return String::new();
    }
    let mut wanted = vec![InsightKind::Summary];
    if !asks_for_recent_meetings(query) {
        for kind in [InsightKind::Decisions, InsightKind::Actions, InsightKind::Topics, InsightKind::Questions] {
            if wants_insight_kind(query, kind) {
                wanted.push(kind);
            }
        }
    }
    let mut out = String::new();
    for kind in wanted {
        let Some((_, text)) = sections.iter().find(|(kept, _)| *kept == kind) else {
            continue;
        };
        let label = match kind {
            InsightKind::Summary => "Resumen",
            InsightKind::Decisions => "Decisiones",
            InsightKind::Actions => "Acciones",
            InsightKind::Topics => "Temas",
            InsightKind::Questions => "Preguntas",
        };
        let clip = if kind == InsightKind::Summary { 500 } else { 1_200 };
        out.push_str(label);
        out.push_str(": ");
        out.push_str(&take_chars(text, clip));
        out.push('\n');
    }
    out.trim().to_string()
}

async fn stored_insight(pool: &SqlitePool, meeting_id: &str, max_chars: usize) -> Result<String, String> {
    let raw: Option<String> = sqlx::query_scalar(
        "SELECT result FROM summary_processes WHERE meeting_id=? AND status='completed'",
    )
    .bind(meeting_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .flatten();
    let Some(raw) = raw else {
        return Ok(String::new());
    };
    let Ok(value) = serde_json::from_str::<Value>(&raw) else {
        return Ok(String::new());
    };
    let markdown = value
        .get("markdown")
        .and_then(Value::as_str)
        .or_else(|| value.pointer("/english_cache/markdown").and_then(Value::as_str))
        .unwrap_or("")
        .trim();
    Ok(take_chars(markdown, max_chars))
}

fn row_source(row: &ChunkRow, text: String) -> Source {
    Source {
        id: row.id.clone(),
        meeting_id: Some(row.meeting_id.clone()),
        session_id: None,
        title: row.title.clone(),
        text,
        start: row.start,
        end: row.end,
        date: Some(day_label(&row.created_at)),
    }
}

fn insight_source(row: &ChunkRow, text: String) -> Source {
    Source {
        id: format!("{}:insight", row.meeting_id),
        meeting_id: Some(row.meeting_id.clone()),
        session_id: None,
        title: row.title.clone(),
        text,
        start: 0.0,
        end: None,
        date: Some(day_label(&row.created_at)),
    }
}

async fn meetings_from_selection(
    pool: &SqlitePool,
    rows: &[ChunkRow],
    selected: &[(String, f32)],
    query: &str,
    limits: ChatLimits,
) -> Result<Vec<ChatMeeting>, String> {
    let mut meetings = Vec::new();
    for (meeting_id, _) in selected {
        let Some(sample) = rows.iter().find(|row| &row.meeting_id == meeting_id) else {
            continue;
        };
        let markdown = stored_insight(pool, meeting_id, limits.insight_chars).await?;
        let card = insight_card(&markdown, query);
        // The first packet is the insight card only. The transcript stays on disk until a read.
        let text = if card.is_empty() { "Sin insights.".into() } else { card };
        let passages = vec![insight_source(sample, text)];
        meetings.push(ChatMeeting {
            id: meeting_id.clone(),
            title: sample.title.clone(),
            client: sample.client.clone(),
            project: sample.project.clone(),
            date: day_label(&sample.created_at),
            passages,
        });
    }
    meetings.sort_by(|a, b| b.date.cmp(&a.date).then_with(|| a.id.cmp(&b.id)));
    trim_chat_meetings(&mut meetings, limits.char_budget);
    Ok(meetings)
}

pub fn trim_chat_meetings(meetings: &mut Vec<ChatMeeting>, budget: usize) {
    let size = |items: &[ChatMeeting]| {
        items
            .iter()
            .flat_map(|meeting| meeting.passages.iter())
            .map(|passage| passage.text.chars().count())
            .sum::<usize>()
    };
    while size(meetings) > budget && meetings.len() > 1 {
        meetings.pop();
    }
    while size(meetings) > budget {
        let Some(meeting) = meetings.last_mut() else {
            break;
        };
        if meeting.passages.len() > 1 {
            meeting.passages.pop();
            continue;
        }
        let Some(passage) = meeting.passages.last_mut() else {
            break;
        };
        if passage.text.chars().count() <= 400 {
            break;
        }
        let keep = passage.text.chars().count() / 2;
        passage.text = take_chars(&passage.text, keep);
    }
}

async fn next_embedding_batch(pool: &SqlitePool) -> Result<Vec<EmbedJob>, String> {
    let rows = sqlx::query(
        "SELECT c.id AS id, c.text AS text, COALESCE(m.title,'') AS title, COALESCE(m.client,'') AS client, COALESCE(m.project,'') AS project, COALESCE(m.created_at,'') AS created_at FROM assistant_chunks c JOIN meetings m ON m.id=c.meeting_id WHERE c.embedding IS NULL OR c.revision!=? ORDER BY m.created_at DESC LIMIT 8",
    )
    .bind(EMBEDDING_REVISION)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows
        .iter()
        .map(|row| EmbedJob {
            id: row.get("id"),
            text: row.get("text"),
            title: row.get("title"),
            client: row.get("client"),
            project: row.get("project"),
            created_at: row.get("created_at"),
        })
        .collect())
}

async fn query_vector(app: &tauri::AppHandle, query: &str) -> Result<Option<Vec<f32>>, String> {
    let path = directory(app)?;
    if !ready(&path) {
        return Ok(None);
    }
    let text = query.to_string();
    Ok(Some(
        tauri::async_runtime::spawn_blocking(move || embed(&path, &text, true))
            .await
            .map_err(|e| e.to_string())??,
    ))
}

async fn search_chat_with_vector(
    pool: &SqlitePool,
    query: &str,
    vector: Option<Vec<f32>>,
    client: Option<&str>,
    project: Option<&str>,
    from: Option<&str>,
    to: Option<&str>,
    limits: ChatLimits,
) -> Result<ChatSearch, String> {
    ensure_text_index(pool).await?;
    let rows = load_scoped_chunks(pool, client, project, from, to).await?;
    let partial = vector.is_none() || missing_embeddings(pool, client, project, from, to).await?;
    let lexical = lexical_ids(pool, &or_keywords(query), client, project, from, to).await?;
    let and_hits = lexical_ids(pool, &and_keywords(query), client, project, from, to).await?;
    let metadata = metadata_meeting_ids(pool, query, client, project, from, to).await?;
    let recent = recent_meeting_ids(pool, client, project, from, to).await?;
    let lexical_rank: std::collections::HashMap<&str, usize> = lexical
        .iter()
        .take(SHORTLIST)
        .enumerate()
        .map(|(rank, id)| (id.as_str(), rank))
        .collect();
    let and_set: std::collections::HashSet<&str> = and_hits.iter().map(String::as_str).collect();
    let metadata_set: std::collections::HashSet<&str> = metadata.iter().map(String::as_str).collect();
    let recent_set: std::collections::HashSet<&str> = recent.iter().map(String::as_str).collect();
    let mut candidates = Vec::with_capacity(rows.len());
    for row in &rows {
        let cosine_score = vector.as_ref().and_then(|query_vector| {
            let blob = row.embedding.as_ref()?;
            (blob.len() == query_vector.len() * 4).then(|| cosine(blob, query_vector))
        });
        let insight = is_summary_chunk(&row.id);
        let candidate = ChatCandidate {
            id: row.id.clone(),
            meeting_id: row.meeting_id.clone(),
            age_days: meeting_age_days(&row.created_at),
            cosine: cosine_score,
            lexical_rank: lexical_rank.get(row.id.as_str()).copied(),
            and_match: and_set.contains(row.id.as_str()),
            metadata: metadata_set.contains(row.meeting_id.as_str()),
            recent_insight: insight && recent_set.contains(row.meeting_id.as_str()),
            insight,
        };
        candidates.push(candidate);
    }
    let selected = if asks_for_recent_meetings(query) {
        let present: std::collections::HashSet<&str> = rows.iter().map(|row| row.meeting_id.as_str()).collect();
        recent
            .iter()
            .filter(|id| present.contains(id.as_str()))
            .take(limits.max_meetings)
            .map(|id| (id.clone(), 0.0))
            .collect()
    } else {
        select_chat_meetings(&candidates, limits.max_meetings)
    };
    let meetings = meetings_from_selection(pool, &rows, &selected, query, limits).await?;
    Ok(ChatSearch { meetings, partial })
}

/// Search used by the chat agent. Meetings come back newest first.
pub async fn search_chat_meetings(
    app: &tauri::AppHandle,
    pool: &SqlitePool,
    query: &str,
    client: Option<&str>,
    project: Option<&str>,
    from: Option<&str>,
    to: Option<&str>,
    limits: ChatLimits,
) -> Result<ChatSearch, String> {
    let vector = query_vector(app, query).await?;
    search_chat_with_vector(pool, query, vector, client, project, from, to, limits).await
}

/// Read one meeting inside the conversation scope. `None` when it is outside that scope.
pub async fn read_chat_meeting(
    app: &tauri::AppHandle,
    pool: &SqlitePool,
    meeting_id: &str,
    query: &str,
    client: Option<&str>,
    project: Option<&str>,
    limits: ChatLimits,
) -> Result<Option<ChatMeeting>, String> {
    let vector = query_vector(app, query).await?;
    read_chat_with_vector(pool, meeting_id, query, vector, client, project, limits).await
}

async fn read_chat_with_vector(
    pool: &SqlitePool,
    meeting_id: &str,
    query: &str,
    vector: Option<Vec<f32>>,
    client: Option<&str>,
    project: Option<&str>,
    limits: ChatLimits,
) -> Result<Option<ChatMeeting>, String> {
    ensure_text_index(pool).await?;
    let sql = format!(
        "SELECT id, COALESCE(title,'') AS title, COALESCE(client,'') AS client, COALESCE(project,'') AS project, COALESCE(created_at,'') AS created_at FROM meetings WHERE id=? AND {}",
        scope_clause("meetings")
    );
    let header = sqlx::query(&sql).bind(meeting_id);
    let row = bind_scope!(header, client, project, None::<&str>, None::<&str>)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;
    let Some(row) = row else {
        return Ok(None);
    };
    let sample = ChunkRow {
        id: String::new(),
        meeting_id: row.get("id"),
        text: String::new(),
        start: 0.0,
        end: None,
        embedding: None,
        title: row.get("title"),
        client: row.get("client"),
        project: row.get("project"),
        created_at: row.get("created_at"),
    };
    let chunks = sqlx::query(
        "SELECT c.id AS id, c.meeting_id AS meeting_id, c.text AS text, c.start AS start, c.end AS end, c.embedding AS embedding FROM assistant_chunks c WHERE c.meeting_id=?",
    )
    .bind(meeting_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    let terms = content_terms(query);
    let mut windows: Vec<(f32, ChunkRow)> = chunks
        .iter()
        .filter(|row| !is_summary_chunk(&row.get::<String, _>("id")))
        .map(|row| {
            let text: String = row.get("text");
            let embedding: Option<Vec<u8>> = row.get("embedding");
            let cosine_score = vector.as_ref().and_then(|query_vector| {
                let blob = embedding.as_ref()?;
                (blob.len() == query_vector.len() * 4).then(|| cosine(blob, query_vector))
            });
            let overlap = terms
                .iter()
                .filter(|term| text.to_lowercase().contains(term.as_str()))
                .count() as f32;
            let score = cosine_score.unwrap_or(0.0) + overlap * 0.05;
            (
                score,
                ChunkRow {
                    id: row.get("id"),
                    meeting_id: sample.meeting_id.clone(),
                    text,
                    start: row.get("start"),
                    end: row.get("end"),
                    embedding: None,
                    title: sample.title.clone(),
                    client: sample.client.clone(),
                    project: sample.project.clone(),
                    created_at: sample.created_at.clone(),
                },
            )
        })
        .collect();
    windows.sort_by(|a, b| b.0.total_cmp(&a.0).then_with(|| a.1.start.total_cmp(&b.1.start)));
    windows.truncate(2);
    windows.sort_by(|a, b| a.1.start.total_cmp(&b.1.start));
    let markdown = stored_insight(pool, meeting_id, limits.insight_chars).await?;
    let mut passages = Vec::new();
    let card = insight_card(&markdown, query);
    if !card.is_empty() {
        passages.push(insight_source(&sample, card));
    }
    for (_, row) in windows {
        passages.push(row_source(&row, take_chars(&row.text, 400)));
    }
    if passages.is_empty() {
        return Ok(None);
    }
    Ok(Some(ChatMeeting {
        id: sample.meeting_id,
        title: sample.title,
        client: sample.client,
        project: sample.project,
        date: day_label(&sample.created_at),
        passages,
    }))
}

pub async fn retrieve(
    app: &tauri::AppHandle,
    pool: &SqlitePool,
    question: &str,
    client: &str,
    project: &str,
    from: Option<&str>,
    to: Option<&str>,
) -> Result<(Vec<Source>, bool), String> {
    search_scoped(app, pool, question, Some(client), Some(project), from, to, 2).await
}

async fn text_matches(
    pool: &SqlitePool,
    keywords: &str,
    client: &str,
    project: &str,
    from: Option<&str>,
    to: Option<&str>,
) -> Result<Vec<String>, String> {
    lexical_ids(pool, keywords, Some(client), Some(project), from, to).await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unicode_windows_overlap_without_losing_tail() {
        let text = "decisi\u{f3}n \u{e1}gil \u{65e5}\u{672c}\u{8a9e} ".repeat(150);
        let windows = merged_windows(&[(text, 0.0, None)]);
        assert!(windows.len() > 1);
        assert!(windows.last().unwrap().0.ends_with("\u{65e5}\u{672c}\u{8a9e}"));
        assert!(windows.iter().all(|w| w.0.chars().count() <= WINDOW_CHARS));
    }
    #[tokio::test]
    async fn index_is_idempotent_scoped_and_invalidated_on_retranscription() {
        let pool = crate::desktop::test_pool().await;
        sqlx::raw_sql("INSERT INTO meetings(id,title,client,project,created_at) VALUES('a','A','Norte','Portal','2026-10-01'),('b','B','Sur','Portal','2026-10-01'); INSERT INTO transcripts(id,meeting_id,transcript,audio_start_time) VALUES('ta','a','Decisión de entrega viernes',10),('tb','b','Decisión de entrega lunes',20);").execute(&pool).await.unwrap();
        ensure_text_index(&pool).await.unwrap();
        ensure_text_index(&pool).await.unwrap();
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM assistant_chunks")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 2);
        let matches = text_matches(&pool, "decision", "Norte", "Portal", None, None)
            .await
            .unwrap();
        assert_eq!(matches.len(), 1);
        assert!(matches[0].starts_with("a:"));
        assert!(text_matches(
            &pool,
            "decision",
            "Norte",
            "Portal",
            Some("2026-10-02"),
            None
        )
        .await
        .unwrap()
        .is_empty());
        sqlx::query("UPDATE transcripts SET transcript='Cambio de alcance' WHERE id='ta'")
            .execute(&pool)
            .await
            .unwrap();
        assert!(
            text_matches(&pool, "decision", "Norte", "Portal", None, None)
                .await
                .unwrap()
                .is_empty()
        );
        ensure_text_index(&pool).await.unwrap();
        assert_eq!(
            text_matches(&pool, "alcance", "Norte", "Portal", None, None)
                .await
                .unwrap()
                .len(),
            1
        );
    }
    #[test]
    #[ignore = "Requires the pinned model files; set MEETPULSE_EMBEDDING_TEST_DIR"]
    fn actual_e5_matches_spanish_paraphrases_offline() {
        let path =
            PathBuf::from(std::env::var("MEETPULSE_EMBEDDING_TEST_DIR").expect("model directory"));
        let query = embed(&path, "¿Cuándo estará lista la entrega del proyecto?", true).unwrap();
        let correct = embed(
            &path,
            "El equipo acordó finalizar e implementar el portal este viernes.",
            false,
        )
        .unwrap();
        let unrelated = embed(
            &path,
            "La receta de pan lleva harina, agua y levadura.",
            false,
        )
        .unwrap();
        assert_eq!(query.len(), 384);
        let yes = cosine(&encode_vector(&correct), &query);
        let no = cosine(&encode_vector(&unrelated), &query);
        println!("Relevant similarity: {yes}; unrelated: {no}");
        assert!(yes > no);
    }
    #[test]
    fn short_segments_merge_into_overlapping_passages_with_start_times() {
        let rows: Vec<(String, f64, Option<f64>)> = (0..60)
            .map(|i| (format!("segment number {i} with a few words"), i as f64 * 5.0, Some(i as f64 * 5.0 + 4.0)))
            .collect();
        let windows = merged_windows(&rows);
        assert!(windows.len() > 1 && windows.len() < rows.len());
        assert_eq!(windows[0].1, 0.0);
        assert!(windows[0].0.chars().count() <= WINDOW_CHARS);
        assert!(windows[1].1 > windows[0].1);
        assert!(merged_windows(&[]).is_empty());
        assert!(merged_windows(&[("  ".to_string(), 0.0, None)]).is_empty());
    }

    #[test]
    fn summary_text_is_extracted_and_passages_are_recognised() {
        let lines = summary_lines(r###"{"markdown":"## Decisions\n- **Approve** the budget\n\nNext steps"}"###);
        assert_eq!(lines, vec!["Decisions", "Approve the budget", "Next steps"]);
        let cached = summary_lines(r#"{"english_cache":{"markdown":"Only cached"}}"#);
        assert_eq!(cached, vec!["Only cached"]);
        assert!(summary_lines("not json").is_empty());
        assert!(is_summary_chunk("meeting-1:s0") && is_summary_chunk("a:b:s12"));
        assert!(!is_summary_chunk("meeting-1:w3") && !is_summary_chunk("s1x") && !is_summary_chunk("meeting:s"));
    }

    #[tokio::test]
    async fn summaries_are_indexed_and_rebuilt_when_they_change() {
        let pool = crate::desktop::test_pool().await;
        sqlx::raw_sql("INSERT INTO meetings(id,title,created_at) VALUES('a','A','2026-10-01'); INSERT INTO summary_processes(meeting_id,status,result) VALUES('a','completed','{\"markdown\":\"Approved the irrigation budget\"}');").execute(&pool).await.unwrap();
        ensure_text_index(&pool).await.unwrap();
        let text: String = sqlx::query_scalar("SELECT text FROM assistant_chunks WHERE id='a:s0'").fetch_one(&pool).await.unwrap();
        assert!(text.contains("Approved the irrigation budget"));

        sqlx::query("UPDATE summary_processes SET result='{\"markdown\":\"Moved to next quarter\"}' WHERE meeting_id='a'").execute(&pool).await.unwrap();
        let stale: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM assistant_chunks WHERE id GLOB '*:s[0-9]*'").fetch_one(&pool).await.unwrap();
        assert_eq!(stale, 0);
        ensure_text_index(&pool).await.unwrap();
        let text: String = sqlx::query_scalar("SELECT text FROM assistant_chunks WHERE id='a:s0'").fetch_one(&pool).await.unwrap();
        assert_eq!(text, "Moved to next quarter");
    }

    #[test]
    fn gate_keeps_only_standouts() {
        let mut scores: Vec<(String, f32)> = (0..30).map(|i| (format!("c{i}"), 0.78 + (i % 5) as f32 * 0.005)).collect();
        scores.push(("hit".into(), 0.90));
        scores.sort_by(|a, b| b.1.total_cmp(&a.1));
        let kept = gate_semantic(scores);
        assert_eq!(kept.len(), 1);
        assert_eq!(kept[0].0, "hit");
        let flat: Vec<(String, f32)> = (0..30).map(|i| (format!("c{i}"), 0.80 + (i % 5) as f32 * 0.005)).collect();
        assert!(gate_semantic(flat).is_empty());
    }

    #[test]
    fn vector_roundtrip_and_cosine() {
        assert!((cosine(&encode_vector(&[0.6, 0.8]), &[0.6, 0.8]) - 1.0).abs() < 0.0001);
    }

    #[test]
    fn content_terms_drop_stopwords_and_accents() {
        assert_eq!(content_terms("qué se decidió sobre el riego"), vec!["decidio", "riego"]);
    }

    #[test]
    fn diversity_keeps_two_passages_per_meeting() {
        let ranked = vec![
            ("a:s0".into(), "a".into()),
            ("a:w0".into(), "a".into()),
            ("a:w1".into(), "a".into()),
            ("b:s0".into(), "b".into()),
        ];
        assert_eq!(take_diverse(ranked, 12, 2), vec!["a:s0", "a:w0", "b:s0"]);
    }

    #[tokio::test]
    async fn corpus_lexical_includes_summaries_and_respects_client() {
        let pool = crate::desktop::test_pool().await;
        sqlx::raw_sql("INSERT INTO meetings(id,title,client,project,created_at) VALUES('a','Riego','Norte','Portal','2026-10-01'),('b','Clima','Norte','Portal','2026-10-02'),('c','Sur','Sur','Otro','2026-10-03'); INSERT INTO summary_processes(meeting_id,status,result) VALUES('a','completed','{\"markdown\":\"Decidimos el presupuesto de riego para el viernes\"}'); INSERT INTO transcripts(id,meeting_id,transcript,audio_start_time) VALUES('tb','b','que hay sobre el clima de manana',1),('tc','c','presupuesto de riego del sur',1);").execute(&pool).await.unwrap();
        ensure_text_index(&pool).await.unwrap();
        let keywords = and_keywords("presupuesto de riego");
        let norte = lexical_ids(&pool, &keywords, Some("Norte"), Some(""), None, None).await.unwrap();
        assert!(norte.iter().any(|id| id.starts_with("a:s")), "{norte:?}");
        assert!(norte.iter().all(|id| id.starts_with("a:")));
        let loose = lexical_ids(&pool, &and_keywords("qué hay sobre el presupuesto de riego"), None, None, None, None).await.unwrap();
        assert!(loose.iter().all(|id| !id.starts_with("b:")), "{loose:?}");
        assert!(loose.iter().any(|id| id.starts_with("a:s")), "{loose:?}");
    }

    fn unit(first: f32) -> Vec<f32> {
        let mut values = vec![0f32; 384];
        values[0] = first;
        values[1] = (1.0 - first * first).max(0.0).sqrt();
        values
    }

    fn candidate(
        id: &str,
        meeting: &str,
        age: f32,
        cosine: Option<f32>,
        lexical_rank: Option<usize>,
        and_match: bool,
    ) -> ChatCandidate {
        ChatCandidate {
            id: id.into(),
            meeting_id: meeting.into(),
            age_days: age,
            cosine,
            lexical_rank,
            and_match,
            metadata: false,
            recent_insight: false,
            insight: false,
        }
    }

    #[test]
    fn chat_shortlist_keeps_a_recent_paraphrase_among_thousands() {
        let mut rows = Vec::with_capacity(3_003);
        for index in 0..3_000 {
            rows.push(candidate(
                &format!("n{index}:w0"),
                &format!("n{index}"),
                120.0,
                Some(0.80),
                None,
                false,
            ));
        }
        rows.push(candidate("noise:w0", "noise", 400.0, Some(0.91), None, false));
        rows.push(candidate("old:w0", "old", 400.0, Some(0.88), Some(0), true));
        rows.push(candidate("recent:w0", "recent", 1.0, Some(0.87), None, false));
        let ranked = select_chat_meetings(&rows, 1);
        assert_eq!(ranked[0].0, "recent", "{ranked:?}");

        let mut stronger_old = rows;
        if let Some(old) = stronger_old.iter_mut().find(|row| row.meeting_id == "old") {
            old.cosine = Some(0.97);
        }
        let ranked = select_chat_meetings(&stronger_old, 1);
        assert_eq!(ranked[0].0, "old", "{ranked:?}");
    }

    #[test]
    fn chat_window_grows_with_the_model_context() {
        assert_eq!(chat_limits_for(128_000).max_meetings, 8);
        assert_eq!(chat_limits_for(8_192).max_meetings, 2);
        assert!(chat_limits_for(128_000).char_budget > chat_limits_for(8_192).char_budget);
    }

    #[test]
    fn embedded_passage_carries_meeting_metadata() {
        let text = embed_passage("m:s0", "Riego", "Norte", "Portal", "2026-10-18T15:00:00Z", "hola");
        assert_eq!(text, "Riego. Norte. Portal. 2026-10-18. insight. hola");
    }

    #[tokio::test]
    async fn embedding_batch_takes_the_newest_meeting_first() {
        let pool = crate::desktop::test_pool().await;
        sqlx::raw_sql("INSERT INTO meetings(id,title,created_at) VALUES('old','Vieja','2020-01-01'),('new','Nueva','2026-10-20'); INSERT INTO assistant_chunks(id,meeting_id,text,start) VALUES('old:w0','old','antes',0),('new:w0','new','ahora',0);").execute(&pool).await.unwrap();
        let batch = next_embedding_batch(&pool).await.unwrap();
        assert_eq!(batch[0].id, "new:w0");
    }

    #[tokio::test]
    async fn chat_search_prefers_recent_paraphrase_and_keeps_loose_words() {
        let pool = crate::desktop::test_pool().await;
        let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
        sqlx::query("INSERT INTO meetings(id,title,client,project,created_at) VALUES('recent','Entrega','Norte','Portal',?),('old','Contrato','Norte','Portal','2020-01-01'),('noise','Otra','Norte','Portal','2020-06-01')")
            .bind(&today)
            .execute(&pool)
            .await
            .unwrap();
        let mut tx = pool.begin().await.unwrap();
        for (id, meeting, text, cosine) in [
            ("recent:w0", "recent", "El equipo cerró la entrega del portal", 0.87f32),
            ("old:w0", "old", "presupuesto de riego del contrato", 0.88),
            ("noise:w0", "noise", "notas sueltas de la oficina", 0.91),
        ] {
            sqlx::query("INSERT INTO assistant_chunks(id,meeting_id,text,start,embedding,revision) VALUES(?,?,?,0,?,?)")
                .bind(id)
                .bind(meeting)
                .bind(text)
                .bind(encode_vector(&unit(cosine)))
                .bind(EMBEDDING_REVISION)
                .execute(&mut *tx)
                .await
                .unwrap();
        }
        tx.commit().await.unwrap();
        let limits = ChatLimits {
            max_meetings: 1,
            windows_per_meeting: 4,
            insight_chars: 2_000,
            window_chars: 800,
            char_budget: 20_000,
        };
        let found = search_chat_with_vector(
            &pool,
            "presupuesto de riego",
            Some(unit(1.0)),
            Some("Norte"),
            Some("Portal"),
            None,
            None,
            limits,
        )
        .await
        .unwrap();
        assert_eq!(found.meetings.len(), 1, "{:?}", found.meetings.iter().map(|m| &m.id).collect::<Vec<_>>());
        assert_eq!(found.meetings[0].id, "recent");
        assert_eq!(found.meetings[0].date, today);

        let loose = search_chat_with_vector(
            &pool,
            "presupuesto de riego inexistente",
            None,
            None,
            None,
            None,
            None,
            limits,
        )
        .await
        .unwrap();
        assert!(
            loose.meetings.iter().any(|meeting| meeting.id == "old"),
            "{:?}",
            loose.meetings.iter().map(|m| &m.id).collect::<Vec<_>>()
        );
        let required = lexical_ids(
            &pool,
            &and_keywords("presupuesto de riego inexistente"),
            None,
            None,
            None,
            None,
        )
        .await
        .unwrap();
        assert!(required.is_empty(), "{required:?}");
    }

    #[tokio::test]
    async fn chat_search_finds_a_client_named_only_in_metadata() {
        let pool = crate::desktop::test_pool().await;
        sqlx::raw_sql("INSERT INTO meetings(id,title,client,project,created_at) VALUES('acme','Semanal','Acme','Portal','2026-10-18'),('otra','Semanal','Norte','Portal','2026-10-18'); INSERT INTO transcripts(id,meeting_id,transcript,timestamp,audio_start_time) VALUES('ta','acme','hablamos del cronograma','t',1),('to','otra','hablamos del cronograma','t',1);").execute(&pool).await.unwrap();
        let limits = chat_limits_for(32_768);
        let found = search_chat_with_vector(&pool, "Acme", None, None, None, None, None, limits)
            .await
            .unwrap();
        assert!(found.meetings.iter().any(|meeting| meeting.id == "acme"), "{:?}", found.meetings.iter().map(|m| m.id.as_str()).collect::<Vec<_>>());
        assert!(found.meetings.iter().all(|meeting| meeting.id != "otra"));
        let scoped = search_chat_with_vector(&pool, "cronograma", None, Some("Norte"), Some(""), None, None, limits)
            .await
            .unwrap();
        assert!(scoped.meetings.iter().all(|meeting| meeting.id == "otra"), "{:?}", scoped.meetings.iter().map(|m| &m.id).collect::<Vec<_>>());
    }

    #[test]
    fn insight_card_sends_the_summary_and_only_the_matching_section() {
        let markdown = "## Resumen\nSe hablo del iPhone.\n## Decisiones\n1. Lanzar el Duo.\n## Acciones\n- [ ] **Ana:** enviar el informe.\n";
        let recent = insight_card(markdown, "cuales son mis reuniones recientes");
        assert!(recent.contains("iPhone"), "{recent}");
        assert!(!recent.contains("Lanzar"), "{recent}");
        assert!(!recent.contains("Ana"), "{recent}");
        let decisions = insight_card(markdown, "que decidimos");
        assert!(decisions.contains("iPhone"), "{decisions}");
        assert!(decisions.contains("Lanzar"), "{decisions}");
        assert!(!decisions.contains("Ana"), "{decisions}");
        assert!(insight_card("un texto largo sin secciones", "reuniones recientes").is_empty());
    }

    #[test]
    fn recent_listing_is_detected_without_a_model() {
        assert!(asks_for_recent_meetings("¿Cuáles son mis reuniones recientes?"));
        assert!(asks_for_recent_meetings("cuáles son las últimas reuniones que he tenido"));
        assert!(!asks_for_recent_meetings("presupuesto de riego"));
    }

    #[tokio::test]
    async fn recent_question_lists_the_newest_meeting_first() {
        let pool = crate::desktop::test_pool().await;
        sqlx::raw_sql("INSERT INTO meetings(id,title,created_at) VALUES('new','iPhone','2026-10-20'),('mid','Sintesis','2026-10-19'),('old','Midpuls','2026-10-17'); INSERT INTO transcripts(id,meeting_id,transcript,audio_start_time) VALUES('tn','new','analisis del iphone duo',1),('tm','mid','evaluacion de herramientas para reuniones de consultoria',1),('to','old','desarrollo de reuniones de transcripcion',1); INSERT INTO summary_processes(meeting_id,status,result) VALUES('new','completed','{\"markdown\":\"## Resumen\\nSe hablo del iPhone.\\n## Decisiones\\n1. Lanzar el Duo.\"}'),('mid','completed','{\"markdown\":\"## Resumen\\nSe evaluaron herramientas.\\n## Decisiones\\n1. Adoptar sintesis.\"}');").execute(&pool).await.unwrap();
        let mut limits = chat_limits_for(8_192);
        limits.max_meetings = 2;
        let found = search_chat_with_vector(&pool, "cuales son mis reuniones recientes", None, None, None, None, None, limits)
            .await
            .unwrap();
        assert_eq!(found.meetings.len(), 2, "{:?}", found.meetings.iter().map(|m| &m.id).collect::<Vec<_>>());
        assert_eq!(found.meetings[0].id, "new");
        assert_eq!(found.meetings[0].date, "2026-10-20");
        assert_eq!(found.meetings[1].id, "mid");
        let newest = &found.meetings[0].passages[0].text;
        assert!(newest.contains("iPhone"), "{newest}");
        assert!(!newest.contains("Lanzar"), "{newest}");
        assert!(!newest.contains("analisis del iphone"), "{newest}");
        let topical = search_chat_with_vector(&pool, "reuniones de consultoria", None, None, None, None, None, limits)
            .await
            .unwrap();
        assert!(topical.meetings.iter().all(|meeting| meeting.id != "new"), "{:?}", topical.meetings.iter().map(|m| &m.id).collect::<Vec<_>>());
    }

    #[tokio::test]
    async fn read_outside_the_client_returns_nothing() {
        let pool = crate::desktop::test_pool().await;
        sqlx::raw_sql("INSERT INTO meetings(id,title,client,project,created_at) VALUES('norte','Norte','Norte','Portal','2026-10-18'),('sur','Sur','Sur','Otro','2026-10-18'); INSERT INTO transcripts(id,meeting_id,transcript,audio_start_time) VALUES('tn','norte','el plazo es viernes',1),('ts','sur','el plazo es lunes',1);").execute(&pool).await.unwrap();
        let limits = chat_limits_for(32_768);
        let outside = read_chat_with_vector(&pool, "sur", "plazo", None, Some("Norte"), Some("Portal"), limits)
            .await
            .unwrap();
        assert!(outside.is_none());
        let inside = read_chat_with_vector(&pool, "norte", "plazo", None, Some("Norte"), Some("Portal"), limits)
            .await
            .unwrap();
        let inside = inside.expect("in-scope meeting");
        assert_eq!(inside.id, "norte");
        assert!(inside.passages.iter().any(|passage| passage.text.contains("viernes")));
        let unknown = read_chat_with_vector(&pool, "missing", "plazo", None, Some("Norte"), None, limits)
            .await
            .unwrap();
        assert!(unknown.is_none());
    }
}
