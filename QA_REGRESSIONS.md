# Markdown 원문 보존 회귀 — 2026-09-21

사용자가 QA.md를 Rich로 열고 공백 하나를 입력한 뒤 저장했을 때 82줄이 변경되었다. 표의 정렬·구분선과 밑줄 이스케이프가 문서 전체에 적용된 문제다. 앞선 QA의 의미 왕복 검사와 무수정 저장 검사는 이 동작을 잡지 못했다. 앞선 PASS를 수정 후의 원문 보존까지 검증한 것으로 해석하면 안 된다.

## 수정

- 기존 Milkdown/remark의 원문 위치와 ProseMirror 변경 범위를 사용해 수정하지 않은 블록을 원문 그대로 유지한다. 문법 파서를 교체하거나 새로 구현하지 않았다.
- 일반 문자·표 셀·체크박스 수정은 가능한 경우 원문의 해당 부분만 바꾼다. 원래 상태로 undo하면 원래 Markdown 표기를 돌려준다. Raw 편집·외부 reload는 새 원문을 기준으로 삼는다.
- 구조/서식 변경이나 이스케이프·엔티티처럼 문자 위치를 직접 대응시킬 수 없는 경우에는 수정된 블록만 기존 serializer로 변환한다. 이 경우 해당 블록의 문법 표기가 정규화될 수 있다. 모든 편집의 최소 바이트 diff를 보장하지는 않는다.
- 구조 변경은 결과를 기존 파서로 다시 읽어 의미가 보존되는지 검사한다. 원문 대응/의미 보존이 불가능하면 저장을 거부하고 편집 내용을 Raw에 남긴다. 확인 후 Raw에서 수정하면 저장할 수 있다.

## 검증

- Vitest 56/56: 실제 변경 전 QA.md를 fixture로 고정하고 공백 하나의 삽입만 발생하는지 문자열 전체 비교. 문단·제목·표 셀·굵은 글씨·코드·참조 링크·체크박스, 다중 블록 변경, 구조 변경, undo, 기존 16개 fixture 편집 후 의미 보존 검사 포함.
- Playwright 15/15: QA.md 공백→저장, undo→저장, Raw 수정→Rich 공백→저장 결과를 전체 문자열로 비교. HTML 블록 옆 편집 보존, 원문 보존 오류 시 Save 거부와 Raw 복구(오류 상태 주입), 기존 12개 시나리오 포함. IPC 대역 테스트이며 네이티브 검증과 구분한다.
- Rust 테스트 11/11, TypeScript/Vite 빌드 통과. `npm run tauri build -- --bundles nsis`로 수정된 Windows x64 설치 파일 생성. 로그·SHA-256은 Git에서 제외된 `Docs/markdown-preservation/`에 기록한다.
- 사용자 종료 확인 후 수정본을 NSIS로 설치하고 **실제 WebView2/Rust IPC 회귀 4/4 PASS**를 확인했다. 설치 경로는 `C:\Users\qkrql\AppData\Local\Markraft QA\markraft.exe`다. 재현 스크립트 `Docs/markdown-preservation/native-regression.mjs`가 QA 복사본을 CRLF로 열어 파일 전체 바이트를 비교했다. 결과는 `native-results.json`, `native.log`, `native-1.png`부터 `native-4.png`에 있다. 테스트 후 임시 CDP 포트를 종료했다.
  - Rich에서 공백 하나 입력·저장: 20,995 → 20,996 bytes. 해당 공백 이외의 바이트가 모두 원본과 동일.
  - undo·저장: 원본 20,995 bytes와 완전히 동일.
  - Raw 제목 수정 후 Rich 공백 입력·저장: 의도한 두 변경만 반영된 21,000 bytes와 완전히 동일.
  - 닫기·재열기·무수정 저장: 21,000 bytes 및 수정 시간 불변.
- 원래 사용자 QA.md는 `Docs/markdown-preservation/QA.user-saved.md`에 백업했다. 복원 직전에 사용자가 추가로 수정하지 않았음을 바이트 비교한 뒤 자동 재정렬만 복구했다. 사용자가 넣은 공백 하나는 그대로 남기고 커밋에 포함하지 않는다.

Windows IME와 기존 QA의 NOT RUN 항목은 이번 수정으로 통과 처리하지 않는다.
