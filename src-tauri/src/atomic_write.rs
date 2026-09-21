use std::{fs, io::Write, path::Path};
pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("상위 폴더가 없습니다.")?;
    let mut tmp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    if let Ok(meta) = fs::metadata(path) {
        if meta.permissions().readonly() {
            return Err("읽기 전용 파일입니다.".into());
        }
        tmp.as_file()
            .set_permissions(meta.permissions())
            .map_err(|e| e.to_string())?;
    }
    tmp.write_all(bytes)
        .and_then(|_| tmp.as_file().sync_all())
        .map_err(|e| e.to_string())?;
    // tempfile uses atomic replacement (MoveFileExW with REPLACE_EXISTING on Windows).
    tmp.persist(path).map_err(|e| e.error.to_string())?;
    #[cfg(unix)]
    {
        fs::File::open(parent)
            .and_then(|dir| dir.sync_all())
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn replaces_and_cleans_temp() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.txt");
        fs::write(&path, b"old").unwrap();
        atomic_write(&path, b"new").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"new");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }
    #[test]
    fn failed_write_preserves_original() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.txt");
        fs::write(&path, b"old").unwrap();
        let mut p = fs::metadata(&path).unwrap().permissions();
        p.set_readonly(true);
        fs::set_permissions(&path, p).unwrap();
        assert!(atomic_write(&path, b"new").is_err());
        assert_eq!(fs::read(&path).unwrap(), b"old");
    }
    #[cfg(windows)]
    #[test]
    fn locked_destination_preserves_original_and_cleans_temp() {
        use std::os::windows::fs::OpenOptionsExt;

        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("잠긴 문서.txt");
        fs::write(&path, "원본\r\n").unwrap();
        let locked = fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(&path)
            .unwrap();
        assert!(atomic_write(&path, "변경".as_bytes()).is_err());
        drop(locked);
        assert_eq!(fs::read_to_string(&path).unwrap(), "원본\r\n");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
        atomic_write(&path, "잠금 해제 후 저장".as_bytes()).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "잠금 해제 후 저장");
    }
}
