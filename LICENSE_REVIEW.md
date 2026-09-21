# Windows 의존성 정책 검토

검토일: 2026-09-21. 대상: 현재 `Cargo.lock`, `x86_64-pc-windows-msvc`, Tauri 2.11.6.
**copyleft 의존성 전면 금지 조건은 아직 충족하지 않는다.** 정책 예외를 승인하거나 의존성을 교체하지 않았다.

## 실제 의존 경로

`cargo tree --locked --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-msvc -i <crate> -e normal,build`와 내려받은 crate의 Cargo.toml/소스를 확인했다.

| MPL-2.0 crate | Windows 경로 | 구분 |
| --- | --- | --- |
| option-ext 0.2.0 | tauri → dirs 6.0.0 → dirs-sys 0.5.0 → option-ext | 런타임 의존 그래프 및 tauri-build 양쪽 |
| cssparser 0.36.0 | tauri-build / tauri-codegen / tauri-macros → tauri-utils 2.9.3 → dom_query 0.27.0 → cssparser | 빌드 및 procedural macro 호스트 도구 |
| cssparser-macros 0.6.1 | 위 cssparser → cssparser-macros | 빌드 도구 |
| dtoa-short 0.3.5 | 위 cssparser → dtoa-short | 빌드 도구 |
| selectors 0.36.1 | 위 dom_query → selectors | 빌드 도구 |

`-e normal`만으로 런타임 포함 여부를 판정하면 안 된다. procedural macro의 일반 의존성도 출력되기 때문이다. `tauri-codegen`의 `build-2` 기능은 `tauri-utils/html-manipulation-2`와 `dom_query`를 켠다. 관련 [Tauri 기능 정의](https://docs.rs/crate/tauri-utils/2.9.3/features)도 확인했다.

`dirs-sys`는 option-ext를 플랫폼 조건 없이 선언한다. 실제 확장 메서드 사용은 Unix 코드에 있으나 Windows 의존 그래프에 존재하므로, 최종 바이너리에서 제거되었을 것이라는 추정으로 정책 통과를 주장하지 않는다. 바이너리 수준의 포함 여부는 별도 분석하지 않았다.

## 대안과 필요한 결정

1. 전면 금지를 유지한다면 `dirs-sys`의 Windows 불필요 의존성을 플랫폼별로 정리하는 upstream 변경 또는 관리 가능한 패치가 필요하다. 이것만으로 CSS 관련 네 개 의존성은 해결되지 않는다.
2. CSS 계열을 제거하려면 Tauri의 HTML/CSP 처리 경로를 permissive 구현으로 교체한 upstream 버전 또는 검증된 패치가 필요하다. 현재 잠긴 버전에서 단순한 앱 feature 변경만으로 빌드 경로를 끌 수 없다. CSP를 끄거나 고지/lockfile을 지우는 방법은 대안이 아니다. 별도 구현·보안·플랫폼 회귀 검증이 필요하며 이번 작업에서 실행하지 않았다.
3. Tauri 버전 다운그레이드는 제거가 입증된 대안이 아니다. 과거 HTML 처리 스택 역시 별도 라이선스 검토가 필요하므로 임의로 의존성을 바꾸지 않았다.
4. MPL 간접 의존성 예외를 허용할지, 빌드 도구까지 금지를 유지하며 교체 작업을 할지 사용자의 정책 결정이 필요하다. 예외 선택 시 배포 대상에 해당하는 고지와 소스 제공 절차를 검토해야 한다. 이번 로컬 빌드·설치는 정책 승인이나 공개 릴리스가 아니다.

[Mozilla MPL FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)와 [MPL 2.0 본문 3.1–3.3](https://www.mozilla.org/en-US/MPL/2.0/)은 배포 형태에 따른 고지·소스 제공 요구를 설명한다. 이것과 프로젝트 자체의 더 엄격한 의존성 금지 정책은 별개다.

## 목록 재생성

`scripts/licenses.mjs`는 `os.homedir()`, `CARGO_HOME`, Windows의 `cargo.exe`를 처리하며 `CARGO` 명시 경로를 우선한다. HOME/CARGO/CARGO_HOME이 모두 없는 현재 Windows 세션에서 `npm run licenses`를 실행해 npm 360개, Cargo 502개 목록을 재생성했다. Cargo 목록은 모든 플랫폼과 빌드 의존성을 포함한다. npm 고지는 현재 플랫폼에 설치된 패키지를 수집하므로 macOS에서 생성한 선택적 네이티브 도구 고지와 차이가 있다. 고지 원문을 변경하지 않았다.

`DEPENDENCIES.md`, `THIRD_PARTY_NOTICES.txt`는 유지하며 설치 파일에 포함한다. 로컬 tree 증거는 `Docs/windows-qa/windows-*.txt`에 있다.
