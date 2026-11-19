$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $root 'geo-knowledge-center\assets\jiayihui-logo.png'
$targetPath = Join-Path $PSScriptRoot 'app\src\main\res\drawable-nodpi\ic_launcher_foreground.png'
$source = [System.Drawing.Image]::FromFile($sourcePath)
try {
    if ($source.Width -ne 2104 -or $source.Height -ne 747) {
        throw "Logo dimensions changed; review the icon crop before rebuilding."
    }
    # Use only the square brand mark at the left of the official horizontal logo.
    # The source and destination squares preserve its proportions exactly.
    $crop = [System.Drawing.Rectangle]::new(80, 64, 620, 620)
    $image = [System.Drawing.Bitmap]::new(432, 432, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
        $canvas = [System.Drawing.Graphics]::FromImage($image)
        try {
            $canvas.Clear([System.Drawing.Color]::Transparent)
            $canvas.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $canvas.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $canvas.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $canvas.DrawImage($source, [System.Drawing.Rectangle]::new(108, 108, 216, 216), $crop, [System.Drawing.GraphicsUnit]::Pixel)
        } finally { $canvas.Dispose() }
        $image.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $image.Dispose() }
} finally { $source.Dispose() }
