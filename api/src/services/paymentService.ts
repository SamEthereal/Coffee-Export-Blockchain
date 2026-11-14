// Ethiopian Coffee Export Consortium Blockchain System (CECBS)
// Payment Service - Handles payment workflow with 40% NBE retention policy

import { FabricService } from './fabricService';
import { DatabaseService } from './databaseService';
import { AuditService } from './auditService';
import { ExchangeRateService } from './exchangeRateService';
import { CacheInvalidation } from './blockchainCacheService';
import { logger } from '../utils/logger';

/**
 * NBE Retention Policy:
 * - 40% of export earnings must be retained and converted to Birr
 * - 60% can be held in foreign currency or used for approved imports
 * - Retention applies to all export payments
 */
const NBE_RETENTION_RATE = 40; // 40% mandatory retention

export class PaymentService {
  private static instance: PaymentService;
  private fabricService: FabricService;
  private dbService: DatabaseService;
  private auditService: AuditService;
  private exchangeRateService: ExchangeRateService;

  private constructor() {
    this.fabricService = FabricService.getInstance();
    this.dbService = DatabaseService.getInstance();
    this.auditService = AuditService.getInstance();
    this.exchangeRateService = ExchangeRateService.getInstance();
  }

  public static getInstance(): PaymentService {
    if (!PaymentService.instance) {
      PaymentService.instance = new PaymentService();
    }
    return PaymentService.instance;
  }

  /**
   * Record incoming payment - Automatically calculates 40% retention
   * @workflow Shipment Delivered → Payment Received → 40% Retention Applied
   */
  async recordPayment(paymentData: {
    paymentID: string;
    contractID: string;
    shipmentID: string;
    exporterID: string;
    lcID?: string;
    forexID?: string;
    amountUSD: number;
    currency: string;
    swiftReference?: string;
    paymentDate: string;
    payerName: string;
    payerBank?: string;
    userId: string;
    userOrg: string;
  }) {
    try {
      logger.info(`[PaymentService] Recording payment: ${paymentData.paymentID}`);

      // Calculate 40% retention automatically
      const totalAmount = paymentData.amountUSD;
      const retentionAmount = totalAmount * (NBE_RETENTION_RATE / 100); // 40%
      const releaseAmount = totalAmount - retentionAmount; // 60%

      logger.info(`[PaymentService] Retention breakdown: Total=${totalAmount} USD, Retention=${retentionAmount} USD (40%), Release=${releaseAmount} USD (60%)`);

      // Connect as Banks MSP to record payment
      await this.fabricService.connectAsOrg('BanksMSP');

      // Submit to blockchain using InitiatePayment (the actual function that exists)
      const blockchainResult = await this.fabricService.submitTransaction(
        'InitiatePayment',
        paymentData.paymentID,
        paymentData.contractID,
        paymentData.exporterID,
        paymentData.lcID || '',
        totalAmount.toString(),
        paymentData.currency,
        'Commercial Bank of Ethiopia', // receivingBank
        'CBETETAA', // receivingBankBIC
        paymentData.exporterID, // beneficiaryName (use exporter ID as fallback)
        `${paymentData.exporterID}-001`, // beneficiaryAccount
        'LC' // paymentMethod
      );

      // Submit payment documents (moves status from PENDING to DOCUMENTS_SUBMITTED)
      await this.fabricService.submitTransaction(
        'SubmitPaymentDocuments',
        paymentData.paymentID,
        JSON.stringify(['Bill of Lading', 'Commercial Invoice', 'Certificate of Origin', 'Quality Certificate'])
      );

      // Verify payment documents (moves status from DOCUMENTS_SUBMITTED to VERIFIED)
      await this.fabricService.submitTransaction(
        'VerifyPaymentDocuments',
        paymentData.paymentID,
        paymentData.userId || 'Bank Officer',
        'Payment documents verified - all documents in order'
      );

      logger.info(`✅ Payment ${paymentData.paymentID} initiated, documents submitted and verified on blockchain`);



      // Store in database. status carries the SETTLEMENT machine only
      // (the chain has just verified the documents, so VERIFIED);
      // the NBE retention machine lives on retention_status
      // (TEST-STATUS-MATRIX §17 #8) — the old code wrote 'RECEIVED'
      // into status, so the settle mirror later overwrote it with
      // SETTLED and the retention state was lost.
      await this.dbService.run(
        `INSERT INTO payments (
          payment_id, contract_id, shipment_id, exporter_id, lc_id, forex_id,
          amount_usd, currency, retention_rate, retention_amount, release_amount,
          swift_reference, payment_date, payer_name, payer_bank,
          status, retention_status, blockchain_tx_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, CURRENT_TIMESTAMP)`,
        [
          paymentData.paymentID,
          paymentData.contractID,
          paymentData.shipmentID,
          paymentData.exporterID,
          paymentData.lcID,
          paymentData.forexID,
          totalAmount,
          paymentData.currency,
          NBE_RETENTION_RATE,
          retentionAmount,
          releaseAmount,
          paymentData.swiftReference,
          paymentData.paymentDate,
          paymentData.payerName,
          paymentData.payerBank,
          'VERIFIED',  // Settlement machine: documents verified on-chain
          'RECEIVED',  // Retention machine: payment received (will auto-split to 40% NBE, 60% Exporter)
          typeof blockchainResult === 'string' ? JSON.parse(blockchainResult).transactionId : blockchainResult.txId
        ]
      );

      // Immediately split payment (40% NBE, 60% Exporter) — retention
      // machine only; the settlement status stays VERIFIED.
      await this.dbService.run(
        `UPDATE payments SET retention_status = $1 WHERE payment_id = $2`,
        ['SPLIT', paymentData.paymentID]
      );

      // The contract status is NOT advanced here: 'ACTIVE' →
      // 'PAYMENT_RECEIVED' was never a CONTRACT transition (no such
      // states in the CONTRACT table or on-chain), and the chaincode
      // has no payment-received contract step. The contract reaches
      // COMPLETED via CompleteContract (contracts close route), not via
      // payment recording. Removed with the fail-closed validator
      // (TEST-STATUS-MATRIX §17 #12).

      // Audit log
      await this.auditService.log({
        entityType: 'PAYMENT',
        entityId: paymentData.paymentID,
        action: 'RECORD',
        performedBy: paymentData.userId,
        organization: paymentData.userOrg,
        performedByOrg: paymentData.userOrg,
        newValue: 'VERIFIED',
        // Shared audit contract: top-level operation txId — the
        // InitiatePayment tx that recorded this payment (metadata
        // already carries it; this is the persisted field).
        blockchainTxId: typeof blockchainResult === 'string' ? JSON.parse(blockchainResult).transactionId : blockchainResult.txId,
        metadata: {
          status: 'VERIFIED',
          retentionStatus: 'SPLIT',
          amount: totalAmount,
          retention: retentionAmount,
          release: releaseAmount,
          blockchainTxId: typeof blockchainResult === 'string' ? JSON.parse(blockchainResult).transactionId : blockchainResult.txId
        }
      });

      logger.info(`[PaymentService] ✅ Payment recorded: ${paymentData.paymentID} (${totalAmount} USD, 40% retention = ${retentionAmount} USD)`);

      return {
        success: true,
        paymentID: paymentData.paymentID,
        status: 'VERIFIED',
        retentionStatus: 'SPLIT',
        totalAmount,
        retentionAmount,
        releaseAmount,
        retentionRate: NBE_RETENTION_RATE,
        blockchainTxId: typeof blockchainResult === 'string' ? JSON.parse(blockchainResult).transactionId : blockchainResult.txId
      };

    } catch (error) {
      logger.error(`[PaymentService] Failed to record payment:`, error);
      throw error;
    }
  }

