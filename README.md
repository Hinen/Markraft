# Markraft

로컬 파일을 위한 Tauri 2 텍스트·Markdown 데스크톱 에디터입니다. Windows 10/11 x64를 주 대상으로 구현하며, macOS에서도 빌드할 수 있습니다.

> **상태: Windows 11 x64 설치 빌드 및 실제 파일 검증 완료, 출시 검증은 미완료입니다.** NSIS 설치와 WebView2의 편집·인코딩·충돌·읽기 전용/잠금 보호를 확인했습니다. 실제 Korean IME, Explorer 조작 등 남은 수동 항목과 MPL 의존성 정책 충돌 때문에 전체 Definition of Done은 미완료입니다. 자세한 결과는 [QA.md](QA.md)에 있습니다.

## 편집

- `.md`, `.markdown`: Milkdown / ProseMirror 기반 Rich 편집이 기본입니다. 렌더링된 제목·문장·목록·표 셀을 직접 수정합니다. 체크박스와 중첩 체크박스, 굵게·기울임·취소선, 코드, 인용문, 링크, 이미지, 표 행/열 편집을 지원합니다.
- **Rich / Raw** 버튼 또는 `Ctrl+Shift+M`으로 전환합니다. Raw는 CodeMirror Markdown 편집기이며 두 모드는 같은 문서 내용을 공유합니다.
- `.txt`: CodeMirror 일반 텍스트 편집.
- `.yaml`, `.yml`, `.xml`: 문법 강조·접기·들여쓰기. `items: []` 같은 문법은 Markdown 체크박스로 처리하지 않습니다.
- 다른 UTF 텍스트 파일은 Open 대화상자의 **Open as Plain Text** 필터로 열 수 있습니다.
- 여러 탭, dirty 표시, 저장 확인, 탭별 undo/redo·선택·스크롤 유지, 검색/바꾸기, 여러 커서, 줄 번호, 줄 이동, 자동 줄바꿈.
- Rich 모드 `Ctrl+F`는 렌더링된 텍스트에서 검색합니다. 바꾸기·줄 이동은 Raw 모드로 전환합니다. Rich 검색은 같은 텍스트 노드 안에서 찾으며 서식 경계를 가로지르는 검색에는 Raw를 사용합니다.
- Light / Dark / System 테마, 글꼴·크기·줄바꿈 설정은 로컬에만 저장합니다. 글꼴은 설치된 시스템 폰트를 사용합니다.

## 파일 보존

UTF-8, UTF-8 BOM, BOM이 있는 UTF-16 LE/BE를 읽고 원래 인코딩으로 저장합니다. 기존 파일의 LF/CRLF, 마지막 개행을 유지하며, 새 파일은 UTF-8 / CRLF입니다. 혼합 줄바꿈은 수정 후 저장 시 감지한 CRLF로 통일됩니다. 수정 없는 저장은 원본 바이트와 수정 시간을 유지하고 디스크를 다시 쓰지 않습니다.

저장은 같은 디렉터리의 임시 파일에 기록하고 flush/sync 후 원자적으로 교체합니다. 저장 실패와 외부 변경 시 원본을 임의로 덮어쓰지 않습니다. 2초 간격 내용 해시 검사로 외부 변경을 감지합니다. 미수정 탭은 다시 불러오며, 수정 중이면 **Reload / Keep Mine**을 선택할 수 있습니다. Keep Mine은 현재 디스크 버전을 확인한 후에만 다음 저장을 허용합니다. 파일이 삭제되거나 이동되면 Save As로 보존할 수 있습니다.

Rich 편집 후 Markdown 문법은 표준 문법으로 정규화될 수 있습니다. 목록은 `-`, 작업 목록은 `- [ ]` / `- [x]`로 직렬화합니다. 참조형 링크는 같은 URL·제목의 인라인 링크로 바뀔 수 있습니다. Raw HTML은 실행하지 않고 문자로 표시합니다. CommonMark + GFM 범위 밖의 frontmatter, 수식, 사용자 확장 문법에는 Raw 사용을 권장합니다. 저장하지 않은 내용의 crash recovery는 구현하지 않았으므로 앱 강제 종료 시 미저장 편집은 복구되지 않습니다.

## 프라이버시와 네트워크

**Local-first · no telemetry · no ads · no account · no cloud.** 분석, 문서 업로드, 원격 로그, 업데이트 검사, 자동 업데이트를 포함하지 않습니다.

- 원격 이미지는 기본적으로 **Remote image blocked**로 표시합니다. HTTPS 이미지의 **Load once**를 직접 누른 경우에만 해당 서버로 이미지 요청을 보냅니다. 이때 서버는 IP를 볼 수 있으며 referrer는 보내지 않습니다. HTTP·실행형·절대 파일 URL은 차단합니다.
- 로컬 이미지는 열린 Markdown 파일의 폴더 아래 상대 경로만 허용합니다. PNG/JPEG/GIF/WebP, 최대 20MB. 상위 경로 탈출과 symlink 탈출을 차단하며 SVG는 실행 가능 콘텐츠를 피하기 위해 지원하지 않습니다.
- 웹 링크는 OS 브라우저, 메일 링크는 OS 기본 메일 앱에 전달합니다. WebView 내부에서 문서 링크로 이동하지 않습니다. `javascript:`, `data:`, `file:` 링크는 차단합니다.
- Rust는 네이티브 대화상자, OS 실행 인자, 파일 드롭으로 허용한 파일만 읽고 저장합니다. unrestricted FS capability는 없습니다.
- CSP는 원격 스크립트·iframe·object·eval을 허용하지 않습니다. 편집기 스타일을 위해 inline style만 허용하고, HTTPS 이미지는 사용자 선택 로딩을 위해 허용합니다.
- 개발 서버의 HMR 연결과 빌드 의존성 다운로드는 개발 도구 동작이며 배포 앱에는 포함되지 않습니다.

