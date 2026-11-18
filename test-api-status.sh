#!/bin/bash
echo "=== Database Status ==="
docker exec cecbs-postgres psql -U cecbs -d cecbs -t -c "SELECT lc_id, status FROM letters_of_credit WHERE lc_id = 'LC-CONTRACT1794809015706';"

echo ""
echo "=== API Endpoint Status ==="
curl -s http://localhost:3001/api/v1/banking/letters-of-credit/LC-CONTRACT1794809015706 | jq -r '.data.status // "ERROR: " + .message'

echo ""
echo "=== All LCs from API (Banks endpoint) ==="
curl -s http://localhost:3001/api/v1/banking/letters-of-credit | jq -r '.data[] | select(.lc_id == "LC-CONTRACT1794809015706") | {lc_id, status}'