  /**
   * Ledger-first payment resolution (NBE release/convert read-source
   * fix): release and convert used to read PG `payments` only, so a
   * payment that exists on the ledger but has no PG row — e.g. the
   * LC-release-path payments, which banking.ts writes chaincode-only,
   * and the Nov-11/12 suite payments — 404'd even though settle (which
   * reads the ledger via ReadPayment) works on the same payment.
   *
   * PG first: a payment with a PG row resolves exactly as before, with
   * no ledger call at all, so the PG path is unchanged. Only when
   * there is no PG row is the ledger read (the same ReadPayment query
   * the settle route and releasePayment already use). When the ledger
   * has the payment, a PG-shaped row is derived from the ledger fields
   * (amount, retentionRate, retentionConverted / retentionReleased,
   * status, contract/exporter/LC/currency) and reconciled into PG with
   * an ON CONFLICT DO NOTHING insert — the same mirror pattern the
   * initiate route uses — so the release/convert PG updates below land
   * on a real row and later reads find it. The insert is best-effort:
   * if it fails, the derived row is still returned so the chain call
   * can proceed (ledger-first). Returns null only when the payment is
   * in neither store.
   */
  async resolvePayment(paymentID: string): Promise<any | null> {
    const pgPayment = await this.dbService.get(
      'SELECT * FROM payments WHERE payment_id = $1',
      [paymentID]
    );
    if (pgPayment) return pgPayment;

    let ledger: any;
    try {
      const read = await this.fabricService.queryChaincode('ReadPayment', [paymentID]);
      if (!read.success || !read.data) return null;
      ledger = read.data;
    } catch (readErr: any) {
      logger.warn(`[PaymentService] Could not read payment ${paymentID} from the ledger: ${readErr?.message}`);
      return null;
    }

    // The NBE split is 40% retention / 60% release, from the ledger's
    // own retentionRate (40 on every payment seen so far). Derive both
    // from the total: the ledger's retainedAmount is only set by
    // SettlePayment and convertedAmount is overwritten with birr by
    // ConvertRetention, so neither is a reliable release amount here.
    const total = Number(ledger.amount ?? 0);
    const rawRate = Number(ledger.retentionRate ?? 40);
    const retentionRate = Number.isFinite(rawRate) && rawRate > 0 && rawRate < 100 ? rawRate : 40;
    const retentionAmount = Math.round(total * retentionRate / 100 * 100) / 100;
    const releaseAmount = Math.round((total - retentionAmount) * 100) / 100;
    const retentionStatus = ledger.retentionReleased
      ? 'RELEASED'
      : ledger.retentionConverted
        ? 'RETENTION_CONVERTED'
        : 'RECEIVED';
    const reconciled: any = {
      payment_id: paymentID,
      contract_id: ledger.contractId ?? null,
      shipment_id: ledger.shipmentId ?? null,
      exporter_id: ledger.exporterId ?? null,
      lc_id: ledger.lcId ?? null,
      lc_number: ledger.lcId ?? null,
      amount: total,
      amount_usd: total,
      currency: ledger.currency || 'USD',
      payment_date: ledger.paymentDate ?? null,
      retention_rate: retentionRate,
      retention_amount: retentionAmount,
      release_amount: releaseAmount,
      status: String(ledger.status || 'PENDING'),
      retention_status: retentionStatus,
    };

    try {
      await this.dbService.run(
        `INSERT INTO payments (
          payment_id, contract_id, shipment_id, exporter_id, lc_id, lc_number,
          amount, amount_usd, currency, payment_date,
          retention_rate, retention_amount, release_amount,
          status, retention_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (payment_id) DO NOTHING`,
        [
          reconciled.payment_id, reconciled.contract_id, reconciled.shipment_id,
          reconciled.exporter_id, reconciled.lc_id, reconciled.lc_number,
          reconciled.amount, reconciled.amount_usd, reconciled.currency,
          reconciled.payment_date, reconciled.retention_rate,
          reconciled.retention_amount, reconciled.release_amount,
          reconciled.status, reconciled.retention_status,
        ]
      );
      // Another writer may have created the row meanwhile: prefer the
      // stored row when it exists.
      const stored = await this.dbService.get(
        'SELECT * FROM payments WHERE payment_id = $1',
        [paymentID]
      );
      if (stored) return stored;
    } catch (mirrorErr: any) {
      logger.warn(`[PaymentService] Could not reconcile ledger payment ${paymentID} into Postgres: ${mirrorErr?.message}`);
    }
    return reconciled;
  }

