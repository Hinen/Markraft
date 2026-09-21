use crate::{atomic_write::atomic_write, encoding::{self,Encoding}};
use serde::{Deserialize,Serialize};
use sha2::{Digest,Sha256};
use std::{collections::HashSet,fs,path::{Path,PathBuf},sync::Mutex};
use base64::Engine;
#[derive(Default)] pub struct FileState { pub allowed: Mutex<HashSet<PathBuf>>, pub pending: Mutex<Vec<PathBuf>>, pub operation: Mutex<()> }
#[derive(Clone,Serialize)] #[serde(rename_all="camelCase")]
pub struct Document { pub path:String, pub name:String, pub text:String, pub encoding:Encoding, pub line_ending:String, pub revision:String }
#[derive(Deserialize)] #[serde(rename_all="camelCase")]
pub struct SaveRequest { pub path:Option<String>, pub text:String, pub encoding:Encoding, pub line_ending:String, pub revision:Option<String>, pub save_as:bool, pub suggested_name:String }
pub fn revision(bytes: &[u8]) -> String { format!("{:x}",Sha256::digest(bytes)) }
pub fn authorize(state:&FileState,path:&Path) -> Result<PathBuf,String> {
    let path=path.canonicalize().map_err(|e|e.to_string())?;
    if !path.is_file() {return Err("일반 파일만 열 수 있습니다.".into());}
    state.allowed.lock().unwrap().insert(path.clone()); Ok(path)
}
pub fn validated(state:&FileState,path:&Path) -> Result<PathBuf,String> {
    let canonical=path.canonicalize().map_err(|e|e.to_string())?;
    if !state.allowed.lock().unwrap().contains(&canonical) {return Err("이 파일에 대한 접근 권한이 없습니다.".into());}
    Ok(canonical)
}
pub fn read(path:&Path) -> Result<Document,String> {
    if fs::metadata(path).map_err(|e|e.to_string())?.len()>100*1024*1024 {return Err("100 MB보다 큰 파일은 지원하지 않습니다.".into());}
    let bytes=fs::read(path).map_err(|e|e.to_string())?;
    let (text,encoding)=encoding::decode(&bytes)?;
    Ok(Document{path:path.to_string_lossy().into(),name:path.file_name().unwrap_or_default().to_string_lossy().into(),line_ending:encoding::line_ending(&text).into(),text,encoding,revision:revision(&bytes)})
}
#[tauri::command] pub async fn open_dialog(state:tauri::State<'_,FileState>) -> Result<Vec<Document>,String> {
    let Some(files)=rfd::AsyncFileDialog::new().add_filter("Text documents",&["md","markdown","txt","yaml","yml","xml"]).add_filter("Open as Plain Text",&["*"]).pick_files().await else {return Ok(vec![])};
    files.into_iter().map(|file|authorize(&state,file.path()).and_then(|path|read(&path))).collect()
}
#[tauri::command] pub fn take_pending(state:tauri::State<FileState>) -> Vec<Result<Document,String>> {
    let paths=std::mem::take(&mut *state.pending.lock().unwrap());
    paths.into_iter().map(|path|authorize(&state,&path).and_then(|path|read(&path))).collect()
}
#[tauri::command] pub fn read_document(state:tauri::State<FileState>,path:String) -> Result<Document,String> {read(&validated(&state,Path::new(&path))?)}
#[tauri::command] pub fn check_document(state:tauri::State<FileState>,path:String) -> Result<String,String> {
    let path=validated(&state,Path::new(&path))?; Ok(revision(&fs::read(path).map_err(|e|e.to_string())?))
}
#[tauri::command] pub async fn save_document(state:tauri::State<'_,FileState>,request:SaveRequest) -> Result<Option<Document>,String> {
    let (path,expected) = if request.save_as || request.path.is_none() {
        let mut dialog=rfd::AsyncFileDialog::new().set_file_name(&request.suggested_name);
        if let Some(ref path)=request.path { if let Some(parent)=Path::new(path).parent() { dialog=dialog.set_directory(parent); } }
        let Some(file)=dialog.save_file().await else {return Ok(None)};
        let chosen=file.path();
        let path=if chosen.exists(){chosen.canonicalize()}else{chosen.parent().unwrap().canonicalize().map(|parent|parent.join(chosen.file_name().unwrap()))}.map_err(|e|e.to_string())?;
        let expected=if path.exists(){Some(revision(&fs::read(&path).map_err(|e|e.to_string())?))}else{None};
        (path,expected)
    } else { (validated(&state,Path::new(request.path.as_ref().unwrap()))?, request.revision) };
    let _operation=state.operation.lock().unwrap();
    let current=if path.exists(){Some(fs::read(&path).map_err(|e|e.to_string())?)}else{None};
    if current.as_ref().map(|b|revision(b)) != expected {return Err("CONFLICT: 파일이 외부에서 변경되었습니다. 다시 불러오거나 내 변경 유지 후 저장하세요.".into());}
    let text=if request.line_ending=="CRLF" {request.text.replace("\r\n","\n").replace('\n',"\r\n")} else {request.text.replace("\r\n","\n")};
    let bytes=encoding::encode(&text,request.encoding);
    if current.as_ref()!=Some(&bytes) {atomic_write(&path,&bytes)?;}
    state.allowed.lock().unwrap().insert(path.clone());
    read(&path).map(Some)
}
#[tauri::command] pub fn local_image(state:tauri::State<FileState>,document:String,source:String) -> Result<String,String> {
    let document=validated(&state,Path::new(&document))?;
    let relative=Path::new(&source);
    if relative.is_absolute() || source.contains(':') || source.starts_with('\\') {return Err("상대 이미지 경로만 허용합니다.".into());}
    let parent=document.parent().unwrap();
    let path=parent.join(relative).canonicalize().map_err(|e|e.to_string())?;
    if !path.starts_with(parent) {return Err("문서 폴더 밖의 이미지는 차단됩니다.".into());}
    if fs::metadata(&path).map_err(|e|e.to_string())?.len()>20*1024*1024 {return Err("이미지가 20 MB를 초과합니다.".into());}
    let bytes=fs::read(&path).map_err(|e|e.to_string())?;
    let mime=if bytes.starts_with(b"\x89PNG\r\n\x1a\n"){"image/png"}else if bytes.starts_with(&[255,216,255]){"image/jpeg"}else if bytes.starts_with(b"GIF8"){"image/gif"}else if bytes.starts_with(b"RIFF")&&bytes.get(8..12)==Some(b"WEBP"){"image/webp"}else{return Err("PNG/JPEG/GIF/WebP 이미지만 허용합니다.".into())};
    Ok(format!("data:{};base64,{}",mime,base64::engine::general_purpose::STANDARD.encode(bytes)))
}
#[tauri::command] pub fn open_link(url:String) -> Result<(),String> {
    let parsed=url::Url::parse(&url).map_err(|e|e.to_string())?;
    if !["https","http","mailto"].contains(&parsed.scheme()) {return Err("이 링크 형식은 차단됩니다.".into());}
    open::that(parsed.as_str()).map_err(|e|e.to_string())
}
#[cfg(test)] mod tests { use super::*;
    #[test] fn paths_require_grant() {let dir=tempfile::tempdir().unwrap(); let p=dir.path().join("note.md"); fs::write(&p,"# 제목").unwrap(); let state=FileState::default(); assert!(validated(&state,&p).is_err()); authorize(&state,&p).unwrap(); assert!(validated(&state,&p).is_ok()); assert!(authorize(&state,dir.path()).is_err());}
    #[test] fn exact_bytes_revision() {assert_ne!(revision(b"a\r\n"),revision(b"a\n"));}
}
