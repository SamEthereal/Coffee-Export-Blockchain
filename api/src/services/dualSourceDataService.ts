// Ethiopian Coffee Export Consortium Blockchain System (CECBS)
// Dual Source Data Service - High Performance CQRS Pattern (PostgreSQL Mirror + Hyperledger Fabric Ledger)

import { FabricService } from './fabricService';
import { DatabaseService } from './databaseService';
import { logger } from '../utils/logger';

export interface DataSourceStats {
  couchdbCount: number;
  postgresCount: number;
  totalCount: number;
  source: 'couchdb' | 'postgres' | 'both';
  mergedData: any[];
}

export interface FetchOptions {
  countOnly?: boolean;
  limit?: number;
  offset?: number;
}

export class DualSourceDataService {
  private static instance: DualSourceDataService;
  private fabricService: FabricService;
  private dbService: DatabaseService;

  private constructor() {
    this.fabricService = FabricService.getInstance();
    this.dbService = DatabaseService.getInstance();
  }

  public static getInstance(): DualSourceDataService {
    if (!DualSourceDataService.instance) {
      DualSourceDataService.instance = new DualSourceDataService();
    }
    return DualSourceDataService.instance;
  }

  /**
   * Fast SQL count helper — O(1) memory, executes in < 5ms.
   */
  public async getTableCount(tableName: string): Promise<number> {
    try {
      const row = await this.dbService.get(`SELECT COUNT(*)::int AS count FROM ${tableName}`);
      return row?.count ?? 0;
    } catch (err) {
      logger.warn(`[DUAL-SOURCE] Failed to get count for table ${tableName}:`, err);
      return 0;
    }
  }

  /**
   * Safe ledger count with a bounded timeout so slow chaincode never hangs dashboard statistics.
   */
  public async getLedgerCount(queryFn: string, timeoutMs = 2500): Promise<number> {
    try {
      const queryPromise = this.fabricService.queryChaincode(queryFn, []);
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
      const result = await Promise.race([queryPromise, timeoutPromise]);

      if (result && (result as any).success && (result as any).data) {
        const data = (result as any).data;
        return Array.isArray(data) ? data.length : 1;
      }
      return 0;
    } catch (err) {
      logger.warn(`[DUAL-SOURCE] Ledger count query ${queryFn} skipped/timed out:`, (err as any)?.message || err);
      return 0;
    }
  }

  /**
   * Letters of Credit
   */
  public async getLettersOfCredit(options: FetchOptions = {}): Promise<DataSourceStats> {
    const postgresCount = await this.getTableCount('letters_of_credit');
    const couchdbCount = await this.getLedgerCount('QueryAllLCs');
    const totalCount = Math.max(postgresCount, couchdbCount);
    const source: 'couchdb' | 'postgres' | 'both' =
      couchdbCount > 0 && postgresCount > 0 ? 'both' : couchdbCount > 0 ? 'couchdb' : 'postgres';

    if (options.countOnly) {
      return { couchdbCount, postgresCount, totalCount, source, mergedData: [] };
    }

    let postgresData: any[] = [];
    try {
      const limit = options.limit ? `LIMIT ${options.limit}` : '';
      const offset = options.offset ? `OFFSET ${options.offset}` : '';
      postgresData = await this.dbService.all(`
        SELECT * FROM letters_of_credit 
        ORDER BY created_at DESC ${limit} ${offset}
      `);
    } catch (error) {
      logger.warn('[DUAL-SOURCE] Failed to fetch LCs from PostgreSQL:', error);
    }

    return {
      couchdbCount,
      postgresCount,
      totalCount,
      source,
      mergedData: postgresData.map((item) => ({ ...this.normalizeKeys(item), _source: 'postgres' }))
    };
  }

