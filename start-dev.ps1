<#
.SYNOPSIS
  Fast Local Development Launcher for Ethiopian Coffee Export Blockchain System (CECBS)
  Tier 1: Fast Dev Mode (Simulated Ledger Engine + Lightweight Backing Stack)

.DESCRIPTION
  Boots PostgreSQL 15, Redis 7, and Kubo IPFS in ~5 seconds (<300MB RAM),
  ensures environment files are populated, and automatically starts both
  Backend API (port 3001) and Frontend UI (port 3000).

.PARAMETER ServicesOnly
  If specified, starts only the Docker backing services without launching the Node.js apps.
#>

param(
    [switch]$ServicesOnly
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "   ☕ CECBS - Fast Local Development Mode (Tier 1: Dev Mode)    " -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check Docker
Write-Host "[1/5] Checking Docker daemon status..." -ForegroundColor Yellow
try {
    $null = docker info 2>&1
    Write-Host "  --> Docker daemon is active and responding." -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] Docker is not running. Please start Docker Desktop and retry." -ForegroundColor Red
    exit 1
}

# 2. Check & Prepare Environment Files
Write-Host "[2/5] Ensuring environment configuration files..." -ForegroundColor Yellow

if (-not (Test-Path "api\.env")) {
    if (Test-Path "api\.env.dev") {
        Copy-Item "api\.env.dev" "api\.env"
        Write-Host "  --> Created api\.env from api\.env.dev (Fast Dev Mode defaults)" -ForegroundColor Green
    } elseif (Test-Path "api\.env.example") {
        Copy-Item "api\.env.example" "api\.env"
        Write-Host "  --> Created api\.env from api\.env.example" -ForegroundColor Green
    }
} else {
    Write-Host "  --> api\.env already exists." -ForegroundColor Gray
}

if (-not (Test-Path "ui\.env.local")) {
    if (Test-Path "ui\.env.dev") {
        Copy-Item "ui\.env.dev" "ui\.env.local"
        Write-Host "  --> Created ui\.env.local from ui\.env.dev" -ForegroundColor Green
    } elseif (Test-Path "ui\.env.example") {
        Copy-Item "ui\.env.example" "ui\.env.local"
        Write-Host "  --> Created ui\.env.local from ui\.env.example" -ForegroundColor Green
    }
} else {
    Write-Host "  --> ui\.env.local already exists." -ForegroundColor Gray
}

# 3. Start Backing Containers
Write-Host "[3/5] Launching lightweight backing stack (PostgreSQL + Redis + IPFS)..." -ForegroundColor Yellow
docker compose -f docker-compose.dev.yml up -d

# 4. Wait for PostgreSQL readiness
Write-Host "[4/5] Verifying PostgreSQL readiness..." -ForegroundColor Yellow
$maxAttempts = 12
$attempt = 0
$dbReady = $false

while ($attempt -lt $maxAttempts -and -not $dbReady) {
    Start-Sleep -Seconds 1
    $check = docker exec cecbs-postgres pg_isready -U cecbs -d cecbs 2>&1
    if ($check -match "accepting connections") {
        $dbReady = $true
    }
    $attempt++
}

if ($dbReady) {
    Write-Host "  --> PostgreSQL database 'cecbs' is ready on port 5433." -ForegroundColor Green
} else {
    Write-Host "  --> PostgreSQL container started (initialization continuing in background)." -ForegroundColor Yellow
}

# 5. Launch Application Servers (API + UI)
if (-not $ServicesOnly) {
    Write-Host "[5/5] Launching Application Servers in separate windows..." -ForegroundColor Yellow

    # Check if API is already running
    $apiRunning = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
    if (-not $apiRunning) {
        Write-Host "  --> Starting Backend API server on http://localhost:3001..." -ForegroundColor Cyan
        Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$Host.UI.RawUI.WindowTitle = 'CECBS Backend API (Port 3001)'; Set-Location '$PSScriptRoot\api'; npm run dev"
    } else {
        Write-Host "  --> Backend API is already running on port 3001." -ForegroundColor Green
    }

    # Check if UI is already running
    $uiRunning = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
    if (-not $uiRunning) {
        Write-Host "  --> Starting Frontend Next.js UI on http://localhost:3000..." -ForegroundColor Cyan
        Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$Host.UI.RawUI.WindowTitle = 'CECBS Frontend UI (Port 3000)'; Set-Location '$PSScriptRoot\ui'; npm run dev"
    } else {
        Write-Host "  --> Frontend UI is already running on port 3000." -ForegroundColor Green
    }
} else {
    Write-Host "[5/5] Services-only mode: application servers not launched." -ForegroundColor Gray
}

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "                  FAST DEV STACK IS ACTIVE                       " -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  Database:     localhost:5433  (DB: cecbs, User: cecbs)" -ForegroundColor White
Write-Host "  Redis Cache:  localhost:6379" -ForegroundColor White
Write-Host "  IPFS API:     localhost:5001  (Gateway: http://localhost:8080/ipfs)" -ForegroundColor White
Write-Host "  Blockchain:   SIMULATED (Built-in Simulated Ledger Engine Active)" -ForegroundColor Cyan
Write-Host ""
Write-Host "Access Portals at: http://localhost:3000" -ForegroundColor Green
Write-Host "API Gateway at:    http://localhost:3001/api-docs" -ForegroundColor Green
Write-Host ""
Write-Host "Test Credentials:" -ForegroundColor Yellow
Write-Host "  Exporter:     exporter1      / password123" -ForegroundColor White
Write-Host "  Bank Admin:   bank_admin     / password123" -ForegroundColor White
Write-Host "  ECTA Admin:   ecta_admin     / password123" -ForegroundColor White
Write-Host "  System Admin: admin          / admin123" -ForegroundColor White
Write-Host ""
Write-Host "To stop services:  .\stop-dev.ps1" -ForegroundColor Gray
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""
