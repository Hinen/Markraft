param([Parameter(Mandatory = $true)][string]$InstallDirectory)
$ErrorActionPreference = 'Stop'
$exe = Join-Path (Resolve-Path -LiteralPath $InstallDirectory).Path 'markraft.exe'
foreach ($file in @($exe, (Join-Path $InstallDirectory 'README.md'), (Join-Path $InstallDirectory 'DEPENDENCIES.md'), (Join-Path $InstallDirectory 'THIRD_PARTY_NOTICES.txt'))) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing installed file: $file" }
}
$command = (Get-Item 'HKCU:\Software\Classes\Markraft.Document\shell\open\command').GetValue('')
if ($command -ne ('"' + $exe + '" "%1"')) { throw "Incorrect file association command: $command" }
$capabilities = (Get-ItemProperty 'HKCU:\Software\RegisteredApplications' -Name Markraft).Markraft
if ($capabilities -ne 'Software\Markraft\Capabilities') { throw 'Missing default-app registration' }
foreach ($extension in 'md', 'markdown', 'txt', 'yaml', 'yml', 'xml') {
    $openWith = Get-Item "HKCU:\Software\Classes\.$extension\OpenWithProgids"
    if ($openWith.GetValueNames() -notcontains 'Markraft.Document') { throw "Missing Open With entry: $extension" }
    $association = (Get-Item 'HKCU:\Software\Markraft\Capabilities\FileAssociations').GetValue(".$extension")
    if ($association -ne 'Markraft.Document') { throw "Missing capability: $extension" }
}
[pscustomobject]@{ Result = 'PASS'; Executable = $exe; Command = $command; Extensions = 6 }
