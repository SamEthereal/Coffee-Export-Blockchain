/**
 * Test Suite for Hybrid IPFS Service
 * Tests:
 * 1. Offline behavior (graceful fallback when daemon is down)
 * 2. Upload, CID generation, and pinning against a mock Kubo RPC API
 * 3. Download / cat functionality
 * 4. Diagnostics & status endpoint
 */

import http from 'http';
import assert from 'assert';

// Set test environment variables before importing
process.env.USE_IPFS = 'true';
process.env.IPFS_HOST = '127.0.0.1';
process.env.IPFS_PORT = '5999'; // test port
process.env.IPFS_TIMEOUT_MS = '1500';
process.env.IPFS_GATEWAY = 'http://localhost:8080/ipfs/';

async function run() {
  console.log('🧪 Starting IPFS Service Test Suite...\n');

  // Dynamically import IpfsService
  const { IpfsService } = await import('../../api/src/services/ipfsService.ts');
  const ipfs = IpfsService.getInstance();

  // ── TEST 1: Gateway URL Generation ──────────────────────────────────────
  console.log('Test 1: Gateway URL generation');
  const cid1 = 'QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco';
  const gwUrl = ipfs.getGatewayUrl(cid1);
  assert.strictEqual(gwUrl, `http://localhost:8080/ipfs/${cid1}`);
  console.log('✓ Gateway URL matches expected format:', gwUrl);

  // ── TEST 2: Offline Resilience (Daemon not running) ────────────────────
  console.log('\nTest 2: Offline Resilience (Daemon unreachable)');
  const isUp = await ipfs.isAvailable(true);
  assert.strictEqual(isUp, false, 'Expected daemon to be unreachable');
  console.log('✓ isAvailable() returned false cleanly without throwing');

  const dummyData = Buffer.from('Coffee Export Contract #CECBS-2026-001', 'utf8');
  const offlineUpload = await ipfs.uploadFile(dummyData, 'contract.txt');
  assert.strictEqual(offlineUpload.success, false);
  assert(offlineUpload.error, 'Expected an error message explaining unreachable status');
  console.log('✓ uploadFile() failed gracefully with fallback message:', offlineUpload.error);

  const offlineDownload = await ipfs.downloadFile(cid1);
  assert.strictEqual(offlineDownload, null, 'Expected null download when offline');
  console.log('✓ downloadFile() returned null gracefully without throwing');

  // ── TEST 3: Mock Kubo RPC Daemon ───────────────────────────────────────
  console.log('\nTest 3: Simulated Kubo RPC Daemon (/api/v0/add & /api/v0/cat)');
  const mockStorage = new Map<string, Buffer>();
  const mockCid = 'QmZ4tDuvesekSs4qM5ZBKpXiZGun7S2CYtEZRB3DYXkjGx';

  const mockServer = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    if (url.pathname === '/api/v0/version') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ Version: '0.26.0', Commit: 'mock', Repo: '14', System: 'amd64/linux' }));
      return;
    }

    if (url.pathname === '/api/v0/add') {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const fullBody = Buffer.concat(chunks);
        mockStorage.set(mockCid, fullBody);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          Name: 'contract.txt',
          Hash: mockCid,
          Size: dummyData.length.toString(),
        }) + '\n');
      });
      return;
    }

    if (url.pathname === '/api/v0/cat') {
      const arg = url.searchParams.get('arg');
      if (arg && mockStorage.has(arg)) {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        res.end(dummyData);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => mockServer.listen(5999, '127.0.0.1', () => resolve()));
  console.log('✓ Mock Kubo server listening on 127.0.0.1:5999');

  try {
    // Check daemon availability now
    const isNowUp = await ipfs.isAvailable(true);
    assert.strictEqual(isNowUp, true, 'Daemon should now be detected as online');
    console.log('✓ isAvailable() detected daemon online');

    // Test diagnostics
    const status = await ipfs.getStatus();
    assert.strictEqual(status.available, true);
    assert.strictEqual(status.version, '0.26.0');
    console.log('✓ getStatus() reported version 0.26.0');

    // Test file upload
    const uploadRes = await ipfs.uploadFile(dummyData, 'contract.txt');
    assert.strictEqual(uploadRes.success, true);
    assert.strictEqual(uploadRes.cid, mockCid);
    console.log(`✓ uploadFile() succeeded! Generated CID: ${uploadRes.cid}`);

    // Test file download
    const downloaded = await ipfs.downloadFile(mockCid);
    assert(downloaded !== null, 'Expected downloaded buffer');
    assert.strictEqual(downloaded!.toString('utf8'), dummyData.toString('utf8'));
    console.log('✓ downloadFile() retrieved exact original bytes matching content');

  } finally {
    mockServer.close();
  }

  console.log('\n🎉 ALL IPFS HYBRID SERVICE TESTS PASSED SUCCESSFULLY!\n');
}

run().catch((err) => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
