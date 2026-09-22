# 구현 및 검증 기록

## Windows 11 x64 — 2026-09-21

**NSIS 생성·설치와 실제 WebView2/Rust 파일 검증을 수행했다. 전체 출시 조건은 미완료다.** 실제 Microsoft Korean IME, Explorer 직접 조작, 일부 네이티브 대화상자 및 정책 결정이 남아 있다. 아래 PASS는 명시한 범위에만 적용한다.

### 환경과 증거

- Windows 11 Home 10.0.26200 x64, Intel Core i9-13900K, RAM 68,478,234,624 bytes(약 63.8 GiB).
- Node 24.17.0, npm 11.13.0, Rust/Cargo 1.96.0, stable-x86_64-pc-windows-msvc. Visual Studio 2022 Build Tools C++ 설치 확인. rustfmt/clippy 추가 설치.
- WebView2 설치 버전 152.0.4191.66, 153.0.4234.32, 153.0.4234.48. 실제 테스트 WebView는 Edge/Chromium 153 user-agent이며 최종 설치 앱의 WebView2 프로세스 파일 버전은 **153.0.4234.48**(`webview-version.json`).
- 시작 커밋 `74f10ba`, 시작 시 미커밋 변경 없음. 로컬 Git 이메일만 인계 지시대로 설정. `Docs/text_md_editor_build_spec.md`는 없어서 인계 문서/README/QA를 기준으로 작업.
- 로컬 증거 폴더: `C:\Repository\Markraft\Docs\windows-qa`. `Docs/`는 요청대로 Git 제외. 아래 로그/JSON/PNG와 재현용 `native.mjs`, `native-safety.mjs`가 있다. Git clone만으로 증거 파일은 전달되지 않는다.
- 설치 앱 검증은 NSIS가 설치한 `C:\Users\qkrql\AppData\Local\Markraft QA\markraft.exe`에서 실행. **개발 서버나 IPC 대역을 사용하지 않았다.** 해당 실행에만 WebView2 localhost CDP 포트 9331을 켜 UI를 조작하고 Rust 브리지를 통해 실제 QA 파일을 저장했다. 일반 실행 설정에는 디버깅 옵션을 넣지 않았다. 자동 문자열 입력은 IME 증거가 아니다.

### 명령 실행 결과

| 명령/검증 | 결과 | 증거 |
| --- | --- | --- |
| `npm ci` | PASS, 300 packages 설치 | npm-ci.log |
| `npm run build` | PASS, Vite 대형 번들 경고 있음 | build-final.log |
| `npm test` | PASS, 26/26; Markdown fixture 15개 포함 | vitest-final.log |
| `npx playwright install chromium` | PASS | playwright-install.log |
| `npm run test:e2e` | PASS, 12/12, IPC 대역 Chromium | playwright-final.log |
| `cargo test --locked --manifest-path src-tauri/Cargo.toml` | PASS, 11/11 Windows | cargo-test-final.log |
| `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | PASS | clippy-final.log |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --check` | PASS | rustfmt-final.log |
| `npm audit` | PASS, 0 vulnerabilities | npm-audit.log |
| `npm run licenses` | PASS, npm 360 / Cargo 502; HOME 없는 환경 | licenses.log |
| `npm run tauri build -- --bundles nsis` | PASS, Windows x64 NSIS | nsis-build-final.log |
| NSIS `/S` 설치·제거·재설치 | PASS, exit 0; 공백 경로 포함 | install-verification.log, uninstall-registration.json |
| 설치된 앱 기본 시나리오 | PASS, 20개 | native-results.json, native-1.png … native-20.png |
| 설치된 앱 안전성 시나리오 | PASS, 6개 | native-safety-results.json, native-safety-final.log |
| 원격 CI / Windows 10 / ARM | NOT RUN | workflow는 갱신만 함; push/릴리스 안 함 |