  /**
   * Convert retention amount to Birr - NBE/Bank processes 40% retention
   * @workflow Payment Received → Retention Converted → Birr Deposited
   */
  async convertRetention(conversionData: {
    paymentID: string;
    exchangeRate: number;
    amountBirr: number;
    convertedBy: string;
    conversionRef: string;
    conversionDate: string;
    userId: string;
    userOrg: string;
  }) {
    try {
      logger.info(`[PaymentService] Converting retention for payment: ${conversionData.paymentID}`);

      // Ledger-first resolution (see resolvePayment): a payment with no
      // PG row but a ledger record converts instead of 404'ing.
      const payment = await this.resolvePayment(conversionData.paymentID);

      if (!payment) {
        throw new Error(`Payment not found: ${conversionData.paymentID}`);
      }

      if (payment.retention_status === 'RETENTION_CONVERTED') {
        throw new Error(`Retention already converted for payment: ${conversionData.paymentID}`);
      }

      // Connect as NBE MSP
      await this.fabricService.connectAsOrg('NBEMSP');

      // Submit conversion to blockchain
      const blockchainResult = await this.fabricService.submitTransaction(
        'ConvertRetention',
        conversionData.paymentID,
        conversionData.exchangeRate.toString(),
        conversionData.amountBirr.toString(),
        conversionData.convertedBy,
        conversionData.conversionRef,
        conversionData.conversionDate
      );

      // N7 (F11 pattern, mirroring releasePayment): keep the
      // ConvertRetention txId. The old code dropped it here, so the
      // convert response carried no txId, no blockchain_signatures row
      // existed for the conversion, and the chain tx had to be recovered
      // via a block scan. submitTransaction returns txId (and
      // transactionId as an alias); extract defensively, the same way
      // the audit metadata below does.
      const convertTxId =
        typeof blockchainResult === 'string'
          ? JSON.parse(blockchainResult).transactionId || null
          : (blockchainResult as any).txId || (blockchainResult as any).transactionId || null;

      // N7: signature row for the ConvertRetention call so the signer
      // and tx are findable without a block scan, exactly as
      // releasePayment records SettlePayment / RecordRetentionRelease.
      // Best-effort (recordChainSignature catches internally): the
      // ledger write already committed, so a failed PG write must not
      // turn the conversion into a 500.
      if (convertTxId) {
        await this.recordChainSignature({
          paymentID: conversionData.paymentID,
          txId: convertTxId,
          chaincodeFunction: 'ConvertRetention',
          signerOrg: 'NBEMSP',
          signerUsername: conversionData.convertedBy,
          actionType: 'RETENTION_CONVERSION',
        });
      }

      // Update database — retention machine only (status stays VERIFIED;
      // the settlement machine does not move on a retention conversion).
      await this.dbService.run(
        `UPDATE payments 
         SET retention_status = $1, exchange_rate = $2, amount_birr = $3, 
             converted_by = $4, conversion_ref = $5, conversion_date = $6
         WHERE payment_id = $7`,
        [
          'RETENTION_CONVERTED',
          conversionData.exchangeRate,
          conversionData.amountBirr,
          conversionData.convertedBy,
          conversionData.conversionRef,
          conversionData.conversionDate,
          conversionData.paymentID
        ]
      );

      // Audit log
      await this.auditService.log({
        entityType: 'PAYMENT',
        entityId: conversionData.paymentID,
        action: 'CONVERT_RETENTION',
        performedBy: conversionData.userId,
        organization: conversionData.userOrg,
        performedByOrg: conversionData.userOrg,
        newValue: 'RETENTION_CONVERTED',
        // Shared audit contract: top-level operation txId — the
        // ConvertRetention tx (metadata already carries it).
        blockchainTxId: convertTxId ?? undefined,
        metadata: {
          retentionStatus: 'RETENTION_CONVERTED',
          exchangeRate: conversionData.exchangeRate,
          amountBirr: conversionData.amountBirr,
          retentionUSD: payment.retention_amount,
          blockchainTxId: convertTxId
        }
      });

      logger.info(`[PaymentService] ✅ Retention converted: ${payment.retention_amount} USD → ${conversionData.amountBirr} Birr @ ${conversionData.exchangeRate}`);

      // N7: return the chain txId(s) — the convert response used to
      // carry none, so the chain tx had to be recovered via a block
      // scan. txId/blockchainTxId is the ConvertRetention tx, mirroring
      // the release response (releasePayment returns the same pair).
      return {
        success: true,
        paymentID: conversionData.paymentID,
        status: payment.status || 'VERIFIED',
        retentionStatus: 'RETENTION_CONVERTED',
        retentionUSD: payment.retention_amount,
        amountBirr: conversionData.amountBirr,
        exchangeRate: conversionData.exchangeRate,
        txId: convertTxId,
        blockchainTxId: convertTxId
      };

    } catch (error) {
      logger.error(`[PaymentService] Failed to convert retention:`, error);
      throw error;
    }
  }

