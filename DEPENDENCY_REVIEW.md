# Dependency license review

Reviewed: September 22, 2026. This document records dependency findings; the
license for Markraft itself is the [MIT License](LICENSE).

## Project and third-party licenses

Markraft's original code is licensed under MIT. Dependencies retain their own
licenses and copyright notices; Markraft's MIT license does not replace them.
See [DEPENDENCIES.md](DEPENDENCIES.md) for versions and license expressions and
[THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt) for collected upstream texts.

The inventory includes development tools and Cargo dependencies for all targets.
It is not a list of components proven to be linked into every shipped executable.
Notices are collected from installed packages, so optional npm packages can differ
between Windows and macOS. This collection is not a complete binary-level audit.

## MPL-2.0 dependencies

The Windows dependency paths below were inspected on September 21, 2026 against
Tauri 2.11.6 and the locked dependency graph using:

```sh
cargo tree --locked --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-msvc -i <crate> -e normal,build
```

| Crate | Dependency path | Scope |
| --- | --- | --- |
| option-ext 0.2.0 | tauri → dirs 6.0.0 → dirs-sys 0.5.0 → option-ext | Normal dependency graph and tauri-build |
| cssparser 0.36.0 | tauri-build / tauri-codegen / tauri-macros → tauri-utils 2.9.3 → dom_query 0.27.0 → cssparser | Build and procedural-macro host tools |
| cssparser-macros 0.6.1 | cssparser → cssparser-macros | Build tools |
| dtoa-short 0.3.5 | cssparser → dtoa-short | Build tools |
| selectors 0.36.1 | dom_query → selectors | Build tools |

`-e normal` alone does not prove runtime inclusion: procedural macros also have
normal dependencies. `dirs-sys` declares `option-ext` without a platform condition,
although the inspected extension-method uses were in Unix code. Binary-level
inclusion or elimination has not been established. The `tauri-codegen` `build-2`
feature enables `tauri-utils/html-manipulation-2` and `dom_query`.

MPL is file-level copyleft. Combining MPL dependencies with separate MIT code does
not by itself relicense Markraft's original files as MPL. Recipients of binaries
containing MPL code must be told where to obtain the corresponding MPL source;
changes to covered files remain subject to MPL. See the
[Mozilla FAQ, questions 8–11](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)
and [MPL 2.0, sections 3.1–3.3](https://www.mozilla.org/en-US/MPL/2.0/).

### Source availability

The locked upstream sources for the five crates above are available below. These
sources retain their MPL-2.0 terms and upstream notices. Markraft currently has no
local patches to these crates. If a future release changes covered source files,
publish the corresponding modified source with that release.

| Crate | Source browser | Source archive |
| --- | --- | --- |
| option-ext 0.2.0 | [Source](https://docs.rs/crate/option-ext/0.2.0/source/) | [Archive](https://static.crates.io/crates/option-ext/option-ext-0.2.0.crate) |
| cssparser 0.36.0 | [Source](https://docs.rs/crate/cssparser/0.36.0/source/) | [Archive](https://static.crates.io/crates/cssparser/cssparser-0.36.0.crate) |
| cssparser-macros 0.6.1 | [Source](https://docs.rs/crate/cssparser-macros/0.6.1/source/) | [Archive](https://static.crates.io/crates/cssparser-macros/cssparser-macros-0.6.1.crate) |
| dtoa-short 0.3.5 | [Source](https://docs.rs/crate/dtoa-short/0.3.5/source/) | [Archive](https://static.crates.io/crates/dtoa-short/dtoa-short-0.3.5.crate) |
| selectors 0.36.1 | [Source](https://docs.rs/crate/selectors/0.36.1/source/) | [Archive](https://static.crates.io/crates/selectors/selectors-0.36.1.crate) |

## Current dependency policy

Effective September 22, 2026, following the maintainer's instruction to resolve the
identified policy conflict: Markraft remains MIT-licensed and permits the current
Tauri MPL-2.0 dependencies with their upstream notices and source availability.
This supersedes the original implementation specification's blanket no-copyleft
restriction. That historical restriction is not a release blocker under this policy.

Changes to MPL-covered files must retain MPL terms and publish corresponding source.
Future dependency changes require review of their actual license, distribution scope,
and obligations. Do not remove license text, relabel upstream code as MIT, or infer
that every component is permissive. See [distribution scope](DISTRIBUTION_COMPONENTS.md)
for build-only data and system runtimes.

## Maintaining the inventory

Run `npm ci`, then `npm run licenses` with the locked Cargo dependencies available.
The generator supports `CARGO`, `CARGO_HOME`, and the default Windows Cargo path.
It preserves upstream license texts rather than translating or rewriting them.
Review inventory changes and missing notices before distributing new builds.
The license, inventory, this review, and collected notices are included as bundle
resources. Existing release artifacts are not changed by editing these files.
