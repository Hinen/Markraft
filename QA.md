# 구현 및 검증 기록

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