초기 Playwright는 Rust DLL에 대한 Vite watcher의 `EBUSY`로 4 PASS / 8 FAIL이었다(`playwright.log`). `src-tauri/**` 감시 제외 후 12/12 통과. 최초 네이티브 harness는 숨겨진 체크박스 수, ProseMirror 보조 img, 가상화된 CodeMirror의 화면 밖 텍스트를 잘못 검사했다. 선택자/커서 이동을 고쳐 실제 디스크 검증을 유지한 채 재실행했다. 안전성 harness는 Windows PowerShell 실행 정책 및 재사용 탭/중복 실행 때문에 실패한 회차가 있다. 일회성 자식 프로세스에만 실행 정책 옵션을 주고, 열린 QA 탭을 닫은 단일 실행에서 6/6 확인했다. 실패 회차를 앱 기능 PASS의 증거로 사용하지 않았다.

### 설치 파일

- 경로: `C:\Repository\Markraft\src-tauri\target\release\bundle\nsis\Markraft_0.1.0_x64-setup.exe`
- 최종 SHA-256: `2A791ED9A56D9FF73994CDFBA251A17F49CA46C0F8540A9CC22EEBD392DB22C1` (`Docs/windows-qa/installer-sha256.txt`).
- 최종 문서 리소스를 포함해 재빌드·재설치한 뒤 cold start 한 탭/Rich 표시와 체크박스 실제 디스크 저장을 다시 확인했다(`final-smoke.json`, `final-installed.png`).
- 서명 없음. 로컬 검증용 생성물이며 원격 배포/릴리스하지 않았다.
- 설치 경로에 공백을 넣어 실행하고, `scripts/verify-windows-install.ps1`로 실행 파일·고지·문서 포함, 인용된 실행 명령, 6개 OpenWithProgids/Capabilities 등록 확인. 제거 후 RegisteredApplications/Capabilities 정리 확인. Windows 사용자 기본 앱 선택 UI를 자동으로 바꾸지 않았다.

### 인계 체크리스트 A — Windows 통합

| 항목 | 상태 | 실제 확인 / 남은 절차 |
| --- | --- | --- |
| A1. 6개 확장자 기본 앱 후보 | PASS(등록) / NOT RUN(UI) | md/markdown/txt/yaml/yml/xml 등록 검사. 설정 → 기본 앱 → 확장자별 Markraft 선택은 사람 검증 필요 |
| A2. cold start 한 창·한 탭·처음부터 Rich | PASS(파일 인자) / NOT RUN(Explorer) | 설치 앱 완전 종료 후 한글·공백 Markdown 인자로 시작, 탭 1개 및 Rich 제목 확인. Explorer 더블클릭은 별도 |
| A3. 기존 인스턴스 새 파일 | PASS(파일 인자) / NOT RUN(전면/Explorer) | 두 번째 프로세스 exit 0, 기존 창에 새 탭, 한 프로세스 확인. OS 전면 전환은 미검증 |
| A4. 동일 파일 중복 방지 | PASS | 같은 YAML 파일을 다시 인자로 실행, 탭 수 불변 |
| A5. 여러 파일 드래그앤드롭 | NOT RUN | Explorer에서 QA 파일 3개 및 이미 열린 파일을 창에 드롭 |
| A6. Open 단일/다중/Plain Text | NOT RUN(선택 완료) / PASS(표시·취소) | 실제 열기 대화상자 표시·취소 후 앱 복귀. 파일 이름 필드 자동 set-value 미지원. native-open-dialog.json, dialog-cancel.json |
| A7. Save As 한글·취소·교체 | NOT RUN | 한글 경로 새 이름 저장, 취소 후 dirty 유지, 기존 QA 파일 교체 각각 수행 필요 |

### 인계 체크리스트 B — 편집