  /**
   * Canonical SettlePayment invocation (TEST-STATUS-MATRIX §17 #14):
   * the settle route (payments.ts) and releasePayment below both
   * submitted SettlePayment with the same 7-arg order — paymentID,
   * exchangeRate, retentionRate, payingBank, payingBankBIC,
   * swiftReference, nbeApprovalRef — from two places, a divergence
   * risk if the order ever changes. Both now go through here. Returns
   * the raw chain result; the caller decides the failure mode (the
   * settle route returns 400, releasePayment throws).
   */
  async settleOnChain(params: {
    paymentID: string;
    exchangeRate: string;
    retentionRate: string;
    payingBank: string;
    payingBankBIC: string;
    swiftReference: string;
    nbeApprovalRef: string;
  }) {
    return this.fabricService.invokeChaincode('SettlePayment', [
      params.paymentID,
      params.exchangeRate,
      params.retentionRate,
      params.payingBank,
      params.payingBankBIC,
      params.swiftReference,
      params.nbeApprovalRef,
    ]);
  }

  /**
   * N6: record the 60% retention release on the ledger via
   * RecordRetentionRelease (chaincode payment.go, seq 11). The release
   * is an NBE action, so it is signed as NBEMSP, and it writes the
   * release evidence (retentionReleased=true, amount, released-by,
   * MSP, ref) WITHOUT changing Status — the same no-status-change
   * precedent as ConvertRetention. It only accepts SETTLED/CONFIRMED
   * payments and refuses a second release, so callers must settle
   * first on the settleable path. Throws on a chain rejection: the
   * transitional PG-only fallback was removed (N5), so a failure here
   * is a real failure, like SettlePayment. Returns the chain txId.
   * Used by BOTH release paths so both leave the identical ledger
   * record; factored out so the two paths cannot diverge again.
   */
  private async recordRetentionReleaseOnChain(params: {
    paymentID: string;
    releaseAmount: number;
    releasedBy: string;
    releaseRef: string;
    releaseDate: string;
  }): Promise<string | null> {
    await this.fabricService.connectAsOrg('NBEMSP');
    const releaseResult = await this.fabricService.invokeChaincode('RecordRetentionRelease', [
      params.paymentID,
      String(params.releaseAmount),
      params.releasedBy,
      params.releaseRef,
      params.releaseDate,
    ]);
    if (!releaseResult.success) {
      throw new Error((releaseResult as any).error || 'Fabric rejected transaction RecordRetentionRelease');
    }
    const txId = (releaseResult as any).txId || (releaseResult as any).transactionId || null;
    logger.info(`[PaymentService] Payment ${params.paymentID} 60% release recorded on-chain (TX: ${txId})`);
    return txId;
  }

