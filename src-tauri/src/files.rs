use crate::{
    atomic_write::atomic_write,
    encoding::{self, Encoding},
};
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
#[derive(Default)]
pub struct FileState {
    pub allowed: Mutex<HashSet<PathBuf>>,
    pub pending: Mutex<Vec<PathBuf>>,
    pub operation: Mutex<()>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub path: String,
    pub name: String,
    pub text: String,
    pub encoding: Encoding,
    pub line_ending: String,
    pub revision: String,
}
#[derive(Deserialize)]
pub struct DialogFilter {
    pub name: String,
    pub extensions: Vec<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveRequest {
    pub path: Option<String>,
    pub text: String,
    pub encoding: Encoding,
    pub line_ending: String,
    pub revision: Option<String>,
    pub save_as: bool,
    pub suggested_name: String,
    #[serde(default)]
    pub filters: Vec<DialogFilter>,
}
pub fn revision(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub fn authorize(state: &FileState, path: &Path) -> Result<PathBuf, String> {
    let path = path.canonicalize().map_err(|e| e.to_string())?;
    if !path.is_file() {
        return Err("일반 파일만 열 수 있습니다.".into());
    }
    state.allowed.lock().unwrap().insert(path.clone());
    Ok(path)
}
pub fn validated(state: &FileState, path: &Path) -> Result<PathBuf, String> {
    let canonical = path.canonicalize().map_err(|e| e.to_string())?;
    if !state.allowed.lock().unwrap().contains(&canonical) {
        return Err("이 파일에 대한 접근 권한이 없습니다.".into());
    }
    Ok(canonical)
}
pub fn read(path: &Path) -> Result<Document, String> {
    if fs::metadata(path).map_err(|e| e.to_string())?.len() > 100 * 1024 * 1024 {
        return Err("100 MB보다 큰 파일은 지원하지 않습니다.".into());
    }
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    let (text, encoding) = encoding::decode(&bytes)?;
    Ok(Document {
        path: path.to_string_lossy().into(),
        name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into(),
        line_ending: encoding::line_ending(&text).into(),
        text,
        encoding,
        revision: revision(&bytes),
    })
}
#[tauri::command]
pub async fn open_dialog(
    state: tauri::State<'_, FileState>,
    locale: Option<String>,
) -> Result<Vec<Document>, String> {
    let all_files = match locale.as_deref() {
        Some("ko") => "모든 파일",
        Some("ja") => "すべてのファイル",
        _ => "All files",
    };
    let Some(files) = rfd::AsyncFileDialog::new()
        .add_filter(all_files, &["*"])
        .pick_files()
        .await
    else {
        return Ok(vec![]);
    };
    files
        .into_iter()
        .map(|file| authorize(&state, file.path()).and_then(|path| read(&path)))
        .collect()
}
#[tauri::command]
pub fn take_pending(state: tauri::State<FileState>) -> Vec<Result<Document, String>> {
    let paths = std::mem::take(&mut *state.pending.lock().unwrap());
    paths
        .into_iter()
        .map(|path| authorize(&state, &path).and_then(|path| read(&path)))
        .collect()
}
#[tauri::command]
pub fn read_document(state: tauri::State<FileState>, path: String) -> Result<Document, String> {
    read(&validated(&state, Path::new(&path))?)
}
#[tauri::command]
pub fn check_document(state: tauri::State<FileState>, path: String) -> Result<String, String> {
    let path = validated(&state, Path::new(&path))?;
    Ok(revision(&fs::read(path).map_err(|e| e.to_string())?))
}
#[tauri::command]
pub async fn save_document(
    state: tauri::State<'_, FileState>,
    request: SaveRequest,
) -> Result<Option<Document>, String> {
    let (path, expected) = if request.save_as || request.path.is_none() {
        let mut dialog = rfd::AsyncFileDialog::new().set_file_name(&request.suggested_name);
        for filter in &request.filters {
            dialog = dialog.add_filter(&filter.name, &filter.extensions);
        }
        if let Some(ref path) = request.path {
            if let Some(parent) = Path::new(path).parent() {
                dialog = dialog.set_directory(parent);
            }
        }
        let Some(file) = dialog.save_file().await else {
            return Ok(None);
        };
        let chosen = file.path();
        let path = if chosen.exists() {
            chosen.canonicalize()
        } else {
            chosen
                .parent()
                .unwrap()
                .canonicalize()
                .map(|parent| parent.join(chosen.file_name().unwrap()))
        }
        .map_err(|e| e.to_string())?;
        let expected = if path.exists() {
            Some(revision(&fs::read(&path).map_err(|e| e.to_string())?))
        } else {
            None
        };
        (path, expected)
    } else {
        (
            validated(
                &state,
                Path::new(request.path.as_deref().ok_or("파일 경로가 없습니다.")?),
            )?,
            request.revision.clone(),
        )
    };
    save_to(&state, &path, expected, &request).map(Some)
}

fn save_to(
    state: &FileState,
    path: &Path,
    expected: Option<String>,
    request: &SaveRequest,
) -> Result<Document, String> {
    let _operation = state.operation.lock().unwrap();
    let current = if path.exists() {
        Some(fs::read(path).map_err(|e| e.to_string())?)
    } else {
        None
    };
    if current.as_ref().map(|b| revision(b)) != expected {
        return Err(
            "CONFLICT: 파일이 외부에서 변경되었습니다. 다시 불러오거나 내 변경 유지 후 저장하세요."
                .into(),
        );
    }
    // Preserve exact bytes (including mixed endings) if the text was not changed.
    if let Some(ref original) = current {
        if let Ok((text, encoding)) = encoding::decode(original) {
            if encoding == request.encoding
                && text.replace("\r\n", "\n") == request.text.replace("\r\n", "\n")
            {
                state.allowed.lock().unwrap().insert(path.to_path_buf());
                return read(path);
            }
        }
    }
    let text = if request.line_ending == "CRLF" {
        request.text.replace("\r\n", "\n").replace('\n', "\r\n")
    } else {
        request.text.replace("\r\n", "\n")
    };
    let bytes = encoding::encode(&text, request.encoding);
    if current.as_ref() != Some(&bytes) {
        atomic_write(path, &bytes)?;
    }
    state.allowed.lock().unwrap().insert(path.to_path_buf());
    read(path)
}
#[tauri::command]
pub fn local_image(
    state: tauri::State<FileState>,
    document: String,
    source: String,
) -> Result<String, String> {
    read_local_image(&state, Path::new(&document), &source)
}

fn read_local_image(state: &FileState, document: &Path, source: &str) -> Result<String, String> {
    let document = validated(state, document)?;
    let relative = Path::new(&source);
    if relative.is_absolute() || source.contains(':') || source.starts_with('\\') {
        return Err("상대 이미지 경로만 허용합니다.".into());
    }
    let parent = document.parent().unwrap();
    let path = parent
        .join(relative)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !path.starts_with(parent) {
        return Err("문서 폴더 밖의 이미지는 차단됩니다.".into());
    }
    if fs::metadata(&path).map_err(|e| e.to_string())?.len() > 20 * 1024 * 1024 {
        return Err("이미지가 20 MB를 초과합니다.".into());
    }
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    let mime = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        "image/png"
    } else if bytes.starts_with(&[255, 216, 255]) {
        "image/jpeg"
    } else if bytes.starts_with(b"GIF8") {
        "image/gif"
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        "image/webp"
    } else {
        return Err("PNG/JPEG/GIF/WebP 이미지만 허용합니다.".into());
    };
    Ok(format!(
        "data:{};base64,{}",
        mime,
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}
#[tauri::command]
pub fn open_link(url: String) -> Result<(), String> {
    let parsed = url::Url::parse(&url).map_err(|e| e.to_string())?;
    if !["https", "http", "mailto"].contains(&parsed.scheme()) {
        return Err("이 링크 형식은 차단됩니다.".into());
    }
    open::that(parsed.as_str()).map_err(|e| e.to_string())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn paths_require_grant() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("note.md");
        fs::write(&p, "# 제목").unwrap();
        let state = FileState::default();
        assert!(validated(&state, &p).is_err());
        authorize(&state, &p).unwrap();
        assert!(validated(&state, &p).is_ok());
        assert!(authorize(&state, dir.path()).is_err());
    }
    fn request(text: &str, encoding: Encoding) -> SaveRequest {
        SaveRequest {
            path: None,
            text: text.into(),
            encoding,
            line_ending: "CRLF".into(),
            revision: None,
            save_as: false,
            suggested_name: "note.txt".into(),
            filters: vec![],
        }
    }
    #[test]
    fn save_preserves_encoding_and_detects_conflicts() {
        for encoding in [
            Encoding::Utf8,
            Encoding::Utf8Bom,
            Encoding::Utf16Le,
            Encoding::Utf16Be,
        ] {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("note.txt");
            fs::write(&path, encoding::encode("original\r\n", encoding)).unwrap();
            let original = read(&path).unwrap();
            let state = FileState::default();
            let saved = save_to(
                &state,
                &path,
                Some(original.revision.clone()),
                &request("한글\nlast", encoding),
            )
            .unwrap();
            assert_eq!(saved.text, "한글\r\nlast");
            assert_eq!(saved.encoding, encoding);
            assert!(save_to(
                &state,
                &path,
                Some(original.revision),
                &request("lost", encoding)
            )
            .is_err());
            assert_eq!(read(&path).unwrap().text, "한글\r\nlast");
        }
    }
    #[test]
    fn no_op_preserves_bytes_and_modification_time() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.md");
        let bytes = b"\xef\xbb\xbf# Heading  \r\n\n*text*";
        fs::write(&path, bytes).unwrap();
        let modified = fs::metadata(&path).unwrap().modified().unwrap();
        let state = FileState::default();
        let doc = read(&path).unwrap();
        save_to(
            &state,
            &path,
            Some(doc.revision),
            &request("# Heading  \n\n*text*", Encoding::Utf8Bom),
        )
        .unwrap();
        assert_eq!(fs::read(&path).unwrap(), bytes);
        assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), modified);
    }
    #[test]
    fn local_images_reject_traversal_and_absolute_paths() {
        let dir = tempfile::tempdir().unwrap();
        let nested = dir.path().join("nested");
        fs::create_dir(&nested).unwrap();
        let doc = nested.join("note.md");
        fs::write(&doc, "").unwrap();
        fs::write(nested.join("image.png"), b"\x89PNG\r\n\x1a\n").unwrap();
        fs::write(dir.path().join("outside.png"), b"\x89PNG\r\n\x1a\n").unwrap();
        let state = FileState::default();
        authorize(&state, &doc).unwrap();
        assert!(read_local_image(&state, &doc, "image.png")
            .unwrap()
            .starts_with("data:image/png;base64,"));
        for source in [
            "../outside.png",
            "https://example.com/i.png",
            "/etc/passwd",
            "file:///etc/passwd",
        ] {
            assert!(read_local_image(&state, &doc, source).is_err());
        }
    }
    #[cfg(unix)]
    #[test]
    fn symlinks_cannot_escape_grants() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a.txt");
        let b = dir.path().join("b.txt");
        let link = dir.path().join("link.txt");
        fs::write(&a, "a").unwrap();
        fs::write(&b, "b").unwrap();
        std::os::unix::fs::symlink(&a, &link).unwrap();
        let state = FileState::default();
        authorize(&state, &link).unwrap();
        fs::remove_file(&link).unwrap();
        std::os::unix::fs::symlink(&b, &link).unwrap();
        assert!(validated(&state, &link).is_err());
    }
    #[test]
    fn exact_bytes_revision() {
        assert_ne!(revision(b"a\r\n"), revision(b"a\n"));
    }
}
