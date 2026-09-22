param([Parameter(Mandatory = $true)][string]$InstallDirectory)
$ErrorActionPreference = 'Stop'
$exe = Join-Path (Resolve-Path -LiteralPath $InstallDirectory).Path 'markraft.exe'
foreach ($file in @($exe, (Join-Path $InstallDirectory 'LICENSE'), (Join-Path $InstallDirectory 'README.md'), (Join-Path $InstallDirectory 'DEPENDENCIES.md'), (Join-Path $InstallDirectory 'DEPENDENCY_REVIEW.md'), (Join-Path $InstallDirectory 'THIRD_PARTY_NOTICES.txt'))) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing installed file: $file" }
}
$resourceConfig = Get-Content (Join-Path $PSScriptRoot '../src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json
foreach ($resource in $resourceConfig.bundle.resources.PSObject.Properties) {
    $sourceFile = Join-Path $PSScriptRoot "../src-tauri/$($resource.Name)"
    $installedFile = Join-Path $InstallDirectory $resource.Value
    if (-not (Test-Path -LiteralPath $installedFile -PathType Leaf)) { throw "Missing resource: $installedFile" }
    if ((Get-FileHash -LiteralPath $sourceFile).Hash -ne (Get-FileHash -LiteralPath $installedFile).Hash) { throw "Resource mismatch: $installedFile" }
}
$command = (Get-Item 'HKCU:\Software\Classes\Markraft.Document\shell\open\command').GetValue('')
if ($command -ne ('"' + $exe + '" "%1"')) { throw "Incorrect file association command: $command" }
$capabilities = (Get-ItemProperty 'HKCU:\Software\RegisteredApplications' -Name Markraft).Markraft
if ($capabilities -ne 'Software\Markraft\Capabilities') { throw 'Missing default-app registration' }
$extensions = @($resourceConfig.bundle.fileAssociations | ForEach-Object { $_.ext })
$appCommand = (Get-Item 'HKCU:\Software\Classes\Applications\markraft.exe\shell\open\command').GetValue('')
if ($appCommand -ne $command) { throw 'Incorrect Open With application command' }
foreach ($extension in $extensions) {
    $openWith = Get-Item "HKCU:\Software\Classes\.$extension\OpenWithProgids"
    if ($openWith.GetValueNames() -notcontains 'Markraft.Document') { throw "Missing Open With entry: $extension" }
    $association = (Get-Item 'HKCU:\Software\Markraft\Capabilities\FileAssociations').GetValue(".$extension")
    if ($association -ne 'Markraft.Document') { throw "Missing capability: $extension" }
    $supported = Get-Item 'HKCU:\Software\Classes\Applications\markraft.exe\SupportedTypes'
    if ($supported.GetValueNames() -notcontains ".$extension") { throw "Missing supported type: $extension" }
}
[pscustomobject]@{ Result = 'PASS'; Executable = $exe; Command = $command; Extensions = $extensions.Count }
