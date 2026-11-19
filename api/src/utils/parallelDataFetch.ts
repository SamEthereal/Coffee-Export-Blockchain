/**
 * Parallel Data Fetching Utility
 * 
 * Fetches data from both blockchain and PostgreSQL simultaneously,
 * returning whichever responds first while continuing to wait for the other.
 * This eliminates the perception of slow blockchain queries by showing
 * database results immediately.
 */

import { logger } from './logger';

export interface DataSourceResult<T> {
  data: T[];
  source: 'blockchain' | 'database' | 'both';
  blockchainData?: T[];
  databaseData?: T[];
  blockchainSuccess: boolean;
  databaseSuccess: boolean;
  blockchainError?: string;
  databaseError?: string;
  blockchainDuration?: number;
  databaseDuration?: number;
  mergedCount?: number;
}

export interface ParallelFetchOptions {
  /**
   * Timeout in milliseconds for blockchain query (default: 5000ms)
   */
  blockchainTimeout?: number;
  
  /**
   * Whether to wait for blockchain even if database returns first (default: false)
   */
  waitForBoth?: boolean;
  
  /**
   * Function to merge blockchain and database results
   * Default: prefer blockchain data, fallback to database
   */
  mergeFn?: <T>(blockchainData: T[], databaseData: T[]) => T[];
  
  /**
   * Function to deduplicate merged results by a unique key
   */
  deduplicateBy?: string; // e.g., 'contractId', 'id'
}

/**
 * Fetch data from both blockchain and database in parallel
 * 
 * @param blockchainFn - Async function that queries blockchain
 * @param databaseFn - Async function that queries database
 * @param options - Configuration options
 * @returns Combined result with metadata about both sources
 */
export async function fetchFromBothSources<T>(
  blockchainFn: () => Promise<T[]>,
  databaseFn: () => Promise<T[]>,
  options: ParallelFetchOptions = {}
): Promise<DataSourceResult<T>> {
  const {
    blockchainTimeout = 5000,
    waitForBoth = false,
    mergeFn,
    deduplicateBy,
  } = options;

  const startTime = Date.now();
  let blockchainData: T[] = [];
  let databaseData: T[] = [];
  let blockchainSuccess = false;
  let databaseSuccess = false;
  let blockchainError: string | undefined;
  let databaseError: string | undefined;
  let blockchainDuration: number | undefined;
  let databaseDuration: number | undefined;

  // Create timeout promise for blockchain
  const blockchainWithTimeout = Promise.race([
    blockchainFn()
      .then((data) => {
        blockchainDuration = Date.now() - startTime;
        blockchainSuccess = true;
        blockchainData = data;
        logger.info(`[ParallelFetch] ✅ Blockchain responded in ${blockchainDuration}ms with ${data.length} records`);
        return data;
      })
      .catch((err) => {
        blockchainDuration = Date.now() - startTime;
        blockchainError = err.message || String(err);
        logger.warn(`[ParallelFetch] ⚠️ Blockchain failed after ${blockchainDuration}ms: ${blockchainError}`);
        return [];
      }),
    new Promise<T[]>((resolve) => {
      setTimeout(() => {
        if (!blockchainSuccess) {
          blockchainDuration = blockchainTimeout;
          blockchainError = `Timeout after ${blockchainTimeout}ms`;
          logger.warn(`[ParallelFetch] ⏱️ Blockchain timeout after ${blockchainTimeout}ms`);
        }
        resolve([]);
      }, blockchainTimeout);
    }),
  ]);

  // Database query
  const databasePromise = databaseFn()
    .then((data) => {
      databaseDuration = Date.now() - startTime;
      databaseSuccess = true;
      databaseData = data;
      logger.info(`[ParallelFetch] ✅ Database responded in ${databaseDuration}ms with ${data.length} records`);
      return data;
    })
    .catch((err) => {
      databaseDuration = Date.now() - startTime;
      databaseError = err.message || String(err);
      logger.error(`[ParallelFetch] ❌ Database failed after ${databaseDuration}ms: ${databaseError}`);
      return [];
    });

  // Run both in parallel
  if (waitForBoth) {
    // Wait for both to complete
    await Promise.allSettled([blockchainWithTimeout, databasePromise]);
  } else {
    // Return as soon as database completes, but continue blockchain in background
    await databasePromise;
    
    // If blockchain hasn't finished, let it continue but don't wait
    blockchainWithTimeout.catch(() => {}); // Prevent unhandled rejection
  }

  // Merge results
  let finalData: T[];
  let source: 'blockchain' | 'database' | 'both';

  if (blockchainSuccess && databaseSuccess) {
    source = 'both';
    if (mergeFn) {
      finalData = mergeFn(blockchainData, databaseData);
    } else {
      // Default: prefer blockchain data, add missing records from database
      finalData = mergeWithDedup(blockchainData, databaseData, deduplicateBy);
    }
  } else if (blockchainSuccess) {
    source = 'blockchain';
    finalData = blockchainData;
  } else if (databaseSuccess) {
    source = 'database';
    finalData = databaseData;
  } else {
    source = 'database'; // fallback
    finalData = [];
  }

  const result: DataSourceResult<T> = {
    data: finalData,
    source,
    blockchainData,
    databaseData,
    blockchainSuccess,
    databaseSuccess,
    blockchainError,
    databaseError,
    blockchainDuration,
    databaseDuration,
    mergedCount: finalData.length,
  };

  logger.info(
    `[ParallelFetch] 📊 Final result: ${result.mergedCount} records from ${source} ` +
    `(BC: ${blockchainSuccess ? '✅' : '❌'} ${blockchainDuration}ms, ` +
    `DB: ${databaseSuccess ? '✅' : '❌'} ${databaseDuration}ms)`
  );

  return result;
}

/**
 * Merge two arrays and deduplicate by a key field
 * Blockchain data takes precedence over database data
 */
function mergeWithDedup<T>(
  blockchainData: T[],
  databaseData: T[],
  keyField?: string
): T[] {
  if (!keyField) {
    // No deduplication, just concatenate
    return [...blockchainData, ...databaseData];
  }

  const seen = new Set<any>();
  const merged: T[] = [];

  // Add blockchain data first (takes precedence)
  for (const item of blockchainData) {
    const key = (item as any)[keyField];
    if (key && !seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }

  // Add database data for items not in blockchain
  for (const item of databaseData) {
    const key = (item as any)[keyField];
    if (key && !seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }

  return merged;
}

/**
 * Helper to create a resilient fetch that never throws
 */
export function resilientFetch<T>(
  fn: () => Promise<T[]>,
  fallback: T[] = []
): () => Promise<T[]> {
  return async () => {
    try {
      return await fn();
    } catch (error) {
      logger.warn(`[ResilientFetch] Query failed, returning fallback:`, error);
      return fallback;
    }
  };
}