| 항목 | 상태 | 실제 확인 / 남은 절차 |
| --- | --- | --- |
| B1. TXT/YAML/XML 저장·재열기 | PASS(아래 범위) | TXT 8개 인코딩 조합 재열기. YAML `items: []` 유지·`extra: []` 저장 및 체크박스 0개. XML 대용량 끝 문자 저장. XML 태그 수정·재열기 조합은 NOT RUN |
| B2. Rich 제목·문장 직접 수정 | PASS | 제목 끝 `edited`, Raw 문장 추가 후 Rich 확인; 클릭으로 모드가 바뀌지 않음 |
| B3. 일반/중첩 체크박스 | PASS | parent 토글, child 상태 보존; 디스크에 `[x] parent`, `[x] child` 확인 |
| B4. 표 셀·이동·행열 | PASS(셀) / NOT RUN(네이티브 나머지) | 셀 100→1000 실제 저장. Tab/Shift+Tab·행열 명령은 설치 앱에서 미검증(행열은 대역 E2E 통과) |
| B5. 모든 서식·코드·목록·인용·링크 보존 | PASS(fixture) / NOT RUN(전체 네이티브) | 15개 Markdown fixture 의미 왕복. 설치 앱에서는 굵은 문장·중첩 작업·표 포함 문서 저장 확인 |
| B6. Rich→Raw→Rich·저장 | PASS | 수정 내용 양방향 확인 및 실제 디스크 저장. Rich 전체 문서 재열기 조합은 NOT RUN |
| B7. 마지막 입력 직후 저장/전환 | PASS(E2E) / NOT RUN(실제 IME) | 대역 E2E 즉시 저장/전환 테스트 통과. 설치 앱 자동 편집→저장에서도 마지막 문자 확인 |
| B8. 탭 이동 undo·커서·선택·스크롤 | PASS(E2E undo) / NOT RUN(네이티브 전체) | 실제 앱은 여러 탭 유지 확인; 설치 앱 undo 및 상태 유지 세부 검증 필요 |
| B9. 단축키·다중 커서·word wrap | PASS(일부) / NOT RUN(전체) | CDP를 통한 Ctrl+S/W/F, 문서 이동·Raw 전환 확인. Ctrl+H/G/B/I/Shift+M, 다중 커서, wrap 수동 검증 필요 |
| B10. 테마·폰트·재시작 유지 | NOT RUN | Light/Dark/System과 폰트 변경 → 재시작 확인 필요 |

### 인계 체크리스트 C — 실제 Microsoft Korean IME

**C1–C5 모두 NOT RUN.** Rich/CodeMirror의 문장·굵은 글씨·체크박스·표 셀에서 실제 조합 입력, 조합 중 Backspace/방향키/클릭, Enter, undo/redo·저장·탭/모드 전환, 저장 후 재열기를 사람이 검증해야 한다.

`computer-use`의 Alt+F4 입력은 `window_not_focused`였고 `--restore-window` 재시도도 실패했다. `Hangul` 전환 키는 `Unsupported key: Hangul`이었다. `native-exit-clean*.json`, `ime-key-capability.json`에 증거가 있다. 완성 한글 문자열 입력이나 `isComposing` 이벤트 합성으로 PASS 처리하지 않았다. 재현 문자열: `안녕하세요`, `한글 입력 테스트입니다.`, `체크박스 옆에서도 한글 입력`, `굵은 글씨 안에서도 한글 입력`, `표 셀 안에서 한글 입력`.

### 인계 체크리스트 D — 데이터 보존

| 항목 | 상태 | 증거 / 남은 절차 |
| --- | --- | --- |
| D1. UTF-8/BOM/UTF-16 LE/BE × LF/CRLF | PASS | 8개 파일에서 한글 추가 후 기대 바이트와 일치, 저장·닫기·재열기 확인 |
| D2. no-op SHA256/mtime 보존 | PASS | Rich↔Raw 왕복·Save, 혼합 줄바꿈·BOM·끝 공백·마지막 개행 없는 파일 및 8개 인코딩 파일 불변 |
| D3. clean 외부 변경 reload | PASS | 실제 파일을 외부에서 변경 후 설치 앱 내용 자동 반영 |
| D4. dirty 충돌 Reload/Keep Mine | PASS | 선택 전 외부 디스크 내용 보존; Keep Mine 저장 및 Reload로 로컬 편집 폐기 각각 확인 |
| D5. polling 전 저장 충돌 | PASS(즉시 저장 시나리오) | 외부 쓰기 직후 Save, 충돌 대화상자 확인. 타이머 경계의 정확한 선후는 계측하지 않음. Rust stale revision 거부도 통과 |
| D6. 읽기 전용/잠금/권한 없는 폴더 | PASS(앞 2개) / NOT RUN(폴더 ACL·백신) | 읽기 전용 속성 및 Windows deny-delete 파일 핸들에서 실패 알림·원본·dirty 유지; 원자적 쓰기 테스트는 임시 파일 정리도 확인 |
| D7. 파일 이동/삭제·Save As | PASS(삭제 알림·메모리 유지) / NOT RUN(이동·Save As) | 실제 QA 파일 삭제 후 경고와 LOCAL 편집 유지 확인 |
| D8. 닫기 Save/Discard/Cancel | PASS(탭 Cancel/Discard) / NOT RUN(네이티브 나머지) | Cancel 후 내용/원본 유지, Discard 확인. 전체 닫기 clean 경로는 확인. dirty Save·Alt+F4·작업표시줄 종료는 추가 검증 |
| D9. 강제 종료 중 기존 파일 보호 | NOT RUN(프로세스 강제 종료) | 원자적 쓰기·실패 보존 Rust 테스트 통과만 있음; crash 주입 테스트 아님. 메모리 crash recovery 없음 |

