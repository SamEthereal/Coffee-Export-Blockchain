<#
.SYNOPSIS
  Stops the Fast Local Development Environment (CECBS)
#>

Write-Host ""
Write-Host "Stopping CECBS Fast Dev Environment..." -ForegroundColor Yellow

# 1. Stop Node.js processes on ports 3000 and 3001
$ports = @(3000, 3001)
foreach ($port in $ports) {
    try {
        $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        if ($conn) {
            $pids = $conn | Select-Object -ExpandProperty OwningProcess -Unique
            foreach ($p in $pids) {
                Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
                Write-Host "  --> Stopped server process on port $port (PID: $p)" -ForegroundColor Gray
            }
        }
    } catch {}
}

# 2. Stop Docker backing containers
docker compose -f docker-compose.dev.yml down
Write-Host "All development containers and services stopped cleanly." -ForegroundColor Green
Write-Host ""
