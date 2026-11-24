<#
.SYNOPSIS
  Stops the Fast Local Development Backing Stack (CECBS)
#>

Write-Host "Stopping CECBS Fast Dev Backing Stack..." -ForegroundColor Yellow
docker compose -f docker-compose.dev.yml down
Write-Host "All development containers stopped cleanly." -ForegroundColor Green
