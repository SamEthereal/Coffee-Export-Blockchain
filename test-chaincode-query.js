// Direct chaincode query test using Fabric Gateway SDK
const { connect, signers } = require('@hyperledger/fabric-gateway');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const grpc = require('@grpc/grpc-js');

async function main() {
    console.log('🔍 Testing Chaincode Query via Fabric Gateway SDK...\n');
    
    // Paths
    const mspId = 'ECTAMSP';
    const orgPath = '/home/guda/GoCBC/blockchain/organizations/peerOrganizations/ecta.cecbs.et';
    const certPath = path.join(orgPath, 'users', 'admin-ECTAMSP', 'msp', 'signcerts', 'cert.pem');
    const keyPath = path.join(orgPath, 'users', 'admin-ECTAMSP', 'msp', 'keystore', 'priv_sk');
    const tlsCertPath = path.join(orgPath, 'peers', 'peer0.ecta.cecbs.et', 'tls', 'ca.crt');
    
    console.log(`MSP ID: ${mspId}`);
    console.log(`Cert: ${certPath}`);
    console.log(`Key: ${keyPath}`);
    console.log(`TLS Cert: ${tlsCertPath}\n`);
    
    // Read credentials
    const cert = fs.readFileSync(certPath);
    const key = fs.readFileSync(keyPath);
    const tlsCert = fs.readFileSync(tlsCertPath);
    
    // Create signer
    const privateKey = crypto.createPrivateKey(key);
    const signer = signers.newPrivateKeySigner(privateKey);
    
    // Create gRPC client
    const peerEndpoint = 'peer0.ecta.cecbs.et:7051';
    console.log(`Connecting to peer: ${peerEndpoint}`);
    
    const tlsCredentials = grpc.credentials.createSsl(tlsCert);
    const client = new grpc.Client(peerEndpoint, tlsCredentials, {
        'grpc.ssl_target_name_override': 'peer0.ecta.cecbs.et',
    });
    
    // Connect to gateway
    const gateway = connect({
        client,
        identity: {
            mspId,
            credentials: cert,
        },
        signer,
    });
    
    try {
        console.log('✓ Gateway connected\n');
        
        // Get network and contract
        const network = gateway.getNetwork('coffeechannel');
        console.log('✓ Network obtained: coffeechannel');
        
        const contract = network.getContract('coffee');
        console.log('✓ Contract obtained: coffee\n');
        
        // Query chaincode
        console.log('📤 Submitting query: QueryAllLCs');
        console.log('⏱️  Waiting for response...\n');
        
        const startTime = Date.now();
        const result = await contract.evaluateTransaction('QueryAllLCs');
        const duration = Date.now() - startTime;
        
        console.log(`✅ Query successful! (took ${duration}ms)`);
        console.log(`📊 Result: ${result.toString()}\n`);
        
    } catch (error) {
        console.error('❌ Query failed:');
        console.error(`   Error: ${error.message}`);
        if (error.stack) {
            console.error(`   Stack: ${error.stack}`);
        }
        process.exit(1);
    } finally {
        gateway.close();
        client.close();
        console.log('🔌 Gateway and client closed');
    }
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