  /**
   * N7 (F11 pattern): record a payment chain call where it can be found
   * without a block scan — a blockchain_signatures row (signer + tx).
   * Used by releasePayment (SettlePayment / RecordRetentionRelease),
   * convertRetention (ConvertRetention) and the settle route
   * (SettlePayment, via recordSettleSignature below). Best-effort: the
   * ledger write already committed, so a failed PG write must not turn
   * the operation into a 500.
   *
   * Leftover 2 dedupe: blockchain_tx_id has no UNIQUE constraint
   * (migration 046 only indexes it), and the same chain tx can reach
   * here twice — the settle route records SettlePayment and
   * releasePayment records its own SettlePayment call on the settleable
   * path — so a re-recorded tx must not leave a second row. One row
   * per chain tx, keyed on the txId itself.
   */
  private async recordChainSignature(params: {
    paymentID: string;
    txId: string | null;
    chaincodeFunction: string;
    signerOrg: string;
    signerUsername: string;
    actionType: string;
  }): Promise<void> {
    try {
      if (params.txId) {
        const existing = await this.dbService.get(
          `SELECT signature_id FROM blockchain_signatures WHERE blockchain_tx_id = $1 LIMIT 1`,
          [params.txId]
        );
        if (existing) {
          logger.info(`[PaymentService] Chain signature already recorded for tx ${params.txId} (${params.chaincodeFunction}) — skipping duplicate`);
          return;
        }
      }
      const signatureId = `SIG-${Date.now()}-${require('crypto').randomBytes(8).toString('hex')}`;
      await this.dbService.run(
        `INSERT INTO blockchain_signatures (
          signature_id, blockchain_tx_id, entity_type, entity_id,
          chaincode_function, signer_org, signer_username,
          blockchain_timestamp, action_type, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, NOW())
        ON CONFLICT (signature_id) DO NOTHING`,
        [
          signatureId,
          params.txId || null,
          'PAYMENT',
          params.paymentID,
          params.chaincodeFunction,
          params.signerOrg,
          params.signerUsername,
          params.actionType,
        ]
      );
    } catch (sigErr: any) {
      logger.warn(`[PaymentService] Failed to store chain signature for ${params.paymentID} (${params.chaincodeFunction}): ${sigErr?.message}`);
    }
  }

  /**
   * Leftover 2: the settle route's SettlePayment call never left a
   * blockchain_signatures row, unlike release/convert, which record
   * theirs in-service. Public so the route can record it with the
   * route's own signer; same BanksMSP / PAYMENT_SETTLEMENT convention
   * releasePayment uses for its SettlePayment row. Best-effort
   * (recordChainSignature catches internally) and deduped by txId,
   * so a release that re-records the same settle tx cannot double it.
   */
  async recordSettleSignature(params: {
    paymentID: string;
    txId: string | null;
    signerUsername: string;
  }): Promise<void> {
    if (!params.txId) return;
    await this.recordChainSignature({
      paymentID: params.paymentID,
      txId: params.txId,
      chaincodeFunction: 'SettlePayment',
      signerOrg: 'BanksMSP',
      signerUsername: params.signerUsername,
      actionType: 'PAYMENT_SETTLEMENT',
    });
  }

