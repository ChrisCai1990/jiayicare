Add-Type -AssemblyName System.Drawing

$outputPath = Join-Path $PSScriptRoot '..\miniprogram\src\assets\invite-share-cover.png'
$bitmap = New-Object System.Drawing.Bitmap 500, 400
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#F2EDE3'))

$green = [System.Drawing.ColorTranslator]::FromHtml('#1E6B50')
$dark = [System.Drawing.ColorTranslator]::FromHtml('#1A2B24')
$muted = [System.Drawing.ColorTranslator]::FromHtml('#4A6558')
$white = [System.Drawing.Color]::White
$graphics.FillRectangle((New-Object System.Drawing.SolidBrush $green), 0, 0, 500, 142)

$heartFont = New-Object System.Drawing.Font 'Microsoft YaHei', 48, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$titleFont = New-Object System.Drawing.Font 'Microsoft YaHei', 36, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$bodyFont = New-Object System.Drawing.Font 'Microsoft YaHei', 22, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$smallFont = New-Object System.Drawing.Font 'Microsoft YaHei', 18, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)

$center = New-Object System.Drawing.StringFormat
$center.Alignment = [System.Drawing.StringAlignment]::Center
$graphics.DrawString('♥', $heartFont, (New-Object System.Drawing.SolidBrush $white), (New-Object System.Drawing.RectangleF 0, 18, 500, 64), $center)
$graphics.DrawString('邀请你一起关注健康', $titleFont, (New-Object System.Drawing.SolidBrush $white), (New-Object System.Drawing.RectangleF 0, 82, 500, 54), $center)
$graphics.DrawString('把健康理念分享给身边的人', $bodyFont, (New-Object System.Drawing.SolidBrush $dark), (New-Object System.Drawing.RectangleF 0, 202, 500, 40), $center)
$graphics.DrawString('健康可控，人生方可从容。', $smallFont, (New-Object System.Drawing.SolidBrush $muted), (New-Object System.Drawing.RectangleF 0, 260, 500, 36), $center)

$pen = New-Object System.Drawing.Pen $green, 3
$graphics.DrawLine($pen, 145, 330, 355, 330)

$bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$pen.Dispose()
$center.Dispose()
$heartFont.Dispose()
$titleFont.Dispose()
$bodyFont.Dispose()
$smallFont.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
