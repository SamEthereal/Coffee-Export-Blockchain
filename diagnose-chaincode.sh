#!/bin/bash
# diagnose-chaincode.sh — host-side chaincode diagnostics (F8).
# Prints, with NO hardcoded versions: the committed definition, the
# package ID installed on every peer, the ID the coffee-chaincode server
# registered under, DNS + TCP reachability of the server from a peer, the
# server log tail, and peer log lines mentioning the committed package ID
# or connection errors. Run on the Docker host after pulling:
#   ./diagnose-chaincode.sh
# The failure this diagnoses is a STALE server, not a Fabric bug: if the
# installed package ID and the server env ID differ, the peer waits ~20 s
# on a server that will never answer for the committed definition. The
# same Fabric 2.5.16 peers + this exact chaincode code serve queries live
# on the native stack, so a 20 s hang here is a host-environment failure
# (stale container/image, wrong package-ID wiring, or a server that is
# not listening on 9999 despite looking "Up").
# Every section is best-effort: a failing section prints its error and
# the script continues with the rest.

echo "=== 0. Chaincode server container ==="
docker ps --filter "name=coffee-chaincode" --format "table {{.Names}}\t{{.Status}}\t{{.Image}}" 2>&1 || echo "(docker ps failed)"

echo ""
echo "=== 1. Committed definition (coffeechannel) ==="
COMMITTED=$(docker exec peer0.ecta.cecbs.et peer lifecycle chaincode querycommitted --channelID coffeechannel --name coffee 2>&1 || echo "QUERYCOMMITTED FAILED")
echo "$COMMITTED"
COMMITTED_VERSION=$(echo "$COMMITTED" | grep -oP 'Version: \K[0-9.]+' | head -1)
COMMITTED_SEQUENCE=$(echo "$COMMITTED" | grep -oP 'Sequence: \K[0-9]+' | head -1)
echo "Committed: version=${COMMITTED_VERSION:-unknown} sequence=${COMMITTED_SEQUENCE:-unknown}"

echo ""
echo "=== 2. Installed package IDs per peer (queryinstalled) ==="
for peer_info in "peer0.ecta.cecbs.et:ECTAMSP:ecta.cecbs.et" \
                 "peer0.ecx.cecbs.et:ECXMSP:ecx.cecbs.et" \
                 "peer0.banks.cecbs.et:BanksMSP:banks.cecbs.et" \
                 "peer0.nbe.cecbs.et:NBEMSP:nbe.cecbs.et" \
                 "peer0.customs.cecbs.et:CustomsMSP:customs.cecbs.et" \
                 "peer0.shipping.cecbs.et:ShippingMSP:shipping.cecbs.et"; do
    IFS=':' read -r peer_name msp_id org_domain <<< "$peer_info"
    echo "--- $peer_name ---"
    docker exec \
        -e CORE_PEER_LOCALMSPID="$msp_id" \
        -e CORE_PEER_MSPCONFIGPATH="/etc/hyperledger/fabric/users/Admin@$org_domain/msp" \
        "$peer_name" peer lifecycle chaincode queryinstalled 2>&1 | grep -E "Package ID" || echo "(no installed packages listed, or queryinstalled failed)"
done

echo ""
echo "=== 3. Server package ID (container env) vs installed ID ==="
SERVER_ID=$(docker inspect coffee-chaincode --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep '^CORE_CHAINCODE_ID_NAME=' | cut -d= -f2-)
[ -z "$SERVER_ID" ] && SERVER_ID=$(docker exec coffee-chaincode printenv CORE_CHAINCODE_ID_NAME 2>/dev/null || echo "unknown")
echo "Server CORE_CHAINCODE_ID_NAME: ${SERVER_ID}"
INSTALLED_ID=$(docker exec \
    -e CORE_PEER_LOCALMSPID=ECTAMSP \
    -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/users/Admin@ecta.cecbs.et/msp \
    peer0.ecta.cecbs.et peer lifecycle chaincode queryinstalled 2>/dev/null | grep "coffee_${COMMITTED_VERSION}" | awk '{print $3}' | sed 's/,//' | head -1)
echo "Installed ID for committed version coffee_${COMMITTED_VERSION:-?} (ECTA peer): ${INSTALLED_ID:-unknown}"
if [ -n "$INSTALLED_ID" ] && [ -n "$SERVER_ID" ] && [ "$SERVER_ID" != "unknown" ]; then
    if [ "$INSTALLED_ID" = "$SERVER_ID" ]; then
        echo "MATCH: server registered under the installed package ID."
    else
        echo "MISMATCH: server registered under $SERVER_ID but the peer has $INSTALLED_ID installed."
        echo "  This is the stale-server failure: rebuild with --no-cache and recreate with --force-recreate (deploy-chaincode.sh does both), then re-run this script."
    fi
else
    echo "(could not compare IDs — see the outputs above)"
fi

echo ""
echo "=== 4. DNS: coffee-chaincode from peer0.ecta ==="
docker exec peer0.ecta.cecbs.et getent hosts coffee-chaincode 2>&1 || echo "DNS resolution FAILED (or getent unavailable in the peer image)"

echo ""
echo "=== 5. TCP probe: coffee-chaincode:9999 from peer0.ecta (3 attempts) ==="
for i in 1 2 3; do
    if docker exec peer0.ecta.cecbs.et sh -c 'echo > /dev/tcp/coffee-chaincode/9999' 2>/dev/null; then
        echo "attempt $i: CONNECTED (coffee-chaincode:9999 reachable from peer)"
        break
    else
        echo "attempt $i: FAILED (rc=$?) — server not accepting connections from the peer"
        [ $i -lt 3 ] && sleep 5
    fi
done

echo ""
echo "=== 6. Chaincode server logs (last 50 lines) ==="
docker logs --tail 50 coffee-chaincode 2>&1 || echo "(docker logs failed)"

echo ""
echo "=== 7. Peer logs: committed package ID / connection errors ==="
for peer_name in peer0.ecta.cecbs.et peer0.ecx.cecbs.et peer0.banks.cecbs.et peer0.nbe.cecbs.et peer0.customs.cecbs.et peer0.shipping.cecbs.et; do
    echo "--- $peer_name ---"
    # The committed package ID is a variable, never hardcoded: grep for the
    # installed ID (same value as the server env when healthy).
    docker logs "$peer_name" 2>&1 | grep -iE "${INSTALLED_ID:-NO_INSTALLED_ID}|could not launch chaincode|connection refused|REQUEST TIMEOUT|error in simulation" | tail -5 || echo "(no matching log lines)"
done

echo ""
echo "=== 8. API chaincode query errors (cecbs-api, if running) ==="
docker logs cecbs-api 2>&1 | grep -i "timeout\|chaincode.*error" | tail -5 || echo "(no cecbs-api logs, or no matches)"

echo ""
echo "=== done ==="
