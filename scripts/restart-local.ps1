$ErrorActionPreference = 'Stop'
$projectDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$projectPattern = [regex]::Escape($projectDir)
$serverPort = 4028

$lockPath = Join-Path $projectDir 'logs\localhost.lock'
if (Test-Path -LiteralPath $lockPath) {
  $launcherPid = [int](Get-Content -LiteralPath $lockPath -Raw)
  $oldLauncher = Get-CimInstance Win32_Process -Filter "ProcessId = $launcherPid"
  if ($oldLauncher) {
    if ($oldLauncher.Name -ne 'node.exe' -or $oldLauncher.CommandLine -notmatch $projectPattern -or $oldLauncher.CommandLine -notmatch 'dev-local\.mjs') {
      throw "The localhost launcher PID no longer belongs to this project."
    }
    taskkill.exe /PID $launcherPid /T /F | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Unable to stop the old localhost launcher.' }
  }
  Remove-Item -LiteralPath $lockPath
}

# netstat works in environments where Get-NetTCPConnection is unavailable.
$listeners = netstat.exe -ano -p tcp | Select-String "^\s*TCP\s+\S+:$serverPort\s+\S+\s+LISTENING\s+(\d+)\s*$"
foreach ($line in $listeners) {
  $serverPid = [int]$line.Matches[0].Groups[1].Value
  $server = Get-CimInstance Win32_Process -Filter "ProcessId = $serverPid"
  if ($server.Name -ne 'node.exe' -or $server.CommandLine -notmatch $projectPattern -or $server.CommandLine -notmatch 'next') {
    throw "Port $serverPort belongs to another application (PID $serverPid)."
  }
  Stop-Process -Id $serverPid -Force
}

$launcher = Join-Path $projectDir 'scripts\dev-local.mjs'
Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList ('"' + $launcher + '"') -WorkingDirectory $projectDir -WindowStyle Hidden
Write-Output "Localhost restarting on port $serverPort. Log: $projectDir\logs\localhost.log"
