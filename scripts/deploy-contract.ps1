$ErrorActionPreference = "Stop"

$ROOT = Split-Path -Parent $PSScriptRoot
$CONTRACT_DIR = Join-Path $ROOT "contracts/event-ticket"
$FRONTEND_ENV = Join-Path $ROOT "frontend/.env"
$NETWORK = "testnet"
$SOURCE_ACCOUNT = "deployer"

Write-Host "Building contract..." -ForegroundColor Green
Set-Location $CONTRACT_DIR

stellar contract build

$WASM = Get-ChildItem -Path "target/wasm32v1-none/release" -Filter "*.wasm" | Select-Object -First 1

if (-not $WASM) {
    throw "No WASM file found. Contract build failed."
}

Write-Host "Deploying contract to Stellar Testnet..." -ForegroundColor Green

$DEPLOY_OUTPUT = stellar contract deploy `
    --wasm $WASM.FullName `
    --source-account $SOURCE_ACCOUNT `
    --network $NETWORK

Write-Host $DEPLOY_OUTPUT

$CONTRACT_ID = ($DEPLOY_OUTPUT | Select-String -Pattern "C[A-Z0-9]{55,}").Matches.Value | Select-Object -First 1

if (-not $CONTRACT_ID) {
    throw "Could not detect Contract ID from deploy output."
}

Write-Host "New Contract ID: $CONTRACT_ID" -ForegroundColor Cyan

@"
VITE_STELLAR_NETWORK=testnet
VITE_CONTRACT_ID=$CONTRACT_ID
VITE_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
"@ | Set-Content -Encoding UTF8 $FRONTEND_ENV

Set-Location $ROOT

Write-Host "frontend/.env updated successfully!" -ForegroundColor Green
Write-Host "Contract ID has been auto-injected into frontend/.env" -ForegroundColor Yellow
