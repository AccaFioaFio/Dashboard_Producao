# Mantém Docker + Evolution API online após login no Windows.
$ErrorActionPreference = "Continue"
$log = Join-Path $PSScriptRoot "ensure-online.log"
function Write-Log($msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
  Add-Content -Path $log -Value $line -Encoding UTF8
}

Write-Log "inicio"

$dockerExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
if (Test-Path $dockerExe) {
  $running = Get-Process "Docker Desktop" -ErrorAction SilentlyContinue
  if (-not $running) {
    Write-Log "iniciando Docker Desktop"
    Start-Process $dockerExe
  }
}

$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
  [System.Environment]::GetEnvironmentVariable("Path", "User")

$deadline = (Get-Date).AddMinutes(5)
$ready = $false
do {
  $ver = & docker version --format '{{.Server.Version}}' 2>$null
  if ($LASTEXITCODE -eq 0 -and $ver) {
    $ready = $true
    Write-Log "docker ready $ver"
    break
  }
  Start-Sleep -Seconds 5
} while ((Get-Date) -lt $deadline)

if (-not $ready) {
  Write-Log "docker nao ficou pronto"
  exit 1
}

Set-Location $PSScriptRoot
docker compose up -d | Out-String | ForEach-Object { Write-Log $_.Trim() }

$apiDeadline = (Get-Date).AddMinutes(2)
do {
  try {
    $null = Invoke-WebRequest -Uri "http://localhost:8080" -UseBasicParsing -TimeoutSec 3
    Write-Log "evolution online"
    exit 0
  } catch {
    Start-Sleep -Seconds 3
  }
} while ((Get-Date) -lt $apiDeadline)

Write-Log "evolution nao respondeu"
exit 1
