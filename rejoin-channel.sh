#!/bin/bash
# Quick script to rejoin all peers to the channel after restart

echo "Rejoining peers to coffeechannel..."

cd /home/guda/GoCBC/blockchain

# Join each peer to the channel
for peer in ecta ecx banks nbe customs shipping; do
    echo "Joining peer0.${peer} to channel..."
    docker exec -e CORE_PEER_LOCALMSPID="${peer^^}MSP" \
                -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/msp \
                peer0.${peer}.cecbs.et \
                peer channel join -b /etc/hyperledger/fabric/channel-artifacts/coffeechannel.block 2>&1 | grep -E "success|already|Error"
done

echo "Done! Restarting API to reconnect..."
docker restart cecbs-api

echo "✅ All peers rejoined to channel"
