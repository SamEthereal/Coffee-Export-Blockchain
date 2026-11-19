/**
 * LC Document Validation Service
 * Validates document compliance for LC approval, issuance, and payment release
 * Based on UCP 600 standards
 */

import { DatabaseService } from './databaseService';
import {
  getRequiredDocuments,
  validateDocumentsForStage,
  LCDocumentRequirement,
} from '../config/lcDocumentRequirements';
import logger from '../utils/logger';

export class LCDocumentValidationService {
  private dbService: DatabaseService;

  constructor() {
    this.dbService = DatabaseService.getInstance();
  }

  /**
   * Check if LC can be approved based on available documents
   */
  async canApproveLCRequest(lcId: string, contractId: string): Promise<{
    canApprove: boolean;
    reason?: string;
    missingDocuments: string[];
    availableDocuments: { type: string; id: string; name: string }[];
    validationDetails: any;
  }> {
    try {
      logger.info(`[LC_VALIDATION] Checking approval eligibility for LC ${lcId}`);

      // Get all documents for this contract (include both 'active' and 'approved')
      const documents = await this.dbService.all(
        `SELECT document_id, document_type, file_name, status, verification_status
         FROM documents
         WHERE entity_type = 'CONTRACT' 
           AND entity_id = $1 
           AND status IN ('active', 'approved')`,
        [contractId]
      );

      const availableDocTypes = documents.map((d: any) => d.document_type);
      const availableDocuments = documents.map((d: any) => ({
        type: d.document_type,
        id: d.document_id,
        name: d.file_name,
        verified: d.verification_status === 'verified',
      }));

      // Validate against APPROVAL stage requirements
      const validation = validateDocumentsForStage('APPROVAL', availableDocTypes);

      const requiredDocs = getRequiredDocuments('APPROVAL');
      const missingDocsDetails = requiredDocs
        .filter(req => req.required && validation.missingRequired.includes(req.documentType))
        .map(doc => ({
          type: doc.documentType,
          description: doc.description,
          category: doc.category,
        }));

      let reason = '';
      if (!validation.isValid) {
        reason = `Missing ${validation.missingRequired.length} required document(s): ${validation.missingRequired.join(', ')}`;
      }

      // Check contract approval
      const contract = await this.dbService.get(
        'SELECT status FROM contracts WHERE contract_id = $1',
        [contractId]
      );

      if (!contract || contract.status !== 'APPROVED') {
        return {
          canApprove: false,
          reason: 'Contract must be APPROVED by ECTA before LC can be approved',
          missingDocuments: [],
          availableDocuments,
          validationDetails: { contractStatus: contract?.status || 'NOT_FOUND' },
        };
      }

      return {
        canApprove: validation.isValid,
        reason,
        missingDocuments: validation.missingRequired,
        availableDocuments,
        validationDetails: {
          requiredCount: requiredDocs.filter(d => d.required).length,
          availableCount: availableDocTypes.length,
          missingDetails: missingDocsDetails,
          contractStatus: contract.status,
        },
      };
    } catch (error: any) {
      logger.error('[LC_VALIDATION] Error checking approval eligibility:', error);
      throw error;
    }
  }

  /**
   * Check if LC can be issued based on compliance requirements
   */
  async canIssueLCRequest(lcId: string, contractId: string, exporterId: string, allowedStatuses: string[] = ['APPROVED']): Promise<{
    canIssue: boolean;
    reason?: string;
    missingRequirements: string[];
    validationDetails: any;
  }> {
    try {
      logger.info(`[LC_VALIDATION] Checking issuance eligibility for LC ${lcId}`);

      const missingRequirements: string[] = [];
      const validationDetails: any = {};

      // 1. Check exporter license status
      const exporter = await this.dbService.get(
        'SELECT license_status FROM exporters WHERE exporter_id = $1',
        [exporterId]
      );

      if (!exporter) {
        const application = await this.dbService.get(
          'SELECT status FROM exporter_applications WHERE exporter_id = $1',
          [exporterId]
        );
        if (!application || application.status.toUpperCase() !== 'APPROVED') {
          missingRequirements.push('Valid exporter license (application not approved)');
          validationDetails.exporterLicenseStatus = application?.status || 'NOT_FOUND';
        } else {
          validationDetails.exporterLicenseStatus = 'APPROVED';
        }
      } else if (exporter.license_status !== 'ACTIVE') {
        missingRequirements.push(`Exporter license must be ACTIVE (current: ${exporter.license_status})`);
        validationDetails.exporterLicenseStatus = exporter.license_status;
      } else {
        validationDetails.exporterLicenseStatus = 'ACTIVE';
      }

      // 2. Check contract approval
      const contract = await this.dbService.get(
        'SELECT status FROM contracts WHERE contract_id = $1',
        [contractId]
      );

      if (!contract || contract.status !== 'APPROVED') {
        missingRequirements.push('Contract must be APPROVED by ECTA');
        validationDetails.contractStatus = contract?.status || 'NOT_FOUND';
      } else {
        validationDetails.contractStatus = 'APPROVED';
      }

      // 3. Check APPROVAL stage documents
      const approvalCheck = await this.canApproveLCRequest(lcId, contractId);
      if (!approvalCheck.canApprove) {
        missingRequirements.push(...approvalCheck.missingDocuments.map(doc => `Required document: ${doc}`));
        validationDetails.approvalDocuments = approvalCheck.validationDetails;
      }

      // 4. Check LC status
      const lc = await this.dbService.get(
        'SELECT status FROM letters_of_credit WHERE lc_id = $1',
        [lcId]
      );

      if (!lc) {
        return {
          canIssue: false,
          reason: 'LC not found',
          missingRequirements: ['LC must exist in the system'],
          validationDetails,
        };
      }

      // 4. Check LC status — APPROVED for a first issue; an AMENDED LC is
      // also issuable (F1 re-issue: the caller passes ['APPROVED',
      // 'AMENDED']). The default is unchanged, so the document-checklist
      // endpoint that calls this without the argument keeps its old gate.
      if (!allowedStatuses.includes(lc.status)) {
        return {
          canIssue: false,
          reason: `LC must be in ${allowedStatuses.join(' or ')} status before issuance (current: ${lc.status})`,
          missingRequirements: [`LC approval required (current status: ${lc.status})`],
          validationDetails,
        };
      }

      validationDetails.lcStatus = lc.status;

      const canIssue = missingRequirements.length === 0;
      let reason = '';
      if (!canIssue) {
        reason = `Cannot issue LC: ${missingRequirements.length} requirement(s) not met`;
      }

      return {
        canIssue,
        reason,
        missingRequirements,
        validationDetails,
      };
    } catch (error: any) {
      logger.error('[LC_VALIDATION] Error checking issuance eligibility:', error);
      throw error;
    }
  }

