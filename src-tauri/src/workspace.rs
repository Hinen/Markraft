use crate::{
    atomic_write::atomic_write,
    files::{authorize, FileState},
};
use serde_json::Value;
use std::{fs, path::Path};
use tauri::Manager;

const FILE_NAME: &str = "workspace.json";

#[tauri::command]
pub fn save_workspace(app: tauri::AppHandle, snapshot: Value) -> Result<(), String> {
    let directory = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let data = serde_json::to_vec(&snapshot).map_err(|e| e.to_string())?;
    atomic_write(&directory.join(FILE_NAME), &data)
}

#[tauri::command]
pub fn load_workspace(
    app: tauri::AppHandle,
    files: tauri::State<FileState>,
) -> Result<Option<Value>, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(FILE_NAME);
    let data = match fs::read(path) {
        Ok(data) => data,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    let snapshot: Value = serde_json::from_slice(&data).map_err(|e| e.to_string())?;
    if let Some(tabs) = snapshot.pointer("/state/tabs").and_then(Value::as_array) {
        for tab in tabs {
            if let Some(path) = tab.get("path").and_then(Value::as_str) {
                let _ = authorize(&files, Path::new(path));
            }
        }
    }
    Ok(Some(snapshot))
}