### 인계 체크리스트 E — 이미지·링크·네트워크

| 항목 | 상태 | 증거 / 남은 절차 |
| --- | --- | --- |
| E1. 상대 PNG/JPEG/GIF/WebP | PASS(PNG) / NOT RUN(나머지 표시) | `한글 그림.png`를 한글·공백 경로 Markdown에서 실제 로드, naturalWidth 1 |
| E2. 새 저장/Save As 이미지 기준 갱신 | NOT RUN | 새 문서에 상대 이미지 삽입 후 다른 폴더로 Save As 수행 필요 |
| E3. 원격 이미지 기본 차단·Load once | PASS | 실제 WebView 페이지 네트워크 관찰: 열기 0요청, 버튼 후 1요청. 서버 응답/이미지 성공 로드 여부는 측정 대상 아님 |
| E4. OS 브라우저·mailto 실행 | NOT RUN | 대역 E2E는 내부 탐색 방지 확인. 설치 앱의 기본 OS 앱 호출은 별도 확인 필요 |
| E5. 위험 링크·폴더 밖 이미지 | PASS | 실제 Rust IPC가 javascript/data/file 링크 및 `../environment.json` 이미지 접근 거부. 절대 경로 등은 Rust 테스트 포함 |
| E6. 앱 전체 백그라운드 네트워크 없음 | NOT RUN(패킷 감사) | 원격 이미지의 WebView 요청만 관찰했으며 OS 전체 트래픽을 감사하지 않음. 설치/빌드 다운로드와 별도 |

### 인계 체크리스트 F — 실제 WebView2 대용량

모두 설치된 release 앱, 한글·공백 QA 경로의 실제 파일이며 IPC 대역이 아니다. 다음 값은 파일 생성·두 번째 인스턴스 전달부터 화면 편집·저장까지의 자동화 경과 시간으로 순수 입력 지연 수치가 아니다. 각 파일 끝에 LAST-QA를 추가하고 실제 디스크를 확인했다. 검색 패널 표시까지 확인했으며 검색 결과 탐색·장시간 스크롤/메모리 계측은 NOT RUN이다.

| 파일 구조 | 크기(bytes) | 열기·편집·저장 | 결과 |
| --- | ---: | ---: | --- |
| TXT, 한글 포함 반복 행 240,000개 | 10,800,000 | 1,168ms | PASS(열기/편집/저장) |
| YAML, `items: []`/name 반복 | 2,200,000 | 905ms | PASS(열기/편집/저장) |
| XML, 한글 포함 item 반복 | 2,240,000 | 742ms | PASS(열기/편집/저장) |
| Markdown, 긴 문단 950개 | 1,065,909 | 1,779ms | PASS(Open Rich/편집/Raw/저장) |
| large-checklist.md, 작업 2,000개 | 36,905 | 개별 지연 미측정 | PASS(15개 체크·디스크 저장) |

한 번의 짧은 시나리오에서 멈춤은 관찰하지 않았으나 장시간 성능·메모리 안정성 보장은 아니다.

### 수정 및 남은 결정

