/**
 * Ethiopian Coffee Export Consortium Blockchain System (CECBS)
 * Unified Signature Service
 *
 * Consolidates all cryptographic signature operations:
 * 1. Transaction Signature Recording & Audit (Database mirror)
 * 2. On-Chain Ledger Verification & QSCC Transaction Proofs (Hyperledger Fabric)
 * 3. Document Cryptographic Proofs & Detached X.509 Signatures
 */

import path from 'path';
import { DatabaseService } from './databaseService';
import { FabricService } from './fabricService';
import { CertificateManager } from '../utils/certificateManager';
import { calculateDocumentHash } from '../utils/fileUtils';
import { DigitalSignatureService } from './digitalSignatureService';
import { logger } from '../utils/logger';

export interface BlockchainSignatureData {
  entityType: string;  // CONTRACT, LETTER_OF_CREDIT, SHIPMENT, FOREX_ALLOCATION, PAYMENT, etc.
  entityId: string;
  actionType: string;  // CREATE, UPDATE, APPROVE, ALLOCATE, VERIFY, etc.
  signerUsername: string;
  signerOrg: string;
  signerRole?: string;
  blockchainTxId?: string;
  blockchainTimestamp?: Date;
  chaincodeName?: string;
  chaincodeFunction?: string;
  transactionArgs?: any[];
  endorsingPeers?: string[];
  metadata?: any;
}

export interface BlockchainTransactionSignature {
  txId: string;
  timestamp: string;
  creator: {
    mspId: string;
    identity: string; // X.509 certificate DN
    signatureValid?: boolean | null;
    certificateTrustStatus?: string;
  };
  chaincodeName: string | null;
  chaincodeFunction: string;
  args: string[];
  endorsers: Array<{
    mspId: string;
    identity?: string;
    signatureValid?: boolean | null;
    endpoint?: string;
  }>;
  endorsementNote?: string;
  validationCode: string;
  blockNumber: number | null;
  blockHash: string;
}

export interface DocumentSigningOptions {
  filePath: string;
  signerUsername: string;
  signerEmail?: string;
  organization: string;
  reason: string;
  documentId: string;
  documentType: string;
  positionIndex?: number;
  isPDF?: boolean;
}

export class SignatureService {
  private static instance: SignatureService;
  private db: DatabaseService;
  private fabricService: FabricService;

  private constructor() {
    this.db = DatabaseService.getInstance();
    this.fabricService = FabricService.getInstance();
    logger.info('[SIGNATURE] Initialized unified SignatureService');
  }

  public static getInstance(): SignatureService {
    if (!SignatureService.instance) {
      SignatureService.instance = new SignatureService();
    }
    return SignatureService.instance;
  }

  // =========================================================================
  // 1. Transaction Signature Recording & Audit Trail
  // =========================================================================