  /**
   * Release 60% to exporter - Bank releases non-retained portion
   * @workflow Retention Converted → 60% Released to Exporter
   */
  async releasePayment(releaseData: {
    paymentID: string;
    exporterAccount: string;
    releasedBy: string;
    releaseRef: string;
    releaseDate: string;
    userId: string;
    userOrg: string;
  }) {
    try {
      logger.info(`[PaymentService] Releasing payment to exporter: ${releaseData.paymentID}`);

      // Ledger-first resolution (see resolvePayment): a payment with no
      // PG row but a ledger record releases instead of 404'ing. The
      // on-chain status read below still gates the release.
      const payment = await this.resolvePayment(releaseData.paymentID);

      if (!payment) {
        throw new Error(`Payment not found: ${releaseData.paymentID}`);
      }

      if (payment.retention_status === 'RELEASED') {
        throw new Error(`Payment already released: ${releaseData.paymentID}`);
      }

      // F1: SettlePayment (chaincode payment.go) accepts VERIFIED and
      // SWIFT_RECEIVED only — calling it for an already-SETTLED payment
      // is rejected on-chain, which is why the NBE 60% release failed.
      // Read the on-chain status first and settle ONLY when the payment
      // is still settleable; when it is already settled (or beyond),
      // skip the chain call and go straight to the PG release update
      // below. Any other status is refused here without invoking the
      // chain (the chaincode would reject it the same way).
      const onChain = await this.fabricService.queryChaincode('ReadPayment', [releaseData.paymentID]);
      if (!onChain.success || !onChain.data) {
        throw new Error(`Cannot release payment ${releaseData.paymentID}: could not read its on-chain status (${onChain.error || 'payment not found on ledger'})`);
      }
      const onChainStatus = onChain.data.status || onChain.data.Status || '';
      const alreadySettled = ['SETTLED', 'CONFIRMED', 'DOCUMENTS_RELEASED', 'COMPLETED'].includes(onChainStatus);
      const settleable = ['VERIFIED', 'SWIFT_RECEIVED'].includes(onChainStatus);
      if (!alreadySettled && !settleable) {
        throw new Error(`Cannot release payment ${releaseData.paymentID}: on-chain status is ${onChainStatus || 'unknown'} — only VERIFIED or SWIFT_RECEIVED payments can be settled`);
      }

      // The PG guard above misses a released+converted payment: convert
      // overwrites PG retention_status to 'RETENTION_CONVERTED', so the
      // chaincode was the backstop and the rejection came back as a raw
      // 6-peer error dump. The ledger flag is the source of truth, and
      // it is already fetched above, so no extra read: a converted-but-
      // not-released payment (retentionReleased false) still falls
      // through and releases normally.
      if (onChain.data.retentionReleased === true) {
        throw new Error(`Payment already released: ${releaseData.paymentID}`);
      }

      // Connect as Banks MSP
      await this.fabricService.connectAsOrg('BanksMSP');

      // Submit settlement to blockchain using SettlePayment, via the
      // canonical helper (§17 #14) — same 7 args the settle route uses.
      // settleOnChain returns the raw result (unlike submitTransaction,
      // it does not throw), so a rejection is turned into an error here
      // to preserve the old throw-on-failure behaviour. Skipped entirely
      // when the payment is already settled on-chain (F1 above).
      // The exchange rate is the LIVE NBE mid-rate from the ledger
      // (QueryExchangeRate via ExchangeRateService — the same reader
      // payments.ts GET / uses), NOT a hardcoded constant: the old
      // '120.5' was a stale hardcode. NOTE: no allocate path reads the
      // ledger rate to follow — banking.ts allocate-forex and
      // forexService.allocateForex both take the rate from the caller —
      // so the ledger reader is ExchangeRateService.getCurrentRate.
      // It throws when no active rate is recorded: fail honestly rather
      // than settle at a fabricated rate.
      // N6: the 60% release amount. recordPayment stores release_amount
      // (60% of amount_usd) at initiation; derive it from the same NBE
      // 40/60 rule only when the stored value is missing, and fail
      // honestly when neither is available — RecordRetentionRelease
      // rejects an unparseable amount on-chain.
      const releaseAmount = payment.release_amount != null
        ? Number(payment.release_amount)
        : (payment.amount_usd != null ? Number(payment.amount_usd) * 0.6 : NaN);
      if (!Number.isFinite(releaseAmount) || releaseAmount <= 0) {
        throw new Error(`Cannot release payment ${releaseData.paymentID}: no 60% release amount on record (release_amount is ${payment.release_amount ?? 'null'})`);
      }

      // N7: keep each chain txId separately — the settleable path now
      // makes TWO chain calls (SettlePayment, then the retention
      // release), and the response must carry the txId that proves the
      // release. blockchainTxId below is the retention-release tx.
      let settleTxId: string | null = null;
      let releaseTxId: string | null = null;
      if (settleable) {
        const liveRate = await this.exchangeRateService.getCurrentRate(payment.currency || 'USD');
        const blockchainResult = await this.settleOnChain({
          paymentID: releaseData.paymentID,
          exchangeRate: liveRate.toString(),
          retentionRate: '40',     // NBE retention rate (40%)
          payingBank: 'Commercial Bank of Ethiopia',
          payingBankBIC: 'CBETETAA',
          swiftReference: releaseData.releaseRef,
          nbeApprovalRef: `NBE-APPROVAL-${releaseData.paymentID}`,
        });
        if (!blockchainResult.success) {
          throw new Error(blockchainResult.error || 'Fabric rejected transaction SettlePayment');
        }
        settleTxId = typeof blockchainResult === 'string' ? JSON.parse(blockchainResult).transactionId : blockchainResult.txId || null;
        // N6: SettlePayment settles on-chain but never sets
        // retentionReleased — only RecordRetentionRelease does
        // (chaincode payment.go). The settleable path used to stop
        // here, so the ledger kept retentionReleased=false while PG
        // said RELEASED. SettlePayment leaves the payment SETTLED,
        // which is exactly the state RecordRetentionRelease accepts,
        // so record the release on-chain right after settling — the
        // same call the already-settled path below makes. A failure
        // here fails honestly (N5: no PG-only fallback).
        releaseTxId = await this.recordRetentionReleaseOnChain({
          paymentID: releaseData.paymentID,
          releaseAmount,
          releasedBy: releaseData.releasedBy,
          releaseRef: releaseData.releaseRef,
          releaseDate: releaseData.releaseDate,
        });
      } else {
        // LEG3 F4: the old code skipped the chain call entirely for an
        // already-settled payment, so the 60% release left no ledger
        // record at all. RecordRetentionRelease (chaincode payment.go,
        // seq 11, live — verified: committed sequence 11, all 6 MSPs
        // approved) writes the release onto the payment WITHOUT
        // changing Status — same no-status-change precedent as
        // ConvertRetention. The release is an NBE action, so it is
        // signed as NBEMSP (the settleable path above stays BanksMSP
        // for SettlePayment). The transitional PG-only fallback that
        // degraded a missing-function failure is REMOVED (N5): seq 11
        // is live and both release paths were re-probed writing
        // on-chain, so a RecordRetentionRelease failure is now a real
        // failure and fails honestly, like SettlePayment above.
        // N6: same helper the settleable path uses, so both paths leave
        // the identical ledger record.
        releaseTxId = await this.recordRetentionReleaseOnChain({
          paymentID: releaseData.paymentID,
          releaseAmount,
          releasedBy: releaseData.releasedBy,
          releaseRef: releaseData.releaseRef,
          releaseDate: releaseData.releaseDate,
        });
      }
      const blockchainTxId = releaseTxId;

      // N7 (F11 pattern): signature rows for the chain call(s) so the
      // signer and tx are findable without a block scan. Best-effort:
      // the ledger writes already committed.
      if (settleTxId) {
        await this.recordChainSignature({
          paymentID: releaseData.paymentID,
          txId: settleTxId,
          chaincodeFunction: 'SettlePayment',
          signerOrg: 'BanksMSP',
          signerUsername: releaseData.releasedBy,
          actionType: 'PAYMENT_SETTLEMENT',
        });
      }
      if (releaseTxId) {
        await this.recordChainSignature({
          paymentID: releaseData.paymentID,
          txId: releaseTxId,
          chaincodeFunction: 'RecordRetentionRelease',
          signerOrg: 'NBEMSP',
          signerUsername: releaseData.releasedBy,
          actionType: 'RETENTION_RELEASE',
        });
      }

      // Update database — SettlePayment settles the payment on-chain, so
      // status becomes SETTLED (settlement machine) and the retention
      // machine advances to RELEASED. The old code wrote status
      // 'RELEASED', which both hid the settlement and failed the
      // settlement CHECK once the machines split (§17 #8).
      await this.dbService.run(
        `UPDATE payments 
         SET status = $1, retention_status = $2
         WHERE payment_id = $3`,
        [
          'SETTLED',
          'RELEASED',
          releaseData.paymentID
        ]
      );

      // The payment just left the pending-release set: drop the cached
      // full payment list behind GET /payments/pending-release so the
      // tab stops listing it immediately (the 30s TTL is the backstop).
      CacheInvalidation.paymentsAll();

      // The contract status is NOT advanced here: 'PAYMENT_RECEIVED'
      // was never a CONTRACT state, so PAYMENT_RECEIVED → COMPLETED
      // validated nothing and updated nothing. The contract reaches
      // COMPLETED via CompleteContract (contracts close route), not via
      // payment release. Removed with the fail-closed validator
      // (TEST-STATUS-MATRIX §17 #12).

      // Audit log
      await this.auditService.log({
        entityType: 'PAYMENT',
        entityId: releaseData.paymentID,
        action: 'RELEASE',
        performedBy: releaseData.userId,
        organization: releaseData.userOrg,
        performedByOrg: releaseData.userOrg,
        newValue: 'SETTLED',
        // Shared audit contract: top-level operation txId — the
        // retention-release tx (metadata already carries it, plus the
        // settle tx separately as settleTxId).
        blockchainTxId: blockchainTxId ?? undefined,
        metadata: {
          status: 'SETTLED',
          retentionStatus: 'RELEASED',
          releaseAmount: releaseAmount,
          exporterAccount: releaseData.exporterAccount,
          blockchainTxId: blockchainTxId,
          settleTxId: settleTxId,
          retentionReleaseTxId: releaseTxId
        }
      });

      logger.info(`[PaymentService] ✅ Payment released: ${releaseAmount} USD to exporter account ${releaseData.exporterAccount}`);

      // N7: return the chain txId(s) — the release response used to
      // carry none, so the chain tx had to be recovered via a block
      // scan. txId/blockchainTxId is the retention-release tx (the
      // record that proves the release); settleTxId is the settle tx
      // on the settleable path (null when already settled).
      return {
        success: true,
        paymentID: releaseData.paymentID,
        status: 'SETTLED',
        retentionStatus: 'RELEASED',
        releaseAmount: releaseAmount,
        totalAmount: payment.amount_usd,
        retentionAmount: payment.retention_amount,
        txId: blockchainTxId,
        blockchainTxId: blockchainTxId,
        settleTxId: settleTxId,
        retentionReleaseTxId: releaseTxId
      };

    } catch (error) {
      logger.error(`[PaymentService] Failed to release payment:`, error);
      throw error;
    }
  }

