; Use an application-specific ProgID and quote both paths for installations
; beneath user names / directories containing spaces. Keep default-app choice
; with Windows; OpenWithProgids and Capabilities make Markraft discoverable.
!include "${__FILEDIR__}\associations.generated.nsh"
!include "${__FILEDIR__}\installer-ui.nsh"

!macro MARKRAFT_REGISTER_EXTENSION EXT
  WriteRegStr SHELL_CONTEXT "Software\Classes\.${EXT}\OpenWithProgids" "Markraft.Document" ""
  WriteRegStr SHELL_CONTEXT "Software\Markraft\Capabilities\FileAssociations" ".${EXT}" "Markraft.Document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" ".${EXT}" ""
!macroend

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHELL_CONTEXT "Software\Classes\Markraft.Document" "" "Markraft text document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Markraft.Document\shell\open\command" "" '$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\"'
  WriteRegStr SHELL_CONTEXT "Software\Classes\Markraft.Document\DefaultIcon" "" '$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0'
  WriteRegStr SHELL_CONTEXT "Software\Markraft\Capabilities" "ApplicationName" "Markraft"
  WriteRegStr SHELL_CONTEXT "Software\Markraft\Capabilities" "ApplicationDescription" "Text and Markdown editor"
  WriteRegStr SHELL_CONTEXT "Software\RegisteredApplications" "Markraft" "Software\Markraft\Capabilities"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${MAINBINARYNAME}.exe" "FriendlyAppName" "Markraft"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${MAINBINARYNAME}.exe\shell\open\command" "" '$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\"'
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${MAINBINARYNAME}.exe\DefaultIcon" "" '$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0'
  !insertmacro MARKRAFT_REGISTER_ALL_EXTENSIONS
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro MARKRAFT_UNREGISTER_EXTENSION EXT
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.${EXT}\OpenWithProgids" "Markraft.Document"
  DeleteRegKey /ifempty SHELL_CONTEXT "Software\Classes\.${EXT}\OpenWithProgids"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "Markraft"
  DeleteRegKey SHELL_CONTEXT "Software\Markraft\Capabilities"
  DeleteRegKey /ifempty SHELL_CONTEXT "Software\Markraft"
  !insertmacro MARKRAFT_UNREGISTER_ALL_EXTENSIONS
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Applications\${MAINBINARYNAME}.exe"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Markraft.Document"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