  /**
   * Advance Payments
   */
  public async getAdvancePayments(options: FetchOptions = {}): Promise<DataSourceStats> {
    const postgresCount = await this.getTableCount('advance_payments');
    const couchdbCount = await this.getLedgerCount('QueryAllAdvancePayments');
    const totalCount = Math.max(postgresCount, couchdbCount);
    const source: 'couchdb' | 'postgres' | 'both' =
      couchdbCount > 0 && postgresCount > 0 ? 'both' : couchdbCount > 0 ? 'couchdb' : 'postgres';

    if (options.countOnly) {
      return { couchdbCount, postgresCount, totalCount, source, mergedData: [] };
    }

    let postgresData: any[] = [];
    try {
      postgresData = await this.dbService.all(`
        SELECT * FROM advance_payments 
        ORDER BY created_at DESC
      `);
    } catch (error) {
      logger.warn('[DUAL-SOURCE] Failed to fetch advance payments from PostgreSQL:', error);
    }

    return {
      couchdbCount,
      postgresCount,
      totalCount,
      source,
      mergedData: postgresData.map((item) => ({ ...this.normalizeKeys(item), _source: 'postgres' }))
    };
  }

  /**
   * Payments
   */
  public async getPayments(options: FetchOptions = {}): Promise<DataSourceStats> {
    const postgresCount = await this.getTableCount('payments');
    const couchdbCount = await this.getLedgerCount('QueryAllPayments');
    const totalCount = Math.max(postgresCount, couchdbCount);
    const source: 'couchdb' | 'postgres' | 'both' =
      couchdbCount > 0 && postgresCount > 0 ? 'both' : couchdbCount > 0 ? 'couchdb' : 'postgres';

    if (options.countOnly) {
      return { couchdbCount, postgresCount, totalCount, source, mergedData: [] };
    }

    let postgresData: any[] = [];
    try {
      postgresData = await this.dbService.all(`
        SELECT * FROM payments 
        ORDER BY created_at DESC
      `);
    } catch (error) {
      logger.warn('[DUAL-SOURCE] Failed to fetch payments from PostgreSQL:', error);
    }

    return {
      couchdbCount,
      postgresCount,
      totalCount,
      source,
      mergedData: postgresData.map((item) => ({ ...this.normalizeKeys(item), _source: 'postgres' }))
    };
  }

  /**
   * Consignment Payments
   */
  public async getConsignmentPayments(options: FetchOptions = {}): Promise<DataSourceStats> {
    const postgresCount = await this.getTableCount('consignment_payments');
    const couchdbCount = await this.getLedgerCount('QueryAllConsignments');
    const totalCount = Math.max(postgresCount, couchdbCount);
    const source: 'couchdb' | 'postgres' | 'both' =
      couchdbCount > 0 && postgresCount > 0 ? 'both' : couchdbCount > 0 ? 'couchdb' : 'postgres';

    if (options.countOnly) {
      return { couchdbCount, postgresCount, totalCount, source, mergedData: [] };
    }

    let postgresData: any[] = [];
    try {
      postgresData = await this.dbService.all(`
        SELECT * FROM consignment_payments 
        ORDER BY created_at DESC
      `);
    } catch (error) {
      logger.warn('[DUAL-SOURCE] Failed to fetch consignment payments from PostgreSQL:', error);
    }

    return {
      couchdbCount,
      postgresCount,
      totalCount,
      source,
      mergedData: postgresData.map((item) => ({ ...this.normalizeKeys(item), _source: 'postgres' }))
    };
  }

