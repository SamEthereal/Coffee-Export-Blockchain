<#
.SYNOPSIS
  Fast Local Development Launcher for Ethiopian Coffee Export Blockchain System (CECBS)
  Tier 1: Fast Dev Mode (Simulated Ledger Engine + Lightweight Backing Stack)

.DESCRIPTION
  Boots PostgreSQL 15, Redis 7, and Kubo IPFS in ~5 seconds (<300MB RAM),
  ensures environment files are populated, and displays service connection endpoints.
#>

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "   ☕ CECBS - Fast Local Development Mode (Tier 1: Dev Mode)    " -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check Docker
Write-Host "[1/4] Checking Docker daemon status..." -ForegroundColor Yellow
try {
    $null = docker info 2>&1
    Write-Host "  --> Docker daemon is active and responding." -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] Docker is not running. Please start Docker Desktop and retry." -ForegroundColor Red
    exit 1
}

# 2. Check & Prepare Environment Files
Write-Host "[2/4] Ensuring environment configuration files..." -ForegroundColor Yellow

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
Write-Host "[3/4] Launching lightweight backing stack (PostgreSQL + Redis + IPFS)..." -ForegroundColor Yellow
docker compose -f docker-compose.dev.yml up -d

# 4. Wait for PostgreSQL readiness
Write-Host "[4/4] Verifying PostgreSQL readiness..." -ForegroundColor Yellow
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
    Write-Host "  --> PostgreSQL database 'cecbs' is ready and accepting connections." -ForegroundColor Green
} else {
    Write-Host "  --> PostgreSQL container started (initialization continuing in background)." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "                  FAST DEV STACK IS ACTIVE                       " -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  Database:     localhost:5432  (DB: cecbs, User: cecbs)" -ForegroundColor White
Write-Host "  Redis Cache:  localhost:6379" -ForegroundColor White
Write-Host "  IPFS API:     localhost:5001  (Gateway: http://localhost:8080/ipfs)" -ForegroundColor White
Write-Host "  Blockchain:   SIMULATED (Built-in Simulated Ledger Engine Active)" -ForegroundColor Cyan
Write-Host ""
Write-Host "To start the application servers:" -ForegroundColor Yellow
Write-Host "  Terminal 1 (Backend API):" -ForegroundColor White
Write-Host "    cd api; npm install; npm run dev" -ForegroundColor Cyan
Write-Host "  Terminal 2 (Frontend UI):" -ForegroundColor White
Write-Host "    cd ui; npm install; npm run dev" -ForegroundColor Cyan
Write-Host ""
Write-Host "Access Portals at: http://localhost:3000" -ForegroundColor Green
Write-Host "API Gateway at:    http://localhost:3001/api-docs" -ForegroundColor Green
Write-Host "To stop services:  .\stop-dev.ps1" -ForegroundColor Gray
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""
