<#
.SYNOPSIS
  DRY RUN of IMG2OLE on many DWG files, in the background (AutoCAD Core Console).
  Nothing is changed or saved. Made for the AI team and for overnight checks.

.DESCRIPTION
  For every DWG in -InputFolder it starts AutoCAD Core Console (no window),
  loads IMG2OLE.lsp, lists every picture and writes two CSV logs:
    IMG2OLE_files.csv   one row per drawing  (Result: OK / CHECK / NO_IMAGES)
    IMG2OLE_images.csv  one row per picture  (WOULD_REPLACE / WOULD_SKIP + reason)
  The original DWGs are opened from where they are and never saved.

.EXAMPLE
  .\Invoke-Img2OleDryRun.ps1 -InputFolder "D:\Exports\2026-11-22"

.EXAMPLE
  .\Invoke-Img2OleDryRun.ps1 -InputFolder "D:\Exports" -OutputFolder "D:\Logs" `
      -AccoreConsole "C:\Program Files\Autodesk\AutoCAD 2025\accoreconsole.exe"
#>
param(
    [Parameter(Mandatory = $true)][string]$InputFolder,
    [string]$OutputFolder,
    [string]$AccoreConsole,
    [int]$TimeoutSeconds = 600
)

$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$lsp  = Join-Path $here 'IMG2OLE.lsp'
if (-not (Test-Path -LiteralPath $lsp)) { throw "IMG2OLE.lsp must sit next to this script: $lsp" }

$InputFolder = (Resolve-Path -LiteralPath $InputFolder).Path
if (-not $OutputFolder) { $OutputFolder = Join-Path $InputFolder 'IMG2OLE_dryrun' }
New-Item -ItemType Directory -Force -Path $OutputFolder | Out-Null
$OutputFolder = (Resolve-Path -LiteralPath $OutputFolder).Path

if (-not $AccoreConsole) {
    $AccoreConsole = Get-ChildItem -Path 'C:\Program Files\Autodesk' -Directory -Filter 'AutoCAD*' -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName 'accoreconsole.exe' } |
        Where-Object { Test-Path -LiteralPath $_ } |
        Select-Object -First 1
}
if (-not $AccoreConsole -or -not (Test-Path -LiteralPath $AccoreConsole)) {
    throw "accoreconsole.exe not found. Pass -AccoreConsole with its full path."
}

function ConvertTo-LispPath([string]$p) { ($p -replace '\\', '/').TrimEnd('/') + '/' }

$srcLisp = ConvertTo-LispPath $InputFolder
$outLisp = ConvertTo-LispPath $OutputFolder
$lspLisp = ($lsp -replace '\\', '/')

$dwgs = @(Get-ChildItem -LiteralPath $InputFolder -Filter '*.dwg' -File)
if ($dwgs.Count -eq 0) { Write-Warning "No DWG files in $InputFolder"; return }

Write-Host "IMG2OLE dry run: $($dwgs.Count) drawing(s)"
Write-Host "Core Console: $AccoreConsole"
Write-Host "Logs:         $OutputFolder"

$consoleDir = Join-Path $OutputFolder 'console_logs'
New-Item -ItemType Directory -Force -Path $consoleDir | Out-Null

$n = 0
foreach ($d in $dwgs) {
    $n++
    Write-Host ("[{0}/{1}] {2}" -f $n, $dwgs.Count, $d.Name)

    $scr = Join-Path $env:TEMP ('img2ole_' + [guid]::NewGuid().ToString('N') + '.scr')
    @(
        "(load `"$lspLisp`")"
        "(i2o:process-file `"DRYRUN`" `"$srcLisp`" `"$outLisp`" `"EMF`")"
        '_.QUIT _Y'
    ) | Set-Content -LiteralPath $scr -Encoding Default

    $consoleLog = Join-Path $consoleDir ($d.BaseName + '.txt')
    $proc = Start-Process -FilePath $AccoreConsole `
        -ArgumentList @('/i', "`"$($d.FullName)`"", '/s', "`"$scr`"") `
        -NoNewWindow -PassThru -RedirectStandardOutput $consoleLog

    if (-not $proc.WaitForExit($TimeoutSeconds * 1000)) {
        $proc.Kill()
        Write-Warning "  Timed out after $TimeoutSeconds s - skipped"
    }
    Remove-Item -LiteralPath $scr -ErrorAction SilentlyContinue
}

$filesCsv = Join-Path $OutputFolder 'IMG2OLE_files.csv'
if (Test-Path -LiteralPath $filesCsv) {
    Write-Host ""
    Write-Host "Summary (latest row per drawing):"
    Import-Csv -LiteralPath $filesCsv |
        Group-Object File | ForEach-Object { $_.Group | Select-Object -Last 1 } |
        Format-Table @{n = 'Drawing'; e = { Split-Path $_.File -Leaf } }, ImagesFound, Ready, Skipped, Result -AutoSize
    $done = @(Import-Csv -LiteralPath $filesCsv | Select-Object -ExpandProperty File -Unique).Count
    if ($done -lt $dwgs.Count) {
        Write-Warning "$($dwgs.Count - $done) drawing(s) wrote no log row. Check console_logs (LISP not loaded? Add the IMG2OLE folder to Trusted Locations)."
    }
}
else {
    Write-Warning "No log was written. Check $consoleDir. Most likely the LISP was blocked: add the IMG2OLE folder to AutoCAD Trusted Locations."
}
