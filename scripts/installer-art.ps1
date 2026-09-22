# Render NSIS artwork at 4x from the 512px icon; retain logical layout coordinates.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$output = Join-Path $root 'src-tauri\windows\branding'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$scale = 4
$icon = [Drawing.Image]::FromFile((Join-Path $root 'src-tauri\icons\icon.png'))
function Brush([string]$hex) { [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml($hex)) }
function Font([single]$size, [Drawing.FontStyle]$style = [Drawing.FontStyle]::Regular) {
  [Drawing.Font]::new('Segoe UI', $size, $style, [Drawing.GraphicsUnit]::Pixel)
}
function Canvas([int]$width, [int]$height) {
  $bitmap = [Drawing.Bitmap]::new(($width * $scale), ($height * $scale), [Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.ScaleTransform($scale, $scale)
  return @($bitmap, $graphics)
}
$white = Brush '#ffffff'; $ink = Brush '#252b34'; $muted = Brush '#aab5c7'; $accent = Brush '#91b2ff'; $line = Brush '#435069'
$title = Font 22 Bold; $headerTitle = Font 18 Bold
try {
  $bitmap, $graphics = Canvas 164 314
  $graphics.Clear([Drawing.ColorTranslator]::FromHtml('#1e232c'))
  $graphics.FillRectangle($accent, 0, 0, 164, 4)
  $graphics.DrawImage($icon, 24, 36, 72, 72)
  $graphics.DrawString('Markraft', $title, $white, 22, 120)
  $graphics.FillRectangle($line, 24, 207, 116, 1)
  $graphics.FillRectangle($accent, 24, 227, 12, 3)
  $graphics.FillRectangle($line, 44, 227, 84, 3)
  $graphics.FillRectangle($line, 36, 242, 71, 3)
  $graphics.FillRectangle($line, 36, 257, 92, 3)
  $graphics.FillRectangle($accent, 24, 279, 2, 12)
  $bitmap.Save((Join-Path $output 'sidebar.bmp'), [Drawing.Imaging.ImageFormat]::Bmp)
  $graphics.Dispose(); $bitmap.Dispose()
  $bitmap, $graphics = Canvas 150 57
  $graphics.Clear([Drawing.Color]::White)
  $graphics.DrawImage($icon, 8, 12, 32, 32)
  $graphics.DrawString('Markraft', $headerTitle, $ink, 46, 16)
  $bitmap.Save((Join-Path $output 'header.bmp'), [Drawing.Imaging.ImageFormat]::Bmp)
  $graphics.Dispose(); $bitmap.Dispose()
} finally {
  $icon.Dispose()
  foreach ($resource in @($white, $ink, $muted, $accent, $line, $title, $headerTitle)) { $resource.Dispose() }
}
