#!/bin/bash
# diagnose-chaincode.sh — host-side chaincode diagnostics (F8).
# Prints, with NO hardcoded versions: the committed definition, the
# package ID installed on every peer, the ID the coffee-chaincode server
# registered under, DNS + TCP reachability of the server from a peer, the
# server log tail, and peer log lines mentioning the committed package ID
# or connection errors. Run on the Docker host after pulling:
#   ./diagnose-chaincode.sh
# Modes: on the Docker host (peer containers present) all sections run.
# On the native stack (~/fabric-native/peers present, no docker peers)
# the docker-only sections 0-8 are skipped and section 9 runs against
# the local installed builds + the local server process/env/log.
# Test mode (proves section 9 catches a planted stale address without
# touching any live peer):
#   ./diagnose-chaincode.sh --test-installed <build-dir>
# where <build-dir> holds release/chaincode/server/connection.json (or
# bld/connection.json — the pre-launch copy; section 9 reads bld/ when
# release/ does not exist yet, see the bld/ fallback below).
# It runs ONLY section 9 against that scratch copy and exits 1 when the
# check fails, 0 when it passes.
# The failure this diagnoses is a STALE server, not a Fabric bug: if the
# installed package ID and the server env ID differ, the peer waits ~20 s
# on a server that will never answer for the committed definition. The
# same Fabric 2.5.16 peers + this exact chaincode code serve queries live
# on the native stack, so a 20 s hang here is a host-environment failure
# (stale container/image, wrong package-ID wiring, or a server that is
# not listening on 9999 despite looking "Up"). Section 9 adds the second
# stale-state failure (TLS-mismatch round, 2026-11-19): the peer dials
# the address in the INSTALLED package's connection.json, so a stale
# bridge IP (172.18.0.17:9999) or a tls_required that disagrees with the
# server's TLS state fails registration at TCP connect / handshake —
# before any TLS question arises on the server side.
# Every section is best-effort: a failing section prints its error and
# the script continues with the rest. Section 9 is the exception: it
# sets the exit code — 1 when it prints FAIL, 0 when it passes.

# --- Mode detection (section 9 runs in docker, native and test modes) ---
DIAG_MODE="docker"
DIAG_TEST_DIR=""
if [ "${1:-}" = "--test-installed" ]; then
    DIAG_MODE="test"
    DIAG_TEST_DIR="${2:-}"
    if [ -z "$DIAG_TEST_DIR" ] || { [ ! -f "$DIAG_TEST_DIR/release/chaincode/server/connection.json" ] && [ ! -f "$DIAG_TEST_DIR/bld/connection.json" ]; }; then
        echo "Usage: $0 --test-installed <build-dir>"
        echo "  <build-dir> must contain release/chaincode/server/connection.json"
        echo "  or bld/connection.json (a scratch copy of an installed build,"
        echo "  e.g. a planted stale address)."
        exit 2
    fi
elif ! docker ps --filter "name=^peer0.ecta.cecbs.et$" --format "{{.Names}}" 2>/dev/null | grep -q "peer0.ecta"; then
    if [ -d "$HOME/fabric-native/peers/ecta/externalbuilder/builds" ]; then
        DIAG_MODE="native"
    fi
fi
# Repo root (needed by section 9 in every mode for the packaged connection.json).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "$DIAG_MODE" = "docker" ]; then

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
echo "=== 3. Server package ID (container env) vs expected ID ==="
SERVER_ID=$(docker inspect coffee-chaincode --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep '^CORE_CHAINCODE_ID_NAME=' | cut -d= -f2-)
[ -z "$SERVER_ID" ] && SERVER_ID=$(docker exec coffee-chaincode printenv CORE_CHAINCODE_ID_NAME 2>/dev/null || echo "unknown")
echo "Server CORE_CHAINCODE_ID_NAME: ${SERVER_ID}"
# Expected package ID: recompute it from the package tar the deploy built
# (newest coffee_*.tar.gz in chaincodes/coffee). Do NOT grep queryinstalled
# by the lifecycle Version (2.3): the package label is coffee_2.13, so that
# grep matches nothing; and several same-label packages stay installed, so
# picking one from that list is a guess. calculatepackageid on the tar is
# exact. If the tar is absent the comparison is skipped.
# (SCRIPT_DIR is defined once at the top of this script, for all modes.)
EXPECTED_ID=""
PKG_TAR=$(ls -t "$SCRIPT_DIR/chaincodes/coffee"/coffee_*.tar.gz 2>/dev/null | head -1)
if [ -n "$PKG_TAR" ] && docker cp "$PKG_TAR" peer0.ecta.cecbs.et:/tmp/diag-package.tar.gz 2>/dev/null; then
    EXPECTED_ID=$(docker exec peer0.ecta.cecbs.et peer lifecycle chaincode calculatepackageid /tmp/diag-package.tar.gz 2>/dev/null | grep -oP 'coffee_[^ ]+' | head -1)
