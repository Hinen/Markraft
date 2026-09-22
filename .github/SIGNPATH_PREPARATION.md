# SignPath application preparation

Prepared September 22, 2026. No application has been submitted and no service,
certificate, approval, or signing integration is claimed.

## Project details for a future application

| Field | Value |
| --- | --- |
| Project | Markraft |
| Maintainer / GitHub owner | Hinen — https://github.com/Hinen |
| Repository and homepage | https://github.com/Hinen/Markraft |
| Description | Desktop editor for Markdown, text, JSON, YAML, and XML, with rich Markdown editing and draggable split panes. |
| License | MIT; no commercial dual-license offering |
| Existing release | https://github.com/Hinen/Markraft/releases/tag/v0.0.2 |
| Requested signing scope | Windows x64 Markraft executable and NSIS installer; final artifact configuration subject to SignPath review |
| Build workflow | https://github.com/Hinen/Markraft/blob/main/.github/workflows/release.yml |
| Initial 0.0.1 build evidence | https://github.com/Hinen/Markraft/actions/runs/35676778646 |
| Code signing policy | https://github.com/Hinen/Markraft/blob/main/CODE_SIGNING_POLICY.md |
| Privacy policy | https://github.com/Hinen/Markraft/blob/main/PRIVACY.md |

The applicant must supply their own contact details directly in the application.
No private contact information or credentials belong in this document.

## Completed preparation

- Public MIT license and matching package metadata.
- Public release, downloads, feature documentation, and build evidence.
- Named author, reviewer, and approver; manual approval policy.
- Privacy, installation, removal, and platform-service disclosures.
- GitHub 2FA confirmed by the maintainer on September 22, 2026 (self-reported,
  not independently verified through the API).
- Dependency inventory and upstream notice collection with MPL source links.

## Evidence and limits

The current inventory contains 362 npm and 502 Cargo entries, including development
and cross-platform dependencies, with no `UNKNOWN` or `UNLICENSED` expressions.
This is metadata inspection, not a complete binary-level or legal audit. WebView2
is a proprietary system runtime; its treatment under the system-library exception
must be confirmed by SignPath. Do not present it as an open-source dependency.
The current MPL dependencies are permitted with their obligations; see the
[dependency policy](../DEPENDENCY_REVIEW.md). [Distribution scope](../DISTRIBUTION_COMPONENTS.md)
distinguishes build-only CC-BY data and describes the WebView2 system-runtime arrangement.
New builds emit frontend component evidence. Service acceptance remains with SignPath.

Markraft is a new project first publicly released in September 2026. Do not claim
an established user base or invent reputation evidence. Acceptance is discretionary.

## Intentionally deferred

Application submission, review correspondence, account creation and SignPath MFA,
service configuration, credentials, artifact rules, and workflow signing integration
are outside this preparation. The maintainer must manually approve future signing
requests after checking their origin and contents. Approval and actual signing must
precede changing the public status or attribution to describe an active service.

## Before the first signed release

Confirm acceptance and MFA, configure origin and metadata restrictions with SignPath,
connect the approved workflow, validate signatures of both the application and
installer, update current-status documentation, then publish final-file checksums.
These are future integration tasks, not completed checks.
