# Parallel Data Loading Implementation Guide

## Overview

This implementation allows the API to fetch data from both blockchain and PostgreSQL **simultaneously**, returning results as soon as the database responds while continuing to fetch from blockchain in the background.

## Benefits

1. **✅ Immediate Response**: Users see data instantly from PostgreSQL
2. **✅ Blockchain Verification**: Blockchain data still loaded and shown when available  
3. **✅ Graceful Degradation**: System works even when blockchain is slow/unavailable
4. **✅ Better UX**: No more 30-second timeouts blocking the UI

## Architecture

```
API Request
    ↓
    ├─→ PostgreSQL Query (fast, ~50ms) ─┐
    │                                     ├─→ Merge → Response
    └─→ Blockchain Query (slow, ~30s) ───┘
        (continues in background)
```

## Implementation

### 1. Utility Created: `parallelDataFetch.ts`

Located at: `/home/guda/GoCBC/api/src/utils/parallelDataFetch.ts`

**Key Function**:
```typescript
fetchFromBothSources<T>(
  blockchainFn: () => Promise<T[]>,
  databaseFn: () => Promise<T[]>,
  options?: ParallelFetchOptions
): Promise<DataSourceResult<T>>
```

**Options**:
- `blockchainTimeout`: Max wait for blockchain (default: 5000ms)
- `waitForBoth`: Wait for both sources before returning (default: false)
- `mergeFn`: Custom merge function
- `deduplicateBy`: Field name to deduplicate by (e.g., 'contractId')

### 2. Example Usage in Routes

#### Before (Sequential - Slow):
```typescript
router.get('/contracts', authMiddleware, async (req, res) => {
  try {
    // Try blockchain first
    const blockchainData = await fabricService.queryAllContracts();
    return res.json({ success: true, data: blockchainData });
  } catch (error) {
    // Fallback to database (after 30s timeout!)
    const dbData = await db.all('SELECT * FROM contracts');
    return res.json({ success: true, data: dbData, source: 'database' });
  }
});
```

#### After (Parallel - Fast):
```typescript
import { fetchFromBothSources, resilientFetch } from '../utils/parallelDataFetch';

router.get('/contracts', authMiddleware, async (req, res) => {
  const result = await fetchFromBothSources(
    // Blockchain query
    resilientFetch(() => fabricService.queryAllContracts()),
    
    // Database query
    resilientFetch(async () => {
      const rows = await db.all('SELECT * FROM contracts');
      return rows.map(mapContractFromDb);
    }),
    
    // Options
    {
      blockchainTimeout: 5000,  // Don't wait more than 5s for blockchain
      deduplicateBy: 'contractId',  // Merge by contract ID
      waitForBoth: false,  // Return DB results immediately
    }
  );

  res.json({
    success: true,
    data: result.data,
    metadata: {
      source: result.source,
      blockchainVerified: result.blockchainSuccess,
      blockchainRecords: result.blockchainData?.length || 0,
      databaseRecords: result.databaseData?.length || 0,
      totalRecords: result.mergedCount,
      timing: {
        blockchain: result.blockchainDuration,
        database: result.databaseDuration,
      }
    }
  });
});
```

### 3. Routes to Update

Update these routes to use parallel fetching:

1. **`GET /api/v1/contracts`** - All contracts
2. **`GET /api/v1/contracts/:id`** - Single contract
3. **`GET /api/v1/banking/lc`** - Letters of Credit
4. **`GET /api/v1/forex`** - Forex allocations
5. **`GET /api/v1/shipments`** - Shipments
6. **`GET /api/v1/payments`** - Payments

### 4. Frontend Updates (Optional)

The frontend already handles this well! The `BanksPortal.tsx` loads data in parallel:

```typescript
const loadBankingData = async () => {
  // Already launches ALL requests in parallel!
  const [contracts, lcs, swift, forex, shipments] = await Promise.all([
    apiFetch('/api/v1/contracts'),
    apiFetch('/api/v1/banking/lc'),
    apiFetch('/api/v1/swift/messages'),
    apiFetch('/api/v1/forex'),
    apiFetch('/api/v1/shipments'),
  ]);
  
  // Each updates state as soon as it completes
  setContracts(contracts.data);
  setLetterOfCredits(lcs.data);
  // etc...
};
```

**Enhancement**: Show blockchain verification status in UI:

```typescript
// Display which records are blockchain-verified
{contracts.map(contract => (
  <TableRow key={contract.contractId}>
    <TableCell>{contract.contractId}</TableCell>
    <TableCell>
      {contract.blockchainVerified && (
        <Tooltip title="Verified on Blockchain">
          <VerifiedIcon color="success" />
        </Tooltip>
      )}
    </TableCell>
  </TableRow>
))}
```

## Testing

### 1. Test Parallel Loading

```bash
# Start the API
cd /home/guda/GoCBC/api && npm start

# Test the endpoint
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/v1/contracts

# Response should include metadata:
{
  "success": true,
  "data": [...],
  "metadata": {
    "source": "database",  // or "blockchain" or "both"
    "blockchainVerified": false,
    "timing": {
      "blockchain": 5000,  // timeout
      "database": 45  // fast!
    }
  }
}
```

### 2. Monitor Logs

```bash
docker logs -f cecbs-api | grep ParallelFetch

# You should see:
# [ParallelFetch] ✅ Database responded in 45ms with 10 records
# [ParallelFetch] ⏱️ Blockchain timeout after 5000ms
# [ParallelFetch] 📊 Final result: 10 records from database (BC: ❌ 5000ms, DB: ✅ 45ms)
```

## Performance Comparison

### Before (Sequential):
```
User Request → API
               ↓
               Try Blockchain (timeout 30s)
               ↓
               ❌ Timeout
               ↓
               Fallback to Database (50ms)
               ↓
Total: ~30 seconds
```

### After (Parallel):
```
User Request → API
               ↓
         ┌─────┴─────┐
         ↓           ↓
    Database    Blockchain
     (50ms)      (5s timeout)
         ↓           
    Response!
               
Total: ~50ms (blockchain continues in background)
```

**Improvement**: **600x faster** response time!

## Monitoring & Metrics

The `DataSourceResult` includes timing information you can use to monitor performance:

```typescript
{
  blockchainDuration: 5000,  // ms
  databaseDuration: 45,      // ms
  blockchainSuccess: false,
  databaseSuccess: true,
  source: 'database'
}
```

Track these metrics:
1. **Blockchain availability**: % of requests where blockchain succeeds
2. **Blockchain response time**: Average duration when successful
3. **Database response time**: Should stay fast (<100ms)
4. **Source distribution**: % from blockchain vs database vs both

## Next Steps

1. ✅ **Created**: `parallelDataFetch.ts` utility
2. ⏭️ **TODO**: Update contract routes to use parallel fetching
3. ⏭️ **TODO**: Update LC routes
4. ⏭️ **TODO**: Update other data routes (forex, shipments, etc.)
5. ⏭️ **TODO**: Add blockchain verification badge in UI
6. ⏭️ **TODO**: Add monitoring dashboard for data source metrics

## Files Modified

- `/home/guda/GoCBC/api/src/utils/parallelDataFetch.ts` - NEW utility
- This guide: `/home/guda/GoCBC/PARALLEL-DATA-LOADING-IMPLEMENTATION.md`

## Example Route Implementation

See the example code in the "After (Parallel - Fast)" section above, or check:
- Current sequential implementation: `/home/guda/GoCBC/api/src/routes/contracts.ts`
- Target parallel implementation: Apply the pattern shown in this guide

---

**Ready to implement!** The utility is created and ready to use. Just update the routes following the pattern above.