  /**
   * Record a blockchain signature after a successful transaction
   */
  public async recordSignature(data: BlockchainSignatureData): Promise<string> {
    try {
      const signatureId = `SIG-${data.entityType}-${data.entityId}-${Date.now()}`;
      
      const certificateDN: string | null = null;
      const certificateFingerprint: string | null = null;

      await this.db.run(
        `INSERT INTO blockchain_signatures (
          signature_id, entity_type, entity_id, action_type,
          signer_username, signer_org, signer_role,
          certificate_dn, certificate_fingerprint,
          blockchain_tx_id, blockchain_timestamp,
          chaincode_name, chaincode_function, transaction_args,
          endorsing_peers, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          signatureId,
          data.entityType,
          data.entityId,
          data.actionType,
          data.signerUsername,
          data.signerOrg,
          data.signerRole || null,
          certificateDN,
          certificateFingerprint,
          data.blockchainTxId || null,
          data.blockchainTimestamp || new Date(),
          data.chaincodeName || 'coffee',
          data.chaincodeFunction || 'unknown',
          data.transactionArgs ? JSON.stringify(data.transactionArgs) : null,
          data.endorsingPeers ? JSON.stringify(data.endorsingPeers) : null,
          data.metadata ? JSON.stringify(data.metadata) : null
        ]
      );

      logger.info(`✅ [SIGNATURE] Blockchain signature recorded: ${signatureId} for ${data.entityType}/${data.entityId}`);
      return signatureId;
    } catch (error: any) {
      logger.error('Failed to record blockchain signature:', error);
      throw error;
    }
  }

  /**
   * Get all signatures for an entity from PostgreSQL
   */
  public async getSignatures(entityType: string, entityId: string): Promise<any[]> {
    try {
      const signatures = await this.db.all(
        `SELECT * FROM blockchain_signatures 
         WHERE entity_type = $1 AND entity_id = $2 
         ORDER BY created_at ASC`,
        [entityType, entityId]
      );
      return signatures || [];
    } catch (error: any) {
      logger.error(`Failed to get signatures for ${entityType}/${entityId}:`, error);
      return [];
    }
  }

  /**
   * Get verification summary for an entity
   */
  public async getVerificationSummary(entityType: string, entityId: string) {
    try {
      const signatures = await this.getSignatures(entityType, entityId);
      
      return {
        total: signatures.length,
        verified: signatures.filter(s => s.blockchain_tx_id).length,
        pending: signatures.filter(s => !s.blockchain_tx_id).length,
        uniqueSigners: new Set(signatures.map(s => s.signer_username)).size,
        organizations: [...new Set(signatures.map(s => s.signer_org))],
        latestSignature: signatures[signatures.length - 1] || null
      };
    } catch (error: any) {
      logger.error(`Failed to get verification summary for ${entityType}/${entityId}:`, error);
      return { total: 0, verified: 0, pending: 0, uniqueSigners: 0, organizations: [], latestSignature: null };
    }
  }

  // =========================================================================
  // 2. On-Chain Ledger Verification & QSCC Transactions
  // =========================================================================

  /**
   * Read one transaction directly from QSCC, including block validation metadata
   */
  public getTransactionDetails(txId: string) {
    return this.fabricService.getTransactionDetails(txId);
  }

  /**
   * Get blockchain transaction signatures for an entity directly from ledger history
   */
  public async getEntityTransactions(
    entityType: string,
    entityId: string,
  ): Promise<BlockchainTransactionSignature[]> {
    try {
      const txIds = new Set<string>();
      const auditResult = await this.fabricService.queryChaincode('QueryAuditLogsByEntity', [entityType, entityId]);
      for (const audit of Array.isArray(auditResult.data) ? auditResult.data : []) {
        const signature = audit.Signature || audit.signature;
        const txId = signature?.TransactionID || signature?.transactionId || audit.TransactionID || audit.transactionId;
        if (typeof txId === 'string' && txId) txIds.add(txId);
      }

      // State keys are prefixed per entity type (ECX lots live under ECXLOT_<lotId>)
      const historyKeyPrefixes: Record<string, string> = { ECXLOT: 'ECXLOT_' };
      const historyKey = `${historyKeyPrefixes[entityType] || ''}${entityId}`;
      const historyResult = await this.fabricService.queryChaincode('GetHistory', [historyKey]);
      for (const record of Array.isArray(historyResult.data) ? historyResult.data : []) {
        const txId = record.TxId || record.txId || record.tx_id;
        if (typeof txId === 'string' && txId) txIds.add(txId);
      }

      const ledgerTransactions = await Promise.all(
        [...txIds].map((txId) => this.fabricService.getTransactionDetails(txId)),
      );
      return ledgerTransactions
        .filter((transaction): transaction is NonNullable<typeof transaction> => transaction !== null)
        .map((transaction) => ({
          txId: transaction.txId,
          timestamp: transaction.timestamp || '',
          creator: transaction.creator,
          chaincodeName: transaction.chaincodeName,
          chaincodeFunction: transaction.chaincodeFunction || 'UNKNOWN',
          args: transaction.args,
          endorsers: transaction.endorsers,
          endorsementNote: 'Endorsements and validation status were decoded from the committed Fabric transaction envelope.',
          validationCode: transaction.validationStatus,
          blockNumber: transaction.blockNumber,
          blockHash: transaction.blockHash || '',
        }))
        .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    } catch (error: any) {
      logger.error(
        `❌ [SIGNATURE] Error querying blockchain for ${entityType}/${entityId}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Get current blockchain state with signatures
   */
  public async getEntityWithSignatures(
    entityType: string,
    entityId: string,
  ): Promise<any> {
    try {
      const stateResult = await this.getEntityState(entityType, entityId);
      const transactions = await this.getEntityTransactions(entityType, entityId);

      return {
        currentState: stateResult,
        transactions,
        summary: {
          total: transactions.length,
          verified: transactions.filter((t) => t.validationCode === 'VALID').length,
          organizations: [...new Set(transactions.map((t) => t.creator.mspId))],
          latestTx: transactions[transactions.length - 1] || null,
        },
      };
    } catch (error: any) {
      logger.error(`[SIGNATURE] Error getting entity with signatures:`, error);
      throw error;
    }
  }

  /**
   * Read entity current state from blockchain
   */
  private async getEntityState(entityType: string, entityId: string): Promise<any> {
    const functionMap: Record<string, string> = {
      FOREX_ALLOCATION: 'ReadForex',
      LETTER_OF_CREDIT: 'ReadLC',
      PAYMENT: 'ReadPayment',
      CONTRACT: 'ReadSalesContract',
      SHIPMENT: 'ReadShipment',
      CUSTOMS_DECLARATION: 'ReadDeclaration',
      ECXLOT: 'ReadECXLot',
      EXPORTER: 'ReadExporter',
      EXPORTER_APPLICATION: 'ReadExporter',
      APPLICATION: 'ReadExporter',
      INSPECTION: 'ReadInspection',
      QUALITY_INSPECTION: 'ReadInspection',
    };

    const func = functionMap[entityType];
    if (!func) {
      logger.warn(`Unknown entity type for state lookup: ${entityType}, skipping state fetch`);
      return null;
    }

    const result = await this.fabricService.queryChaincode(func, [entityId]);
    return result.success ? result.data : null;
  }

  // =========================================================================
  // 3. Document Cryptographic Proofs & Detached Signatures
  // =========================================================================

  /**
   * Sign current file bytes in a detached proof without modifying the original file
   */
  public async signDocumentFile(options: DocumentSigningOptions): Promise<{
    documentHash: string;
    visualSignatureAdded: boolean;
    detachedSignatureCreated: boolean;
  }> {
    const certificate = await CertificateManager.getUserCertificate(options.signerUsername, options.organization);
    const documentHash = calculateDocumentHash(options.filePath);
    const ledgerResult = await this.fabricService.queryChaincode(
      'ReadDocumentHash',
      [options.documentId],
      options.organization,
    );
    const ledgerHash = ledgerResult.data?.hash || ledgerResult.data?.Hash;
    if (!ledgerResult.success || typeof ledgerHash !== 'string' || ledgerHash.toLowerCase() !== documentHash.toLowerCase()) {
      return {
        documentHash,
        visualSignatureAdded: false,
        detachedSignatureCreated: false,
      };
    }

    const signatureInfo = {
      signerName: options.signerUsername,
      signerEmail: options.signerEmail || '',
      organization: options.organization,
      reason: options.reason,
      location: 'Ethiopian Coffee Export Consortium',
      contactInfo: options.signerEmail || '',
      timestamp: new Date(),
      documentId: options.documentId,
      documentType: options.documentType || path.extname(options.filePath).slice(1).toUpperCase() || 'DOCUMENT',
    };
    await DigitalSignatureService.signFileDetached(options.filePath, certificate, signatureInfo);

    return {
      documentHash,
      visualSignatureAdded: false,
      detachedSignatureCreated: true,
    };
  }

  /**
   * Persist committed transaction proof fields alongside an application signature row
   */
  public async persistDocumentLedgerProof(
    signatureId: string,
    documentId: string,
    documentHash: string,
    detachedSignatureCreated: boolean,
    txId: string,
    overrideDb?: DatabaseService
  ): Promise<void> {
    const dbToUse = overrideDb || this.db;
    const transaction = await this.fabricService.getTransactionDetails(txId);
    await dbToUse.run(
      `UPDATE document_signatures
       SET blockchain_tx_id = $1,
           detached_signature_created = $2,
           document_hash_signed = $3,
           ledger_validation_code = $4,
           ledger_validation_status = $5,
           ledger_block_number = $6,
           ledger_block_hash = $7,
           ledger_creator_msp_id = $8,
           ledger_creator_identity = $9,
           endorsing_msp_ids = $10::jsonb,
           creator_signature_valid = $11,
           endorsement_signatures_valid = $12
       WHERE signature_id = $13 AND document_id = $14`,
      [
        txId,
        detachedSignatureCreated,
        documentHash,
        transaction?.validationCode ?? null,
        transaction?.validationStatus ?? 'UNAVAILABLE',
        transaction?.blockNumber ?? null,
        transaction?.blockHash ?? null,
        transaction?.creator.mspId ?? null,
        transaction?.creator.identity ?? null,
        JSON.stringify(transaction?.endorsers.map((endorser) => endorser.mspId) || []),
        transaction?.creator.signatureValid ?? null,
        transaction ? transaction.endorsers.every((endorser) => endorser.signatureValid === true) : null,
        signatureId,
        documentId,
      ]
    );
  }
}

export default SignatureService.getInstance();
