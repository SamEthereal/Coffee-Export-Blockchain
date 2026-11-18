#!/bin/bash
docker exec cecbs-postgres psql -U cecbs -d cecbs -t -A -F"," -c "SELECT lc_id, status FROM letters_of_credit WHERE lc_id = 'LC-CONTRACT1794809015706';"