fi
echo "Expected ID for the committed definition (from ${PKG_TAR:-no package tar found}): ${EXPECTED_ID:-unknown}"
if [ -n "$EXPECTED_ID" ] && [ -n "$SERVER_ID" ] && [ "$SERVER_ID" != "unknown" ]; then
    if [ "$EXPECTED_ID" = "$SERVER_ID" ]; then
        echo "MATCH: server registered under the committed package ID."
    else
        echo "MISMATCH: server registered under $SERVER_ID but the committed package is $EXPECTED_ID."
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
    # The expected package ID is a variable, never hardcoded: grep for it
    # (same value as the server env when healthy).
    docker logs "$peer_name" 2>&1 | grep -iE "${EXPECTED_ID:-NO_EXPECTED_ID}|could not launch chaincode|connection refused|REQUEST TIMEOUT|error in simulation" | tail -5 || echo "(no matching log lines)"
done

echo ""
echo "=== 8. API chaincode query errors (cecbs-api, if running) ==="
docker logs cecbs-api 2>&1 | grep -i "timeout\|chaincode.*error" | tail -5 || echo "(no cecbs-api logs, or no matches)"
else
    echo "(mode: $DIAG_MODE — docker-only sections 0-8 skipped; section 9 below covers the installed package + server TLS state + reachability)"
fi

echo ""
echo "=== 9. Installed connection.json vs server TLS state (TLS-mismatch trap, 2026-11-19) ==="
echo "The peer dials the address in the INSTALLED package's connection.json —"
echo "not the repo file — and dials TLS iff tls_required is true (default"
echo "true when the field is absent). Both sides are plaintext in the"
echo "checked-in config (server CHAINCODE_TLS_DISABLED=true, connection.json"
echo "tls_required:false); a live failure here means installed state drifted"
echo "from the repo. FAIL means: (a) installed address is a bare IP, (b) the"
echo "installed tls_required disagrees with the server's TLS state, or (c) the"
echo "installed address does not resolve / is not TCP-reachable from a peer."
DIAG_FAIL=0
NATIVE_ROOT="$HOME/fabric-native"

# --- Locate the installed connection.json for the committed package ---
if [ "$DIAG_MODE" = "test" ]; then
    INSTALLED_CONN_PATH="$DIAG_TEST_DIR/release/chaincode/server/connection.json"
    echo "Test mode: installed copy under test at $INSTALLED_CONN_PATH"
