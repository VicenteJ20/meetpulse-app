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
fn text_windows(text: &str) -> Vec<String> {
    let chars: Vec<char> = text.chars().collect();
    let mut result = Vec::new();
    let mut start = 0;
    while start < chars.len() {
        let end = (start + 900).min(chars.len());
        result.push(chars[start..end].iter().collect());
        if end == chars.len() {
            break;
        }
        start = end.saturating_sub(150);
    }
    result
}
pub async fn ensure_text_index(pool: &SqlitePool) -> Result<(), String> {
    ensure_scoped_text_index(pool, None, None).await
}
async fn ensure_scoped_text_index(
    pool: &SqlitePool,
    client: Option<&str>,
    project: Option<&str>,
) -> Result<(), String> {
    let meetings=sqlx::query_scalar::<_,String>("SELECT id FROM meetings WHERE (? IS NULL OR client=?) AND (? IS NULL OR project=?) AND EXISTS(SELECT 1 FROM transcripts WHERE meeting_id=meetings.id) AND NOT EXISTS(SELECT 1 FROM assistant_chunks WHERE meeting_id=meetings.id)").bind(client).bind(client).bind(project).bind(project).fetch_all(pool).await.map_err(|e|e.to_string())?;
    for meeting in meetings {
        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
        let rows=sqlx::query("SELECT transcript,COALESCE(audio_start_time,0) AS start,audio_end_time AS end FROM transcripts WHERE meeting_id=? ORDER BY COALESCE(audio_start_time,0),rowid").bind(&meeting).fetch_all(&mut *tx).await.map_err(|e|e.to_string())?;
        for (i, row) in rows.iter().enumerate() {
            let text: String = row.get("transcript");
            for (j, text) in text_windows(&text).into_iter().enumerate() {
                sqlx::query("INSERT OR IGNORE INTO assistant_chunks(id,meeting_id,text,start,end) VALUES(?,?,?,?,?)").bind(format!("{}:{}:{}",meeting,i,j)).bind(&meeting).bind(text).bind(row.get::<f64,_>("start")).bind(row.get::<Option<f64>,_>("end")).execute(&mut *tx).await.map_err(|e|e.to_string())?;
            }
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
    .bind(REVISION)
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
    let (sources, partial) = retrieve_all(&app, pool, &query).await?;
    Ok(json!({"sources": sources, "partial": partial}))
}

pub async fn retrieve_all(
    app: &tauri::AppHandle,
    pool: &SqlitePool,
    query: &str,
) -> Result<(Vec<Source>, bool), String> {
    ensure_text_index(pool).await?;
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
        "SELECT c.id,c.meeting_id,c.text,c.start,c.end,c.embedding,m.title FROM assistant_chunks c JOIN meetings m ON m.id=c.meeting_id ORDER BY m.created_at DESC LIMIT 50000",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    let partial = !available
        || rows
            .iter()
            .any(|row| row.get::<Option<Vec<u8>>, _>("embedding").is_none());
    let keywords = query
        .split(|c: char| !c.is_alphanumeric())
        .filter(|word| word.chars().count() > 2)
        .take(24)
        .map(|word| format!("\"{}\"", word.replace('"', "")))
        .collect::<Vec<_>>()
        .join(" OR ");
    let lexical = text_matches_all(pool, &keywords).await?;
    let mut semantic: Vec<(String, f32)> = rows
        .iter()
        .filter_map(|row| {
            Some((
                row.get("id"),
                cosine(
                    &row.get::<Option<Vec<u8>>, _>("embedding")?,
                    query_vector.as_ref()?,
                ),
            ))
        })
        .collect();
    semantic.sort_by(|a, b| b.1.total_cmp(&a.1));

    let mut scores = std::collections::HashMap::<String, f32>::new();
    for (rank, id) in lexical.iter().enumerate() {
        *scores.entry(id.clone()).or_default() += 1.0 / (60 + rank) as f32;
    }
    for (rank, (id, _)) in semantic.iter().take(60).enumerate() {
        *scores.entry(id.clone()).or_default() += 1.0 / (60 + rank) as f32;
    }
    let mut ranked: Vec<_> = scores.into_iter().collect();
    ranked.sort_by(|a, b| b.1.total_cmp(&a.1));
    let sources: Vec<Source> = ranked
        .into_iter()
        .take(8)
        .filter_map(|(id, _)| {
            let row = rows.iter().find(|row| row.get::<String, _>("id") == id)?;
            Some(Source {
                id,
                meeting_id: Some(row.get("meeting_id")),
                session_id: None,
                title: row.get("title"),
                text: row.get("text"),
                start: row.get("start"),
                end: row.get("end"),
            })
        })
        .collect();
    Ok((sources, partial))
}

async fn text_matches_all(pool: &SqlitePool, keywords: &str) -> Result<Vec<String>, String> {
    if keywords.is_empty() {
        return Ok(vec![]);
    }
    sqlx::query_scalar::<_, String>(
        "SELECT c.id FROM assistant_fts f JOIN assistant_chunks c ON c.id=f.id WHERE assistant_fts MATCH ? ORDER BY bm25(assistant_fts) LIMIT 60",
    )
    .bind(keywords)
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
        let rows = sqlx::query(
            "SELECT id,text FROM assistant_chunks WHERE embedding IS NULL OR revision!=? LIMIT 8",
        )
        .bind(REVISION)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
        if rows.is_empty() {
            break;
        }
        for row in rows {
            if INDEX_CANCEL.load(Ordering::Relaxed)
                || super::assistant::RECORDING.load(Ordering::Relaxed)
            {
                break;
            }
            let id: String = row.get("id");
            let text: String = row.get("text");
            let root = path.clone();
            let vector = tauri::async_runtime::spawn_blocking(move || embed(&root, &text, false))
                .await
                .map_err(|e| e.to_string())??;
            sqlx::query("UPDATE assistant_chunks SET embedding=?,revision=? WHERE id=?")
                .bind(encode_vector(&vector))
                .bind(REVISION)
                .bind(id)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
        }
        tokio::task::yield_now().await;
    }
    Ok(())
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
    ensure_scoped_text_index(pool, Some(client), Some(project)).await?;
    let path = directory(app)?;
    let available = ready(&path);
    let q = if available {
        let text = question.to_string();
        Some(
            tauri::async_runtime::spawn_blocking(move || embed(&path, &text, true))
                .await
                .map_err(|e| e.to_string())??,
        )
    } else {
        None
    };
    let rows=sqlx::query("SELECT c.id,c.meeting_id,c.text,c.start,c.end,c.embedding,m.title FROM assistant_chunks c JOIN meetings m ON m.id=c.meeting_id WHERE m.client=? AND m.project=? AND (? IS NULL OR date(m.created_at)>=date(?)) AND (? IS NULL OR date(m.created_at)<=date(?))").bind(client).bind(project).bind(from).bind(from).bind(to).bind(to).fetch_all(pool).await.map_err(|e|e.to_string())?;
    let partial = !available
        || rows
            .iter()
            .any(|r| r.get::<Option<Vec<u8>>, _>("embedding").is_none());
    let keywords = question
        .split(|c: char| !c.is_alphanumeric())
        .filter(|s| s.chars().count() > 2)
        .take(24)
        .map(|s| format!("\"{}\"", s.replace('"', "")))
        .collect::<Vec<_>>()
        .join(" OR ");
    let lexical = text_matches(pool, &keywords, client, project, from, to).await?;
    let mut semantic: Vec<(String, f32)> = rows
        .iter()
        .filter_map(|r| {
            Some((
                r.get("id"),
                cosine(&r.get::<Option<Vec<u8>>, _>("embedding")?, q.as_ref()?),
            ))
        })
        .collect();
    semantic.sort_by(|a, b| b.1.total_cmp(&a.1));
    let mut scores = std::collections::HashMap::<String, f32>::new();
    for (i, id) in lexical.iter().enumerate() {
        *scores.entry(id.clone()).or_default() += 1.0 / (60 + i) as f32;
    }
    for (i, (id, _)) in semantic.iter().take(60).enumerate() {
        *scores.entry(id.clone()).or_default() += 1.0 / (60 + i) as f32;
    }
    let mut ranked: Vec<_> = scores.into_iter().collect();
    ranked.sort_by(|a, b| b.1.total_cmp(&a.1));
    let sources = ranked
        .into_iter()
        .take(12)
        .filter_map(|(id, _)| {
            let r = rows.iter().find(|r| r.get::<String, _>("id") == id)?;
            Some(Source {
                id,
                meeting_id: Some(r.get("meeting_id")),
                session_id: None,
                title: r.get("title"),
                text: r.get("text"),
                start: r.get("start"),
                end: r.get("end"),
            })
        })
        .collect();
    Ok((sources, partial))
}

async fn text_matches(
    pool: &SqlitePool,
    keywords: &str,
    client: &str,
    project: &str,
    from: Option<&str>,
    to: Option<&str>,
) -> Result<Vec<String>, String> {
    if keywords.is_empty() {
        return Ok(vec![]);
    }
    sqlx::query_scalar::<_,String>("SELECT c.id FROM assistant_fts f JOIN assistant_chunks c ON c.id=f.id JOIN meetings m ON m.id=c.meeting_id WHERE assistant_fts MATCH ? AND m.client=? AND m.project=? AND (? IS NULL OR date(m.created_at)>=date(?)) AND (? IS NULL OR date(m.created_at)<=date(?)) ORDER BY bm25(assistant_fts) LIMIT 60").bind(&keywords).bind(client).bind(project).bind(from).bind(from).bind(to).bind(to).fetch_all(pool).await.map_err(|e|e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unicode_windows_overlap_without_losing_tail() {
        let text = "decisiÃ³n Ã¡gil æ—¥æœ¬èªž ".repeat(150);
        let windows = text_windows(&text);
        assert!(windows.len() > 1);
        assert!(windows.last().unwrap().ends_with("æ—¥æœ¬èªž "));
        assert!(windows.iter().all(|s| s.chars().count() <= 900));
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
    fn vector_roundtrip_and_cosine() {
        assert!((cosine(&encode_vector(&[0.6, 0.8]), &[0.6, 0.8]) - 1.0).abs() < 0.0001);
    }
}
