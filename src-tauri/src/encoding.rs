use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum Encoding { #[serde(rename="UTF-8")] Utf8, #[serde(rename="UTF-8 BOM")] Utf8Bom, #[serde(rename="UTF-16 LE")] Utf16Le, #[serde(rename="UTF-16 BE")] Utf16Be }
pub fn decode(bytes: &[u8]) -> Result<(String, Encoding), String> {
    let (data, encoding) = if bytes.starts_with(&[0xef,0xbb,0xbf]) { (&bytes[3..], Encoding::Utf8Bom) }
        else if bytes.starts_with(&[0xff,0xfe]) { (&bytes[2..], Encoding::Utf16Le) }
        else if bytes.starts_with(&[0xfe,0xff]) { (&bytes[2..], Encoding::Utf16Be) }
        else { (bytes, Encoding::Utf8) };
    let text = match encoding {
        Encoding::Utf8 | Encoding::Utf8Bom => String::from_utf8(data.to_vec()).map_err(|_| "지원하지 않는 인코딩입니다. UTF 파일만 열 수 있습니다.")?,
        _ => {
            if data.len()%2 != 0 { return Err("잘못된 UTF-16 파일입니다.".into()); }
            let words: Vec<u16> = data.chunks_exact(2).map(|b| if encoding == Encoding::Utf16Le { u16::from_le_bytes([b[0],b[1]]) } else { u16::from_be_bytes([b[0],b[1]]) }).collect();
            String::from_utf16(&words).map_err(|_| "잘못된 UTF-16 문자열입니다.")?
        }
    };
    if text.contains('\0') { return Err("바이너리 파일은 열 수 없습니다.".into()); }
    Ok((text,encoding))
}
pub fn encode(text: &str, encoding: Encoding) -> Vec<u8> {
    match encoding {
        Encoding::Utf8 => text.as_bytes().to_vec(),
        Encoding::Utf8Bom => [vec![0xef,0xbb,0xbf], text.as_bytes().to_vec()].concat(),
        Encoding::Utf16Le | Encoding::Utf16Be => {
            let mut bytes = if encoding == Encoding::Utf16Le { vec![0xff,0xfe] } else { vec![0xfe,0xff] };
            for word in text.encode_utf16() { bytes.extend(if encoding == Encoding::Utf16Le { word.to_le_bytes() } else { word.to_be_bytes() }); }
            bytes
        }
    }
}
pub fn line_ending(text: &str) -> &'static str { if text.contains("\r\n") { "CRLF" } else { "LF" } }
#[cfg(test)] mod tests { use super::*;
    #[test] fn all_encodings_round_trip() { for e in [Encoding::Utf8,Encoding::Utf8Bom,Encoding::Utf16Le,Encoding::Utf16Be] { let text="한글 🦀\r\nhello\n"; assert_eq!(decode(&encode(text,e)).unwrap(),(text.into(),e)); } }
    #[test] fn rejects_invalid_and_binary() { assert!(decode(&[0xff]).is_err()); assert!(decode(&[0xff,0xfe,1]).is_err()); assert!(decode(b"a\0b").is_err()); }
    #[test] fn endings() { assert_eq!(line_ending("a\r\nb"),"CRLF"); assert_eq!(line_ending("a\nb"),"LF"); }
}
