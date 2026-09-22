; Override the Korean NSIS language file's legacy Gulim font.
SetFont /LANG=1042 "맑은 고딕" 9

; Customize only the supported MUI hooks; Tauri still owns upgrades and uninstall.
!define MUI_WELCOMEPAGE_TITLE "$(MarkraftWelcomeTitle)"
!define MUI_WELCOMEPAGE_TEXT "$(MarkraftWelcomeText)"
!define MUI_DIRECTORYPAGE_TEXT_TOP "$(MarkraftDirectoryText)"
!define MUI_FINISHPAGE_TITLE "$(MarkraftFinishTitle)"
!define MUI_FINISHPAGE_TEXT "$(MarkraftFinishText)"

LangString MarkraftWelcomeTitle 1033 "Install Markraft"
LangString MarkraftWelcomeText 1033 "Edit Markdown, text and code with Markraft.$\r$\n$\r$\nSetup will install Markraft for your Windows account and add it to Open with for common text files. Your default apps will stay unchanged.$\r$\n$\r$\nSave any open documents in Markraft before continuing."
LangString MarkraftDirectoryText 1033 "Choose where to install Markraft. When updating, your existing installation folder is selected. Use Browse to choose a different location. Setup does not move your documents."
LangString MarkraftFinishTitle 1033 "Markraft is ready"
LangString MarkraftFinishText 1033 "Open a file or create a new document to get started.$\r$\n$\r$\nChoose Markraft from Open with in File Explorer when you need it. To make it your default editor, use Windows Settings."

LangString MarkraftWelcomeTitle 1042 "Markraft 설치"
LangString MarkraftWelcomeText 1042 "Markraft로 Markdown, 텍스트와 코드를 편집하세요.$\r$\n$\r$\n현재 Windows 계정에 Markraft를 설치하고, 자주 쓰는 텍스트 파일의 연결 프로그램 후보에 추가합니다. 기존 기본 앱은 변경하지 않습니다.$\r$\n$\r$\n계속하기 전에 Markraft에서 작업 중인 문서를 저장해 주세요."
LangString MarkraftDirectoryText 1042 "Markraft를 설치할 폴더를 선택하세요. 업데이트 시에는 기존 설치 위치가 표시됩니다. 위치를 바꾸려면 찾아보기를 누르세요. 문서의 저장 위치는 변경하지 않습니다."
LangString MarkraftFinishTitle 1042 "Markraft 설치 완료"
LangString MarkraftFinishText 1042 "파일을 열거나 새 문서를 만들어 시작하세요.$\r$\n$\r$\n파일 탐색기의 연결 프로그램에서 Markraft를 선택할 수 있습니다. 기본 편집기로 사용하려면 Windows 설정에서 지정하세요."

LangString MarkraftWelcomeTitle 1041 "Markraft のインストール"
LangString MarkraftWelcomeText 1041 "Markraft で Markdown、テキスト、コードを編集できます。$\r$\n$\r$\n現在の Windows アカウントに Markraft をインストールし、テキストファイルの「プログラムから開く」に追加します。既定のアプリは変更しません。$\r$\n$\r$\n続行する前に、Markraft で編集中の文書を保存してください。"
LangString MarkraftDirectoryText 1041 "Markraft のインストール先を選択してください。更新時は既存の場所が表示されます。変更するには「参照」を押してください。文書の保存場所は変更しません。"
LangString MarkraftFinishTitle 1041 "Markraft の準備ができました"
LangString MarkraftFinishText 1041 "ファイルを開くか、新しい文書を作成して始めましょう。$\r$\n$\r$\nエクスプローラーの「プログラムから開く」で Markraft を選択できます。既定のエディターにする場合は Windows の設定から指定してください。"
