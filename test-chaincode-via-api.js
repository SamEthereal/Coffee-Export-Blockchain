#!/usr/bin/env node

/**
 * Test Chaincode Query via Fabric Gateway SDK
 * This uses the same approach as the API to test if chaincode invocation works
 */

const { Gateway, Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');

async function main() {
    console.log('🔍 Testing Chaincode Query via Fabric Gateway SDK\n');

    try {
        // Paths
        const orgPath = '/home/guda/GoCBC/blockchain/organizations/peerOrganizations/ecta.cecbs.et';
        const certPath = path.join(orgPath, 'users', 'Admin@ecta.cecbs.et', 'msp', 'signcerts', 'Admin@ecta.cecbs.et-cert.pem');
        const keyDir = path.join(orgPath, 'users', 'Admin@ecta.cecbs.et', 'msp', 'keystore');
        const keyFiles = fs.readdirSync(keyDir);
        const keyPath = path.join(keyDir, keyFiles[0]);
        
        console.log('📂 Loading credentials...');
        console.log(`   Cert: ${certPath}`);
        console.log(`   Key: ${keyPath}\n`);
        
        // Create wallet
        const wallet = await Wallets.newInMemoryWallet();
        const cert = fs.readFileSync(certPath, 'utf8');
        const key = fs.readFileSync(keyPath, 'utf8');
        
        const identity = {
            credentials: {
                certificate: cert,
                privateKey: key,
            },
            mspId: 'ECTAMSP',
            type: 'X.509',
        };
        
        await wallet.put('admin', identity);
        console.log('✓ Wallet created with admin identity\n');
        
        // Connection profile
        const ccpPath = path.join(orgPath, 'connection-ecta.json');
        let ccp;
        
        if (fs.existsSync(ccpPath)) {
            console.log(`📄 Loading connection profile: ${ccpPath}`);
            ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
        } else {
            console.log('📄 Building connection profile (connection-ecta.json not found)');
            // Build minimal connection profile
            ccp = {
                name: 'cecbs-network',
                version: '1.0.0',
                client: {
                    organization: 'ECTA',
                },
                organizations: {
                    ECTA: {
                        mspid: 'ECTAMSP',
                        peers: ['peer0.ecta.cecbs.et'],
                    },
                },
                peers: {
                    'peer0.ecta.cecbs.et': {
                        url: 'grpcs://peer0.ecta.cecbs.et:7051',
                        tlsCACerts: {
                            pem: fs.readFileSync(path.join(orgPath, 'peers', 'peer0.ecta.cecbs.et', 'tls', 'ca.crt'), 'utf8'),
                        },
                        grpcOptions: {
                            'ssl-target-name-override': 'peer0.ecta.cecbs.et',
                            'hostnameOverride': 'peer0.ecta.cecbs.et',
                        },
                    },
                },
            };
        }
        
        console.log('✓ Connection profile ready\n');
        
        // Connect to gateway
        const gateway = new Gateway();
        console.log('🔌 Connecting to Fabric Gateway...');
        
        await gateway.connect(ccp, {
            wallet,
            identity: 'admin',
            discovery: { enabled: false, asLocalhost: false },
        });
        
        console.log('✓ Connected to Gateway\n');
        
        // Get network and contract
        console.log('📡 Getting network: coffeechannel');
        const network = await gateway.getNetwork('coffeechannel');
        console.log('✓ Network obtained\n');
        
        console.log('📜 Getting contract: coffee');
        const contract = network.getContract('coffee');
        console.log('✓ Contract obtained\n');
        
        // Query chaincode
        console.log('═══════════════════════════════════════');
        console.log('📤 Submitting Query: QueryAllLCs');
        console.log('═══════════════════════════════════════\n');
        console.log('⏱️  Waiting for response (timeout: 30s)...\n');
        
        const startTime = Date.now();
        
        try {
            const result = await contract.evaluateTransaction('QueryAllLCs');
            const duration = Date.now() - startTime;
            
            console.log('═══════════════════════════════════════');
            console.log(`✅ Query SUCCESSFUL! (${duration}ms)`);
            console.log('═══════════════════════════════════════\n');
            
            const resultString = result.toString('utf8');
            console.log('📊 Result:');
            console.log('─'.repeat(60));
            
            try {
                const parsed = JSON.parse(resultString);
                console.log(JSON.stringify(parsed, null, 2));
                console.log('─'.repeat(60));
                
                if (Array.isArray(parsed)) {
                    console.log(`\n📈 Found ${parsed.length} Letter(s) of Credit\n`);
                }
            } catch (e) {
                console.log(resultString);
                console.log('─'.repeat(60));
            }
            
            console.log('\n✅ SUCCESS: Chaincode is responding correctly!');
            console.log('   The chaincode works via Fabric Gateway SDK.');
            
        } catch (queryError) {
            const duration = Date.now() - startTime;
            console.log('═══════════════════════════════════════');
            console.log(`❌ Query FAILED (${duration}ms)`);
            console.log('═══════════════════════════════════════\n');
            console.log('Error details:');
            console.log(`   Message: ${queryError.message}`);
            if (queryError.stack) {
                console.log(`\n   Stack:\n${queryError.stack}`);
            }
            
            // Check if it's a timeout
            if (queryError.message && queryError.message.includes('timeout')) {
                console.log('\n⚠️  This is a TIMEOUT error');
                console.log('   The chaincode server is not responding to the Gateway SDK either.');
            } else if (queryError.message && queryError.message.includes('chaincode')) {
                console.log('\n⚠️  This is a CHAINCODE error');
                console.log('   The peer is trying to invoke chaincode but failing.');
            }
            
            process.exit(1);
        }
        
        await gateway.disconnect();
        console.log('🔌 Gateway disconnected\n');
        
    } catch (error) {
        console.error('\n❌ FATAL ERROR:', error.message);
        if (error.stack) {
            console.error('\nStack trace:');
            console.error(error.stack);
        }
        process.exit(1);
    }
}

main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
});
