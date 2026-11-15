#!/bin/bash

# Quick verification script to check peer configuration

echo "🔍 Verifying Peer Configuration"
echo ""

# Check if config files exist on host
echo "📁 Host Configuration:"
if [ -f blockchain/peer-config/core.yaml ]; then
    echo "  ✅ blockchain/peer-config/core.yaml exists"
    if grep -q "externalBuilders:" blockchain/peer-config/core.yaml; then
        echo "  ✅ core.yaml contains externalBuilders"
    else
        echo "  ❌ core.yaml missing externalBuilders"
    fi
else
    echo "  ❌ blockchain/peer-config/core.yaml NOT FOUND"
fi

if [ -d builders/ccaas/bin ]; then
    echo "  ✅ builders/ccaas/bin/ directory exists"
    for script in detect build release; do
        if [ -x builders/ccaas/bin/$script ]; then
            echo "  ✅ builders/ccaas/bin/$script is executable"
        else
            echo "  ❌ builders/ccaas/bin/$script NOT executable"
        fi
    done
else
    echo "  ❌ builders/ccaas/bin/ NOT FOUND"
fi

echo ""
echo "🐳 Container Configuration (ECTA Peer):"

# Check inside ECTA container
if docker ps --format '{{.Names}}' | grep -q "peer0.ecta.cecbs.et"; then
    echo "  Container Status: Running"
    
    # Check core.yaml
    if docker exec peer0.ecta.cecbs.et test -f /etc/hyperledger/fabric/core.yaml 2>/dev/null; then
        echo "  ✅ /etc/hyperledger/fabric/core.yaml exists in container"
        
        if docker exec peer0.ecta.cecbs.et grep -q "externalBuilders:" /etc/hyperledger/fabric/core.yaml 2>/dev/null; then
            echo "  ✅ core.yaml contains externalBuilders configuration"
        else
            echo "  ❌ core.yaml missing externalBuilders"
        fi
    else
        echo "  ❌ /etc/hyperledger/fabric/core.yaml NOT FOUND in container"
    fi
    
    # Check builders
    if docker exec peer0.ecta.cecbs.et test -d /builders/ccaas/bin 2>/dev/null; then
        echo "  ✅ /builders/ccaas/bin/ directory exists in container"
        
        for script in detect build release; do
            if docker exec peer0.ecta.cecbs.et test -x /builders/ccaas/bin/$script 2>/dev/null; then
                echo "  ✅ /builders/ccaas/bin/$script is executable in container"
            else
                echo "  ❌ /builders/ccaas/bin/$script NOT executable in container"
            fi
        done
    else
        echo "  ❌ /builders/ccaas/bin/ NOT FOUND in container"
    fi
    
    # Check environment variables
    echo ""
    echo "  Environment Variables:"
    docker exec peer0.ecta.cecbs.et printenv | grep -E "FABRIC_CFG_PATH|EXTERNAL.*BUILDER" | sed 's/^/    /'
    
else
    echo "  ❌ Container NOT RUNNING"
fi

echo ""
echo "🎯 Summary:"
if [ -f blockchain/peer-config/core.yaml ] && [ -d builders/ccaas/bin ] && \
   docker exec peer0.ecta.cecbs.et test -f /etc/hyperledger/fabric/core.yaml 2>/dev/null && \
   docker exec peer0.ecta.cecbs.et test -x /builders/ccaas/bin/detect 2>/dev/null; then
    echo "  ✅ All configuration is properly set up!"
    echo "  ✅ Chaincode installation should work"
else
    echo "  ❌ Configuration is incomplete"
    echo "  ⚠️  Run: ./start-all.sh to fix configuration and restart peers"
fi

echo ""
