# Code signing policy

## Current status

Markraft has not applied to or been approved by SignPath Foundation. No release
currently uses SignPath signing. Windows releases are unsigned; macOS releases are ad-hoc
signed and not notarized. This policy prepares for a future Windows application.

After approval and activation, the attribution will be:

> Free code signing provided by [SignPath.io](https://signpath.io), certificate by [SignPath Foundation](https://signpath.org).

That attribution does not describe the current releases. Foundation certificates
identify SignPath Foundation, rather than the maintainer, as the certificate holder.

## Responsibilities

| Role | Maintainer |
| --- | --- |
| Author / committer | [Hinen](https://github.com/Hinen) |
| Reviewer of external contributions | [Hinen](https://github.com/Hinen) |
| Release and signing approver | [Hinen](https://github.com/Hinen) |

Markraft currently has one maintainer. Contributions from other authors require
maintainer review, including changes to dependencies and build workflows. These
roles do not imply independent two-person review.

Repository and signing access must use multi-factor authentication. The maintainer
confirmed GitHub 2FA on September 22, 2026. SignPath MFA must be enabled when an
account is set up; it has not been verified or configured by this project yet.

## Release controls

Only Markraft artifacts built from the public repository are eligible for a future
signing request. The approver must check the source commit, workflow results,
product name (Markraft), matching product versions, dependency notices, and exact
artifacts before manually approving each signing request. Third-party executables
must not be signed as Markraft.

The [release workflow](.github/workflows/release.yml) builds Windows NSIS installers
and universal macOS bundles from locked npm and Cargo dependencies. Signing is not
integrated. Once integrated, publish checksums of the final signed files and retain
the source commit and build-run link. Never label an unsigned build as signed.

## Privacy and installation

See the [privacy policy](PRIVACY.md) for local storage, user-requested remote image
loads and links, and WebView2 installation/runtime considerations. Installation,
file registration, and removal are described in the [README](README.md#installation-and-removal).

## References

[SignPath Foundation conditions](https://signpath.org/terms.html) govern eligibility
and any future service. This policy is not evidence of acceptance or certification.