  /**
   * Documentary Collections (CAD)
   */
  public async getDocumentaryCollections(options: FetchOptions = {}): Promise<DataSourceStats> {
    const postgresCount = await this.getTableCount('documentary_collections');
    const couchdbCount = await this.getLedgerCount('QueryAllCollections');
    const totalCount = Math.max(postgresCount, couchdbCount);
    const source: 'couchdb' | 'postgres' | 'both' =
      couchdbCount > 0 && postgresCount > 0 ? 'both' : couchdbCount > 0 ? 'couchdb' : 'postgres';

    if (options.countOnly) {
      return { couchdbCount, postgresCount, totalCount, source, mergedData: [] };
    }

    let postgresData: any[] = [];
    try {
      postgresData = await this.dbService.all(`
        SELECT * FROM documentary_collections 
        ORDER BY created_at DESC
      `);
    } catch (error) {
      logger.warn('[DUAL-SOURCE] Failed to fetch documentary collections from PostgreSQL:', error);
    }

    return {
      couchdbCount,
      postgresCount,
      totalCount,
      source,
      mergedData: postgresData.map((item) => ({ ...this.normalizeKeys(item), _source: 'postgres' }))
    };
  }

  /**
   * Contracts
   */
  public async getContracts(options: FetchOptions = {}): Promise<DataSourceStats> {
    const postgresCount = await this.getTableCount('contracts');
    const couchdbCount = await this.getLedgerCount('QueryAllContracts');
    const totalCount = Math.max(postgresCount, couchdbCount);
    const source: 'couchdb' | 'postgres' | 'both' =
      couchdbCount > 0 && postgresCount > 0 ? 'both' : couchdbCount > 0 ? 'couchdb' : 'postgres';

    if (options.countOnly) {
      return { couchdbCount, postgresCount, totalCount, source, mergedData: [] };
    }

    let postgresData: any[] = [];
    try {
      postgresData = await this.dbService.all(`
        SELECT * FROM contracts 
        ORDER BY created_at DESC
      `);
    } catch (error) {
      logger.warn('[DUAL-SOURCE] Failed to fetch contracts from PostgreSQL:', error);
    }

    return {
      couchdbCount,
      postgresCount,
      totalCount,
      source,
      mergedData: postgresData.map((item) => ({ ...this.normalizeKeys(item), _source: 'postgres' }))
    };
  }

  /**
   * Shipments
   */
  public async getShipments(options: FetchOptions = {}): Promise<DataSourceStats> {
    const postgresCount = await this.getTableCount('shipments');
    const couchdbCount = await this.getLedgerCount('QueryAllShipments');
    const totalCount = Math.max(postgresCount, couchdbCount);
    const source: 'couchdb' | 'postgres' | 'both' =
      couchdbCount > 0 && postgresCount > 0 ? 'both' : couchdbCount > 0 ? 'couchdb' : 'postgres';

    if (options.countOnly) {
      return { couchdbCount, postgresCount, totalCount, source, mergedData: [] };
    }

    let postgresData: any[] = [];
    try {
      postgresData = await this.dbService.all(`
        SELECT * FROM shipments 
        ORDER BY created_at DESC
      `);
    } catch (error) {
      logger.warn('[DUAL-SOURCE] Failed to fetch shipments from PostgreSQL:', error);
    }

    return {
      couchdbCount,
      postgresCount,
      totalCount,
      source,
      mergedData: postgresData.map((item) => ({ ...this.normalizeKeys(item), _source: 'postgres' }))
    };
  }

  /**
   * Forex Allocations
   */
  public async getForexAllocations(options: FetchOptions = {}): Promise<DataSourceStats> {
    const postgresCount = await this.getTableCount('forex_allocations');
    const couchdbCount = await this.getLedgerCount('QueryAllForex');
    const totalCount = Math.max(postgresCount, couchdbCount);
    const source: 'couchdb' | 'postgres' | 'both' =
      couchdbCount > 0 && postgresCount > 0 ? 'both' : couchdbCount > 0 ? 'couchdb' : 'postgres';

    if (options.countOnly) {
      return { couchdbCount, postgresCount, totalCount, source, mergedData: [] };
    }

    let postgresData: any[] = [];
    try {
      postgresData = await this.dbService.all(`
        SELECT * FROM forex_allocations 
        ORDER BY created_at DESC
      `);
    } catch (error) {
      logger.warn('[DUAL-SOURCE] Failed to fetch forex allocations from PostgreSQL:', error);
    }

    return {
      couchdbCount,
      postgresCount,
      totalCount,
      source,
      mergedData: postgresData.map((item) => ({ ...this.normalizeKeys(item), _source: 'postgres' }))
    };
  }