elif [ "$DIAG_MODE" = "native" ]; then
    LIVE_PKG_ID=$(cat "$NATIVE_ROOT/chaincode/package-id.txt" 2>/dev/null || echo "")
    LIVE_LABEL="${LIVE_PKG_ID%%:*}"
    LIVE_HASH="${LIVE_PKG_ID##*:}"
    INSTALLED_CONN_PATH="$NATIVE_ROOT/peers/ecta/externalbuilder/builds/${LIVE_LABEL}-${LIVE_HASH}/release/chaincode/server/connection.json"
    if [ ! -f "$INSTALLED_CONN_PATH" ]; then
        echo "(no installed copy for ${LIVE_PKG_ID:-unknown} under ecta builds — falling back to the newest build dir)"
        INSTALLED_CONN_PATH=$(ls -dt "$NATIVE_ROOT"/peers/ecta/externalbuilder/builds/*/release/chaincode/server/connection.json 2>/dev/null | head -1)
    fi
    echo "Native mode: installed copy at ${INSTALLED_CONN_PATH:-(not found)}"
else
    # Docker: the build dir for the expected (committed) package ID, if
    # section 3 computed one; otherwise the newest installed build.
    if [ -n "${EXPECTED_ID:-}" ]; then
        D_LABEL="${EXPECTED_ID%%:*}"
        D_HASH="${EXPECTED_ID##*:}"
        D_BUILD_DIR="/var/hyperledger/production/externalbuilder/builds/${D_LABEL}-${D_HASH}"
        INSTALLED_CONN_PATH="$D_BUILD_DIR/release/chaincode/server/connection.json"
        echo "Docker mode: installed copy for expected package $EXPECTED_ID"
        if ! docker exec peer0.ecta.cecbs.et test -f "$INSTALLED_CONN_PATH" 2>/dev/null; then
            echo "(expected build dir not present on the peer — reading the newest installed build instead)"
            INSTALLED_CONN_PATH=$(docker exec peer0.ecta.cecbs.et sh -c 'ls -dt /var/hyperledger/production/externalbuilder/builds/*/release/chaincode/server/connection.json 2>/dev/null | head -1' 2>/dev/null || echo "")
        fi
    else
        INSTALLED_CONN_PATH=$(docker exec peer0.ecta.cecbs.et sh -c 'ls -dt /var/hyperledger/production/externalbuilder/builds/*/release/chaincode/server/connection.json 2>/dev/null | head -1' 2>/dev/null || echo "")
    fi
    echo "Docker mode: installed copy at ${INSTALLED_CONN_PATH:- (not found)}"
fi

# --- bld/ fallback (2026-11-20): release/ only exists AFTER the first ---
# --- launch of the installed package; bld/ exists right after install. ---
# The peer dials the bld/ copy until release/ exists, so when the
# resolved release/ path is absent, read bld/ instead of failing — and
# record which path was read so the output says so.
DIAG_CONN_SOURCE="release"
diag_conn_exists() {
    if [ "$DIAG_MODE" = "docker" ]; then
        docker exec peer0.ecta.cecbs.et test -f "$1" 2>/dev/null
    else
        [ -f "$1" ]
    fi
}
if [ -n "${INSTALLED_CONN_PATH:-}" ] && ! diag_conn_exists "$INSTALLED_CONN_PATH"; then
    BLD_CANDIDATE="${INSTALLED_CONN_PATH%/release/chaincode/server/connection.json}/bld/connection.json"
    if [ "$BLD_CANDIDATE" != "$INSTALLED_CONN_PATH" ] && diag_conn_exists "$BLD_CANDIDATE"; then
        echo "(release/ copy not present yet — reading the bld/ copy instead: bld/ exists right after install, release/ only after first launch)"
        INSTALLED_CONN_PATH="$BLD_CANDIDATE"
        DIAG_CONN_SOURCE="bld"
    fi
elif [ -z "${INSTALLED_CONN_PATH:-}" ]; then
    if [ "$DIAG_MODE" = "test" ]; then
        BLD_NEWEST="$DIAG_TEST_DIR/bld/connection.json"
    elif [ "$DIAG_MODE" = "docker" ]; then
        BLD_NEWEST=$(docker exec peer0.ecta.cecbs.et sh -c 'ls -dt /var/hyperledger/production/externalbuilder/builds/*/bld/connection.json 2>/dev/null | head -1' 2>/dev/null || echo "")
    else
        BLD_NEWEST=$(ls -dt "$NATIVE_ROOT"/peers/ecta/externalbuilder/builds/*/bld/connection.json 2>/dev/null | head -1 || echo "")
    fi
    if [ -n "${BLD_NEWEST:-}" ] && diag_conn_exists "$BLD_NEWEST"; then
        echo "(no release/ copy found — reading the newest bld/ copy instead)"
        INSTALLED_CONN_PATH="$BLD_NEWEST"
        DIAG_CONN_SOURCE="bld"
    fi
fi

# --- Read the installed copy (mode-aware) ---
if [ -n "${INSTALLED_CONN_PATH:-}" ]; then
    if [ "$DIAG_MODE" = "docker" ]; then
        INSTALLED_CONN=$(docker exec peer0.ecta.cecbs.et cat "$INSTALLED_CONN_PATH" 2>/dev/null || echo "")
    else
        INSTALLED_CONN=$(cat "$INSTALLED_CONN_PATH" 2>/dev/null || echo "")
    fi
fi
# If the chosen copy could not be read (raced with a launch, or the
# file vanished), try the other copy once before failing.
if [ -z "${INSTALLED_CONN:-}" ] && [ -n "${INSTALLED_CONN_PATH:-}" ]; then
    if [ "$DIAG_CONN_SOURCE" = "release" ]; then
        ALT_CONN_PATH="${INSTALLED_CONN_PATH%/release/chaincode/server/connection.json}/bld/connection.json"
        ALT_SOURCE="bld"
    else
        ALT_CONN_PATH="${INSTALLED_CONN_PATH%/bld/connection.json}/release/chaincode/server/connection.json"
        ALT_SOURCE="release"
    fi
    if [ "$ALT_CONN_PATH" != "$INSTALLED_CONN_PATH" ]; then
        echo "(could not read ${INSTALLED_CONN_PATH} — trying the other copy: ${ALT_CONN_PATH})"
        if [ "$DIAG_MODE" = "docker" ]; then
            INSTALLED_CONN=$(docker exec peer0.ecta.cecbs.et cat "$ALT_CONN_PATH" 2>/dev/null || echo "")
        else
            INSTALLED_CONN=$(cat "$ALT_CONN_PATH" 2>/dev/null || echo "")
        fi
        if [ -n "$INSTALLED_CONN" ]; then
            INSTALLED_CONN_PATH="$ALT_CONN_PATH"
            DIAG_CONN_SOURCE="$ALT_SOURCE"
        fi
    fi
fi
echo "Installed connection.json read from: ${INSTALLED_CONN_PATH:- (not found)} (source: ${DIAG_CONN_SOURCE})"
if [ -z "${INSTALLED_CONN:-}" ]; then
    echo "FAIL: could not read the installed connection.json (${INSTALLED_CONN_PATH:-no path resolved})"
    echo "  Without it the peer's dial address is unknown — check the peer's externalbuilder builds dir."
    DIAG_FAIL=1
    INSTALLED_CONN="{}"
fi
INST_ADDR=$(echo "$INSTALLED_CONN" | grep -oP '"address":\s*"\K[^"]+' | head -1 || echo "")
INST_HOST="${INST_ADDR%%:*}"
INST_PORT="${INST_ADDR##*:}"
INST_TLS=$(echo "$INSTALLED_CONN" | grep -oP '"tls_required":\s*\K(true|false)' | head -1 || echo "")
INST_DIAL=$(echo "$INSTALLED_CONN" | grep -oP '"dial_timeout":\s*"\K[^"]+' | head -1 || echo "")
[ -z "$INST_TLS" ] && INST_TLS="absent (Fabric default: true)"
echo "Installed connection.json: address=${INST_ADDR:-unknown} dial_timeout=${INST_DIAL:-unknown} tls_required=${INST_TLS}"
REPO_CONN_ADDR=$(grep -oP '"address":\s*"\K[^"]+' "$SCRIPT_DIR/chaincodes/coffee/connection.json" 2>/dev/null || echo "unknown")
echo "Repo packaged connection.json (chaincodes/coffee/connection.json): address=${REPO_CONN_ADDR}"
if [ -n "$INST_ADDR" ] && [ "$INST_ADDR" != "$REPO_CONN_ADDR" ]; then
    echo "WARNING: installed address (${INST_ADDR}) differs from the repo file (${REPO_CONN_ADDR}) — the installed package predates the repo fix."
    echo "  Fix: rebuild + reinstall + re-approve + commit (./deploy-chaincode.sh; its change hash now covers connection.json)."
fi

# --- Server TLS state (mode-aware): env + the server's own log line ---
SERVER_TLS_DISABLED="unknown"
SERVER_TLS_LOG="(no TLS log line found)"
if [ "$DIAG_MODE" = "docker" ]; then
    SERVER_TLS_DISABLED=$(docker inspect coffee-chaincode --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep '^CHAINCODE_TLS_DISABLED=' | cut -d= -f2- || echo "unknown")
    [ -z "$SERVER_TLS_DISABLED" ] && SERVER_TLS_DISABLED=$(docker exec coffee-chaincode printenv CHAINCODE_TLS_DISABLED 2>/dev/null || echo "unknown")
    SERVER_TLS_LOG=$(docker logs --tail 200 coffee-chaincode 2>&1 | grep -iE "TLS disabled|TLS enabled|TLS certificate not found|TLS key not found" | tail -1 || echo "(no TLS log line found)")
else
    CC_PID=$(pgrep -x coffee 2>/dev/null | head -1 || echo "")
    if [ -n "$CC_PID" ]; then
        SERVER_TLS_DISABLED=$(tr '\0' '\n' < "/proc/$CC_PID/environ" 2>/dev/null | grep '^CHAINCODE_TLS_DISABLED=' | cut -d= -f2- || echo "unknown")
    fi
    [ -z "$SERVER_TLS_DISABLED" ] && SERVER_TLS_DISABLED="unknown"
    SERVER_TLS_LOG=$(grep -iE "TLS disabled|TLS enabled|TLS certificate not found|TLS key not found" "$NATIVE_ROOT/logs/chaincode.log" 2>/dev/null | tail -1 || echo "(no TLS log line found)")
fi
echo "Server TLS state: CHAINCODE_TLS_DISABLED=${SERVER_TLS_DISABLED} (log: ${SERVER_TLS_LOG})"
if [ "$SERVER_TLS_DISABLED" = "true" ]; then
    SERVER_PLAINTEXT=1
    echo "Server is PLAINTEXT (CHAINCODE_TLS_DISABLED=true)."
elif [ "$SERVER_TLS_DISABLED" = "false" ]; then
    SERVER_PLAINTEXT=0
    echo "Server TLS is NOT disabled by env — check cert files / the log line above."
else
    # Env unknown: fall back to the log line (missing certs also mean plaintext, main.go:3309-3316).
    if echo "$SERVER_TLS_LOG" | grep -qi "TLS enabled"; then
        SERVER_PLAINTEXT=0
        echo "Server appears TLS-ENABLED (log line above)."
    else
        SERVER_PLAINTEXT=1
        echo "Server env unknown; log shows no TLS-enabled line — treating the server as PLAINTEXT (missing-cert fallback)."
    fi
fi

# --- (a) installed address is a bare IP instead of the coffee-chaincode DNS name ---
if [[ "$INST_HOST" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "FAIL (a): installed connection.json address is a bare IP (${INST_ADDR}) — a stale Docker-bridge IP."
    echo "  The peer dials this IP from the installed package; bridge IPs change on every container recreate, so registration fails at TCP connect (before any TLS question arises) — this is what the photo misread as a TLS mismatch."
    echo "  Fix: rebuild + reinstall + re-approve + commit from chaincodes/coffee/connection.json (address coffee-chaincode:9999); ./deploy-chaincode.sh now detects the connection.json change, so deleting chaincodes/coffee/.last_deployed is no longer needed."
    DIAG_FAIL=1
elif [ -z "$INST_HOST" ]; then
    echo "FAIL (a): installed connection.json has no usable address (parsed: '${INST_ADDR}')."
    DIAG_FAIL=1
fi

# --- (b) installed tls_required disagrees with the server's TLS state ---
# Fabric default: tls_required absent == true.
case "$INST_TLS" in
    true|"absent (Fabric default: true)")
        INST_WANTS_TLS=1 ;;
    false)
        INST_WANTS_TLS=0 ;;
    *)
        INST_WANTS_TLS=1 ;;
esac
if [ "$INST_WANTS_TLS" -eq 1 ] && [ "$SERVER_PLAINTEXT" -eq 1 ]; then
    echo "FAIL (b): TLS MISMATCH — installed tls_required=${INST_TLS} (peer will TLS-dial) but the server is PLAINTEXT."
    echo "  Peer log signature: 'tls: first record does not look like a TLS handshake'."
    echo "  Fix: rebuild + reinstall + re-approve + commit a package whose connection.json says tls_required:false (chaincodes/coffee/connection.json already does)."
    DIAG_FAIL=1
elif [ "$INST_WANTS_TLS" -eq 0 ] && [ "$SERVER_PLAINTEXT" -eq 0 ]; then
    echo "FAIL (b): TLS MISMATCH (reversed) — installed tls_required=false (peer will dial plaintext) but the server is TLS-ENABLED."
    echo "  Fix: either rebuild a package with tls_required:true + the server root cert, or run the server plaintext (CHAINCODE_TLS_DISABLED=true)."
    DIAG_FAIL=1
else
    echo "TLS agreement: installed tls_required=${INST_TLS} vs server plaintext=${SERVER_PLAINTEXT} — consistent."
fi

# --- (c) the installed address resolves and is TCP-reachable from a peer ---
if [ -n "$INST_HOST" ] && [[ ! "$INST_HOST" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    if [ "$DIAG_MODE" = "docker" ]; then
        DNS_OUT=$(docker exec peer0.ecta.cecbs.et getent hosts "$INST_HOST" 2>&1); DNS_RC=$?
        if [ $DNS_RC -eq 0 ]; then
            echo "DNS: ${INST_HOST} resolves from peer0.ecta: ${DNS_OUT}"
            if docker exec peer0.ecta.cecbs.et sh -c "echo > /dev/tcp/${INST_HOST}/${INST_PORT}" 2>/dev/null; then
                echo "TCP: ${INST_ADDR} reachable from peer0.ecta."
            else
                echo "FAIL (c): ${INST_ADDR} resolves from the peer but is NOT TCP-reachable — the server is not listening at the dialled address."
                DIAG_FAIL=1
            fi
        elif [ $DNS_RC -eq 126 ] || [ $DNS_RC -eq 127 ]; then
            echo "(cannot run getent in the peer container — DNS check skipped)"
        else
            echo "FAIL (c): ${INST_HOST} does not resolve from peer0.ecta (rc=${DNS_RC}): ${DNS_OUT}"
            echo "  The peer cannot dial an unresolvable address; registration fails at TCP connect."
            DIAG_FAIL=1
        fi
    else
        # Native/test: peers are local processes; resolution via /etc/hosts.
        DNS_OUT=$(getent hosts "$INST_HOST" 2>&1); DNS_RC=$?
        if [ $DNS_RC -eq 0 ]; then
            echo "DNS: ${INST_HOST} resolves: ${DNS_OUT}"
            if (echo > /dev/tcp/"${INST_HOST}"/"${INST_PORT}") 2>/dev/null; then
                echo "TCP: ${INST_ADDR} reachable."
            else
                echo "FAIL (c): ${INST_ADDR} resolves but is NOT TCP-reachable — the server is not listening at the dialled address."
                DIAG_FAIL=1
            fi
        else
            echo "FAIL (c): ${INST_HOST} does not resolve (rc=${DNS_RC}): ${DNS_OUT}"
            DIAG_FAIL=1
        fi
    fi
fi

echo ""
echo "=== done ==="
if [ "$DIAG_FAIL" -ne 0 ]; then
    echo "=== RESULT: FAIL — section 9 found a stale/mismatched installed connection.json (see FAIL lines above) ==="
    echo "Fix: rebuild + reinstall + re-approve + commit from chaincodes/coffee/connection.json."
    echo "  ./deploy-chaincode.sh (or ./start-all.sh Phase 5) — its change hash now covers connection.json, so deleting"
    echo "  chaincodes/coffee/.last_deployed is no longer needed. Then re-run this script."
    exit 1
fi
echo "=== RESULT: PASS — installed connection.json, server TLS state and reachability agree ==="
exit 0
