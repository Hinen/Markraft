param(
  [string]$MakeNsis = "$env:LOCALAPPDATA\tauri\NSIS\makensis.exe"
)
$ErrorActionPreference = 'Stop'
$workspace = Split-Path $PSScriptRoot -Parent
$testId = [guid]::NewGuid().ToString('N')
$sandbox = "HKCU:\Software\MarkraftAssociationTest\$testId"
$artifactDir = Join-Path $workspace "test-results\associations-$testId"
New-Item -ItemType Directory -Path $artifactDir -Force | Out-Null
$hooks = Get-Content -LiteralPath (Join-Path $workspace 'src-tauri\windows\hooks.nsh') -Raw
# Run the real hook bodies under an isolated registry prefix, never real Classes.
$hooks = $hooks.Replace('"Software\', '"Software\MarkraftAssociationTest\' + $testId + '\')
$hooks = $hooks.Replace("  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'", '')
Set-Content -LiteralPath (Join-Path $artifactDir 'hooks.nsh') -Value $hooks -Encoding utf8
Copy-Item -LiteralPath (Join-Path $workspace 'src-tauri\windows\associations.generated.nsh') -Destination $artifactDir
@'
Unicode true
RequestExecutionLevel user
SilentInstall silent
!define SHELL_CONTEXT HKCU
!define MAINBINARYNAME "markraft"
!include "hooks.nsh"
OutFile "${TEST_ACTION}.exe"
Section
  StrCpy $INSTDIR "$LOCALAPPDATA\Markraft Test With Spaces"
  !insertmacro NSIS_HOOK_POST${TEST_ACTION}
SectionEnd
'@ | Set-Content -LiteralPath (Join-Path $artifactDir 'test.nsi') -Encoding utf8

function Assert-Equal($Actual, $Expected, [string]$Message) {
  if ($Actual -cne $Expected) { throw "$Message (actual: $Actual, expected: $Expected)" }
}
try {
  $log = "$sandbox\Classes\.log"
  New-Item -Path "$log\OpenWithProgids" -Force | Out-Null
  Set-Item -LiteralPath $log -Value 'Other.Log'
  New-ItemProperty -LiteralPath "$log\OpenWithProgids" -Name 'Other.Editor' -Value '' | Out-Null
  foreach ($action in @('INSTALL', 'UNINSTALL')) {
    & $MakeNsis /V2 "/DTEST_ACTION=$action" (Join-Path $artifactDir 'test.nsi')
    if ($LASTEXITCODE -ne 0) { throw "NSIS compilation failed: $action" }
    $process = Start-Process -FilePath (Join-Path $artifactDir "$action.exe") -Wait -PassThru -WindowStyle Hidden
    if ($process.ExitCode -ne 0) { throw "Hook execution failed: $action" }
    Assert-Equal (Get-Item -LiteralPath $log).GetValue('') 'Other.Log' 'Existing default changed'
    Assert-Equal (Get-Item -LiteralPath "$log\OpenWithProgids").GetValue('Other.Editor') '' 'Other candidate removed'
    if ($action -eq 'INSTALL') {
      $config = Get-Content -LiteralPath (Join-Path $workspace 'src-tauri\tauri.conf.json') -Raw | ConvertFrom-Json
      foreach ($extension in $config.bundle.fileAssociations[0].ext) {
        Assert-Equal (Get-Item -LiteralPath "$sandbox\Classes\.$extension\OpenWithProgids").GetValue('Markraft.Document') '' "Missing candidate: $extension"
        Assert-Equal (Get-Item -LiteralPath "$sandbox\Markraft\Capabilities\FileAssociations").GetValue(".$extension") 'Markraft.Document' "Missing capability: $extension"
        Assert-Equal (Get-Item -LiteralPath "$sandbox\Classes\Applications\markraft.exe\SupportedTypes").GetValue(".$extension") '' "Missing supported type: $extension"
      }
      $command = (Get-Item -LiteralPath "$sandbox\Classes\Applications\markraft.exe\shell\open\command").GetValue('')
      Assert-Equal $command ('"' + $env:LOCALAPPDATA + '\Markraft Test With Spaces\markraft.exe" "%1"') 'Command must quote executable and file'
    } else {
      if ((Get-Item -LiteralPath "$log\OpenWithProgids").GetValueNames() -contains 'Markraft.Document') { throw 'Candidate was not removed' }
      foreach ($key in @('Markraft\Capabilities', 'Classes\Applications\markraft.exe', 'Classes\Markraft.Document')) {
        if (Test-Path -LiteralPath "$sandbox\$key") { throw "Registration not removed: $key" }
      }
    }
  }
  Write-Output 'PASS: registration, quoted paths, default preservation and uninstall cleanup in isolated registry.'
} finally {
  if ($sandbox -notmatch '^HKCU:\\Software\\MarkraftAssociationTest\\[0-9a-f]{32}$') { throw 'Unexpected registry sandbox path' }
  if (Test-Path -LiteralPath $sandbox) { Remove-Item -LiteralPath $sandbox -Recurse -Force }
}