  /**
   * Customs Declarations
   */
  public async getCustomsDeclarations(options: FetchOptions = {}): Promise<DataSourceStats> {
    const postgresCount = await this.getTableCount('customs_declarations');
    const couchdbCount = await this.getLedgerCount('QueryAllCustomsDeclarations');
    const totalCount = Math.max(postgresCount, couchdbCount);
    const source: 'couchdb' | 'postgres' | 'both' =
      couchdbCount > 0 && postgresCount > 0 ? 'both' : couchdbCount > 0 ? 'couchdb' : 'postgres';

    if (options.countOnly) {
      return { couchdbCount, postgresCount, totalCount, source, mergedData: [] };
    }

    let postgresData: any[] = [];
    try {
      postgresData = await this.dbService.all(`
        SELECT * FROM customs_declarations 
        ORDER BY created_at DESC
      `);
    } catch (error) {
      logger.warn('[DUAL-SOURCE] Failed to fetch customs declarations from PostgreSQL:', error);
    }

    return {
      couchdbCount,
      postgresCount,
      totalCount,
      source,
      mergedData: postgresData.map((item) => ({ ...this.normalizeKeys(item), _source: 'postgres' }))
    };
  }

  /**
   * ECX Lots
   */
  public async getECXLots(options: FetchOptions = {}): Promise<DataSourceStats> {
    const postgresCount = await this.getTableCount('ecx_lots');
    const couchdbCount = await this.getLedgerCount('QueryAllECXLots');
    const totalCount = Math.max(postgresCount, couchdbCount);
    const source: 'couchdb' | 'postgres' | 'both' =
      couchdbCount > 0 && postgresCount > 0 ? 'both' : couchdbCount > 0 ? 'couchdb' : 'postgres';

    if (options.countOnly) {
      return { couchdbCount, postgresCount, totalCount, source, mergedData: [] };
    }

    let postgresData: any[] = [];
    try {
      postgresData = await this.dbService.all(`
        SELECT * FROM ecx_lots 
        ORDER BY created_at DESC
      `);
    } catch (error) {
      logger.warn('[DUAL-SOURCE] Failed to fetch ECX lots from PostgreSQL:', error);
    }

    return {
      couchdbCount,
      postgresCount,
      totalCount,
      source,
      mergedData: postgresData.map((item) => ({ ...this.normalizeKeys(item), _source: 'postgres' }))
    };
  }

  /**
   * Exporters
   */
  public async getExporters(options: FetchOptions = {}): Promise<DataSourceStats> {
    const postgresCount = await this.getTableCount('exporters');
    const couchdbCount = await this.getLedgerCount('QueryAllExporters');
    const totalCount = Math.max(postgresCount, couchdbCount);
    const source: 'couchdb' | 'postgres' | 'both' =
      couchdbCount > 0 && postgresCount > 0 ? 'both' : couchdbCount > 0 ? 'couchdb' : 'postgres';

    if (options.countOnly) {
      return { couchdbCount, postgresCount, totalCount, source, mergedData: [] };
    }

    let postgresData: any[] = [];
    try {
      postgresData = await this.dbService.all(`
        SELECT * FROM exporters 
        ORDER BY created_at DESC
      `);
    } catch (error) {
      logger.warn('[DUAL-SOURCE] Failed to fetch exporters from PostgreSQL:', error);
    }

    return {
      couchdbCount,
      postgresCount,
      totalCount,
      source,
      mergedData: postgresData.map((item) => ({ ...this.normalizeKeys(item), _source: 'postgres' }))
    };
  }

