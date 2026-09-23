# Privacy policy

Updated September 23, 2026. Applies to the Markraft desktop application.

## Documents and settings

Markraft reads and writes files selected by the user. It does not operate a document
upload service or include analytics, advertising, account registration, automatic
update checks, or automatic crash-report uploads. Open tabs and their contents,
including unsaved edits, are saved locally so the workspace can reopen after a restart.

Language grammars are packaged with the application; selecting one does not download a model or
send document contents to a service. Word suggestions use the current document,
and this version does not connect to an AI completion service or language server.

Language, theme, font, and editor preferences are stored in the application's local
WebView storage under `markraft.settings`. The desktop workspace snapshot is stored
in the application's local data directory as `workspace.json`; it contains document
paths, document text, and tab layout. It is not uploaded by Markraft. Local images
are read through the native file bridge. Saving to a cloud-synchronized folder or
network drive uses the location you selected; its synchronization and access rules
are controlled by that provider.

## Network requests you initiate

- Remote HTTPS images in Markdown are initially blocked. Choosing **Load once**
  requests that image from its host. The host receives normal connection information,
  including your IP address and the requested URL. Markraft sets `no-referrer` for
  that image; URLs themselves may contain identifying information. Avoid loading an
  image if you do not trust its host.
- Opening an HTTP/HTTPS or mail link launches the system's browser or mail handler.
  Subsequent activity is governed by that application and the destination service.
- Downloading releases and submitting GitHub issues use GitHub, outside the editor.
  Issue contents may be public; do not attach private documents or credentials.

## Platform components

Windows uses Microsoft Edge WebView2. The installer may download and install the
runtime from Microsoft if it is missing. Runtime updates and platform diagnostics
are governed by Microsoft's components and system settings, independently of
Markraft's own application logic. See the
[Microsoft Privacy Statement](https://www.microsoft.com/en-us/privacy/privacystatement).

macOS uses the system WebKit runtime. Operating-system services, diagnostics, and
backups follow the user's system settings and
[Apple Privacy Policy](https://www.apple.com/legal/privacy/).

The policies of remote image hosts, browsers, mail handlers, and file-sync providers
apply when you use them. Repository and download activity is covered by the
[GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

## Questions

Contact the maintainer through the [Markraft repository](https://github.com/Hinen/Markraft).
Describe privacy issues without publishing sensitive file contents. Policy changes
are tracked in Git history.