  /**
   * Get document checklist for LC stage
   */
  async getDocumentChecklist(
    stage: 'APPROVAL' | 'ISSUANCE' | 'PAYMENT_RELEASE',
    contractId: string,
    exporterId?: string,
    lcId?: string
  ): Promise<{
    stage: string;
    requirements: Array<{
      documentType: string;
      required: boolean;
      description: string;
      category: string;
      status: 'AVAILABLE' | 'MISSING' | 'OPTIONAL';
      documentId?: string;
      fileName?: string;
    }>;
  }> {
    try {
      const requiredDocs = getRequiredDocuments(stage);

      // Get available documents (include both 'active' and 'approved' status)
      const documents = await this.dbService.all(
        `SELECT document_id, document_type, file_name
         FROM documents
         WHERE entity_type = 'CONTRACT' 
           AND entity_id = $1 
           AND status IN ('active', 'approved')`,
        [contractId]
      );

      const documentMap = new Map(
        documents.map((d: any) => [d.document_type, { id: d.document_id, name: d.file_name }])
      );

      // For ISSUANCE stage, check system statuses
      const systemChecks = new Map<string, boolean>();
      if (stage === 'ISSUANCE' && exporterId) {
        // Check exporter license
        const exporter = await this.dbService.get(
          'SELECT license_status FROM exporters WHERE exporter_id = $1',
          [exporterId]
        );
        if (!exporter) {
          // Fallback to exporter_applications
          const application = await this.dbService.get(
            "SELECT status FROM exporter_applications WHERE exporter_id = $1",
            [exporterId]
          );
          systemChecks.set('EXPORTER_LICENSE', application && application.status.toUpperCase() === 'APPROVED');
        } else {
          systemChecks.set('EXPORTER_LICENSE', exporter.license_status === 'ACTIVE');
        }

        // Check contract approval
        const contract = await this.dbService.get(
          'SELECT status FROM contracts WHERE contract_id = $1',
          [contractId]
        );
        systemChecks.set('CONTRACT_APPROVAL', contract?.status === 'APPROVED');

        // Check forex allocation (optional)
        if (lcId) {
          const forex = await this.dbService.get(
            `SELECT status FROM forex_allocations 
             WHERE contract_id = $1 AND status IN ('ALLOCATED', 'PARTIALLY_UTILIZED', 'UTILIZED')`,
            [contractId]
          );
          systemChecks.set('FOREX_ALLOCATION', !!forex);
        }
      }

      const requirements = requiredDocs.map(req => {
        // Check if this is a system requirement (ISSUANCE stage)
        if (systemChecks.has(req.documentType)) {
          const available = systemChecks.get(req.documentType);
          const status: 'AVAILABLE' | 'MISSING' | 'OPTIONAL' = available
            ? 'AVAILABLE'
            : req.required
            ? 'MISSING'
            : 'OPTIONAL';
          return {
            documentType: req.documentType,
            required: req.required,
            description: req.description,
            category: req.category,
            status,
            documentId: undefined,
            fileName: available ? '✓ System Verified' : undefined,
          };
        }

        // Regular document check
        const available = documentMap.get(req.documentType);
        const status: 'AVAILABLE' | 'MISSING' | 'OPTIONAL' = available
          ? 'AVAILABLE'
          : req.required
          ? 'MISSING'
          : 'OPTIONAL';
        return {
          documentType: req.documentType,
          required: req.required,
          description: req.description,
          category: req.category,
          status,
          documentId: available?.id,
          fileName: available?.name,
        };
      });

      return {
        stage,
        requirements,
      };
    } catch (error: any) {
      logger.error('[LC_VALIDATION] Error getting document checklist:', error);
      throw error;
    }
  }
}

export const lcDocumentValidationService = new LCDocumentValidationService();
