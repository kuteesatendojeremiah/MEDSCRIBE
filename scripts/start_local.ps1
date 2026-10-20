<#
Start Mediscribe on this computer with the LOCAL speech model (faster-whisper) so you can test with your
own audio. Audio is transcribed on this machine; nothing is sent over the internet except the one-time
download of the model files. Use FICTIONAL or your-own-voice test audio only - never real patient audio.

  powershell -ExecutionPolicy Bypass -File scripts\start_local.ps1            # real speech model (default: small)
  powershell -ExecutionPolicy Bypass -File scripts\start_local.ps1 -Model small
  powershell -ExecutionPolicy Bypass -File scripts\start_local.ps1 -Mock      # simulated transcription (demo case)
  powershell -ExecutionPolicy Bypass -File scripts\start_local.ps1 -Demo      # also show the testing-only demo sign-in

Accounts are stored (hashed) in backend\dataccounts.json - identities only, never clinical content.

Then open http://localhost:8000 .
#>
param([string]$Model = "small", [switch]$Mock, [switch]$Demo, [int]$Port = 8000)

$root = Split-Path -Parent $PSScriptRoot
$py = Join-Path $root "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $py)) { Write-Error "Backend virtualenv missing. See README (create backend\.venv and pip install -e .[dev,local])."; exit 1 }

Push-Location (Join-Path $root "frontend")
if (-not (Test-Path "node_modules")) { npm install }
npm run build
Pop-Location

if ($Mock) {
  $env:PROVIDER = "mock"
} else {
  $env:PROVIDER = "local_whisper"
  $env:PROVIDER_GATE_APPROVED = "true"
  $env:PROVIDER_ALLOW_LIST = '["local_whisper"]'
  $env:WHISPER_MODEL = $Model
  Write-Host "Local speech model: $Model (downloaded once on first use; audio stays on this computer)"
}
$env:SYNTHETIC_ONLY = "true"
# Doctors sign in with accounts (first run creates the administrator). -Demo adds a testing-only demo button.
$env:DEV_AUTH_ENABLED = $(if ($Demo) { "true" } else { "false" })
$env:STATIC_DIR = (Join-Path $root "frontend\dist")

Start-Job -ScriptBlock { param($p) Start-Sleep 5; Start-Process "http://localhost:$p" } -ArgumentList $Port | Out-Null
Set-Location (Join-Path $root "backend")
& $py -m uvicorn app.web:app --host 127.0.0.1 --port $Port --no-access-log --log-level warning