  /**
   * Get payment by ID
   */
  async getPayment(paymentID: string) {
    try {
      // Try database first
      const dbPayment = await this.dbService.get(
        'SELECT * FROM payments WHERE payment_id = $1',
        [paymentID]
      );

      if (dbPayment) {
        return dbPayment;
      }

      // Fallback to blockchain
      await this.fabricService.connectAsOrg('BanksMSP');
      const blockchainResult = await this.fabricService.queryChaincode(
        'ReadPayment',
        [paymentID]
      );

      return blockchainResult;

    } catch (error) {
      logger.error(`[PaymentService] Failed to get payment:`, error);
      throw error;
    }
  }

  /**
   * Get payments by contract
   */
  async getPaymentsByContract(contractID: string) {
    try {
      const payments = await this.dbService.all(
        'SELECT * FROM payments WHERE contract_id = $1 ORDER BY created_at DESC',
        [contractID]
      );

      return payments;

    } catch (error) {
      logger.error(`[PaymentService] Failed to get payments for contract:`, error);
      throw error;
    }
  }

  /**
   * Get payments by exporter
   */
  async getPaymentsByExporter(exporterID: string) {
    try {
      const payments = await this.dbService.all(
        'SELECT * FROM payments WHERE exporter_id = $1 ORDER BY created_at DESC',
        [exporterID]
      );

      return payments;

    } catch (error) {
      logger.error(`[PaymentService] Failed to get payments for exporter:`, error);
      throw error;
    }
  }