관심사별 커밋: `a103afb` Vite 감시 수정, `b6ca04c` Windows 잠금 회귀 테스트, `c25ca3b` 라이선스 생성/검토, `2154020` 파일 연결/설치 검증, `2d4241b` Windows CI 보강. 최종 QA/README 및 배포 고지 포함 변경은 별도 문서 커밋으로 기록한다.

- Vite의 Rust 출력 감시 제외, Windows 잠금 보존 회귀 테스트, HOME 없는 라이선스 생성 수정.
- NSIS 전용 ProgID·경로 인용·기본 앱 후보·제거 정리 및 설치 검증 스크립트 추가.
- CI에 rustfmt/clippy/audit/licenses, 공백 경로 설치 등록 검사, SHA-256 artifact 추가. 실제 GitHub Actions 실행은 NOT RUN.
- MPL-2.0 간접 의존성은 여전히 존재한다. [DEPENDENCY_REVIEW.md](DEPENDENCY_REVIEW.md)에 Windows 런타임/호스트 도구 경로, upstream/패치 대안 및 예외 허용 여부의 정책 결정을 기록했다. 임의 예외나 의존성 교체는 하지 않았다.
- Windows 10, 실제 IME 및 위 NOT RUN 항목을 완료하고 MPL 정책을 결정하기 전에는 정식 출시 완료로 표시하지 않는다.

## 이전 macOS 검증 기록 (인계 당시 상태)

아래 Windows 미완료 목록은 인계 당시의 기록이다. 현재 Windows 결과는 위 표를 기준으로 한다.

검증 환경: macOS Apple Silicon, Node 26.3.0, Rust 1.98.1. Windows 실행 환경은 제공되지 않았습니다. 날짜: 2026-09-21.

## 자동 검증

| 항목                               | 결과              | 범위                                                                                 |
| ---------------------------------- | ----------------- | ------------------------------------------------------------------------------------ |
| TypeScript / Vite production build | 통과              | UI 타입 및 번들                                                                      |
| Vitest                             | 26/26             | 파일 타입·줄바꿈·탭 저장 상태·URL 보안·Markdown 왕복                                 |
| Markdown fixture                   | 15/15             | 원본 의미 AST와 직렬화 후 AST 및 ProseMirror 문서 비교                               |
| Rust unit tests                    | 11/11 (macOS)     | UTF 인코딩·BOM·개행·원자적 쓰기·실패 시 원본·no-op 수정시간·충돌·경로·이미지·symlink |
| Playwright                         | 12/12             | 아래 UI 시나리오; IPC 테스트 대역 사용                                               |
| Clippy -D warnings                 | 통과              | Rust 전체 target lint (현재 호스트)                                                  |
| npm audit                          | 0 vulnerabilities | npm lockfile 기준                                                                    |
| macOS release `.app`               | 빌드·실행 확인    | Apple Silicon, 서명/공증 없는 개발 배포물                                            |

Playwright: Rich 제목·문장 수정, 중첩 체크박스와 실제 직렬화, 표 셀·행·열 편집, 양방향 Rich/Raw 동기화, 즉시 저장 시 마지막 입력 유지, 탭 이동 후 undo, YAML 대괄호 보존, XML 강조·검색, dirty 닫기 확인, 외부 변경 자동 reload/Keep Mine, Rich 검색, 100개 작업 목록 중 연속 15개 토글, 원격 이미지 기본 요청 0회 및 Load once 후 1회, 링크 내부 이동 방지.

### 대용량 UI 테스트

기준 실행의 파일 전달 → 렌더 → 첫 글자 편집 시간입니다. IPC 테스트 대역을 사용한 Chromium 측정이며 디스크 IO와 WebView2 성능을 포함하지 않습니다. 하드웨어별 보장 수치가 아닙니다.

| 파일          |     바이트 | 열기+편집 |
| ------------- | ---------: | --------: |
| TXT           | 10,880,000 |  약 0.6초 |
| YAML          |  2,340,000 |  약 0.3초 |
| XML           |  2,240,000 |  약 0.3초 |
| Markdown Rich |  1,103,918 |  약 1.0초 |

