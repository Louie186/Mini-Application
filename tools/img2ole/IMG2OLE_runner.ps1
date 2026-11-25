<#
.SYNOPSIS
  Background logo helper: embeds logos in DWGs WHILE Revit is still exporting.
  Started by the Revit buttons - you do not run this yourself.

.DESCRIPTION
  Revit appends "<raw dwg>|<final DWG folder>" lines to <Folder>\IMG2OLE_queue.txt after each model.
  This helper takes the new lines, runs ONE AutoCAD on them (IMG2OLE, then AutoCAD quits), and repeats.
  Only one AutoCAD at a time, so the clipboard is never shared between two runs.
  It stops when Revit writes <Folder>\IMG2OLE_queue.done and everything is processed,
  or after -IdleMinutes without new work.
#>
param(
    [Parameter(Mandatory = $true)][string]$Folder,
    [Parameter(Mandatory = $true)][string]$Acad,
    [Parameter(Mandatory = $true)][string]$Lsp,
    [string]$Format = 'EMF',
    [int]$IdleMinutes = 120
)

$ErrorActionPreference = 'Stop'
$queue = Join-Path $Folder 'IMG2OLE_queue.txt'
$done  = Join-Path $Folder 'IMG2OLE_queue.done'
$pos   = Join-Path $Folder 'IMG2OLE_queue.pos'
$lock  = Join-Path $Folder 'IMG2OLE_runner.lock'
$log   = Join-Path $Folder 'IMG2OLE_runner.log'

function Say($t) { Add-Content -LiteralPath $log -Value ("{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $t) }

# one helper per output folder
if (Test-Path -LiteralPath $lock) {
    $old = Get-Content -LiteralPath $lock -ErrorAction SilentlyContinue
    if ($old -and (Get-Process -Id $old -ErrorAction SilentlyContinue)) { exit 0 }
}
Set-Content -LiteralPath $lock -Value $PID

$fwd = { param($p) $p -replace '\\', '/' }
$home_ = Split-Path -Parent $Lsp
$ansi = [System.Text.Encoding]::Default
$lastWork = Get-Date
$batch = 0
Say "Logo helper started (AutoCAD: $Acad)"

try {
    while ($true) {
        $all = @()
        if (Test-Path -LiteralPath $queue) { $all = @([System.IO.File]::ReadAllLines($queue, $ansi) | Where-Object { $_.Trim() }) }
        $n = 0
        if (Test-Path -LiteralPath $pos) { $n = [int](Get-Content -LiteralPath $pos) }

        if ($all.Count -gt $n) {
            $new = $all[$n..($all.Count - 1)]
            $batch++
            $jobs = Join-Path $Folder ("IMG2OLE_jobs_{0}.txt" -f $batch)
            [System.IO.File]::WriteAllLines($jobs, [string[]]$new, $ansi)
            $scr = Join-Path $Folder ("IMG2OLE_start_{0}.scr" -f $batch)
            $body = @(
                ('(setenv "IMG2OLE_HOME" "{0}")' -f ($home_ -replace '\\', '\\'))
                ('(load "{0}")' -f (& $fwd $Lsp))
                '(setq i2o:*quit-after* T)'
                ('(i2o:batch-file "{0}" "RUN" "{1}" "{2}/")' -f (& $fwd $jobs), $Format, ((& $fwd $Folder).TrimEnd('/')))
            )
            [System.IO.File]::WriteAllLines($scr, [string[]]$body, $ansi)
            Say ("Batch {0}: {1} drawing(s)" -f $batch, $new.Count)
            $p = Start-Process -FilePath $Acad -ArgumentList @('/nologo', '/b', "`"$scr`"") -PassThru
            $p.WaitForExit()
            Set-Content -LiteralPath $pos -Value $all.Count
            Say ("Batch {0} finished" -f $batch)
            $lastWork = Get-Date
            continue
        }

        if ((Test-Path -LiteralPath $done) -and $all.Count -le $n) { Say 'All logos done'; break }
        if (((Get-Date) - $lastWork).TotalMinutes -gt $IdleMinutes) { Say 'Stopped: no new work'; break }
        Start-Sleep -Seconds 5
    }
}
catch { Say ("ERROR: " + $_.Exception.Message) }
finally { Remove-Item -LiteralPath $lock -ErrorAction SilentlyContinue }
