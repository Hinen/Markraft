# Distribution component scope

## Application components

Markraft ships compiled Rust application code, frontend HTML/CSS/JavaScript, icons,
and documentation. `package-lock.json` and `src-tauri/Cargo.lock` pin dependencies.
`DEPENDENCIES.md` includes development and other-platform packages; it is not a
list of executable components proven to be linked into every installer.

Each production Vite build emits `frontend-components.json`, listing npm packages
whose modules occur in emitted JavaScript. It rejects missing package license
metadata and inclusion of `caniuse-lite`. This covers frontend modules, not
binary-level Rust linkage or arbitrary copied assets. Release downloads include
these manifests from both build hosts. Notices for build-only packages are retained.

## Build-only browser compatibility data

`caniuse-lite` 1.0.30001810 is CC-BY-4.0 browser compatibility data. It is marked `dev`
in the lockfile and reached through `@vitejs/plugin-react` → `@babel/core` →
`@babel/helper-compilation-targets` → `browserslist`. Run `npm explain caniuse-lite`.
The emitted-module check establishes its absence from frontend JavaScript; its
license notice remains in the broader notices. It is not relabeled as MIT or
presented as OSI-approved software.

## Windows system runtime

Microsoft Edge WebView2 is proprietary system software, not Markraft source code.
`webviewInstallMode` is explicitly `downloadBootstrapper`: no fixed runtime or offline
runtime installer is configured as a bundled resource. When the runtime is missing,
setup downloads Microsoft's bootstrapper and installs the runtime; otherwise it uses
the installed runtime. Markraft must not sign Microsoft executables.

The open-source Rust WebView2 bindings are distinct from the proprietary runtime.
NSIS also uses upstream installer components; these are not original Markraft code.
See [Tauri's installer documentation](https://v2.tauri.app/distribute/windows-installer/#webview2-installation-options)
and [Microsoft's distribution guidance](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution).
This is evidence for the proposed system-library exception, not confirmation from
SignPath. Its acceptance remains a service-provider decision.

## macOS system runtime

The application uses OS-provided WebKit and does not bundle a separate browser
runtime. This is separate from Windows SignPath signing.

## License obligations

Markraft is MIT; dependencies retain their terms, including MPL crates permitted by
our [dependency policy](DEPENDENCY_REVIEW.md#current-dependency-policy). Exact MPL
source archives are linked there. New releases bundle policies and notices.
Existing 0.0.1 artifacts remain unchanged historical builds.