Markdown은 긴 문단 약 950개로 구성했습니다. 매우 많은 블록/체크박스로 구성된 1MB 문서가 같은 성능을 낸다고 주장하지 않습니다. 2,000개 체크박스 fixture의 왕복 변환도 검사합니다.

## 네이티브 macOS 수동 확인

- 배포 `.app` 실행 후 실제 Tauri WebView 화면 확인.
- 네이티브 Open 대화상자 표시 확인. 자동 조작 도구의 Go To 경로 확정이 안정적이지 않아, 파일 선택 완료는 이 수동 테스트의 통과 항목으로 세지 않음.
- 종료 상태에서 파일 경로 인자로 실행: 정확히 한 파일 탭, Rich 모드로 열림.
- Rich 체크박스 클릭 후 Save: `/tmp/markraft-native.md`의 실제 디스크에 checked 상태 반영 확인.
- 수정 없는 Save: 디스크 쓰기 생략 상태 메시지 확인. 수정 시간/바이트 불변은 별도 Rust 테스트에서 검증.
- 실행 중 두 번째 프로세스에 다른 파일 전달: 기존 창에 두 번째 파일 탭이 열리고 두 번째 프로세스 종료 확인.
- 변경 후 네이티브 창 닫기: Save/Discard/Cancel 표시, Cancel 후 변경 유지 확인.

## 미완료 출시 조건

- [ ] Windows 10/11 x64에서 NSIS 빌드 결과 생성 및 설치/실행. CI 구성만 완료, 실행하지 않음.
- [ ] Explorer 파일 연결로 cold start와 existing instance 동작, 파일 드롭, 중복 탭/창 여부를 실제 Windows에서 검증.
- [ ] Windows Korean IME 실제 조합 입력: Rich와 CodeMirror의 문장·굵은 글씨·체크박스·표, Enter, undo/redo. 자동 테스트의 Unicode 문자열 입력을 실제 IME 테스트로 간주하지 않음.
- [ ] Windows WebView2에서 대용량 편집과 파일 권한/잠금/백신에 따른 저장 실패 검증.
- [ ] 필수 Tauri 스택의 MPL-2.0 간접 의존성과 명세의 copyleft 금지 정책 충돌 해결.

이 조건 때문에 **전체 명세 완료 / Windows 정식 출시 준비 완료 상태가 아닙니다.**

## 알려진 제한

- 미저장 내용의 crash recovery는 없음. 원자적 저장은 기존 디스크 파일 보호 목적이며 편집 중 메모리 내용의 복구를 보장하지 않음.
- 외부 변경 감지는 2초 polling. 내용 검증과 원자적 교체 사이에 타 프로세스가 동시에 쓰는 아주 짧은 경쟁 구간은 파일 시스템의 compare-and-swap 지원 없이 완전히 제거할 수 없음. 일반적인 외부 편집은 감지하고 사용자 선택 없이 덮어쓰지 않음.
- Raw/Rich 각각 undo 스택은 탭 이동에 유지되지만 서로 다른 편집기 사이에 하나의 통합 undo 타임라인은 제공하지 않음. 모드 동기화는 문서 교체 트랜잭션이며 커서 위치의 정확한 의미 매핑은 하지 않음.
- 서식 경계를 가로지르는 Rich 검색, Rich replace는 지원하지 않음. Raw에서는 CodeMirror find/replace 사용 가능.
- 상대 로컬 PNG/JPEG/GIF/WebP만 표시. SVG, 절대 경로, 문서 폴더 바깥 이미지는 차단.
- CommonMark/GFM 외의 frontmatter·수식·커스텀 directive는 Rich 지원 범위 밖. Raw 권장.
- 코드 서명·공증, 자동 업데이트, 세션 복구, 최근 파일 목록은 없음.

## 재현 명령

README의 테스트/빌드 명령을 사용합니다. Windows CI는 `.github/workflows/windows.yml`에 있으며 원격으로 push하지 않았습니다. 배포 artifact와 `dist/`, `target/`, Playwright 캡처는 Git에서 제외합니다. 원래 요청대로 `Docs/`도 계속 제외됩니다.
