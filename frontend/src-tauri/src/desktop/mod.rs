pub mod assistant;
pub mod providers;
pub mod search;

#[cfg(test)]
pub(crate) async fn test_pool() -> sqlx::SqlitePool {
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::raw_sql("CREATE TABLE meetings(id TEXT PRIMARY KEY,title TEXT,client TEXT,project TEXT,created_at TEXT,updated_at TEXT,folder_path TEXT,additional_context TEXT); CREATE TABLE transcripts(id TEXT PRIMARY KEY,meeting_id TEXT,transcript TEXT,timestamp TEXT,audio_start_time REAL,audio_end_time REAL,duration REAL,speaker TEXT); CREATE TABLE summary_processes(meeting_id TEXT PRIMARY KEY,status TEXT,result TEXT);").execute(&pool).await.unwrap();
    sqlx::raw_sql(include_str!(
        "../../migrations/20261017000000_desktop_assistant.sql"
    ))
    .execute(&pool)
    .await
    .unwrap();
    sqlx::raw_sql(include_str!(
        "../../migrations/20261019000000_assistant_summary_chunks.sql"
    ))
    .execute(&pool)
    .await
    .unwrap();
    sqlx::raw_sql(include_str!(
        "../../migrations/20261018000001_assistant_chat_floor.sql"
    ))
    .execute(&pool)
    .await
    .unwrap();
    pool
}

#[tauri::command]
pub async fn desktop_save_pdf(
    app: tauri::AppHandle,
    filename: String,
    bytes: Vec<u8>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    if !bytes.starts_with(b"%PDF-") {
        return Err("Invalid PDF document".into());
    }
    let filename = std::path::Path::new(&filename)
        .file_name()
        .ok_or("Invalid filename")?
        .to_string_lossy()
        .to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let Some(file) = app
            .dialog()
            .file()
            .set_file_name(&filename)
            .add_filter("PDF", &["pdf"])
            .blocking_save_file()
        else {
            return Ok(None);
        };
        let path = file.into_path().map_err(|e| e.to_string())?;
        std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
        Ok(Some(path.to_string_lossy().to_string()))
    })
    .await
    .map_err(|e| e.to_string())?
}