  /**
   * Get Bank Portal Statistics (Optimized with countOnly: true)
   */
  public async getBankPortalStats(): Promise<{
    lc: DataSourceStats;
    documentaryCollection: DataSourceStats;
    advancePayment: DataSourceStats;
    consignment: DataSourceStats;
  }> {
    const [lc, documentaryCollection, advancePayment, consignment] = await Promise.all([
      this.getLettersOfCredit({ countOnly: true }),
      this.getDocumentaryCollections({ countOnly: true }),
      this.getAdvancePayments({ countOnly: true }),
      this.getConsignmentPayments({ countOnly: true }),
    ]);

    return { lc, documentaryCollection, advancePayment, consignment };
  }

  /**
   * Get Exporter Portal Statistics (Optimized with countOnly: true)
   */
  public async getExporterPortalStats(): Promise<{
    contracts: DataSourceStats;
    shipments: DataSourceStats;
    lc: DataSourceStats;
    forex: DataSourceStats;
  }> {
    const [contracts, shipments, lc, forex] = await Promise.all([
      this.getContracts({ countOnly: true }),
      this.getShipments({ countOnly: true }),
      this.getLettersOfCredit({ countOnly: true }),
      this.getForexAllocations({ countOnly: true }),
    ]);

    return { contracts, shipments, lc, forex };
  }

  /**
   * Get NBE Portal Statistics (Optimized with countOnly: true)
   */
  public async getNBEPortalStats(): Promise<{
    forex: DataSourceStats;
    lc: DataSourceStats;
    contracts: DataSourceStats;
  }> {
    const [forex, lc, contracts] = await Promise.all([
      this.getForexAllocations({ countOnly: true }),
      this.getLettersOfCredit({ countOnly: true }),
      this.getContracts({ countOnly: true }),
    ]);

    return { forex, lc, contracts };
  }

  /**
   * Get Customs Portal Statistics (Optimized with countOnly: true)
   */
  public async getCustomsPortalStats(): Promise<{
    declarations: DataSourceStats;
    shipments: DataSourceStats;
  }> {
    const [declarations, shipments] = await Promise.all([
      this.getCustomsDeclarations({ countOnly: true }),
      this.getShipments({ countOnly: true }),
    ]);

    return { declarations, shipments };
  }

  /**
   * Get ECX Portal Statistics (Optimized with countOnly: true)
   */
  public async getECXPortalStats(): Promise<{
    lots: DataSourceStats;
    contracts: DataSourceStats;
  }> {
    const [lots, contracts] = await Promise.all([
      this.getECXLots({ countOnly: true }),
      this.getContracts({ countOnly: true }),
    ]);

    return { lots, contracts };
  }

  /**
   * Get ECTA Portal Statistics (Optimized with countOnly: true)
   */
  public async getECTAPortalStats(): Promise<{
    exporters: DataSourceStats;
    contracts: DataSourceStats;
    shipments: DataSourceStats;
    ecxLots: DataSourceStats;
  }> {
    const [exporters, contracts, shipments, ecxLots] = await Promise.all([
      this.getExporters({ countOnly: true }),
      this.getContracts({ countOnly: true }),
      this.getShipments({ countOnly: true }),
      this.getECXLots({ countOnly: true }),
    ]);

    return { exporters, contracts, shipments, ecxLots };
  }

  /**
   * Get Shipping Portal Statistics (Optimized with countOnly: true)
   */
  public async getShippingPortalStats(): Promise<{
    shipments: DataSourceStats;
  }> {
    const shipments = await this.getShipments({ countOnly: true });
    return { shipments };
  }

  /**
   * Convert snake_case database columns to camelCase
   */
  private normalizeKeys(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    const normalized: any = {};
    for (const key of Object.keys(obj)) {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      normalized[camelKey] = obj[key];
    }
    return normalized;
  }
}

export default DualSourceDataService;
