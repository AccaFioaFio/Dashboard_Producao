# Sobe a Evolution API e cria/reconecta a instância "corte".
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$apiKey = (Get-Content .env | Where-Object { $_ -match '^AUTHENTICATION_API_KEY=' } | ForEach-Object { ($_ -split '=',2)[1] }).Trim()
if (-not $apiKey) { $apiKey = "fioafio-corte-local" }

Write-Host "Subindo Evolution API..."
docker compose up -d

$base = "http://localhost:8080"
$deadline = (Get-Date).AddMinutes(2)
do {
  Start-Sleep -Seconds 2
  try {
    $null = Invoke-WebRequest -Uri $base -UseBasicParsing -TimeoutSec 3
    break
  } catch {
    if ((Get-Date) -gt $deadline) { throw "Evolution não respondeu em $base" }
  }
} while ($true)

Write-Host "Garantindo instância 'corte'..."
try {
  Invoke-RestMethod -Method Delete -Uri "$base/instance/delete/corte" -Headers @{ apikey = $apiKey } | Out-Null
} catch {}

$create = Invoke-RestMethod -Method Post -Uri "$base/instance/create" `
  -Headers @{ apikey = $apiKey; "Content-Type" = "application/json" } `
  -Body (@{ instanceName = "corte"; qrcode = $true; integration = "WHATSAPP-BAILEYS" } | ConvertTo-Json)

$b64 = $create.qrcode.base64
if (-not $b64) {
  Start-Sleep 2
  $connect = Invoke-RestMethod -Method Get -Uri "$base/instance/connect/corte" -Headers @{ apikey = $apiKey }
  $b64 = $connect.base64
}

if ($b64) {
  $raw = $b64 -replace '^data:image/\w+;base64,', ''
  $qrPath = Join-Path $PSScriptRoot "qr-corte.png"
  [IO.File]::WriteAllBytes($qrPath, [Convert]::FromBase64String($raw))
  Write-Host "QR salvo em: $qrPath"
  Start-Process $qrPath
} else {
  Write-Host "Abra o manager: $base/manager (API Key: $apiKey) e clique em Get QR Code."
}

Write-Host ""
Write-Host "No celular: WhatsApp > Aparelhos conectados > Conectar um aparelho > ler o QR."
Write-Host "Manager: $base/manager"
Write-Host "No .env.local do dashboard:"
Write-Host "  WHATSAPP_EVOLUTION_URL=$base"
Write-Host "  WHATSAPP_EVOLUTION_INSTANCE=corte"
Write-Host "  WHATSAPP_EVOLUTION_APIKEY=$apiKey"
Write-Host "  WHATSAPP_CORTE_TO=55SEUDDDNUMERO"
Write-Host "Depois: ENVIO_WHATSAPP_CORTE_PAUSADO = false em app/actions/corte-producao.ts"