## 개발 환경

Node.js 22.12+ (권장 24), npm, Rust stable, 해당 플랫폼의 Tauri 빌드 도구가 필요합니다.

Windows: Visual Studio Build Tools의 **Desktop development with C++**, Windows SDK, WebView2 Runtime. macOS: Xcode Command Line Tools.

```sh
npm ci
npm run tauri dev
```

`npm run dev`는 데스크톱 UI 개발/자동 테스트용 Vite 서버입니다. 독립 브라우저 제품이 아니며 실제 파일 기능은 Tauri Rust 프로세스가 필요합니다.

```sh
# Windows x64에서 NSIS 설치 프로그램 생성
npm run tauri build -- --bundles nsis
# src-tauri/target/release/bundle/nsis/*.exe

# macOS에서 실행 가능한 앱 생성
npm run tauri build -- --bundles app
# src-tauri/target/release/bundle/macos/Markraft.app
```

[Windows CI](.github/workflows/windows.yml)는 테스트와 NSIS 빌드를 실행하고 `Markraft-windows-x64` artifact를 보관합니다. 워크플로 파일은 추가했으나 현재 작업에서는 원격 push/CI 실행을 하지 않았습니다. 설치 프로그램은 코드 서명하지 않았습니다. Windows 파일 연결은 등록되며, 기본 앱 선택은 사용자가 Windows 설정에서 합니다.

Windows 설치 프로그램은 `Markraft.Document` 연결 식별자로 6개 확장자를 등록하며, 공백이 있는 설치 경로와 Windows 기본 앱 후보 등록을 처리합니다. 설치 후 등록 및 포함 파일을 확인하려면 PowerShell에서 `./scripts/verify-windows-install.ps1 -InstallDirectory "$env:LOCALAPPDATA\Markraft"`를 실행합니다. 사용자 지정 경로에 설치했다면 실제 경로를 전달하세요. 이 검사는 Explorer 더블클릭이나 IME 수동 검증을 대체하지 않습니다.

## 테스트

```sh
npm run build
npm test
npx playwright install chromium
npm run test:e2e
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
npm audit
npm run licenses
```

Markdown fixture는 `tests/fixtures/markdown/`에 있습니다. 원본 CommonMark/GFM AST와 직렬화 결과의 의미를 비교하고, ProseMirror 문서 구조도 재검사합니다. Playwright는 파일 브리지를 테스트 대역으로 대체하므로 네이티브 파일 대화상자·Windows WebView2·IME 검증의 대체물이 아닙니다. 실제 파일 인코딩·원자적 저장·경로 검증은 Rust 테스트에서 실제 임시 파일을 사용합니다.

## 단축키

macOS에서는 Ctrl 대신 Command도 사용할 수 있습니다.

| 동작                      | 단축키                                 |
| ------------------------- | -------------------------------------- |
| 새 텍스트 / 새 Markdown   | Ctrl+N / Ctrl+Shift+N                  |
| 열기                      | Ctrl+O                                 |
| 저장 / 다른 이름으로 저장 | Ctrl+S / Ctrl+Shift+S                  |
| 탭 닫기 / 전체 닫기       | Ctrl+W / Ctrl+Shift+W                  |
| 실행 취소 / 다시 실행     | Ctrl+Z / Ctrl+Y (또는 Ctrl+Shift+Z)    |
| 찾기 / 바꾸기 / 줄 이동   | Ctrl+F / Ctrl+H / Ctrl+G               |
| 전체 선택                 | Ctrl+A                                 |
| Rich ↔ Raw                | Ctrl+Shift+M                           |
| 굵게 / 기울임             | Ctrl+B / Ctrl+I                        |
| CodeMirror 다중 커서      | Alt+클릭, Ctrl+D로 다음 일치 항목 선택 |
| 표 다음/이전 셀           | Tab / Shift+Tab                        |

## 구조와 의존성

`src/editors/`는 편집기, `src/tabs/`는 문서 상태, `src/files/`는 Rust 브리지, `src/settings/`는 로컬 설정입니다. `src-tauri/src/`는 파일 접근·인코딩·원자적 저장·OS 통합을 담당합니다.

직접 사용하는 React, CodeMirror, Milkdown은 MIT, Tauri는 MIT/Apache-2.0이며 기존 에디터 앱의 소스를 복사하지 않았습니다. 다만 **Tauri 간접 의존성에 MPL-2.0이 있어 명세의 copyleft 금지 조항과 충돌합니다.** 이를 숨기거나 모두 permissive라고 표시하지 않습니다. 전체 버전·라이선스 목록은 [DEPENDENCIES.md](DEPENDENCIES.md), 상위 프로젝트의 고지 원문은 [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt)에 있습니다. 배포 전에 이 정책 충돌을 해결해야 합니다.

Windows 런타임/빌드 도구별 경로, 교체 대안과 필요한 정책 결정은 [LICENSE_REVIEW.md](LICENSE_REVIEW.md)에 기록했습니다. `npm run licenses`는 Windows에서 `HOME` 없이 실행할 수 있고, `CARGO` 또는 `CARGO_HOME` 경로도 지원합니다.