  /**
   * Get payment statistics for exporter (with retention breakdown)
   */
  async getPaymentStats(exporterID: string) {
    try {
      const payments = await this.getPaymentsByExporter(exporterID);

      const stats = {
        totalPayments: payments.length,
        totalAmountUSD: payments.reduce((sum, p) => sum + (p.amount_usd || 0), 0),
        totalRetentionUSD: payments.reduce((sum, p) => sum + (p.retention_amount || 0), 0),
        totalReleaseUSD: payments.reduce((sum, p) => sum + (p.release_amount || 0), 0),
        totalBirrReceived: payments.reduce((sum, p) => sum + (p.amount_birr || 0), 0),
        retentionRate: NBE_RETENTION_RATE,
        statusBreakdown: {
          received: payments.filter(p => p.retention_status === 'RECEIVED').length,
          retentionConverted: payments.filter(p => p.retention_status === 'RETENTION_CONVERTED').length,
          released: payments.filter(p => p.retention_status === 'RELEASED').length,
        },
        payments: payments
      };

      return stats;

    } catch (error) {
      logger.error(`[PaymentService] Failed to get payment stats:`, error);
      throw error;
    }
  }

  /**
   * Get all payments with optional filters
   */
  async getAllPayments(filters?: {
    exporterID?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
  }) {
    try {
      let query = 'SELECT * FROM payments WHERE 1=1';
      const params: any[] = [];
      let paramCount = 1;

      if (filters?.exporterID) {
        query += ` AND exporter_id = $${paramCount}`;
        params.push(filters.exporterID);
        paramCount++;
      }

      if (filters?.status) {
        query += ` AND status = $${paramCount}`;
        params.push(filters.status);
        paramCount++;
      }

      if (filters?.fromDate) {
        query += ` AND created_at >= $${paramCount}`;
        params.push(filters.fromDate);
        paramCount++;
      }

      if (filters?.toDate) {
        query += ` AND created_at <= $${paramCount}`;
        params.push(filters.toDate);
        paramCount++;
      }

      query += ' ORDER BY created_at DESC';

      const payments = await this.dbService.all(query, params);
      return payments;

    } catch (error) {
      logger.error(`[PaymentService] Failed to get all payments:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export const paymentService = PaymentService.getInstance();
