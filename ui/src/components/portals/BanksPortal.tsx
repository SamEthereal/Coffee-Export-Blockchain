// Ethiopian Coffee Export Consortium Blockchain System (CECBS)
// Banks Portal - Letter of Credit, Forex & Export Permit Management

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  MenuItem,
  InputAdornment,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Stepper,
  Step,
  StepLabel,
  Divider,
  Checkbox,
  ThemeProvider,
  createTheme,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
  Badge,
  TablePagination,
} from '@mui/material';
import { 
  ExpandMore,
  Visibility as VisibilityIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import { createOrganizationTheme } from '@/theme/organizationThemes';
import { apiFetch, API_BASE_URL, API_ENDPOINTS, getAuthHeaders } from '@/config/api.config';
import api from '@/utils/api';
import { resolvePortalTabIndex } from '@/utils/portalTabNames';
import { usePortalLiveRefresh, type LiveNotificationRow } from '@/utils/useLiveNotifications';
import { validateBIC } from '@/utils/fieldValidation';
import { couchDBService } from '@/services/couchdbService';
import {
  AccountBalance,
  CurrencyExchange,
  Assignment,
  Visibility,
  CheckCircle,
  Payment,
  Description,
  TrendingUp,
  Warning,
  AttachMoney,
  AccessTime,
  Comment as CommentIcon,
  CloudUpload,
  DirectionsBoat,
  FlightTakeoff,
  LocalShipping,
  Edit,
  Cancel,
  Close,
  Message as MessageOutlined,
  Send as SendOutlined,
  Assessment,
  Security,
  Timeline,
  VerifiedUser,
  Verified,
  Error,
} from '@mui/icons-material';
import AuditTrailViewer from './AuditTrailViewer';
import DocumentVerificationPanel from './DocumentVerificationPanel';
import { DocumentUploadDialog } from './DocumentUploadDialog';
import { DocumentValidationDialog } from './DocumentValidationDialog';
import ForexAllocationDialog from './ForexAllocationDialog';
import SwiftComposeDialog from './SwiftComposeDialog';

// Modern Components
import {
  AnimatedButton,
  DashboardKPI,
  StatusChip,
} from '@/components/modern';
import {
  PortalShell,
  PortalTabBar,
  PortalCard,
  PortalKpiCard,
  PrimaryButton,
  SecondaryButton,
  DangerButton,
  GhostButton,
  PortalDialog,
  PortalField,
  getPortalBrand,
} from '@/components/shared/portal';
import { PaymentDocuments } from './PaymentDocuments';
import { PaymentMethodForms } from './PaymentMethodForms';
import { NotificationDialog } from '@/components/common/NotificationDialog';

// Blockchain Components
import BlockchainBadge from '@/components/blockchain/BlockchainBadge';
import { BlockchainStatusIcon, BlockchainTxChip } from '@/components/blockchain';

import { useNotification } from '@/hooks/useNotification';
import { extractTxId } from '@/utils/txId';
import { UnifiedPaymentWorkflow } from './UnifiedPaymentWorkflow';
import { useAuth } from '@/contexts/AuthContext';
import AnalyticsDashboard from '@/components/analytics/AnalyticsDashboard';
import { DocumentManagementPanel } from '@/components/documents';
import BlockchainSignatureVerification from '@/components/documents/BlockchainSignatureVerification';
import BusinessActivityTimeline from '@/components/documents/BusinessActivityTimeline';
import ExporterHistoricalTrend from '@/components/shared/ExporterHistoricalTrend';
import PostDeliveryWorkflowPanel from '../shared/PostDeliveryWorkflowPanel';

// NEW: HIGH Priority Features UI Components
import { RepatriationInitiationDialog, RepatriationRecordingDialog } from '@/components/repatriation';
import { LCDiscrepancyTab } from '@/components/lcdiscrepancy';

interface SalesContract {
  contractId: string;
  nbeReferenceNumber?: string;
  exporterId: string;
  buyerId?: string;        // Buyer ID
  buyerName: string;
  buyerCountry: string;
  buyerBank?: string;      // Issuing bank (buyer's bank)
  exporterBank?: string;   // Advising bank (exporter's bank)
  coffeeType: string;
  quantity: number;
  pricePerKg: number;
  totalValue: number;
  currency: string;
  status: string;
  registrationDate: string;
  approvalDate?: string;
  txId?: string;  // Blockchain transaction ID
  blockchainVerified?: boolean;  // Blockchain verification status
}

interface LetterOfCredit {
  lcId: string;
  contractId: string;
  exporterId: string;
  buyerId?: string;
  buyerName?: string;
  buyerCountry?: string;
  bankName: string;
  issuingBank: string;
  advisingBank: string;
  swiftReference?: string;
  lcNumber?: string;
  applicant?: string;
  beneficiary?: string;
  txId?: string;  // Blockchain transaction ID
  blockchainVerified?: boolean;  // Blockchain verification status
  amount: number;
  currency: string;
  transportMode?: 'SEA' | 'AIR';
  portOfLoading?: string;
  portOfDischarge?: string;
  latestShipmentDate?: string;
  status: string;
  expiryDate: string;
  requestDate: string;
  issueDate?: string;
  approvalDate?: string;
  advisingDate?: string;
  confirmationStatus?: 'CONFIRMED' | 'UNCONFIRMED';
  paymentTerms?: string;
  terms?: string;
  
  // ✅ Documents attached to LC
  documents?: any[];
  
  // ✅ Related shipments for this LC's contract
  relatedShipments?: any[];
  
  // ✅ Actor tracking fields (WHO performed actions)
  approvedBy?: string;
  approvedByMsp?: string;
  issuedBy?: string;
  issuedByMsp?: string;
  lastUpdatedBy?: string;
  lastUpdatedByMsp?: string;
}

interface ForexAllocation {
  forexId: string;
  contractId: string;
  exporterId: string;
  lcId: string;
  buyerName?: string; // ✅ Added for buyer enrichment
  BuyerName?: string; // ✅ Alternative field name
  buyerCountry?: string; // ✅ Added for buyer country
  requestedAmount: number;
  allocatedAmount: number;
  currency: string;
  exchangeRate: number;
  retentionRate: number;
  status: string;
  expiryDate: string | null;
  isDraft?: boolean;
}

// Use the organization theme for BANKS (purple/golden/black/white)
const banksTheme = createOrganizationTheme('BANKS');

// CBE Color Palette - Commercial Bank of Ethiopia
const CBE_COLORS = {
  purple: getPortalBrand('BANKS').primary,
  golden: '#FFD700',
  black: '#000000',
  white: '#ffffff',
};

// B8/D3 (2026-11-18, merge fix): GET /documents/entity/* returns raw PG
// rows in snake_case (document_id, entity_type, verification_status,
// status='active', …) with no normalisation, while every consumer in this
// portal — the examination dialog's grouping, verification chips, Verify
// buttons and the "Mark LC as Compliant" gate — reads camelCase
// (documentId, entityType, verificationStatus, …). Merging a raw row
// therefore (a) made the gate evaluate the row's lifecycle status
// ('active') as its verification status, so `every()` was false forever
// and the Compliant button could never appear, (b) left the row invisible
// in both dialog groups (they filter on entityType), and (c) collapsed
// the dedupe (`d.documentId === doc.documentId`, both undefined) so N raw
// rows became one invisible row. Normalise at every /documents/entity/*
// merge site so a merged row is indistinguishable from the camelCase rows
// GET /banking/lc/:id already returns (same field names and defaults).
// `status` is deliberately kept as the row's lifecycle status ('active');
// `verificationStatus` is always populated (default 'pending') so the
// gate never falls through to `status` and reads 'active' as a verdict.
const normalizeEntityDocument = (doc: any): any => {
  if (!doc || typeof doc !== 'object') return doc;
  const verificationStatus =
    doc.verification_status ?? doc.verificationStatus ??
    (doc.verified === true ? 'verified' : undefined) ?? 'pending';
  return {
    ...doc,
    documentId: doc.document_id ?? doc.documentId ?? doc.id ?? '',
    documentType: doc.document_type ?? doc.documentType ?? doc.type ?? '',
    documentName: doc.document_name ?? doc.documentName ?? doc.name ?? '',
    fileName: doc.file_name ?? doc.fileName ?? doc.filename ?? '',
    filePath: doc.file_path ?? doc.filePath ?? '',
    fileHash: doc.file_hash ?? doc.fileHash ?? '',
    mimeType: doc.mime_type ?? doc.mimeType ?? '',
    fileSize: doc.file_size ?? doc.fileSize ?? doc.size ?? null,
    uploadedBy: doc.uploaded_by ?? doc.uploadedBy ?? '',
    uploadedAt: doc.uploaded_at ?? doc.uploadedAt ?? null,
    status: doc.status ?? 'pending',
    verificationStatus,
    verified: doc.verified ?? verificationStatus === 'verified',
    verificationNotes: doc.verification_notes ?? doc.verificationNotes ?? '',
    verifiedAt: doc.verified_at ?? doc.verifiedAt ?? null,
    verifiedBy: doc.verified_by ?? doc.verifiedBy ?? '',
    entityType: doc.entity_type ?? doc.entityType ?? '',
    entityId: doc.entity_id ?? doc.entityId ?? '',
    contractId: doc.contract_id ?? doc.contractId ?? '',
    shipmentId: doc.shipment_id ?? doc.shipmentId ?? '',
  };
};

// Merge raw /documents/entity/* rows into an LC's existing documents:
// normalise each row, then drop any row whose documentId is already
// present (GET /banking/lc/:id already returns the SHIPMENT/CONTRACT rows,
// so a blind append duplicates them and the gate counts them twice).
// Rows with no usable id are keyed by type+file so they can still dedupe
// instead of collapsing on `undefined === undefined`.
const mergeEntityDocuments = (existing: any[], rawRows: any[]): any[] => {
  const merged = [...(existing || [])];
  const seen = new Set(
    merged.map((d: any) => d?.documentId || `${d?.documentType || ''}|${d?.fileName || ''}`),
  );
  for (const raw of rawRows || []) {
    const doc = normalizeEntityDocument(raw);
    const key = doc.documentId || `${doc.documentType}|${doc.fileName}`;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    merged.push(doc);
  }
  return merged;
};

/**
 * Live-refresh relevance (2026-11-19): notification types whose
 * payload feeds a Banks list. Covers the DIAGNOSIS §5.3 map plus the
 * emit gaps closed in the same round (lc_approved / lc_examined /
 * lc_rejected / lc_amended, swift_approved / swift_sent /
 * swift_processed / swift_settled / swift_rejected /
 * swift_nbe_approved, forex_requested / forex_utilised,
 * payment_released — now also addressed to BANKS).
 */
const BANKS_LIVE_TYPES = new Set([
  'lc_issued', 'lc_approved', 'lc_rejected', 'lc_amended', 'lc_examined', 'lc_documents_rejected',
  'contract_approved',
  'forex_allocated', 'forex_requested', 'forex_utilised',
  'swift_message_created', 'swift_received', 'swift_approved', 'swift_nbe_approved',
  'swift_sent', 'swift_processed', 'swift_settled', 'swift_rejected',
  'payment_received', 'payment_settled', 'payment_released',
  'shipment_delivered', 'customs_cleared', 'permit_issued',
  'repatriation_recorded',
]);

const BanksPortal: React.FC = () => {
  // 🔇 Logging Control - Set to true to enable verbose logs
  const DEV_LOGGING = true;
  const devLog = (...args: any[]) => {
    if (DEV_LOGGING) console.log(...args);
  };

  const { user } = useAuth();
  const { notification, showSuccess, showError, showWarning, showInfo, closeNotification } = useNotification();
  const [activeTab, setActiveTab] = useState(0);
  const [activeParentTab, setActiveParentTab] = useState(0); // NEW: For parent tab navigation
  const [activeChildTab, setActiveChildTab] = useState(0);   // NEW: For child tab navigation within parent
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('LC');
  const [contracts, setContracts] = useState<SalesContract[]>([]);
  const [lcDetailsLoading, setLcDetailsLoading] = useState(false); // ✅ Loading state for LC details
  const [letterOfCredits, setLetterOfCredits] = useState<LetterOfCredit[]>([]);
  const [forexAllocations, setForexAllocations] = useState<ForexAllocation[]>([]);
  const persistedForexAllocations = forexAllocations.filter((forex) => !forex.isDraft);
  const [exportPermits, setExportPermits] = useState<any[]>([]);
  // F26: analytics summary (GET /analytics/dashboard) — the Analytics
  // tab KPI is computed from this; null until loaded.
  const [analyticsSummary, setAnalyticsSummary] = useState<any | null>(null);
  const [deliveredShipments, setDeliveredShipments] = useState<any[]>([]);
  const [documentaryCollections, setDocumentaryCollections] = useState<any[]>([]);
  const [advancePayments, setAdvancePayments] = useState<any[]>([]);
  const [consignments, setConsignments] = useState<any[]>([]);
  const [pendingDocuments, setPendingDocuments] = useState<any[]>([]);
  // Raw payment records (GET /payments) — the Payments table below opens the
  // payment details dialog, which is the only place the Settle Payment
  // button lives. Without this list the dialog (and the button) was
  // unreachable: nothing ever set selectedPaymentForDetails.
  const [payments, setPayments] = useState<any[]>([]);
  const [swiftStats, setSwiftStats] = useState<any>(null);
  const [swiftMessages, setSwiftMessages] = useState<any[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<any | null>(null);
  const [verificationDialogOpen, setVerificationDialogOpen] = useState(false);
  const [documentUploadDialogOpen, setDocumentUploadDialogOpen] = useState(false);
  const [uploadEntityId, setUploadEntityId] = useState<string>('');
  const [uploadEntityType, setUploadEntityType] = useState<string>('');
  const [selectedContract, setSelectedContract] = useState<SalesContract | null>(null);
  const [selectedLC, setSelectedLC] = useState<LetterOfCredit | null>(null);
  const [documentChecklist, setDocumentChecklist] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<'lc' | 'forex' | 'permit' | 'lcDetails' | 'lcAmend' | 'cad' | 'advance' | 'consignment' | null>(null);
  
  // Document Validation Dialog state
  const [validationDialogOpen, setValidationDialogOpen] = useState(false);
  const [validationData, setValidationData] = useState<any>(null);
  
  // Bulk selection state
  const [selectedLCIds, setSelectedLCIds] = useState<string[]>([]);
  const [bulkApproving, setBulkApproving] = useState(false);
  
  // Phase 1: Document Examination & Payment Release state
  const [documentExaminationOpen, setDocumentExaminationOpen] = useState(false);
  const [verifyingDocumentId, setVerifyingDocumentId] = useState<string | null>(null); // ✅ Track which document is being verified
  const [uploadShippingDocDialogOpen, setUploadShippingDocDialogOpen] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [uploadingDocType, setUploadingDocType] = useState<string | null>(null);
  const [uploadDocForm, setUploadDocForm] = useState({
    file: null as File | null,
    documentType: '',
    remarks: '',
  });
  const [paymentReleaseOpen, setPaymentReleaseOpen] = useState(false);
  // F1 (removed): `lcAmendmentOpen` was declared here but never set — the
  // amend dialog is driven by `dialogType === 'lcAmend'` instead.
  const [forexDetailsOpen, setForexDetailsOpen] = useState(false);
  const [utilizeDialogOpen, setUtilizeDialogOpen] = useState(false);
  const [utilizeForm, setUtilizeForm] = useState({ forexId: '', maxAmount: 0, utilizedAmount: 0 });
  const [paymentDetailsOpen, setPaymentDetailsOpen] = useState(false);
  // Settle Payment dialog state (slice-6 fix: POST /payments/:id/settle
  // had no UI caller anywhere in the app)
  const [settleDialogOpen, setSettleDialogOpen] = useState(false);
  const [settling, setSettling] = useState(false);
  const [settleForm, setSettleForm] = useState({
    exchangeRate: '',
    retentionRate: '40',
    payingBank: 'Commercial Bank of Ethiopia',
    payingBankBIC: 'CBETETAA',
    swiftReference: '',
    nbeApprovalRef: '',
  });
  const [selectedForex, setSelectedForex] = useState<ForexAllocation | null>(null);
  const [selectedPaymentForDetails, setSelectedPaymentForDetails] = useState<any | null>(null);
  // Standby LC issuance (Issue 6, 2026-11-14): POST /banking/lc/standby/issue
  // was API-only. The form lives on the Payment Methods tab (the All LCs
  // tab, tab 10, was removed in the 2026-11-18 merge); the chaincode
  // (IssueStandbyLC) only accepts an APPROVED or COMPLETED contract, so the
  // contract picker offers the already-loaded APPROVED contracts.
  const [standbyDialogOpen, setStandbyDialogOpen] = useState(false);
  const [issuingStandby, setIssuingStandby] = useState(false);
  const [standbyError, setStandbyError] = useState('');
  const [standbyResult, setStandbyResult] = useState<{ standbyLCId: string; standbyLCNumber: string; txId: string } | null>(null);
  const [standbyForm, setStandbyForm] = useState({
    standbyLCNumber: '',
    contractId: '',
    amount: '',
    currency: 'USD',
    expiryDate: '',
    type: 'PERFORMANCE',
    purpose: '',
    beneficiary: '',
    applicant: '',
    terms: '',
    issuingBank: 'Commercial Bank of Ethiopia',
    advisingBank: '',
  });
  const [allocationDialogOpen, setAllocationDialogOpen] = useState(false);
  const [allocationPolicyReady, setAllocationPolicyReady] = useState(false);
  const [allocationForm, setAllocationForm] = useState({
    forexId: '',
    lcId: '',
    amount: 0,
    exchangeRate: 0,
    retentionRate: 0,
    officer: '',
    approvalRef: '',
    expiryDate: '',
  });

  // SWIFT compose dialog state
  const [swiftComposeOpen, setSwiftComposeOpen] = useState(false);
  const [selectedSwiftMessage, setSelectedSwiftMessage] = useState<any | null>(null);
  const [swiftDetailsDialogOpen, setSwiftDetailsDialogOpen] = useState(false);
  const [swiftLedgerProof, setSwiftLedgerProof] = useState<any | null>(null);
  const [swiftLedgerProofLoading, setSwiftLedgerProofLoading] = useState(false);
  const [swiftForm, setSwiftForm] = useState<any>({
    messageID: '',
    messageType: 'MT103',
    swiftReference: '',
    senderBIC: 'CBETETAA',
    receiverBIC: '',
    amount: '',
    currency: 'USD',
    valueDate: '',
    beneficiary: '',
    remittanceInfo: '',
    linkedLcId: '',
    linkedPaymentId: '',
    applicant: '',
    lcExpiryDate: '',
    discrepancyDetails: '',
    // F20 (MT707): amendment reason is required by
    // POST /swift/messages/mt707.
    amendmentReason: '',
    documents: [],
  });
  const [documentExaminationFilter, setDocumentExaminationFilter] = useState<'PENDING_EXAMINATION' | 'VERIFIED'>('PENDING_EXAMINATION');
  const [paymentReleaseFilter, setPaymentReleaseFilter] = useState<'READY_FOR_PAYMENT' | 'RELEASED_TODAY' | 'TOTAL_RELEASED'>('READY_FOR_PAYMENT');
  const [lcsForExamination, setLcsForExamination] = useState<LetterOfCredit[]>([]);
  const [lcsForPaymentRelease, setLcsForPaymentRelease] = useState<LetterOfCredit[]>([]);

  const openSwiftMessageDetails = async (message: any) => {
    setSelectedSwiftMessage(message);
    setSwiftDetailsDialogOpen(true);
    setSwiftLedgerProof(null);
    const messageId = message?.messageId || message?.MessageID || message?.messageID;
    if (!messageId) {
      setSwiftLedgerProof({ events: [], error: 'This SWIFT record has no message ID to query in Fabric history.' });
      return;
    }

    setSwiftLedgerProofLoading(true);
    try {
      const response = await apiFetch(`/swift/messages/${encodeURIComponent(messageId)}/ledger-proof`, {
        headers: getAuthHeaders(),
      });
      const result = await response.json() as {
        success?: boolean;
        data?: any;
        error?: { message?: string } | string;
      };
      const errorMessage = typeof result.error === 'string'
        ? result.error
        : result.error?.message;
      setSwiftLedgerProof(result.success
        ? result.data
        : { events: [], error: errorMessage || 'Fabric ledger proof could not be read.' });
    } catch (error) {
      setSwiftLedgerProof({
        events: [],
        error: error instanceof Error ? String(error) : 'Fabric ledger proof could not be read.',
      });
    } finally {
      setSwiftLedgerProofLoading(false);
    }
  };
  
  // KPI Data Dialog state
  const [kpiDataDialogOpen, setKpiDataDialogOpen] = useState(false);
  const [kpiDataDialogTitle, setKpiDataDialogTitle] = useState('');
  const [kpiDataDialogData, setKpiDataDialogData] = useState<any[]>([]);
  const [kpiDataDialogType, setKpiDataDialogType] = useState<'forex' | 'lc' | 'swift' | ''>('');
  const [kpiDialogPage, setKpiDialogPage] = useState(0);
  const [kpiDialogRowsPerPage, setKpiDialogRowsPerPage] = useState(10);
  
  // NEW: Repatriation Dialog state
  const [repatriationDialogOpen, setRepatriationDialogOpen] = useState(false);
  const [repatriationRecordingOpen, setRepatriationRecordingOpen] = useState(false);
  
  // LC Amendment Form
  const [amendmentForm, setAmendmentForm] = useState({
    amendmentReason: '',
    newAmount: '',
    newExpiryDate: '',
    newTerms: '',
  });
  
  // LC Form
  const [lcForm, setLcForm] = useState({
    issuingBank: '',
    advisingBank: '',
    beneficiary: '',
    terms: 'Payment against shipping documents as per UCP 600',
    expiryDays: '90',
  });

  // Export Permit Form
  const [permitForm, setPermitForm] = useState({
    permitNumber: '',
    paymentMethod: 'LC',
    amount: '',
    description: '',
    destination: '',
    commercialInvoice: '',
  });

  // Documentary Collection Form
  const [cadForm, setCadForm] = useState({
    drawerName: '',
    draweeName: '',
    draweeAddress: '',
    paymentTerm: 'SIGHT',
    acceptanceDays: '',
    collectingBank: '',
    collectingBankBIC: '',
    remittingBank: '',
    remittingBankBIC: '',
    instructions: '',
  });

  // Advance Payment Form
  const [advanceForm, setAdvanceForm] = useState({
    creditAdviceNumber: '',
    payingBank: '',
    payingBankBIC: '',
    swiftReference: '',
    beneficiaryAccount: '',
  });

  // Consignment Form
  const [consignmentForm, setConsignmentForm] = useState({
    commodityType: 'FRUITS',
    description: '',
    buyerName: '',
    buyerAddress: '',
    permitAmount: '',
  });

  // Audit Trail State (entity-scoped viewer dialog; the tab moved to
  // Settings → System Management, so the tab's stats state is gone).
  const [showAuditTrail, setShowAuditTrail] = useState(false);
  const [auditEntityType, setAuditEntityType] = useState<'LC' | 'PAYMENT' | 'FOREX'>('LC');
  const [auditEntityId, setAuditEntityId] = useState<string>('');
  
  // Payment Release Confirmation Dialog State
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false);
  const [paymentConfirmData, setPaymentConfirmData] = useState<{
    lcId: string;
    exporterId: string;
    amount: number;
    currency: string;
  } | null>(null);
  const [paymentReleasing, setPaymentReleasing] = useState(false);
  const [lcDiscrepancyStats, setLcDiscrepancyStats] = useState({
    total: 0,
    open: 0,
    resolved: 0,
    resolutionRate: 0,
    avgTime: 0,
  });

  // Search and Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  // Tab-local LC status filter for the All LCs tab (tab 10). The shared
  // filterStatus above is per-tab state in effect (forex / SWIFT / LC
  // dropdowns use different value domains), so the All LCs tab keeps its
  // own filter instead of reusing it.
  const [allLcFilterStatus, setAllLcFilterStatus] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  
  // Advanced filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Get current user role from auth context (already imported at top)
  const userRole = user?.role || '';

  // NEW: Hierarchical Tab Structure with Parent/Child Navigation
  const getHierarchicalTabStructure = () => {
    const isSuperAdmin = userRole === 'ADMIN';
    
    // Define parent categories with their child tabs
    const tabStructure = [
      {
        id: 'payment-operations',
        label: 'Payment Operations',
        icon: React.createElement(Payment),
        roles: ['BANKS', 'ADMIN', 'BANKS Portal Administrator', 'Bank Officer', 'LC Officer', 'Payment Officer', 'Document Officer'],
        children: [
          { 
            id: 'payment-methods', 
            label: 'Payment Methods', 
            icon: React.createElement(Payment),
            roles: ['BANKS', 'ADMIN', 'BANKS Portal Administrator', 'Bank Officer', 'LC Officer', 'Payment Officer'],
            tabIndex: 0
          },
          { 
            id: 'document-examination', 
            label: `Document Examination${pendingExaminationCount > 0 ? ` (${pendingExaminationCount})` : ''}`, 
            icon: React.createElement(Description),
            roles: ['BANKS', 'ADMIN', 'BANKS Portal Administrator', 'Bank Officer', 'Document Officer'],
            tabIndex: 2
          },
          { 
            id: 'payment-release', 
            label: `Payment Release${lcsForPaymentRelease.length > 0 ? ` (${lcsForPaymentRelease.length})` : ''}`, 
            icon: React.createElement(AttachMoney),
            roles: ['BANKS', 'ADMIN', 'BANKS Portal Administrator', 'Bank Officer', 'Payment Officer'],
            tabIndex: 3
          },
          { 
            id: 'lc-discrepancies', 
            label: 'LC Discrepancies', 
            icon: React.createElement(Error),
            roles: ['BANKS', 'ADMIN', 'BANKS Portal Administrator', 'Bank Officer', 'LC Officer', 'Document Officer'],
            tabIndex: 9
          },
        ]
      },
      {
        id: 'forex-settlements',
        label: 'Forex & Settlements',
        icon: React.createElement(CurrencyExchange),
        roles: ['BANKS', 'ADMIN', 'BANKS Portal Administrator', 'Bank Officer', 'Forex Officer', 'LC Officer', 'Payment Officer'],
        children: [
          { 
            id: 'forex-allocations', 
            label: `Forex Allocations${forexAllocations.length > 0 ? ` (${forexAllocations.length})` : ''}`, 
            icon: React.createElement(CurrencyExchange),
            roles: ['BANKS', 'ADMIN', 'BANKS Portal Administrator', 'Bank Officer', 'Forex Officer'],
            tabIndex: 1
          },
          { 
            id: 'lc-settlements', 
            label: `LC Settlements${deliveredShipments.length > 0 ? ` (${deliveredShipments.length})` : ''}`, 
            icon: React.createElement(CheckCircle),
            roles: ['BANKS', 'ADMIN', 'BANKS Portal Administrator', 'Bank Officer', 'LC Officer', 'Payment Officer'],
            tabIndex: 5
          },
        ]
      },
      {
        id: 'communication',
        label: 'Communication & Issues',
        icon: React.createElement(MessageOutlined),
        roles: ['BANKS', 'ADMIN', 'BANKS Portal Administrator', 'Bank Officer', 'SWIFT Officer', 'LC Officer', 'Document Officer'],
        children: [
          { 
            id: 'swift-messages', 
            label: `SWIFT Messages${swiftMessages.length > 0 ? ` (${swiftMessages.length})` : ''}`, 
            icon: React.createElement(AccountBalance),
            roles: ['BANKS', 'ADMIN', 'BANKS Portal Administrator', 'Bank Officer', 'SWIFT Officer'],
            tabIndex: 4
          },
        ]
      },
      {
        // Was "System Management" (Analytics + User Management + Audit
        // Trail). User Management and Audit Trail moved to the account
        // menu (Settings → User Management / System Management,
        // /settings?section=users | system), so only Analytics is left
        // here — as its own parent. A parent with a single child shows
        // no second bar (see the child-bar condition below).
        id: 'analytics',
        label: 'Analytics',
        icon: React.createElement(Assessment),
        roles: ['BANKS', 'ADMIN', 'BANKS Portal Administrator', 'Bank Officer'],
        children: [
          {
            id: 'analytics',
            label: 'Analytics',
            icon: React.createElement(Assessment),
            roles: ['BANKS', 'ADMIN', 'BANKS Portal Administrator', 'Bank Officer'],
            tabIndex: 6
          },
        ]
      },
    ];
    
    // Filter by role
    if (isSuperAdmin) return tabStructure;
    
    return tabStructure
      .filter(parent => parent.roles.includes(userRole))
      .map(parent => ({
        ...parent,
        children: parent.children.filter(child => child.roles.includes(userRole))
      }))
      .filter(parent => parent.children.length > 0); // Remove parents with no accessible children
  };
  
  // S6 (2026-11-18, banks-tabs-status fix): lcsForExamination
  // deliberately includes already-examined UTILIZED / PAYMENT_RELEASED
  // rows for audit trail, so its length overstates truly-pending
  // examinations. The badge, the "Pending Examination" KPI and the
  // PENDING view all count only FOREX_ALLOCATED rows; examined rows
  // live under the VERIFIED view instead (see
  // getFilteredDocumentExaminationLCs).
  const pendingExaminationCount = lcsForExamination.filter((lc: any) => lc.status === 'FOREX_ALLOCATED').length;

  const tabStructure = getHierarchicalTabStructure();
  
  // Keep the selection valid when role-based filtering changes the available
  // parent or child tabs (for example, after the authenticated user loads).
  React.useEffect(() => {
    if (tabStructure.length === 0) {
      setActiveParentTab(0);
      setActiveChildTab(0);
      setActiveTab(0);
      return;
    }

    const parentIndex = Math.min(activeParentTab, tabStructure.length - 1);
    const children = tabStructure[parentIndex].children;
    const childIndex = Math.min(activeChildTab, Math.max(children.length - 1, 0));

    if (parentIndex !== activeParentTab) setActiveParentTab(parentIndex);
    if (childIndex !== activeChildTab) setActiveChildTab(childIndex);
    setActiveTab(children[childIndex]?.tabIndex ?? 0);
  }, [activeParentTab, activeChildTab, userRole]);

  // The shared filterStatus state is reused by the forex, SWIFT and LC
  // dropdowns, whose value domains do not overlap (e.g. a forex value
  // would filter the SWIFT tab to 0 rows). Reset it whenever the active
  // tab changes so a filter can never leak across tabs. The shared
  // searchTerm has the same leak: the forex / SWIFT / documents /
  // payment-release inputs all write one state, so a term typed in one
  // tab used to keep filtering (and showing in the box of) the next tab.
  React.useEffect(() => {
    setFilterStatus('ALL');
    setAllLcFilterStatus('ALL');
    setSearchTerm('');
  }, [activeTab]);

  // ?tab=<child tabIndex> deep-link from global search results (e.g.
  // /portals/banks?tab=0 for Payment Methods) and from stored
  // notification links, which carry NAMES (e.g. ?tab=swift-messages).
  // A name resolves through the Banks map in utils/portalTabNames
  // (`swift-messages` -> 4, `contracts` -> 0); parseInt('contracts')
  // is NaN, so named links used to be ignored and landed on tab 0.
  // The All LCs tab (?tab=10) was removed in the 2026-11-18 merge and
  // stays removed; a ?tab=10 link now lands on tab 0 with a notice
  // (see the tabIndex === 10 branch below). Maps the flat tabIndex to
  // its parent/child pair; the sync effect above then derives
  // activeTab. Waits until the role-based structure is non-empty
  // (userRole loads async), applies once, and ignores an unknown /
  // invisible tab.
  const tabFromQueryHandled = React.useRef(false);
  const router = useRouter();
  React.useEffect(() => {
    if (tabFromQueryHandled.current) return;
    const structure = getHierarchicalTabStructure();
    if (structure.length === 0) return;
    tabFromQueryHandled.current = true;
    if (typeof window === 'undefined') return;
    const raw = new URLSearchParams(window.location.search).get('tab');
    if (raw === null) return;
    const tabIndex = resolvePortalTabIndex('banks', raw);
    if (tabIndex === null || Number.isNaN(tabIndex)) return;
    // Old links to the moved tabs keep working: User Management and
    // Audit Trail now live under Settings in the account menu.
    if (tabIndex === 7) {
      void router.replace('/settings?section=users');
      return;
    }
    if (tabIndex === 8) {
      void router.replace('/settings?section=system');
      return;
    }
    // B11 (2026-11-18, merge fix): the All LCs tab (tab 10) was deleted
    // in the merge and stays deleted by intent — do NOT restore it. But
    // ?tab=10 used to fall through silently to tab 0 (Payment Methods)
    // with no notice. Follow the tab 7/8 pattern: land on tab 0, which
    // lists the LCs, tell the user the tab is gone and where Approve /
    // Issue live now, and rewrite the URL so a refresh does not
    // re-trigger the notice.
    if (tabIndex === 10) {
      showWarning(
        'All LCs Tab Removed',
        'The All LCs tab was removed. All letters of credit are listed on the Payment Methods tab.',
        'Approve and issue an LC from its LC Details dialog (Payment Methods tab → open the LC).'
      );
      for (let p = 0; p < structure.length; p++) {
        const c = structure[p].children.findIndex((child) => child.tabIndex === 0);
        if (c !== -1) {
          setActiveParentTab(p);
          setActiveChildTab(c);
          break;
        }
      }
      void router.replace('/portals/banks?tab=0');
      return;
    }
    for (let p = 0; p < structure.length; p++) {
      const c = structure[p].children.findIndex((child) => child.tabIndex === tabIndex);
      if (c !== -1) {
        setActiveParentTab(p);
        setActiveChildTab(c);
        return;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabStructure]);

  // Legacy compatibility - keep old visibleTabs for backward compatibility
  const getRoleBasedTabs = () => {
    const isSuperAdmin = userRole === 'ADMIN';
    
    const allTabs = [
      { index: 0, label: 'Payment Methods', icon: React.createElement(Payment), roles: ['BANKS', 'ADMIN', 'BANKS Portal Administrator', 'Bank Officer', 'LC Officer', 'Payment Officer'] },
      { index: 1, label: `Forex Allocations${forexAllocations.length > 0 ? ` (${forexAllocations.length})` : ''}`, icon: React.createElement(CurrencyExchange), roles: ['BANKS', 'ADMIN', 'BANKS Portal Administrator', 'Bank Officer', 'Forex Officer'] },
      { index: 2, label: `Document Examination${pendingExaminationCount > 0 ? ` (${pendingExaminationCount})` : ''}`, icon: React.createElement(Description), roles: ['BANKS', 'ADMIN', 'BANKS Portal Administrator', 'Bank Officer', 'Document Officer'] },
      { index: 3, label: `Payment Release${lcsForPaymentRelease.length > 0 ? ` (${lcsForPaymentRelease.length})` : ''}`, icon: React.createElement(AttachMoney), roles: ['BANKS', 'ADMIN', 'BANKS Portal Administrator', 'Bank Officer', 'Payment Officer'] },
      { index: 4, label: `SWIFT Messages${swiftMessages.length > 0 ? ` (${swiftMessages.length})` : ''}`, icon: React.createElement(AccountBalance), roles: ['BANKS', 'ADMIN', 'BANKS Portal Administrator', 'Bank Officer', 'SWIFT Officer'] },
      { index: 5, label: `LC Settlements${deliveredShipments.length > 0 ? ` (${deliveredShipments.length})` : ''}`, icon: React.createElement(CheckCircle), roles: ['BANKS', 'ADMIN', 'BANKS Portal Administrator', 'Bank Officer', 'LC Officer', 'Payment Officer'] },
      { index: 6, label: 'Analytics', icon: React.createElement(Assessment), roles: ['BANKS', 'ADMIN', 'BANKS Portal Administrator', 'Bank Officer'] },
      // User Management (7) and Audit Trail (8) used to be tabs here.
      // They moved to the account menu (Settings → User Management /
      // System Management, /settings?section=users | system); the
      // ?tab= redirect in the deep-link effect below keeps old
      // deep-links working.
      { index: 9, label: 'LC Discrepancies', icon: React.createElement(Error), roles: ['BANKS', 'ADMIN', 'BANKS Portal Administrator', 'Bank Officer', 'LC Officer', 'Document Officer'] },
    ];
    
    if (isSuperAdmin) return allTabs;
    return allTabs.filter(tab => tab.roles.includes(userRole));
  };
  
  const visibleTabs = getRoleBasedTabs();

  // Payment Method Configuration
  const PAYMENT_METHODS = [
    {
      id: 'LC',
      name: 'Letter of Credit',
      steps: ['Request LC', 'Approve LC', 'Issue LC', 'Ship Goods', 'Examine Documents', 'Release Payment'],
    },
    {
      id: 'CAD',
      name: 'Documentary Collection',
      steps: ['Ship Goods', 'Submit to Bank', 'Forward Documents', 'Notify Buyer', 'Receive Payment', 'Release Documents'],
    },
    {
      id: 'ADVANCE',
      name: 'Advance Payment',
      steps: ['Issue Proforma', 'Receive Advance', 'Register Contract', 'Source Coffee', 'Quality Check', 'Ship Goods', 'Receive Balance'],
    },
    {
      id: 'CONSIGNMENT',
      name: 'Consignment',
      steps: ['Issue Permit', 'Ship Goods', 'Sell Goods', 'Receive Payment', 'Settle Account'],
    },
  ];
  
  const selectedMethodConfig = PAYMENT_METHODS.find(m => m.id === selectedPaymentMethod);

  useEffect(() => {
    loadBankingData();
  }, []);

  // Auto-fill LC form when dialog opens with a selected contract
  useEffect(() => {
    if (dialogOpen && dialogType === 'lc' && selectedContract) {
      const userOrg = user?.organization || 'Commercial Bank of Ethiopia';
      
      let issuingBankValue = selectedContract.buyerBank || '';
      if (!issuingBankValue && selectedContract.buyerName && selectedContract.buyerCountry) {
        issuingBankValue = `${selectedContract.buyerName}'s Bank (${selectedContract.buyerCountry})`;
      }
      
      const advisingBankValue = selectedContract.exporterBank || userOrg;
      
      const formData = {
        issuingBank: issuingBankValue,
        advisingBank: advisingBankValue,
        beneficiary: selectedContract.exporterId || '',
        terms: 'Payment against shipping documents as per UCP 600',
        expiryDays: '90',
      };
      
      setLcForm(formData);
    }
  }, [dialogOpen, dialogType, selectedContract]);

  // (User Management and Audit Trail moved to Settings → the account
  // menu; their stats loaders ran only for those tabs.)

  const loadBankingData = async () => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      console.error('[BANKS] No auth token found');
      showError('Authentication Required', 'Please log in to access banking data', '');
      return;
    }

    devLog('[BANKS] ⚡ PARALLEL LOADING - All data loads at once!');

    try {
      const loadLedgerList = async (
        path: string,
        label: string,
        setRows: (rows: any[]) => void
      ): Promise<any[]> => {
        try {
          const response = await apiFetch(path, { headers: { Authorization: `Bearer ${token}` } });
          if (!response.ok) {
            throw new globalThis.Error(`${response.status} ${response.statusText}`);
          }
          const payload = await response.json();
          const rows = Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.data)
              ? payload.data
              : [];
          setRows(rows);
          devLog(`[BANKS] ⚡ ${label} loaded: ${rows.length}`);
          return rows;
        } catch (error) {
          console.warn(`[BANKS] ${label} failed:`, error);
          setRows([]);
          return [];
        }
      };

      // Launch ALL requests in parallel - each updates state as soon as it completes
      devLog('[BANKS] 🚀 Starting parallel data load with CONTRACTS support...');
      
      const [contractsPromise, lcPromise, swiftPromise, forexPromise, shipmentsPromise, collectionsPromise, advancesPromise, consignmentsPromise, paymentsPromise] = [
        // 0. Contracts (for LC issuance) - NEWLY ADDED!
        apiFetch('/api/v1/contracts', { headers: { 'Authorization': `Bearer ${token}` }})
          .then(r => r.json())
          .then(result => {
            if (result.success) {
              // Filter for ECTA-approved contracts
              const approvedContracts = (result.data || []).filter((c: any) => {
                const status = String(
                  c.status ?? c.contractStatus ?? c.ContractStatus ?? c.Status ?? ''
                ).trim().toUpperCase();
                return status === 'APPROVED';
              });
              setContracts(approvedContracts);
              devLog(`[BANKS] ⚡ Approved contracts loaded: ${approvedContracts.length}`);
              return approvedContracts;
            }
            devLog('[BANKS] ⚠️ No contracts returned from API');
            return [];
          })
          .catch(err => { 
            console.warn('[BANKS] Contracts failed:', err); 
            return []; 
          }),
        
        // 1. LCs
        apiFetch('/api/v1/banking/lc', { headers: { 'Authorization': `Bearer ${token}` }})
          .then(r => r.json())
          .then(result => {
            if (result.success) {
              const lcs = result.data.map((lc: any) => ({
                lcId: lc.lcId || lc.LCID,
                contractId: lc.contractId,
                exporterId: lc.exporterId,
                buyerId: lc.buyerId,
                buyerName: lc.buyerName || '',
                buyerCountry: lc.buyerCountry || '',
                amount: lc.amount,
                currency: lc.currency,
                status: lc.status,
                documents: lc.documents || [],
                requestDate: lc.requestDate || lc.createdAt,
                issueDate: lc.issueDate,
                expiryDate: lc.expiryDate,
                approvalDate: lc.approvalDate,
                issuingBank: lc.issuingBank,
                advisingBank: lc.advisingBank,
                // ✅ CRITICAL: Include customs clearance data from API
                customsClearanceStatus: lc.customsClearanceStatus,
                customsCleared: lc.customsCleared,
                customsClearanceDate: lc.customsClearanceDate,
                // F20 (MT707): amendment count drives the MT707
                // amendmentNumber sent for an AMENDED LC.
                amendmentCount: lc.amendmentCount ?? 0,
                // ✅ BLOCKCHAIN: Capture transaction ID from API
                txId: lc.txId || lc.TxId,
                blockchainVerified: !!(lc.txId || lc.TxId),
              }));
              setLetterOfCredits(lcs);
              devLog(`[BANKS] ⚡ LCs loaded: ${lcs.length}`);
              return lcs;
            }
            return [];
          })
          .catch(err => { console.warn('[BANKS] LCs failed:', err); return []; }),

        // 2. SWIFT Messages - PRIORITY!
        apiFetch('/api/v1/swift/messages', { headers: { 'Authorization': `Bearer ${token}` }})
          .then(r => r.json())
          .then(result => {
            if (result.success) {
              setSwiftMessages(result.data || []);
              devLog(`[BANKS] ⚡ SWIFT loaded: ${result.data?.length || 0}`);
              return result.data || [];
            }
            return [];
          })
          .catch(err => { console.warn('[BANKS] SWIFT failed:', err); return []; }),

        // 3. Forex
        apiFetch('/api/v1/forex', { headers: { 'Authorization': `Bearer ${token}` }})
          .then(r => r.json())
          .then(result => {
            if (result.success) {
              devLog(`[BANKS] ⚡ Forex loaded: ${result.data?.length || 0}`);
              if (result.data && result.data.length > 0) {
                devLog(`[BANKS] 🔍 Forex statuses:`, result.data.map((f: any) => ({ id: f.forexId, status: f.status })));
              }
              return result.data || [];
            }
            return [];
          })
          .catch(err => { console.warn('[BANKS] Forex failed:', err); return []; }),

        // 4. Shipments
        api.getShipments({ status: 'DELIVERED' })
          .then(result => {
            if (result.success) {
              const delivered = (result.data || []).filter((s: any) => {
                const status = s.Status || s.status || '';
                return status === 'DELIVERED';
              });
              setDeliveredShipments(delivered);
              devLog(`[BANKS] ⚡ Shipments loaded: ${delivered.length}`);
              return delivered;
            }
            return [];
          })
          .catch(err => { console.warn('[BANKS] Shipments failed:', err); return []; }),

        // 5. Documentary collections directly from the ledger
        loadLedgerList('/api/v1/stats/documentary-collections', 'Documentary collections', setDocumentaryCollections),

        // 6. Advance payments directly from the ledger
        loadLedgerList('/api/v1/stats/advance-payments', 'Advance payments', setAdvancePayments),

        // 7. Consignment payments directly from the ledger
        loadLedgerList('/api/v1/stats/consignments', 'Consignments', setConsignments),

        // 8. Raw payment records — feeds the Payments table and the
        // payment details dialog (the only place Settle Payment lives)
        loadLedgerList('/api/v1/payments', 'Payments', setPayments),

        // 9. Export permits — feeds the LC Settlements tab gate (F16):
        // the "Issue Export Permit" button is hidden once a permit
        // already exists for the shipment's contract. The permits list
        // carries contractId but no shipmentId, so the gate matches on
        // contractId. A failed load leaves the list empty, which only
        // means the button stays visible (fail-open, as before).
        loadLedgerList('/api/v1/permits', 'Export permits', setExportPermits),

        // 10. Analytics summary — feeds the Analytics tab KPI (F26).
        // Same endpoint the AnalyticsDashboard reads; stored here so the
        // portal-level KPI card is a real computed total, not a literal.
        apiFetch('/api/v1/analytics/dashboard', { headers: { 'Authorization': `Bearer ${token}` } })
          .then(r => r.json())
          .then(result => {
            if (result.success && result.data) {
              setAnalyticsSummary(result.data);
              devLog('[BANKS] ⚡ Analytics summary loaded');
              return result.data;
            }
            return null;
          })
          .catch(err => { console.warn('[BANKS] Analytics summary failed:', err); return null; }),
      ];

      // Wait for all to complete and process forex with LC data
      const [lcs, swift, forex, shipments, collections, advances, consignmentRows, paymentRows] = await Promise.all([
        lcPromise,
        swiftPromise,
        forexPromise,
        shipmentsPromise,
        collectionsPromise,
        advancesPromise,
        consignmentsPromise,
        paymentsPromise,
      ]);

      devLog('[BANKS] Payment method records loaded:', {
        collections: collections.length,
        advances: advances.length,
        consignments: consignmentRows.length,
      });

      // NOTE: deliveredShipments is intentionally NOT filtered by LC
      // payment status here. The shipments fetch above already returns
      // only DELIVERED shipments, and the LC Settlements tab (tab 5)
      // must list every delivered shipment so its per-card "Issue
      // Export Permit" button is reachable — filtering to
      // PAYMENT_RELEASED/SETTLED LCs emptied the list (and the permit
      // button with it) for every shipment whose LC payment had not
      // been released yet. Settlement tracking still happens per card
      // (LC lookup + PostDeliveryWorkflowPanel), and the Payment
      // Release tab keeps its own lcsForPaymentRelease list.

      // Process forex allocations with buyer names from LCs
      if (forex && forex.length > 0) {
        const mappedForex = forex.map((f: any) => {
          const matchingLC = lcs?.find((lc: any) => lc.lcId === f.lcId || lc.contractId === f.contractId);
          return {
            forexId: f.forexId || '',
            contractId: f.contractId || '',
            exporterId: f.exporterId || '',
            lcId: f.lcId || '',
            buyerName: matchingLC?.buyerName || f.buyerName || '',
            buyerCountry: matchingLC?.buyerCountry || f.buyerCountry || '',
            requestedAmount: f.requestedAmount || 0,
            allocatedAmount: f.allocatedAmount || 0,
            currency: f.currency || 'USD',
            exchangeRate: f.exchangeRate || 0,
            retentionRate: f.retentionRate || 0,
            status: f.status || 'REQUESTED',
            expiryDate: f.expiryDate || null,
          };
        });

        // Keep an unpersisted, clearly marked draft only when an issued LC has
        // no corresponding ledger request. It is excluded from ledger metrics.
        if (lcs && lcs.length > 0) {
          const forexRelatedLCs = lcs.filter((lc: any) => lc.status === 'ISSUED');
          for (const lc of forexRelatedLCs) {
            if (!mappedForex.find((f: any) => f.lcId === lc.lcId || (f.contractId === lc.contractId && f.exporterId === lc.exporterId))) {
              mappedForex.push({
                forexId: `FOREX_${lc.lcId}_PENDING`,
                contractId: lc.contractId || '',
                exporterId: lc.exporterId || '',
                lcId: lc.lcId || '',
                buyerName: lc.buyerName || '',
                buyerCountry: lc.buyerCountry || '',
                requestedAmount: Number(lc.amount || 0),
                allocatedAmount: 0,
                currency: lc.currency || 'USD',
                exchangeRate: 0,
                retentionRate: 0,
                status: 'REQUESTED',
                expiryDate: lc.expiryDate || '',
                isDraft: true,
              });
            }
          }
        }

        setForexAllocations(mappedForex);
        devLog(`[BANKS] ⚡ Total forex: ${mappedForex.length}`);
      }

      // Filter LCs for document examination (documents submitted, awaiting bank verification)
      if (lcs && lcs.length > 0) {
        const forExam = lcs.filter((lc: any) => {
          // ✅ FOREX_ALLOCATED is REQUIRED before document examination
          // Pending: {FOREX_ALLOCATED only}
          // Completed: {UTILIZED, PAYMENT_RELEASED} for audit trail
          const isRelevantStatus = ['FOREX_ALLOCATED', 'UTILIZED', 'PAYMENT_RELEASED'].includes(lc.status);
          if (!isRelevantStatus) {
            if (lc.status === 'ISSUED') {
              devLog(`[BANKS] ⚠️ LC ${lc.lcId} is ISSUED but needs forex allocation first (use Forex Allocations tab)`);
            }
            return false;
          }
          
          // D4 (2026-11-18, merge fix): do NOT require a DELIVERED
          // shipment here. ExamineLCDocuments needs only FOREX_ALLOCATED
          // on the ledger, and the examination dialog fetches the
          // shipment's documents per LC when it opens — so gating this
          // tab on a DELIVERED shipment hid 74% of examinable LCs (48 of
          // 185 live) for the whole interval between shipment creation
          // and delivery. An LC with no shipment yet simply shows no
          // shipping documents in the dialog until one exists.
          devLog(`[BANKS] ✅ LC ${lc.lcId} for examination tab - status: ${lc.status}`);
          return true;
        });
        setLcsForExamination(forExam);
        devLog(`[BANKS] ⚡ LCs for document examination: ${forExam.length}`);
        if (forExam.length > 0) {
          devLog(`[BANKS] 📋 LCs awaiting examination:`, forExam.map((lc: any) => ({
            lcId: lc.lcId,
            status: lc.status,
            contractId: lc.contractId,
            shipmentId: shipments?.find((s: any) => s.contractId === lc.contractId)?.shipmentId
          })));
        }

        // Filter LCs for payment release (documents examined and compliant, awaiting payment)
        console.log('[BANKS] 🚀 Starting payment release filter, total LCs:', lcs.length);
        console.log('[BANKS] 🔍 Sample LC data:', lcs[0]);
        const forPayment = lcs.filter((lc: any) => {
          const isTarget = lc.lcId === 'LC1789460822330';
          if (isTarget) console.log('[BANKS] 🎯 Found target LC1789460822330, checking conditions...');
          
          // Must have documents
          if (!lc.documents || lc.documents.length === 0) {
            if (isTarget) console.log('[BANKS] ❌ FAIL: No documents');
            return false;
          }
          if (isTarget) console.log('[BANKS] ✅ Has documents:', lc.documents.length);
          
          // ✅ Must be UTILIZED (documents examined) to release payment
          // Show both pending (UTILIZED) and completed (PAYMENT_RELEASED) for audit trail
          const isRelevantPaymentStatus = ['UTILIZED', 'PAYMENT_RELEASED'].includes(lc.status);
          if (!isRelevantPaymentStatus) {
            if (isTarget) console.log('[BANKS] ❌ FAIL: Status not UTILIZED or PAYMENT_RELEASED. Current:', lc.status);
            return false;
          }
          if (isTarget) console.log('[BANKS] ✅ Status OK:', lc.status);
          
          // ✅ All documents must be verified/compliant through Document Examination workflow
          // Documents must be explicitly verified by bank officers - NO AUTO-VERIFICATION
          const allDocsVerified = lc.documents.every((d: any) => {
            const docStatus = d.verificationStatus || d.status || '';
            const isVerified = docStatus === 'verified' || docStatus === 'approved' || docStatus === 'compliant';
            
            if (isTarget && !isVerified) {
              console.log('[BANKS] ❌ Doc not verified:', d.documentType, 'status:', docStatus);
            }
            
            return isVerified;
          });
          
          if (!allDocsVerified) {
            if (isTarget) console.log('[BANKS] ❌ FAIL: Not all docs verified');
            return false;
          }
          if (isTarget) console.log('[BANKS] ✅ All docs verified');
          
          // ✅ At this point:
          // - LC status is UTILIZED (documents examined)
          // - All documents are verified by bank
          // - Ready for payment release
          
          if (isTarget) console.log('[BANKS] ✅✅✅ ALL CHECKS PASSED! LC ready for payment release');
          
          return true;
        });
        console.log('[BANKS] 🚀 Payment filter complete, forPayment count:', forPayment.length);
        setLcsForPaymentRelease(forPayment);
        devLog(`[BANKS] ⚡ LCs ready for payment release: ${forPayment.length}`);
        
        // ✅ ENHANCED DEBUG: Show why LCs are not qualifying for payment release
        if (forPayment.length === 0 && lcs.length > 0) {
          const utilizedLCs = lcs.filter((lc: any) => lc.status === 'UTILIZED');
          devLog(`[BANKS] 🔍 DEBUG Payment Release Filter:`);
          devLog(`  - Total LCs: ${lcs.length}`);
          devLog(`  - LCs in UTILIZED status: ${utilizedLCs.length}`);
          devLog(`  - LCs with documents: ${lcs.filter((lc: any) => lc.documents && lc.documents.length > 0).length}`);
          
          // Check LCs with verified docs (using same logic as filter)
          const lcsWithVerifiedDocs = lcs.filter((lc: any) => {
            if (!lc.documents || lc.documents.length === 0) return false;
            return lc.documents.every((d: any) => {
              const docStatus = d.verificationStatus || d.status || '';
              return docStatus === 'verified' || docStatus === 'approved' || docStatus === 'compliant';
            });
          });
          devLog(`  - LCs with verified docs: ${lcsWithVerifiedDocs.length}`);
          
          // Check customs clearance
          const lcsWithCustoms = lcs.filter((lc: any) => {
            return lc.customsClearanceStatus === 'CLEARED' || lc.customsClearanceStatus === 'cleared' || lc.customsCleared === true;
          });
          devLog(`  - LCs with customs clearance: ${lcsWithCustoms.length}`);
          
          // ✅ Check approval workflows
          const lcsWithPendingApprovals = lcs.filter((lc: any) => {
            if (!lc.documents || lc.documents.length === 0) return false;
            return lc.documents.some((d: any) => d.requiresMultiPartyApproval && !d.approvalWorkflowComplete);
          });
          devLog(`  - LCs with pending approvals: ${lcsWithPendingApprovals.length}`);
          
          // Show status breakdown
          const statusCounts: any = {};
          lcs.forEach((lc: any) => {
            statusCounts[lc.status] = (statusCounts[lc.status] || 0) + 1;
          });
          devLog(`  - LC Status Breakdown:`, statusCounts);
          
          // Show sample UTILIZED LC with document details
          if (utilizedLCs.length > 0) {
            const sampleLC = utilizedLCs[0];
            devLog(`  - Sample UTILIZED LC:`, {
              lcId: sampleLC.lcId,
              status: sampleLC.status,
              documentCount: sampleLC.documents?.length || 0,
              customsClearanceStatus: sampleLC.customsClearanceStatus || 'NOT SET',
              customsCleared: sampleLC.customsCleared || false,
              documents: sampleLC.documents?.map((d: any) => ({
                type: d.documentType,
                status: d.status,
                verificationStatus: d.verificationStatus,
                combined: d.verificationStatus || d.status || '',
                requiresMultiPartyApproval: d.requiresMultiPartyApproval || false,
                approvalProgress: d.requiresMultiPartyApproval ? `${d.currentApprovals}/${d.requiredApprovals}` : 'N/A',
                approvalComplete: d.approvalWorkflowComplete
              }))
            });
          }
        }
        
        if (forPayment.length > 0) {
          devLog(`[BANKS] 💰 LCs with verified documents:`, forPayment.map((lc: any) => ({
            lcId: lc.lcId,
            status: lc.status,
            amount: lc.amount,
            currency: lc.currency
          })));
        }
      }

      devLog('[BANKS] ⚡ All critical data loaded!');
    } catch (error: any) {
      console.error('[BANKS] Loading failed:', error);
      showError('Data Loading Failed', 'Could not load banking data', (error as Error)?.message || String(error));
    }
  };

  const handleOpenDialog = (type: 'lc' | 'forex' | 'permit', contract: SalesContract) => {
    console.log('=== LC Dialog Opening ===');
    console.log('Contract data:', {
      contractId: contract.contractId,
      exporterId: contract.exporterId,
      buyerBank: contract.buyerBank,
      exporterBank: contract.exporterBank,
      buyerName: contract.buyerName,
      buyerCountry: contract.buyerCountry,
      totalValue: contract.totalValue,
      currency: contract.currency
    });
    
    setSelectedContract(contract);
    setDialogType(type);
    
    // Auto-fill LC form with contract data
    if (type === 'lc') {
      // Get logged-in bank user's organization for advising bank
      const userOrg = user?.organization || 'Commercial Bank of Ethiopia';
      
      // ✅ DEBUG: Log the contract object to see what we have
      console.log('[LC FORM] Contract object received:', {
        contractId: contract.contractId,
        buyerBank: contract.buyerBank,
        exporterBank: contract.exporterBank,
        buyerName: contract.buyerName,
        buyerCountry: contract.buyerCountry,
        exporterId: contract.exporterId
      });
      
      // ✅ FIX: Better issuing bank handling
      let issuingBankValue = contract.buyerBank || '';
      if (!issuingBankValue) {
        // If buyer bank not specified, leave blank so user must enter it
        console.warn('[LC FORM] ⚠️ Buyer bank not found in contract');
        issuingBankValue = '';
      } else {
        console.log('[LC FORM] ✅ Using buyerBank as issuing bank:', issuingBankValue);
      }
      
      // ✅ FIX: Better advising bank handling  
      let advisingBankValue = contract.exporterBank || '';
      if (!advisingBankValue) {
        // Use the logged-in bank's organization as advising bank
        console.log('[LC FORM] Using user organization as advising bank:', userOrg);
        advisingBankValue = userOrg;
      } else {
        console.log('[LC FORM] ✅ Using exporterBank as advising bank:', advisingBankValue);
      }
      
      const formData = {
        issuingBank: issuingBankValue,
        advisingBank: advisingBankValue,
        beneficiary: contract.exporterId || '',
        terms: 'Payment against shipping documents as per UCP 600',
        expiryDays: '90',
      };
      
      // Set form data immediately
      setLcForm(formData);
      
      // Also set after a brief delay to ensure state updates
      setTimeout(() => {
        setLcForm(formData);
      }, 50);
    }
    
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setSelectedContract(null);
    setSelectedLC(null);
    setDialogType(null);
    setLcForm({
      issuingBank: '',
      advisingBank: '',
      beneficiary: '',
      terms: 'Payment against shipping documents as per UCP 600',
      expiryDays: '90',
    });
  };

  // 0.10: StatusChip's `status` prop is a closed union, but LC/forex/
  // SWIFT rows carry the real chaincode status as a plain string. Pass
  // the real status through (the chip falls back to its default colour
  // for any value outside its map) instead of hardcoding
  // 'pending'/'approved'/'ACTIVE'.
  const chipStatus = (status?: string | null) => (status || 'PENDING') as any;

  // --- F6/F9/F10/F15/F16/F26: honest KPI helpers ---
  // F9/F10: the release date of an LC is the date of its bridge payment.
  // ReleaseLCPayment creates payment `PAY_<lcId>` (VERIFIED) at release
  // time, and the portal already loads GET /payments — so no extra fetch
  // is needed. The LC list rows themselves carry no payment/release date
  // (only requestDate/issueDate/expiryDate).
  const bridgePaymentForLc = (lcId: string) =>
    payments.find((p: any) => (p.paymentId || p.PaymentID) === `PAY_${lcId}`);
  const releaseDateForLc = (lc: LetterOfCredit): string | null => {
    const pay = bridgePaymentForLc(lc.lcId);
    return (pay?.paymentDate || pay?.createdAt || null) as string | null;
  };
  const isSameLocalDay = (iso: string | null | undefined, ref = new Date()): boolean => {
    if (!iso) return false;
    const d = new Date(iso);
    return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
  };
  const isSameLocalMonth = (iso: string | null | undefined, ref = new Date()): boolean => {
    if (!iso) return false;
    const d = new Date(iso);
    return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
  };
  // F9: PAYMENT_RELEASED LCs whose bridge payment landed today / this
  // month. An LC with no bridge payment has no known release date and is
  // counted in neither bucket (0 live — every released LC has its bridge
  // payment). Amounts arrive as strings ("275000.00") — coerce with
  // Number, or the sum concatenates and renders $NaNM (seen live).
  const releasedTodayLCs = letterOfCredits.filter(
    (lc) => lc.status === 'PAYMENT_RELEASED' && isSameLocalDay(releaseDateForLc(lc)),
  );
  const releasedThisMonthLCs = letterOfCredits.filter(
    (lc) => lc.status === 'PAYMENT_RELEASED' && isSameLocalMonth(releaseDateForLc(lc)),
  );
  // F10: mean request → release time across released LCs with a known
  // release date. No examination timestamp exists on the LC row (the
  // chaincode only writes UtilizationDate at release, and it is empty for
  // UTILIZED LCs), so the honest basis is requestDate → release date, and
  // the subtitle says so. Null when there is nothing to average.
  const avgReleaseTimeMs = (() => {
    const spans = letterOfCredits
      .filter((lc) => lc.status === 'PAYMENT_RELEASED')
      .map((lc) => {
        const rel = releaseDateForLc(lc);
        const req = (lc as any).requestDate;
        if (!rel || !req) return null;
        const ms = new Date(rel).getTime() - new Date(req).getTime();
        return Number.isFinite(ms) && ms >= 0 ? ms : null;
      })
      .filter((ms): ms is number => ms !== null);
    if (spans.length === 0) return null;
    return spans.reduce((a, b) => a + b, 0) / spans.length;
  })();
  const formatReleaseDuration = (ms: number): string => {
    const mins = ms / 60000;
    if (mins < 60) return `${Math.max(1, Math.round(mins))}m`;
    const hours = mins / 60;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${(hours / 24).toFixed(1)}d`;
  };
  // F15: settlement KPIs on the same denominator — delivered shipments.
  // A shipment counts as settled when its linked LC (by contractId) is
  // SETTLED; otherwise it is pending. A shipment with no linked LC counts
  // as pending (0 live).
  const lcForShipment = (shipment: any) =>
    letterOfCredits.find((l) => l.contractId === (shipment.contractId || shipment.contractID));
  const settledShipments = deliveredShipments.filter((s) => lcForShipment(s)?.status === 'SETTLED');
  const pendingSettlementShipments = deliveredShipments.filter((s) => lcForShipment(s)?.status !== 'SETTLED');
  // F16: a permit already issued for a contract. The permits list carries
  // contractId but no shipmentId, so the gate matches on contractId.
  const permitForContract = (contractId: string) =>
    exportPermits.find((p: any) => p.contractId === contractId);
  // F26: total records aggregated by the analytics dashboard endpoint
  // (same numbers the Analytics tab shows). Null until loaded.
  const totalAnalyticsMetrics = analyticsSummary
    ? ['lcs', 'forex', 'payments', 'swift'].reduce(
        (sum, key) => sum + Number(analyticsSummary?.[key]?.total || 0), 0)
    : null;

  const handleViewLCDetails = async (lc: LetterOfCredit) => {
    devLog('[BANKS] 📋 Fetching complete LC details for:', lc.lcId);
    
    // ✅ Show dialog immediately with loading state
    setSelectedLC(lc);
    setDialogType('lcDetails');
    setDialogOpen(true);
    setLcDetailsLoading(true); // Show loading indicator
    setDocumentChecklist(null); // Reset checklist
    
    try {
      // Fetch complete LC data and related shipments
      const token = localStorage.getItem('authToken');
      
      const [lcResponse, shipmentsResult, checklistResponse] = await Promise.all([
        apiFetch(`/banking/lc/${encodeURIComponent(lc.lcId)}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : undefined,
        }),
        // Fetch all shipments and filter by contractId client-side
        api.getShipments({}),
        // Fetch document checklist
        apiFetch(`/banking/lc/${encodeURIComponent(lc.lcId)}/document-checklist`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : undefined,
        }).catch(err => {
          console.warn('[BANKS] Document checklist fetch failed:', err);
          return null;
        })
      ]);

      // Process LC data
      if (lcResponse.ok) {
        const result = await lcResponse.json();
        if (result.success && result.data) {
          devLog('[BANKS] ✅ Fetched complete LC data:', result.data);
          devLog('[BANKS] 📎 LC Documents count:', result.data.documents?.length || 0);
          devLog('[BANKS] 📎 LC Documents:', result.data.documents);
          
          // Filter shipments for this LC's contract
          const relatedShipments = (shipmentsResult.success && shipmentsResult.data)
            ? shipmentsResult.data.filter((s: any) => s.contractId === result.data.contractId)
            : [];
          
          devLog('[BANKS] ✅ Found', relatedShipments.length, 'shipments for contract:', result.data.contractId);
          
          // Attach shipments to LC data
          setSelectedLC({
            ...result.data,
            relatedShipments
          });
        } else {
          console.warn('[BANKS] ⚠️ API returned no data, using cached LC');
          setSelectedLC(lc);
        }
      } else {
        console.warn('[BANKS] ⚠️ API fetch failed, using cached LC');
        setSelectedLC(lc);
      }

      // Process document checklist
      if (checklistResponse && checklistResponse.ok) {
        const checklistResult = await checklistResponse.json();
        if (checklistResult.success && checklistResult.data) {
          devLog('[BANKS] ✅ Document checklist loaded:', checklistResult.data);
          setDocumentChecklist(checklistResult.data);
        }
      }
    } catch (error) {
      console.error('[BANKS] ❌ Error fetching LC details:', error);
      // Keep the initial LC data as fallback
      setSelectedLC(lc);
    } finally {
      setLcDetailsLoading(false); // Hide loading indicator
    }
  };

  const handleViewContractDetails = async (contract: SalesContract) => {
    devLog('[BANKS] 📄 handleViewContractDetails called with contract:', {
      contractId: contract.contractId,
      buyerName: contract.buyerName,
      buyerId: contract.buyerId,
      coffeeType: contract.coffeeType,
      quantity: contract.quantity,
      totalValue: contract.totalValue,
    });
    
    setSelectedContract(contract);
    
    // Fetch real documents for this contract
    const token = localStorage.getItem('authToken');
    let contractDocuments: any[] = [];
    
    if (token) {
      try {
        devLog('[BANKS] 📄 Fetching documents for contract:', contract.contractId);
        const response = await apiFetch(`/documents/entity/CONTRACT/${contract.contractId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        
        const result = await response.json();
        devLog('[BANKS] 📄 Documents API response:', { success: result.success, dataLength: result.data?.length });
        
        if (result.success && result.data && Array.isArray(result.data)) {
          devLog('[BANKS] 📄 Raw documents from API:', result.data);
          contractDocuments = result.data.map((doc: any) => {
            const docId = doc.document_id || doc.documentId || doc.id;
            return {
              id: docId,
              name: doc.file_name || doc.filename || doc.name,
              type: (doc.mime_type || doc.mimeType || 'application/pdf').split('/')[1]?.toUpperCase() || 'PDF',
              status: 'AVAILABLE',
              url: `/api/v1/documents/${docId}/view`, // ✅ Fixed: Add /view to the URL
              uploadedDate: doc.uploaded_at || doc.uploadedAt ? new Date(doc.uploaded_at || doc.uploadedAt).toLocaleDateString() : new Date().toLocaleDateString(),
              size: doc.file_size || doc.size ? `${((doc.file_size || doc.size) / 1024).toFixed(0)} KB` : 'N/A',
              category: doc.document_type || doc.category || 'CONTRACT_DOCUMENT',
            };
          });
          devLog('[BANKS] 📄 Mapped documents:', contractDocuments);
        }
      } catch (error) {
        console.error('[BANKS] ❌ Error fetching contract documents:', error);
      }
    }
    
    // If no documents found, provide standard required documents list
    if (contractDocuments.length === 0) {
      devLog('[BANKS] ⚠️  No documents found for contract, showing MISSING placeholders');
      contractDocuments = [
        { id: '1', name: 'Sales Contract (Signed)', type: 'PDF', status: 'MISSING', uploadedDate: 'N/A', size: 'N/A' },
        { id: '2', name: 'Commercial Invoice', type: 'PDF', status: 'MISSING', uploadedDate: 'N/A', size: 'N/A' },
        { id: '3', name: 'Exporter Declaration', type: 'PDF', status: 'MISSING', uploadedDate: 'N/A', size: 'N/A' },
        { id: '4', name: 'Buyer Banking Details', type: 'PDF', status: 'MISSING', uploadedDate: 'N/A', size: 'N/A' },
      ];
    }
    
    // Set validation data for view mode
    setValidationData({
      entityId: contract.contractId,
      entityType: 'SALES CONTRACT',
      title: `Contract Details - ${contract.contractId}`,
      summary: [
        { label: 'Contract ID', value: contract.contractId },
        ...(contract.nbeReferenceNumber ? [{ label: 'ECTA Reference', value: contract.nbeReferenceNumber }] : []),
        { label: 'Exporter', value: contract.exporterId },
        { label: 'Buyer ID', value: contract.buyerId || 'N/A' },
        { label: 'Buyer Name', value: contract.buyerName || contract.buyerId || 'N/A' },
        { label: 'Buyer Country', value: contract.buyerCountry },
        ...(contract.buyerBank ? [{ label: 'Buyer Bank', value: contract.buyerBank }] : []),
        ...(contract.exporterBank ? [{ label: 'Exporter Bank', value: contract.exporterBank }] : []),
        { label: 'Coffee Type', value: contract.coffeeType },
        { label: 'Quantity', value: `${contract.quantity?.toLocaleString() || 0} kg` },
        { label: 'Price per Kg', value: `$${contract.pricePerKg || 0}` },
        { label: 'Total Value', value: `$${contract.totalValue?.toLocaleString() || 0} ${contract.currency}` },
        { label: 'Status', value: contract.status },
        { label: 'Registration Date', value: contract.registrationDate ? new Date(contract.registrationDate).toLocaleDateString() : 'N/A' },
      ],
      prerequisites: [
        {
          label: 'ECTA Approval',
          status: contract.status === 'APPROVED' ? 'PASSED' : 'FAILED',
          details: contract.status === 'APPROVED' ? 'Contract approved by ECTA for export compliance' : `Current status: ${contract.status}`
        },
        {
          label: 'Exporter License',
          status: 'PASSED',
          details: `Exporter ${contract.exporterId} holds valid ECTA export license`
        },
        {
          label: 'Buyer Information',
          status: contract.buyerName && contract.buyerCountry ? 'PASSED' : 'WARNING',
          details: 'Buyer information complete and verified'
        },
        {
          label: 'Trade Compliance',
          status: 'PASSED',
          details: `Destination ${contract.buyerCountry} verified - not subject to trade sanctions`
        },
        {
          label: 'Documents Submitted',
          status: contractDocuments.some(d => d.status === 'AVAILABLE') ? 'PASSED' : 'WARNING',
          details: `${contractDocuments.filter(d => d.status === 'AVAILABLE').length} of ${contractDocuments.length} documents available`
        },
      ],
      documents: contractDocuments,
      complianceChecks: [
        {
          label: 'ECTA Registration',
          status: 'COMPLIANT',
          details: 'Contract registered with Ethiopian Coffee and Tea Authority'
        },
        {
          label: 'NBE Forex Requirements',
          status: 'COMPLIANT',
          details: 'Meets National Bank of Ethiopia export and forex allocation requirements'
        },
        {
          label: 'Trade Sanctions',
          status: 'COMPLIANT',
          details: `${contract.buyerCountry} is not subject to international trade sanctions`
        },
        {
          label: 'Export Regulations',
          status: 'COMPLIANT',
          details: 'Complies with Ethiopian export regulations and coffee quality standards'
        },
      ],
      additionalInfo: contract.status === 'APPROVED' ?
        'This contract has been approved by ECTA. You can now issue a Letter of Credit for this contract.' :
        'Review contract details and current status.'
    });
    setValidationDialogOpen(true);
  };

  const handleApproveLC = async (lcId: string, exporterId: string) => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      showError('Authentication Required', 'You are not authenticated', 'Please login again to continue');
      return;
    }

    try {
      // The backend will automatically use the logged-in user's organization as the bank
      const response = await apiFetch(`/banking/lc/${lcId}/approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          beneficiary: exporterId, // Use exporter ID as beneficiary
        }),
      });

      const result = await response.json();

      if (result.success) {
        showSuccess(
          'Letter of Credit Approved',
          `LC ${lcId} has been approved successfully`,
          'The LC is now approved and ready for issuance',
          extractTxId(result),
        );
        loadBankingData(); // Reload to show updated status
      } else {
        const errorMsg = result.error?.message || 'Unknown error';
        showError('LC Approval Failed', errorMsg, 'Please try again or contact support');
      }
    } catch (error: any) {
      console.error('Error approving LC:', error);
      showError('Network Error', 'Failed to approve LC', error.message);
    }
  };

  // Issue Standby LC — POST /banking/lc/standby/issue (BANKS). Verified
  // live 2026-11-14: 201 with a real ledger txId (SBLC-1794647078469,
  // tx 6d946161…). The chaincode writes the ledger document FIRST and
  // the API mirrors it to Postgres only after the chain write succeeds,
  // so a failure here leaves no orphan row. Required fields are exactly
  // the route's validators (banking.ts): standbyLCNumber, contractId,
  // amount, currency, expiryDate, type (PERFORMANCE / ADVANCE_PAYMENT /
  // BID_BOND / FINANCIAL), purpose, beneficiary, applicant; terms,
  // issuingBank and advisingBank are optional.
  const handleIssueStandbyLC = async () => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      showError('Authentication Required', 'You are not authenticated', 'Please login again to continue');
      return;
    }

    setIssuingStandby(true);
    setStandbyError('');
    try {
      const response = await apiFetch('/banking/lc/standby/issue', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          standbyLCNumber: standbyForm.standbyLCNumber.trim(),
          contractId: standbyForm.contractId,
          amount: Number(standbyForm.amount),
          currency: standbyForm.currency.trim(),
          expiryDate: standbyForm.expiryDate,
          type: standbyForm.type,
          purpose: standbyForm.purpose.trim(),
          beneficiary: standbyForm.beneficiary.trim(),
          applicant: standbyForm.applicant.trim(),
          terms: standbyForm.terms.trim(),
          issuingBank: standbyForm.issuingBank.trim(),
          advisingBank: standbyForm.advisingBank.trim(),
        }),
      });

      const result = await response.json();

      if (result.success) {
        const txId = extractTxId(result);
        setStandbyResult({
          standbyLCId: result.data?.standbyLCId || '',
          standbyLCNumber: standbyForm.standbyLCNumber.trim(),
          txId: txId || '',
        });
        showSuccess(
          'Standby Letter of Credit Issued',
          `Standby LC ${standbyForm.standbyLCNumber.trim()} issued successfully`,
          'The standby LC is now ISSUED on the ledger.',
          txId,
        );
        loadBankingData();
      } else {
        const errorMsg = result.error?.message || 'Unknown error';
        setStandbyError(errorMsg);
        showError('Standby LC Issue Failed', errorMsg, 'Please try again or contact support');
      }
    } catch (error: any) {
      console.error('Error issuing standby LC:', error);
      setStandbyError(error.message);
      showError('Network Error', 'Failed to issue standby LC', error.message);
    } finally {
      setIssuingStandby(false);
    }
  };

  // Reject LC — POST /banking/lc/:lcId/reject (BANKS). Chaincode
  // RejectLC: REQUESTED → REJECTED, reason 10–500 chars; the rejection
  // is recorded on the consortium ledger and the LC cannot be approved
  // afterwards. Same endpoint/body as the DocumentValidationDialog
  // onReject path; the reason prompt (with the 10-char minimum) follows
  // handleRejectForex.
  const handleRejectLC = async (lcId: string) => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      showError('Authentication Required', 'You are not authenticated');
      return;
    }
    const reason = window.prompt(
      `Reject LC ${lcId}?\nEnter a rejection reason (10–500 characters):`,
      ''
    );
    if (reason === null) return;
    if (reason.trim().length < 10) {
      showError('Rejection Reason Too Short', 'The chaincode requires a rejection reason of 10–500 characters.');
      return;
    }
    if (reason.trim().length > 500) {
      showError('Rejection Reason Too Long', 'The chaincode requires a rejection reason of 10–500 characters.');
      return;
    }
    try {
      const response = await apiFetch(`/banking/lc/${encodeURIComponent(lcId)}/reject`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rejectionReason: reason.trim() }),
      });
      const result = await response.json();
      if (result.success) {
        showSuccess('LC Rejected', `LC ${lcId} was rejected and recorded on the consortium ledger.`, undefined, extractTxId(result));
        handleCloseDialog();
        loadBankingData();
      } else {
        showError('LC Rejection Failed', result.error?.message || 'Failed to reject LC');
      }
    } catch (error: any) {
      showError('Network Error', 'Failed to reject LC', error?.message || 'Please try again');
    }
  };

  const handleBulkApproveLC = async () => {
    if (selectedLCIds.length === 0) return;
    
    const token = localStorage.getItem('authToken');
    if (!token) {
      showError('Authentication Required', 'You are not authenticated');
      return;
    }

    setBulkApproving(true);
    let successCount = 0;
    let failCount = 0;

    for (const lcId of selectedLCIds) {
      try {
        const lc = letterOfCredits.find(l => l.lcId === lcId);
        if (!lc) continue;

        const response = await apiFetch(`/banking/lc/${lcId}/approve`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            beneficiary: lc.exporterId,
          }),
        });

        const result = await response.json();
        if (result.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (error) {
        failCount++;
      }
    }

    setBulkApproving(false);
    setSelectedLCIds([]);

    if (failCount === 0) {
      showSuccess('Bulk Approval Complete', `Successfully approved ${successCount} Letters of Credit`);
    } else {
      showWarning('Bulk Approval Partial', `Approved: ${successCount}, Failed: ${failCount}`);
    }

    loadBankingData();
  };

  const toggleLCSelection = (lcId: string) => {
    setSelectedLCIds(prev => 
      prev.includes(lcId) ? prev.filter(id => id !== lcId) : [...prev, lcId]
    );
  };

  const toggleAllLCSelection = () => {
    // Select-all applies to the All LCs tab (tab 10) list this button
    // lives in — getFilteredAllLCs() (the old getFilteredLCs was deleted
    // as dead code in the 2026-11-12 search audit).
    const requestedLCs = getFilteredAllLCs().filter(lc => lc.status === 'REQUESTED');
    if (selectedLCIds.length === requestedLCs.length) {
      setSelectedLCIds([]);
    } else {
      setSelectedLCIds(requestedLCs.map(lc => lc.lcId));
    }
  };

  const handleAmendLC = async () => {
    if (!selectedLC) return;

    const token = localStorage.getItem('authToken');
    if (!token) return;

    try {
      const response = await apiFetch(`/banking/lc/${selectedLC.lcId}/amend`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amendmentReason: amendmentForm.amendmentReason,
          newAmount: amendmentForm.newAmount ? parseFloat(amendmentForm.newAmount) : undefined,
          newExpiryDate: amendmentForm.newExpiryDate || undefined,
          newTerms: amendmentForm.newTerms || undefined,
        }),
      });

      const result = await response.json();
      if (result.success) {
        showSuccess('LC Amended', `LC ${selectedLC.lcId} has been amended successfully`, undefined, extractTxId(result));
        handleCloseDialog();
        loadBankingData();
      } else {
        showError('Amendment Failed', result.error?.message || 'Unknown error');
      }
    } catch (error: any) {
      showError('Network Error', error.message);
    }
  };

  const handlePaymentMethodSubmit = async (type: string, data: any) => {
    const token = localStorage.getItem('authToken');
    if (!token || !selectedContract) return;

    try {
      if (type === 'cad') {
        const collectionId = `CAD${Date.now()}`;
        
        const response = await apiFetch('/banking/cad', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            collectionID: collectionId,
            contractID: selectedContract.contractId,
            exporterID: selectedContract.exporterId,
            drawerName: data.drawerName,
            draweeName: data.draweeName,
            draweeAddress: data.draweeAddress,
            amount: selectedContract.totalValue,
            currency: selectedContract.currency,
            paymentTerm: data.paymentTerm,
            acceptanceDays: data.acceptanceDays ? parseInt(data.acceptanceDays) : 0,
            remittingBank: data.remittingBank,
            remittingBankBIC: data.remittingBankBIC,
            collectingBank: data.collectingBank,
            collectingBankBIC: data.collectingBankBIC,
            instructions: data.instructions,
            documents: ['Bill of Lading', 'Commercial Invoice', 'Packing List', 'Certificate of Origin'],
          }),
        });

        const result = await response.json();
        if (result.success) {
          showSuccess('Documentary Collection Sent', `Collection ${collectionId} registered successfully`, undefined, extractTxId(result));
          handleCloseDialog();
          loadBankingData();
        } else {
          showError('Collection Failed', result.error?.message || 'Unknown error');
        }
      } else if (type === 'advance') {
        const paymentId = `ADV${Date.now()}`;
        const advancePercentage = data.advancePercentage || '30';

        // The form's Amount Received is the amount recorded — it used to
        // be silently discarded in favour of the contract total, so an
        // edited amount never reached the ledger.
        const advanceAmount = data.amount ? String(data.amount) : selectedContract.totalValue.toString();
        const response = await apiFetch('/banking/payment/initiate', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentID: paymentId,
            contractID: selectedContract.contractId,
            exporterID: selectedContract.exporterId,
            lcID: '', // May not have LC for advance payment
            paymentMethod: 'ADVANCE',
            amount: advanceAmount,
            currency: selectedContract.currency,
            swiftReference: data.swiftReference || '',
            payingBank: data.payingBank || '',
            payingBankBIC: data.payingBankBIC || '',
            receivingBank: selectedContract.exporterBank || 'Commercial Bank of Ethiopia',
            receivingBankBIC: 'CBETETAA',
            beneficiaryName: selectedContract.exporterId,
            beneficiaryAccount: data.beneficiaryAccount || '',
          }),
        });

        const result = await response.json();
        if (result.success) {
          showSuccess('Advance Payment Recorded', `Payment ${paymentId} recorded. Permit will be issued.`, undefined, extractTxId(result));
          handleCloseDialog();
          loadBankingData();
        } else {
          showError('Recording Failed', result.error?.message || 'Unknown error');
        }
      } else if (type === 'consignment') {
        const consignmentId = `CONSIGN${Date.now()}`;
        
        const response = await apiFetch('/banking/consignment/register', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            consignmentID: consignmentId,
            exporterID: selectedContract.exporterId,
            commodityType: data.commodityType,
            description: data.description,
            buyerName: data.buyerName || selectedContract.buyerName,
            buyerAddress: data.buyerAddress,
            buyerCountry: selectedContract.buyerCountry,
            permitAmount: data.permitAmount || selectedContract.totalValue.toString(),
            currency: selectedContract.currency,
            permitNumber: `CP-${Date.now()}`,
          }),
        });

        const result = await response.json();
        if (result.success) {
          showSuccess('Consignment Permit Issued', `Consignment ${consignmentId} issued for ${data.commodityType}`, undefined, extractTxId(result));
          handleCloseDialog();
          loadBankingData();
        } else {
          showError('Permit Failed', result.error?.message || 'Unknown error');
        }
      }
    } catch (error: any) {
      showError('Network Error', error.message);
    }
  };

  const handleDocumentVerification = async (approved: boolean, comments: string, checklist: any) => {
    const token = localStorage.getItem('authToken');
    if (!selectedPayment) return;

    // VerifyPaymentDocuments only records VERIFIED on-chain — there is no
    // payment-document reject transition (payment.go VerifyPaymentDocuments
    // requires DOCUMENTS_SUBMITTED and sets VERIFIED). A discrepant set must
    // be recorded as an LC discrepancy (Tab 9), never "verified" here.
    if (!approved) {
      showError(
        'Cannot Reject From This Dialog',
        'Payment documents can only be verified here. Record discrepant documents as an LC discrepancy instead (Tab 9 — LC Discrepancies).',
        'Chaincode VerifyPaymentDocuments has no reject path: it only moves DOCUMENTS_SUBMITTED → VERIFIED.'
      );
      return;
    }

    try {
      // Route requires verifiedBy (validateRequest) and calls chaincode
      // VerifyPaymentDocuments, which requires DOCUMENTS_SUBMITTED.
      const response = await apiFetch(`/banking/payment/${selectedPayment.paymentID}/verify-documents`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verifiedBy: user?.username || user?.fullName || 'Bank Officer',
          comments: comments || 'Documents verified against LC terms',
        }),
      });

      const result = await response.json();
      if (result.success) {
        showSuccess('Documents Verified', 'Payment documents approved. Payment can proceed to settlement.', undefined, extractTxId(result));
        setVerificationDialogOpen(false);
        setSelectedPayment(null);
        loadBankingData();
      } else {
        showError('Verification Failed', result.error?.message || 'Unknown error');
      }
    } catch (error: any) {
      showError('Network Error', error.message);
    }
  };

  // Settle Payment — POST /payments/:paymentID/settle (slice-6 fix: the
  // settle step VERIFIED/SWIFT_RECEIVED → SETTLED had no UI caller
  // anywhere; payments could only be settled via curl). The route
  // validates all six fields and reads the payment on-chain first, so
  // without a Fabric peer it returns 404 and the error is shown honestly.
  const handleSettlePayment = async () => {
    const token = localStorage.getItem('authToken');
    const paymentId = selectedPaymentForDetails?.paymentId || selectedPaymentForDetails?.id;
    if (!paymentId) return;

    // Field validation 2026-11-16: the API now rejects a malformed BIC
    // with 400 — stop it here with a readable error instead.
    const settleBicCheck = validateBIC(settleForm.payingBankBIC, 'Paying bank BIC');
    if (!settleBicCheck.valid) {
      showError('Invalid SWIFT/BIC', settleBicCheck.error || 'Enter a valid 8- or 11-character SWIFT/BIC code.');
      return;
    }

    try {
      setSettling(true);
      const response = await apiFetch(`/payments/${paymentId}/settle`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exchangeRate: Number(settleForm.exchangeRate),
          retentionRate: Number(settleForm.retentionRate),
          payingBank: settleForm.payingBank,
          payingBankBIC: settleForm.payingBankBIC,
          swiftReference: settleForm.swiftReference,
          nbeApprovalRef: settleForm.nbeApprovalRef,
        }),
      });

      const result = await response.json();
      if (result.success) {
        showSuccess('Payment Settled', `Payment ${paymentId} settled successfully.`, undefined, extractTxId(result));
        setSettleDialogOpen(false);
        setPaymentDetailsOpen(false);
        setSelectedPaymentForDetails(null);
        loadBankingData();
      } else {
        showError('Settlement Failed', result.error?.message || 'Unknown error');
      }
    } catch (error: any) {
      showError('Network Error', error.message);
    } finally {
      setSettling(false);
    }
  };

  // LC Document Examination - Bank verifies shipping documents against LC terms
  const handleExamineLCDocuments = async (lcId: string, documentsCompliant: boolean, discrepancies: string = '') => {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    try {
      const response = await apiFetch(`/banking/lc/${lcId}/examine-documents`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compliant: documentsCompliant,
          discrepancies: discrepancies,
          examinationDate: new Date().toISOString(),
        }),
      });

      const result = await response.json();
      if (result.success) {
        if (documentsCompliant) {
          showSuccess('Documents Compliant', 'Shipping documents comply with LC terms. Payment authorized.', undefined, extractTxId(result));
        } else {
          showWarning('Discrepancies Found', `Document discrepancies: ${discrepancies}`);
        }
        loadBankingData();
      } else {
        showError('Examination Failed', result.error?.message || 'Unknown error');
      }
    } catch (error: any) {
      showError('Network Error', error.message);
    }
  };

  // Verify Individual Document - Bank approves/rejects specific document
  const handleVerifyDocument = async (documentId: string, approved: boolean) => {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    // ✅ IMMEDIATE UI FEEDBACK: Set loading state and optimistically update document
    setVerifyingDocumentId(documentId);
    
    // Optimistic update: immediately show new status in UI
    if (selectedLC && selectedLC.documents) {
      const optimisticDocs = selectedLC.documents.map((d: any) => 
        d.documentId === documentId || d.document_id === documentId
          ? { ...d, verificationStatus: approved ? 'verified' : 'rejected', status: approved ? 'verified' : 'rejected' }
          : d
      );
      setSelectedLC({ ...selectedLC, documents: optimisticDocs });
    }

    try {
      const response = await apiFetch(`/documents/${documentId}/verify`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verified: approved,  // ✅ Backend expects "verified" not "approved"
          remarks: approved ? 'Document verified and complies with LC terms' : 'Document does not comply',
        }),
      });

      const result = await response.json();
      if (result.success) {
        showSuccess(
          approved ? 'Document Approved ✅' : 'Document Rejected ❌',
          approved ? 'Document verified successfully with blockchain signature' : 'Document marked as non-compliant',
          undefined,
          extractTxId(result),
        );
        
        // ✅ Refresh the document dialog to show updated status from server
        if (selectedLC?.lcId) {
          try {
            // Fetch updated LC data
            const lcResponse = await apiFetch(`/banking/lc/${selectedLC.lcId}`, {
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            const lcResult = await lcResponse.json();
            let lcData = lcResult.success && lcResult.data ? lcResult.data : selectedLC;
            
            // Also re-fetch shipment documents if there's a related shipment
            if (selectedLC.relatedShipments && selectedLC.relatedShipments.length > 0) {
              const shipmentId = selectedLC.relatedShipments[0].shipmentId;
              console.log('[VERIFY] Re-fetching shipment documents for:', shipmentId);
              
              let shipmentDocuments: any[] = [];
              
              // Fetch SHIPMENT documents
              const shipmentDocsResponse = await apiFetch(
                `/documents/entity/SHIPMENT/${encodeURIComponent(shipmentId)}`,
                { headers: { 'Authorization': `Bearer ${token}` } }
              );
              if (shipmentDocsResponse.ok) {
                const shipmentDocsResult = await shipmentDocsResponse.json();
                if (shipmentDocsResult.success && shipmentDocsResult.data) {
                  shipmentDocuments = [...shipmentDocuments, ...shipmentDocsResult.data];
                }
              }
              
              // Fetch CUSTOMS_DECLARATION documents
              const customsDocsResponse = await apiFetch(
                `/documents/entity/CUSTOMS_DECLARATION/${encodeURIComponent(shipmentId)}`,
                { headers: { 'Authorization': `Bearer ${token}` } }
              );
              if (customsDocsResponse.ok) {
                const customsDocsResult = await customsDocsResponse.json();
                if (customsDocsResult.success && customsDocsResult.data) {
                  shipmentDocuments = [...shipmentDocuments, ...customsDocsResult.data];
                }
              }
              
              // B8/D3: normalise the raw /documents/entity/* rows to
              // camelCase and drop any row already present in the LC
              // detail (which already carries the SHIPMENT rows) — a
              // blind append of snake_case rows poisoned the Compliant
              // gate with status 'active' and collapsed the dedupe.
              lcData = {
                ...lcData,
                documents: mergeEntityDocuments(lcData.documents || [], shipmentDocuments),
                relatedShipments: selectedLC.relatedShipments
              };
            }
            
            setSelectedLC(lcData);  // ✅ Update dialog with fresh document statuses
          } catch (refreshError) {
            console.warn('Could not refresh LC documents:', refreshError);
          }
        }
        
        loadBankingData(); // Refresh main LC list
      } else {
        // Revert optimistic update on error
        if (selectedLC?.lcId) {
          const lcResponse = await apiFetch(`/banking/lc/${selectedLC.lcId}`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
          });
          const lcResult = await lcResponse.json();
          if (lcResult.success && lcResult.data) {
            setSelectedLC(lcResult.data);
          }
        }
        showError('Verification Failed', result.error?.message || 'Unknown error');
      }
    } catch (error: any) {
      // Revert optimistic update on error
      if (selectedLC?.lcId) {
        try {
          const lcResponse = await apiFetch(`/banking/lc/${selectedLC.lcId}`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
          });
          const lcResult = await lcResponse.json();
          if (lcResult.success && lcResult.data) {
            setSelectedLC(lcResult.data);
          }
        } catch {
          // Ignore refresh error
        }
      }
      showError('Network Error', error.message);
    } finally {
      setVerifyingDocumentId(null); // ✅ Clear loading state
    }
  };

  // Release Payment - Bank releases payment after document compliance
  const handleReleasePayment = async (lcId: string, amount: number, currency: string) => {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    try {
      const response = await apiFetch(`/banking/lc/${lcId}/release-payment`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amount.toString(),
          currency: currency,
          paymentDate: new Date().toISOString(),
        }),
      });

      const result = await response.json();
      if (result.success) {
        showSuccess('Payment Released', `${currency} ${amount.toLocaleString()} released to exporter via SWIFT`, undefined, extractTxId(result));
        loadBankingData();
      } else {
        showError('Payment Failed', result.error?.message || 'Unknown error');
      }
    } catch (error: any) {
      showError('Network Error', error.message);
    }
  };

  // Issue Export Permit — POST /permits (slice-6 fix: the permit step had
  // no UI caller anywhere in the app; API_ENDPOINTS.permits existed but
  // was never used). The API resolves the commercial terms from the
  // contract (leg2 #1/#2 — no 85000/'Germany' defaults), so send the
  // contract's own amount/currency/destination when known; the API
  // still 400s honestly if no contract can be resolved.
  const handleIssueExportPermit = async (shipment: any) => {
    const token = localStorage.getItem('authToken');
    if (!token) return;
    const shipmentId = shipment.shipmentId || shipment.shipmentID;
    const contractId = shipment.contractId || shipment.contractID || '';
    const lc = letterOfCredits.find((l: any) => l.contractId === contractId);
    const contract = contracts.find((c: any) => c.contractId === contractId);

    // F16: refuse a re-issue when this contract already has a permit
    // (the card hides the button; this is the backstop if it is reached
    // while the permits list is still loading).
    const existingPermit = permitForContract(contractId);
    if (existingPermit) {
      showWarning('Permit Already Issued', `Contract ${contractId} already has export permit ${existingPermit.permitId}. A second permit will not be issued.`);
      return;
    }

    try {
      const response = await apiFetch('/permits', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shipmentID: shipmentId,
          contractID: contractId,
          exporterID: shipment.exporterId || shipment.exporterID || lc?.exporterId || '',
          lcID: lc?.lcId || '',
          paymentMethod: 'LC',
          amount: contract?.totalValue,
          currency: contract?.currency,
          destination: contract?.buyerCountry,
        }),
      });

      const result = await response.json();
      if (result.success) {
        showSuccess('Export Permit Issued', `Permit ${result.data?.permitId || ''} issued for shipment ${shipmentId}.`, undefined, extractTxId(result));
        loadBankingData();
      } else {
        showError('Permit Issue Failed', result.error?.message || 'Unknown error');
      }
    } catch (error: any) {
      showError('Network Error', error.message);
    }
  };

  // Allocate Forex - Bank action
  const handleAllocateForex = async (forex: any) => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      showError('Authentication Required', 'You are not authenticated');
      return;
    }

    try {
      // Drafts are derived from an issued LC and do not exist on the ledger yet.
      if (forex.isDraft) {
        // Step 1: Create the forex request
        const forexId = `FOREX_${forex.lcId}_${Date.now()}`;
        const requestPayload = {
          forexId: forexId,
          lcId: forex.lcId,
          contractId: forex.contractId,
          exporterId: forex.exporterId,
          amount: forex.requestedAmount || 0,
          currency: forex.currency || 'USD',
        };
        
        showInfo('Creating Forex Request', 'Creating forex allocation request...');
        
        const requestResponse = await apiFetch('/forex/request', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(requestPayload),
        });
        
        const requestResult = await requestResponse.json();
        if (!requestResult.success) {
          showError('Forex Request Failed', requestResult.error?.message || 'Failed to create forex request');
          return;
        }

        showSuccess(
          'Forex Request Submitted',
          `Request ${forexId} was sent to NBE for confirmation.`,
          'Allocation becomes available after NBE confirms the request.',
          extractTxId(requestResult),
        );
        loadBankingData();
        return;
      }
      
      // Step 2: Allocate the forex. The route reads `officer` and
      // `approvalRef` (forex.ts) — the dialog collects both from the user,
      // so send them through instead of inventing an approval reference.
      const payload = {
        forexId: forex.forexId,
        lcId: forex.lcId || '',
        amount: forex.requestedAmount || forex.allocatedAmount || 0,
        exchangeRate: forex.exchangeRate || 0,
        retentionRate: forex.retentionRate || 0,
        officer: forex.officer || user?.username || user?.fullName || 'Bank Officer',
        approvalRef: forex.approvalRef || '',
        expiryDate: forex.expiryDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const response = await apiFetch('/forex/allocate', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (result.success) {
        const actualRetentionRate = Number(result.autoMapped?.retentionRate ?? payload.retentionRate);
        showSuccess('Forex Allocated', `Forex allocated successfully for LC ${forex.lcId}`, `Recorded retention: ${actualRetentionRate}%`, extractTxId(result));
        setAllocationDialogOpen(false);
        loadBankingData();
      } else {
        showError('Allocation Failed', result.error?.message || 'Unknown error');
      }
    } catch (error: any) {
      showError('Network Error', error.message || 'Failed to allocate forex');
    }
  };

  // Reject Forex — POST /banking/forex/:forexID/reject (BANKS).
  // Chaincode RejectForex: REQUESTED/CONFIRMED → REJECTED, reason 10–500
  // chars; impossible once ALLOCATED ("funds are committed").
  const handleRejectForex = async (forex: any) => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      showError('Authentication Required', 'You are not authenticated');
      return;
    }
    const reason = window.prompt(
      `Reject forex allocation ${forex.forexId}?\nEnter a rejection reason (10–500 characters):`,
      ''
    );
    if (reason === null) return;
    if (reason.trim().length < 10) {
      showError('Rejection Reason Too Short', 'The chaincode requires a rejection reason of 10–500 characters.');
      return;
    }
    if (reason.trim().length > 500) {
      showError('Rejection Reason Too Long', 'The chaincode requires a rejection reason of 10–500 characters.');
      return;
    }
    try {
      const response = await apiFetch(`/banking/forex/${encodeURIComponent(forex.forexId)}/reject`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectionReason: reason.trim() }),
      });
      const result = await response.json();
      if (result.success) {
        showSuccess('Forex Rejected', `Forex allocation ${forex.forexId} was rejected.`);
        setForexDetailsOpen(false);
        loadBankingData();
      } else {
        showError('Forex Rejection Failed', result.error?.message || 'Unknown error');
      }
    } catch (error: any) {
      showError('Network Error', error.message || 'Failed to reject forex allocation');
    }
  };

  // Utilise Forex — POST /forex/utilize (BANKS). Chaincode UtilizeForex:
  // ALLOCATED → UTILIZED, amount > 0 and <= AllocatedAmount.
  const handleUtilizeForex = async (forex: any) => {
    const max = Number(forex.allocatedAmount) || 0;
    if (max <= 0) {
      showError('Nothing To Utilise', `Forex ${forex.forexId} has no allocated amount.`);
      return;
    }
    
    // ✅ WORKFLOW ENFORCEMENT: Check if shipment exists before allowing utilization
    // UCP 600 requires: LC → Forex Allocated → Shipment Created → Document Examination → Forex Utilized
    try {
      const token = localStorage.getItem('authToken');
      if (token && forex.contractId) {
        // D1/B6 (2026-11-18, merge fix): GET /shipments returns
        // {success, data, pagination} — there is no `.shipments` field,
        // so reading it always yielded [] and this gate always warned
        // "Shipment Required" and the dialog never opened. Use
        // api.getShipments (which pages through the whole list and
        // returns .data) and accept either payload shape defensively.
        // Shipments carry no lcId, so match on the contract only.
        const shipmentsResult = await api.getShipments({});
        const payload: any = shipmentsResult as any;
        const shipments = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload?.shipments)
            ? payload.shipments
            : Array.isArray(payload)
              ? payload
              : [];

        // Check if any shipment exists for this contract
        const hasShipment = shipments.some((s: any) =>
          (s.contractId ?? s.contract_id) === forex.contractId
        );

        if (!hasShipment) {
          showWarning(
            'Shipment Required',
            'Forex cannot be utilized before shipment creation',
            'Please create a shipment first to comply with UCP 600 workflow requirements. Go to Exporter Portal → Shipments to create a shipment for this contract.'
          );
          return;
        }
      }
    } catch (validationError) {
      console.warn('Shipment validation check failed (continuing):', validationError);
      // Continue if validation fails - don't block legitimate operations
    }
    
    // Open utilize dialog with pre-filled max amount
    setUtilizeForm({
      forexId: forex.forexId,
      maxAmount: max,
      utilizedAmount: max // Default to full amount
    });
    setUtilizeDialogOpen(true);
  };
  
  const confirmUtilizeForex = async () => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      showError('Authentication Required', 'You are not authenticated');
      return;
    }
    
    const { forexId, maxAmount, utilizedAmount } = utilizeForm;
    
    // Convert to number in case it's a string from the input
    const amount = Number(utilizedAmount);
    
    if (!Number.isFinite(amount) || amount <= 0 || amount > maxAmount) {
      showError('Invalid Amount', `Enter an amount greater than 0 and no more than ${maxAmount.toLocaleString()} USD.`);
      return;
    }
    
    try {
      const response = await apiFetch('/forex/utilize', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ forexId, utilizedAmount: amount }),
      });
      const result = await response.json();
      if (result.success) {
        showSuccess('Forex Utilised', `${amount.toLocaleString()} USD of forex ${forexId} utilised.`);
        setUtilizeDialogOpen(false);
        setForexDetailsOpen(false);
        loadBankingData();
      } else {
        // Enhanced error handling for workflow violations
        if (result.error?.code === 'SHIPMENT_REQUIRED') {
          showWarning(
            'Shipment Required',
            result.error?.message || 'Forex cannot be utilized before shipment creation',
            'Please create a shipment first to comply with UCP 600 workflow requirements.'
          );
        } else {
          showError('Forex Utilisation Failed', result.error?.message || 'Unknown error');
        }
      }
    } catch (error: any) {
      showError('Network Error', error.message || 'Failed to utilise forex');
    }
  };

  // Create a NEW SWIFT message (Compose dialog). This only creates the
  // message as DRAFT on the ledger — it does not send it. Sending an
  // existing message is handleSwiftLifecycleAction('send') below, which
  // calls POST /swift/messages/:id/send (chaincode APPROVED → SENT).
  // LEG3 M-7: returns true only when the message was created, so the
  // caller can close the compose dialog on success and KEEP it (with the
  // form contents) on failure. It used to return undefined and the
  // dialog closed either way.
  const handleCreateSwiftMessage = async (msg: any): Promise<boolean> => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      showError('Authentication Required', 'You are not authenticated');
      return false;
    }

    try {
      // MT700 requires lcID/applicant/beneficiary/expiryDate (swift.ts
      // validateRequest); the generic create requires the BIC/reference
      // fields. Send the full form so both endpoints validate.
      const payload: any = {
        messageID: msg.messageID || msg.messageId || `MSG${Date.now()}`,
        messageType: msg.messageType || 'MT103',
        swiftReference: msg.swiftReference || `REF${Date.now()}`,
        senderBIC: msg.senderBIC || msg.senderBic || 'CBETETAA',
        receiverBIC: msg.receiverBIC || msg.receiverBic || '',
        amount: msg.amount || 0,
        currency: msg.currency || 'USD',
        linkedLcId: msg.linkedLcId || msg.lcId || '',
        linkedPaymentId: msg.linkedPaymentId || '',
        lcID: msg.linkedLcId || msg.lcId || '',
        applicant: msg.applicant || '',
        beneficiary: msg.beneficiary || '',
        expiryDate: msg.lcExpiryDate || '',
        valueDate: msg.valueDate || '',
        remittanceInfo: msg.remittanceInfo || '',
        // MT750 discrepancy details (required by /swift/messages/mt750;
        // the dialog now collects them — previously every MT750 was
        // created with empty details).
        discrepancyDetails: msg.discrepancyDetails || '',
        // LEG3 M-2: forward attached documents so the generic create
        // route calls AddSWIFTDocuments with them.
        documents: msg.documents && msg.documents.length > 0 ? msg.documents : undefined,
        // F20 (MT707): amendment advice — POST /swift/messages/mt707
        // requires amendmentReason; newAmount / newExpiryDate /
        // amendmentNumber are optional. The dialog's Amount field is
        // the new amount and LC Expiry Date is the new expiry date
        // for an MT707; the amendment number follows the LC's own
        // amendment count (list rows carry amendmentCount).
        amendmentReason: msg.amendmentReason || '',
        newAmount: msg.messageType === 'MT707' && msg.amount !== '' && msg.amount != null ? String(msg.amount) : '',
        newExpiryDate: msg.messageType === 'MT707' ? (msg.lcExpiryDate || '') : '',
        amendmentNumber: msg.messageType === 'MT707'
          ? ((letterOfCredits.find((lc) => lc.lcId === (msg.linkedLcId || msg.lcId || '')) as any)?.amendmentCount ?? 0) + 1
          : undefined,
      };

      // F20 (MT707): an amendment advice is only meaningful for an
      // AMENDED LC. The chaincode (CreateMT707_AmendLC) does not check
      // LC state, so the UI is the guard. The guard reads the
      // ledger-backed LC detail endpoint — NOT the portal's LC list:
      // the list is the PG mirror, which the amend route never updates,
      // so an amended LC still reads ISSUED there (verified live on two
      // LCs). If the detail read fails, it falls back to the list.
      if (msg.messageType === 'MT707') {
        const linkedLcId = msg.linkedLcId || msg.lcId || '';
        const listedLc = letterOfCredits.find((lc) => lc.lcId === linkedLcId);
        let detailStatus: string | null = null;
        try {
          const detailRes = await apiFetch(`/banking/lc/${encodeURIComponent(linkedLcId)}`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          const detail = await detailRes.json();
          if (detailRes.ok && detail.success && detail.data) {
            detailStatus = String(detail.data.status || detail.data.Status || '');
          }
        } catch (e) {
          console.warn('[BANKS] MT707 LC detail check failed, using list status:', e);
        }
        const effectiveStatus = detailStatus || listedLc?.status || '';
        if (!listedLc && !detailStatus) {
          showError('Validation', `LC ${linkedLcId} was not found. MT707 can only be sent for an AMENDED LC.`);
          return false;
        }
        if (effectiveStatus !== 'AMENDED') {
          showError('Validation', `LC ${linkedLcId} is ${effectiveStatus || 'unknown'}, not AMENDED. MT707 (amendment advice) can only be sent for an amended LC.`);
          return false;
        }
      }

      // Choose endpoint based on message type
      const endpoint = (msg.messageType === 'MT700') ? '/swift/messages/mt700'
        : (msg.messageType === 'MT707') ? '/swift/messages/mt707'
        : '/swift/messages';

      const response = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (result.success) {
        showSuccess('SWIFT Message Created', `Message ${payload.messageID} created as DRAFT. Approve it from the SWIFT tab, then send it.`);
        loadBankingData();
        return true;
      } else {
        showError('SWIFT Creation Failed', result.error?.message || 'Failed to create SWIFT message');
        return false;
      }
    } catch (error: any) {
      showError('Network Error', error.message || 'Failed to create SWIFT message');
      return false;
    }
  };

  // Re-fetch ONLY the SWIFT list (same endpoint/shape as the SWIFT
  // promise in loadBankingData) without touching other state. Returns
  // the rows, or [] on failure — never throws.
  const fetchSwiftMessages = async (): Promise<any[]> => {
    const token = localStorage.getItem('authToken');
    if (!token) return [];
    try {
      const response = await apiFetch('/api/v1/swift/messages', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const result = await response.json();
      if (result.success) return result.data || [];
      return [];
    } catch {
      return [];
    }
  };

  // Re-fetch the SWIFT list until the acted-on message shows the
  // expected post-action status, then apply the fresh list. The list
  // read (GET /api/v1/swift/messages) is served from the CouchDB state
  // DB, which can lag the ledger commit by a few seconds — a single
  // immediate reload can therefore return the PRE-action status and
  // leave the row looking unchanged until a manual reload. Only a list
  // that already shows the new status is applied, so a stale read can
  // never flash the row back to its old state.
  const refreshSwiftMessagesUntil = async (
    messageId: string,
    expectedStatus: string,
    attempts = 6
  ): Promise<boolean> => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const rows = await fetchSwiftMessages();
      const row = rows.find((m: any) => (m.messageId || m.messageID || m.MessageID) === messageId);
      if (row && row.status === expectedStatus) {
        setSwiftMessages(rows);
        return true;
      }
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    return false;
  };

  // --- Live refresh (2026-11-19) -------------------------------------------
  // The bell's socket is shared — no second WebSocket. SWIFT
  // notifications re-fetch just the SWIFT list until it converges on
  // the notified message (same "until" guard as
  // refreshSwiftMessagesUntil, but the expected status is NOT in the
  // row, so convergence = the row for entityId differs from the
  // last-seen snapshot, or the list length moved); a stale list is
  // never applied. Every other relevant notification reloads the
  // whole portal (debounced + mirror-lag-delayed by the hook). While
  // the socket is down the hook polls loadBankingData every 30 s.
  const swiftMessagesRef = useRef<any[]>([]);
  swiftMessagesRef.current = swiftMessages;
  const refreshSwiftMessagesUntilChanged = async (messageId: string): Promise<boolean> => {
    const snapshot = swiftMessagesRef.current;
    const snapRow = messageId
      ? snapshot.find((m: any) => (m.messageId || m.messageID || m.MessageID) === messageId)
      : undefined;
    for (let attempt = 0; attempt < 6; attempt++) {
      const rows = await fetchSwiftMessages();
      const row = messageId
        ? rows.find((m: any) => (m.messageId || m.messageID || m.MessageID) === messageId)
        : undefined;
      const changed =
        rows.length !== snapshot.length ||
        JSON.stringify(row ?? null) !== JSON.stringify(snapRow ?? null);
      if (changed) {
        setSwiftMessages(rows);
        return true;
      }
      if (attempt < 5) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    return false;
  };
  usePortalLiveRefresh({
    refetch: () => { void loadBankingData(); },
    isRelevant: (row: LiveNotificationRow) => BANKS_LIVE_TYPES.has(row.type),
    resolveRefetch: (row: LiveNotificationRow) =>
      row.type.startsWith('swift_')
        ? { key: 'swift', run: () => refreshSwiftMessagesUntilChanged(row.entityId || '') }
        : null,
  });

  // SWIFT lifecycle on an EXISTING message — chaincode swift.go:
  // DRAFT → APPROVED → SENT → RECEIVED → PROCESSING → SETTLED, and any
  // non-terminal state → REJECTED. NBE_APPROVED → APPROVED is the same
  // approve call. Each route takes only the message ID (reject also
  // requires a reason). Never re-creates the message.
  const handleSwiftLifecycleAction = async (msg: any, action: 'approve' | 'send' | 'receive' | 'process' | 'settle' | 'reject') => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      showError('Authentication Required', 'You are not authenticated');
      return;
    }
    const messageId = msg.messageId || msg.messageID || msg.MessageID;
    if (!messageId) {
      showError('Missing Message ID', 'This SWIFT record has no message ID to act on.');
      return;
    }
    let reason = '';
    if (action === 'reject') {
      reason = window.prompt(`Reject SWIFT message ${messageId}? Enter a rejection reason (required):`, '') || '';
      if (!reason.trim()) return;
    }
    const pastTense: Record<string, string> = {
      approve: 'approved', send: 'sent', receive: 'received',
      process: 'moved to processing', settle: 'settled', reject: 'rejected',
    };
    // Status the message must show after this action (chaincode swift.go).
    const expectedStatus: Record<string, string> = {
      approve: 'APPROVED', send: 'SENT', receive: 'RECEIVED',
      process: 'PROCESSING', settle: 'SETTLED', reject: 'REJECTED',
    };
    try {
      const response = await apiFetch(`/swift/messages/${encodeURIComponent(messageId)}/${action}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'reject' ? { reason: reason.trim() } : {}),
      });
      const result = await response.json();
      if (result.success) {
        const nextStatus = expectedStatus[action];
        // Optimistic row update: the API confirmed the ledger write, so
        // the row (and the open details dialog, if any) shows the new
        // status immediately instead of the pre-action one.
        setSwiftMessages((prev: any[]) => prev.map((m: any) =>
          (m.messageId || m.messageID || m.MessageID) === messageId
            ? { ...m, status: nextStatus }
            : m
        ));
        setSelectedSwiftMessage((prev: any) =>
          prev && (prev.messageId || prev.messageID || prev.MessageID) === messageId
            ? { ...prev, status: nextStatus }
            : prev
        );
        showSuccess('SWIFT Message Updated', `Message ${messageId} ${pastTense[action]}.`);
        // Full refresh like every other action in this file, then
        // re-assert the confirmed status (the list read can lag the
        // commit), then keep polling the list until it agrees with the
        // ledger. If it never converges, the optimistic row above stays
        // — it matches the API-confirmed ledger state.
        await loadBankingData();
        setSwiftMessages((prev: any[]) => prev.map((m: any) =>
          (m.messageId || m.messageID || m.MessageID) === messageId
            ? { ...m, status: nextStatus }
            : m
        ));
        await refreshSwiftMessagesUntil(messageId, nextStatus);
      } else {
        showError('SWIFT Action Failed', result.error?.message || `Failed to ${action} SWIFT message`);
      }
    } catch (error: any) {
      showError('Network Error', error.message || 'Failed to update SWIFT message');
    }
  };

  // Filter and Pagination Helper Functions
  // NOTE (2026-11-12 search audit): the old getFilteredLCs() lived here
  // and filtered letterOfCredits by searchTerm, but no tab ever called
  // it — the All LCs tab uses getFilteredAllLCs() below. Deleted as dead
  // code; do not revive it, extend getFilteredAllLCs() instead.
  // All LCs tab (tab 10) filter — the 11 real LC statuses (matrix §3: the 10
  // chaincode states plus PENDING, the letters_of_credit default from
  // migration 058). Uses the tab-local allLcFilterStatus state, plus the
  // shared search box. (The old getFilteredLCs filtered by searchTerm
  // but was never called — this tab rendered this function, which
  // ignored the search term, so the LC list was the one Banks list
  // with no search at all. getFilteredLCs is deleted, not revived:
  // this is the live path.)
  const getFilteredAllLCs = () => {
    let filtered =
      allLcFilterStatus === 'ALL'
        ? letterOfCredits
        : letterOfCredits.filter((lc) => lc.status === allLcFilterStatus);
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (lc) =>
          (lc.lcId || '').toLowerCase().includes(lowerSearch) ||
          (lc.contractId || '').toLowerCase().includes(lowerSearch) ||
          (lc.exporterId || '').toLowerCase().includes(lowerSearch),
      );
    }
    return filtered;
  };

  const getFilteredForex = () => {
    let filtered = forexAllocations;
    devLog(`[BANKS] 🔍 getFilteredForex() called with ${forexAllocations.length} total forex allocations`);
    
    if (searchTerm) {
      filtered = filtered.filter(forex => 
        forex.forexId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        forex.lcId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        forex.exporterId.toLowerCase().includes(searchTerm.toLowerCase())
      );
      devLog(`[BANKS] 🔍 After search filter (term: "${searchTerm}"): ${filtered.length} items`);
    }
    if (filterStatus !== 'ALL') {
      // CONFIRMED_OR_ALLOCATED is a filter bucket, not a status: it matches
      // NBE-confirmed (CONFIRMED) or allocated (ALLOCATED) forex. The old
      // bucket APPROVED_OR_ALLOCATED matched APPROVED, a state the
      // chaincode never assigns (NBE approve now writes CONFIRMED).
      if (filterStatus === 'CONFIRMED_OR_ALLOCATED') {
        filtered = filtered.filter(forex => forex.status === 'CONFIRMED' || forex.status === 'ALLOCATED');
      } else {
        filtered = filtered.filter(forex => forex.status === filterStatus);
      }
      devLog(`[BANKS] 🔍 After status filter (status: "${filterStatus}"): ${filtered.length} items`);
    }
    if (amountMin) {
      filtered = filtered.filter(forex => forex.allocatedAmount >= parseFloat(amountMin));
      devLog(`[BANKS] 🔍 After min amount filter (min: ${amountMin}): ${filtered.length} items`);
    }
    if (amountMax) {
      filtered = filtered.filter(forex => forex.allocatedAmount <= parseFloat(amountMax));
      devLog(`[BANKS] 🔍 After max amount filter (max: ${amountMax}): ${filtered.length} items`);
    }
    
    devLog(`[BANKS] ✅ getFilteredForex() returning ${filtered.length} items`);
    return filtered;
  };

  const getFilteredSwiftMessages = () => {
    let filtered = swiftMessages;
    if (searchTerm) {
      filtered = filtered.filter((msg: any) =>
        msg.messageId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        msg.swiftReference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        msg.senderBic?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        msg.receiverBic?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        msg.linkedLcId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        msg.linkedPaymentId?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    if (filterStatus !== 'ALL') {
      filtered = filtered.filter((msg: any) => msg.status === filterStatus);
    }
    if (amountMin) {
      filtered = filtered.filter((msg: any) => (msg.amount || 0) >= parseFloat(amountMin));
    }
    if (amountMax) {
      filtered = filtered.filter((msg: any) => (msg.amount || 0) <= parseFloat(amountMax));
    }
    return filtered;
  };

  const getFilteredDocumentExaminationLCs = () => {
    // S6 (2026-11-18, banks-tabs-status fix): the PENDING view is
    // truly-pending only (FOREX_ALLOCATED) — the badge and the
    // "Pending Examination" KPI count exactly this list. Examined rows
    // (UTILIZED, PAYMENT_RELEASED) stay on the tab for audit trail
    // under the VERIFIED view, which is what "verified" means: they
    // passed examination and were verified.
    const baseList = documentExaminationFilter === 'VERIFIED'
      ? letterOfCredits.filter(lc => lc.status === 'UTILIZED' || lc.status === 'PAYMENT_RELEASED')
      : lcsForExamination.filter((lc: any) => lc.status === 'FOREX_ALLOCATED');

    if (!searchTerm) {
      return baseList;
    }

    const lowerSearch = searchTerm.toLowerCase();
    return baseList.filter(lc =>
      lc.lcId?.toLowerCase().includes(lowerSearch) ||
      lc.exporterId?.toLowerCase().includes(lowerSearch) ||
      lc.currency?.toLowerCase().includes(lowerSearch) ||
      lc.status?.toLowerCase().includes(lowerSearch)
    );
  };

  const getFilteredPaymentReleaseLCs = () => {
    // F9: RELEASED_TODAY and TOTAL_RELEASED used to render the identical
    // unfiltered PAYMENT_RELEASED list. Now each filter is the date
    // bucket its KPI counts (bridge payment date: today / this month).
    const baseList = paymentReleaseFilter === 'RELEASED_TODAY'
      ? releasedTodayLCs
      : paymentReleaseFilter === 'TOTAL_RELEASED'
        ? releasedThisMonthLCs
        : lcsForPaymentRelease;

    if (!searchTerm) {
      return baseList;
    }

    const lowerSearch = searchTerm.toLowerCase();
    return baseList.filter(lc =>
      lc.lcId?.toLowerCase().includes(lowerSearch) ||
      lc.exporterId?.toLowerCase().includes(lowerSearch) ||
      lc.currency?.toLowerCase().includes(lowerSearch) ||
      lc.status?.toLowerCase().includes(lowerSearch)
    );
  };

  const getPaginatedData = (data: any[]) => {
    const startIndex = currentPage * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    return data.slice(startIndex, endIndex);
  };

  const handleChangePage = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const handleChangeRowsPerPage = (newRowsPerPage: number) => {
    setRowsPerPage(newRowsPerPage);
    setCurrentPage(0);
  };

  // CSV Export Functions
  const generateContractCSV = (data: SalesContract[]) => {
    const headers = ['Contract ID', 'NBE Reference', 'Exporter', 'Buyer', 'Country', 'Coffee Type', 'Quantity (kg)', 'Price/kg', 'Total Value', 'Currency', 'Status', 'Registration Date'];
    const rows = data.map(c => [
      c.contractId,
      c.nbeReferenceNumber,
      c.exporterId,
      c.buyerName,
      c.buyerCountry,
      c.coffeeType,
      c.quantity,
      c.pricePerKg,
      c.totalValue,
      c.currency,
      c.status,
      new Date(c.registrationDate).toLocaleDateString()
    ]);
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  };

  const generateLCCSV = (data: LetterOfCredit[]) => {
    const headers = ['LC ID', 'Contract ID', 'Exporter', 'Issuing Bank', 'Advising Bank', 'Amount', 'Currency', 'Status', 'Expiry Date', 'Request Date'];
    const rows = data.map(lc => [
      lc.lcId,
      lc.contractId,
      lc.exporterId,
      lc.issuingBank || 'N/A',
      lc.advisingBank || 'N/A',
      lc.amount,
      lc.currency,
      lc.status,
      lc.expiryDate ? new Date(lc.expiryDate).toLocaleDateString() : 'N/A',
      lc.requestDate ? new Date(lc.requestDate).toLocaleDateString() : 'N/A'
    ]);
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  };

  const generateForexCSV = (data: ForexAllocation[]) => {
    const headers = ['Forex ID', 'LC ID', 'Exporter', 'Allocated Amount', 'Exchange Rate', 'Retention Amount USD', 'ETB Converted', 'Status', 'Expiry Date'];
    const rows = data.map(f => [
      f.forexId,
      f.lcId,
      f.exporterId,
      f.allocatedAmount,
      f.exchangeRate,
      f.exchangeRate > 0 ? (f.allocatedAmount * f.retentionRate / 100).toFixed(2) : '',
      f.exchangeRate > 0 ? (f.allocatedAmount * (100 - f.retentionRate) / 100 * f.exchangeRate).toFixed(2) : '',
      f.status,
      f.expiryDate ? new Date(f.expiryDate).toLocaleDateString() : 'N/A'
    ]);
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  };

  const generateSwiftCSV = (data: any[]) => {
    const headers = ['Message ID', 'Type', 'SWIFT Reference', 'Sender BIC', 'Receiver BIC', 'Amount', 'Currency', 'Status', 'Created/Updated Date'];
    const rows = data.map(msg => [
      msg.messageId,
      msg.messageType,
      msg.swiftReference,
      msg.senderBic,
      msg.receiverBic,
      msg.amount || 0,
      msg.currency || 'USD',
      msg.status,
      msg.sentDate || msg.createdAt || msg.updatedAt || 'N/A'
    ]);
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  };

  const downloadCSV = (csvContent: string, filename: string) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <ThemeProvider theme={banksTheme}>
      <PortalShell brand="BANKS" title="Banks Portal" subtitle="Commercial Bank of Ethiopia">
        {/* Professional KPI Cards - Dynamic per Tab */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          {(() => {
            // Dynamic KPI cards based on active tab (like ShippingPortal)
            const kpis = activeTab === 0 ? [
              // Tab 0: Payment Methods - Show ALL LCs for complete visibility
              // Include both pending (REQUESTED, APPROVED) and completed (all other statuses) for audit trail
              { 
                icon: <Description />, 
                label: 'Letter of Credit', 
                value: letterOfCredits.length, 
                color: '#9b30b7',
                subtitle: 'Bank-guaranteed (UCP 600)',
                method: 'LC',
                clickable: true,
                debug: `Total LCs: ${letterOfCredits.length} (Pending: ${letterOfCredits.filter(lc => ['REQUESTED', 'APPROVED'].includes(lc.status)).length}, Completed: ${letterOfCredits.filter(lc => !['REQUESTED', 'APPROVED'].includes(lc.status)).length})`
              },
              { 
                icon: <DirectionsBoat />, 
                label: 'Documentary Collection', 
                value: documentaryCollections.length, 
                color: '#2196F3',
                subtitle: 'Cash Against Documents',
                method: 'CAD',
                clickable: true,
                debug: `Ledger documentary collections loaded: ${documentaryCollections.length}`
              },
              { 
                icon: <AttachMoney />, 
                label: 'Advance Payment', 
                value: advancePayments.length, 
                color: '#ff9800',
                subtitle: 'Payment before shipment',
                method: 'ADVANCE',
                clickable: true,
                debug: `Ledger advance payments loaded: ${advancePayments.length}`
              },
              { 
                icon: <Assignment />, 
                label: 'Consignment', 
                value: consignments.length, 
                color: '#4caf50',
                subtitle: 'Fruits, Flowers, Meat',
                method: 'CONSIGNMENT',
                clickable: true,
                debug: `Consignment Array Length: ${consignments.length}, Has Data: ${consignments.length > 0 ? 'YES' : 'NO'}`
              },
            ] : activeTab === 1 ? [
              // Tab 1: Forex Allocations KPIs - Show data in table
              { 
                icon: <CurrencyExchange />, 
                label: 'Total Forex Requests', 
                value: persistedForexAllocations.length,
                color: '#FFD700',
                subtitle: 'All Requests',
                description: 'View every forex allocation request below.',
                clickable: true,
                selected: filterStatus === 'ALL',
                onClick: () => {
                  setSearchTerm('');
                  setFilterStatus('ALL');
                  setAmountMin('');
                  setAmountMax('');
                  setCurrentPage(0);
                },
                debug: `Ledger Forex Records: ${persistedForexAllocations.length}, Has Data: ${persistedForexAllocations.length > 0 ? 'YES' : 'NO'}`
              },
              { 
                icon: <AttachMoney />, 
                label: 'Total Requested', 
                value: `$${(persistedForexAllocations.reduce((s, f) => {
                  // For REQUESTED, use requestedAmount; for others, use allocatedAmount
                  const amount = f.status === 'REQUESTED' ? (Number(f.requestedAmount) || 0) : (Number(f.allocatedAmount) || 0);
                  return s + amount;
                }, 0) / 1000000).toFixed(1)}M`, 
                color: '#9b30b7',
                subtitle: 'Total USD',
                description: 'Sum of all requested and allocated forex amounts in USD.',
                clickable: true,
                selected: filterStatus === 'ALLOCATED',
                onClick: () => {
                  setSearchTerm('');
                  setFilterStatus('ALLOCATED');
                  setAmountMin('');
                  setAmountMax('');
                  setCurrentPage(0);
                }
              },
              { 
                icon: <CheckCircle />, 
                label: 'Confirmed / Allocated', 
                value: persistedForexAllocations.filter(f => f.status === 'CONFIRMED' || f.status === 'ALLOCATED').length,
                color: '#4caf50',
                subtitle: 'Ready to Use',
                description: 'Forex confirmed by NBE or already allocated.',
                clickable: true,
                selected: filterStatus === 'CONFIRMED_OR_ALLOCATED',
                onClick: () => {
                  setSearchTerm('');
                  setFilterStatus('CONFIRMED_OR_ALLOCATED');
                  setAmountMin('');
                  setAmountMax('');
                  setCurrentPage(0);
                }
              },
              { 
                icon: <AccessTime />, 
                label: 'Pending Allocation', 
                // REQUESTED is the only awaiting-allocation forex state; the
                // old PENDING arm matched nothing (stored values are
                // uppercase REQUESTED, and no machine produces PENDING).
                value: persistedForexAllocations.filter(f => f.status === 'REQUESTED').length,
                color: '#ff9800',
                subtitle: 'Awaiting Action',
                description: 'LC issued, awaiting bank forex allocation.',
                clickable: true,
                selected: filterStatus === 'REQUESTED',
                onClick: () => {
                  setSearchTerm('');
                  setFilterStatus('REQUESTED');
                  setAmountMin('');
                  setAmountMax('');
                  setCurrentPage(0);
                }
              },
            ] : activeTab === 4 ? [
              // Tab 4: SWIFT Messages - Show multiple KPI cards like other tabs
              { 
                icon: <MessageOutlined />, 
                label: 'Total Messages', 
                value: swiftMessages.length, 
                color: '#9b30b7',
                subtitle: 'SWIFT Messages',
                description: 'All SWIFT messages linked to LCs and payments.',
                clickable: true,
                selected: filterStatus === 'ALL',
                onClick: () => {
                  setSearchTerm('');
                  setFilterStatus('ALL');
                  setAmountMin('');
                  setAmountMax('');
                  setCurrentPage(0);
                },
                debug: `SWIFT Array Length: ${swiftMessages.length}, Has Data: ${swiftMessages.length > 0 ? 'YES' : 'NO'}`
              },
              { 
                icon: <SendOutlined />, 
                label: 'Sent', 
                value: swiftMessages.filter((msg: any) => msg.status === 'SENT').length, 
                color: '#2196F3',
                subtitle: 'Outgoing',
                description: 'Messages that have been dispatched to counterparties.',
                clickable: true,
                selected: filterStatus === 'SENT',
                onClick: () => {
                  setSearchTerm('');
                  setFilterStatus('SENT');
                  setAmountMin('');
                  setAmountMax('');
                  setCurrentPage(0);
                }
              },
              { 
                icon: <AccountBalance />, 
                label: 'Received', 
                value: swiftMessages.filter((msg: any) => msg.status === 'RECEIVED').length, 
                color: '#4caf50',
                subtitle: 'Incoming',
                description: 'Messages received from the counterparty bank.',
                clickable: true,
                selected: filterStatus === 'RECEIVED',
                onClick: () => {
                  setSearchTerm('');
                  setFilterStatus('RECEIVED');
                  setAmountMin('');
                  setAmountMax('');
                  setCurrentPage(0);
                }
              },
              // S5 (2026-11-18, banks-tabs-status fix): Total / Sent /
              // Received left 62 of 80 messages (78%) in no bucket — a
              // stuck DRAFT or a REJECTED message was invisible in the
              // KPI row. One card per SWIFT status now, so the buckets
              // sum to Total: DRAFT + NBE_APPROVED + APPROVED + SENT +
              // RECEIVED + PROCESSING + SETTLED + REJECTED = Total.
              {
                icon: <Description />,
                label: 'Draft',
                value: swiftMessages.filter((msg: any) => msg.status === 'DRAFT').length,
                color: '#ff9800',
                subtitle: 'Needs Approval',
                description: 'Draft messages awaiting bank approval.',
                clickable: true,
                selected: filterStatus === 'DRAFT',
                onClick: () => {
                  setSearchTerm('');
                  setFilterStatus('DRAFT');
                  setAmountMin('');
                  setAmountMax('');
                  setCurrentPage(0);
                }
              },
              {
                icon: <VerifiedUser />,
                label: 'NBE Approved',
                value: swiftMessages.filter((msg: any) => msg.status === 'NBE_APPROVED').length,
                color: '#673ab7',
                subtitle: 'Pre-Approved',
                description: 'Messages approved by NBE, awaiting bank approval.',
                clickable: true,
                selected: filterStatus === 'NBE_APPROVED',
                onClick: () => {
                  setSearchTerm('');
                  setFilterStatus('NBE_APPROVED');
                  setAmountMin('');
                  setAmountMax('');
                  setCurrentPage(0);
                }
              },
              {
                icon: <CheckCircle />,
                label: 'Approved',
                value: swiftMessages.filter((msg: any) => msg.status === 'APPROVED').length,
                color: '#2e7d32',
                subtitle: 'Ready to Send',
                description: 'Approved messages awaiting dispatch.',
                clickable: true,
                selected: filterStatus === 'APPROVED',
                onClick: () => {
                  setSearchTerm('');
                  setFilterStatus('APPROVED');
                  setAmountMin('');
                  setAmountMax('');
                  setCurrentPage(0);
                }
              },
              {
                icon: <AccessTime />,
                label: 'Processing',
                value: swiftMessages.filter((msg: any) => msg.status === 'PROCESSING').length,
                color: '#00acc1',
                subtitle: 'In Progress',
                description: 'Messages received and being processed.',
                clickable: true,
                selected: filterStatus === 'PROCESSING',
                onClick: () => {
                  setSearchTerm('');
                  setFilterStatus('PROCESSING');
                  setAmountMin('');
                  setAmountMax('');
                  setCurrentPage(0);
                }
              },
              {
                icon: <Verified />,
                label: 'Settled',
                value: swiftMessages.filter((msg: any) => msg.status === 'SETTLED').length,
                color: '#1565c0',
                subtitle: 'Complete',
                description: 'Messages settled end to end.',
                clickable: true,
                selected: filterStatus === 'SETTLED',
                onClick: () => {
                  setSearchTerm('');
                  setFilterStatus('SETTLED');
                  setAmountMin('');
                  setAmountMax('');
                  setCurrentPage(0);
                }
              },
              {
                icon: <Cancel />,
                label: 'Rejected',
                value: swiftMessages.filter((msg: any) => msg.status === 'REJECTED').length,
                color: '#f44336',
                subtitle: 'Failed',
                description: 'Messages rejected at any stage.',
                clickable: true,
                selected: filterStatus === 'REJECTED',
                onClick: () => {
                  setSearchTerm('');
                  setFilterStatus('REJECTED');
                  setAmountMin('');
                  setAmountMax('');
                  setCurrentPage(0);
                }
              },
            ] : activeTab === 2 ? [
              // Tab 2: Document Examination KPIs - Show data in table
              { 
                icon: <Description />, 
                label: 'Pending Examination', 
                value: pendingExaminationCount,  // S6: FOREX_ALLOCATED only — the truly-pending list, not the audit rows
                color: '#ff9800',
                subtitle: 'Awaiting Examination',
                description: 'LCs in FOREX_ALLOCATED awaiting document examination. Already-examined LCs stay visible under Verified for audit.',
                clickable: true,
                selected: documentExaminationFilter === 'PENDING_EXAMINATION',
                onClick: () => {
                  setSearchTerm('');
                  setAmountMin('');
                  setAmountMax('');
                  setDocumentExaminationFilter('PENDING_EXAMINATION');
                  setCurrentPage(0);
                },
              },
              {
                icon: <CheckCircle />,
                // F6: was "Examined Today" counting UTILIZED in
                // lcsForExamination — a list that by construction holds
                // only ISSUED/FOREX_ALLOCATED LCs, so the count was
                // structurally always 0. No examination date exists on
                // the LC row (UtilizationDate is empty for UTILIZED LCs;
                // the list carries no updatedAt), so "today" cannot be
                // computed honestly. Relabelled to what is counted:
                // all LCs whose documents were examined and verified.
                // S6: PAYMENT_RELEASED LCs passed examination too (they
                // reached UTILIZED first), so they count here as well —
                // the VERIFIED view shows UTILIZED + PAYMENT_RELEASED.
                label: 'Verified',
                value: letterOfCredits.filter((lc: any) => lc.status === 'UTILIZED' || lc.status === 'PAYMENT_RELEASED').length,
                color: '#4caf50',
                subtitle: 'Documents Verified',
                description: 'Show LCs with documents examined and verified.',
                clickable: true,
                selected: documentExaminationFilter === 'VERIFIED',
                onClick: () => {
                  setSearchTerm('');
                  setAmountMin('');
                  setAmountMax('');
                  setDocumentExaminationFilter('VERIFIED');
                  setCurrentPage(0);
                }
              },
              { 
                icon: <AccessTime />, 
                label: 'Avg Processing Time', 
                value: (() => {
                  // Calculate average time from document upload to verification
                  const completedLCs = letterOfCredits.filter(lc => 
                    lc.documents && lc.documents.length > 0 && 
                    lc.documents.some((d: any) => d.verifiedAt || d.verified_at)
                  );
                  
                  if (completedLCs.length === 0) return '—';
                  
                  let totalHours = 0;
                  let count = 0;
                  
                  completedLCs.forEach(lc => {
                    if (!lc.documents) return;
                    lc.documents.forEach((d: any) => {
                      const uploaded = d.uploadedAt || d.uploaded_at;
                      const verified = d.verifiedAt || d.verified_at;
                      if (uploaded && verified) {
                        const uploadTime = new Date(uploaded).getTime();
                        const verifyTime = new Date(verified).getTime();
                        const hours = (verifyTime - uploadTime) / (1000 * 60 * 60);
                        if (hours >= 0) {
                          totalHours += hours;
                          count++;
                        }
                      }
                    });
                  });
                  
                  if (count === 0) return '—';
                  const avgHours = totalHours / count;
                  const avgDays = avgHours / 24;
                  
                  if (avgDays < 1) return `${Math.round(avgHours)}h`;
                  return `${avgDays.toFixed(1)}d`;
                })(),
                color: '#2196F3',
                subtitle: 'Document Review',
                description: 'Average time required to complete document examination.',
                clickable: false,
              },
              { 
                icon: <Assignment />, 
                label: 'Compliance Rate', 
                value: (() => {
                  // Calculate percentage of verified vs rejected documents
                  const allDocs = letterOfCredits.flatMap(lc => lc.documents || []);
                  const processedDocs = allDocs.filter((d: any) => 
                    d.verificationStatus === 'verified' || d.verificationStatus === 'rejected' ||
                    d.status === 'verified' || d.status === 'rejected'
                  );
                  
                  if (processedDocs.length === 0) return '—';
                  
                  const verifiedCount = processedDocs.filter((d: any) => 
                    d.verificationStatus === 'verified' || d.status === 'verified'
                  ).length;
                  
                  const rate = (verifiedCount / processedDocs.length) * 100;
                  return `${Math.round(rate)}%`;
                })(),
                color: '#9b30b7',
                subtitle: 'UCP 600 Standard',
                description: 'Percentage of documents compliant with UCP 600.',
                clickable: false,
              },
            ] : activeTab === 6 ? [
              // Tab 6: Analytics KPIs — F26: was the hardcoded literal
              // '—'. Now the real total from GET /analytics/dashboard
              // (the same endpoint the dashboard reads): LCs + forex +
              // payments + SWIFT records. '—' only while it loads.
              {
                icon: <Assessment />,
                label: 'Total Metrics',
                value: totalAnalyticsMetrics ?? '—',
                subtitle: 'LCs + Forex + Payments + SWIFT',
                color: '#1976d2',
                clickable: false,
              },
            ] : activeTab === 9 ? [
              // Tab 9: LC Discrepancies KPIs
              { 
                icon: <Assessment />, 
                label: 'Total Discrepancies', 
                value: lcDiscrepancyStats.total, 
                color: CBE_COLORS.purple,
                subtitle: 'All Records',
                description: 'Total LC discrepancies reported.',
                clickable: false,
              },
              { 
                icon: <Warning />, 
                label: 'Open Cases', 
                value: lcDiscrepancyStats.open, 
                color: '#f57c00',
                subtitle: 'Requiring Action',
                description: 'Discrepancies that need attention.',
                clickable: false,
              },
              { 
                icon: <CheckCircle />, 
                label: 'Resolved', 
                value: lcDiscrepancyStats.resolved, 
                color: '#4caf50',
                subtitle: `${lcDiscrepancyStats.resolutionRate}% Resolution Rate`,
                description: 'Successfully resolved discrepancies.',
                clickable: false,
              },
              { 
                icon: <TrendingUp />, 
                label: 'Avg Resolution', 
                value: `${lcDiscrepancyStats.avgTime.toFixed(1)}d`, 
                color: '#ff9800',
                subtitle: 'Days to Resolve',
                description: 'Average time to resolve discrepancies.',
                clickable: false,
              },
            ] : activeTab === 5 ? [
              // Tab 5: LC Settlements KPIs
              { 
                icon: <CheckCircle />, 
                label: 'Delivered Shipments', 
                value: deliveredShipments.length, 
                color: '#4caf50',
                subtitle: 'Ready for Settlement',
                description: 'Shipments requiring LC settlement.',
                clickable: false,
              },
              {
                icon: <Payment />,
                // F15: was deliveredShipments.filter(() => true) —
                // identical to "Delivered Shipments" and never
                // decreasing. Now delivered shipments whose linked LC
                // is not yet SETTLED (same shipment denominator as
                // "Completed Settlements" below, so the two reconcile:
                // pending + completed = delivered).
                label: 'Pending Settlement',
                value: pendingSettlementShipments.length,
                color: '#ff9800',
                subtitle: 'Awaiting Processing',
                description: 'Delivered shipments whose LC is not yet settled.',
                clickable: false,
              },
              { 
                icon: <AccountBalance />, 
                label: 'Active LCs', 
                value: letterOfCredits.filter(lc => ['ISSUED', 'FOREX_ALLOCATED', 'UTILIZED', 'PAYMENT_RELEASED'].includes(lc.status)).length, 
                color: '#9b30b7',
                subtitle: 'In Progress',
                description: 'Active Letters of Credit.',
                clickable: false,
              },
              {
                icon: <AttachMoney />,
                // F15: was a count of SETTLED LCs — a different
                // denominator (LCs, not shipments) from "Pending
                // Settlement", so the two could never reconcile. Now
                // delivered shipments whose linked LC is SETTLED.
                label: 'Completed Settlements',
                value: settledShipments.length,
                color: '#2196f3',
                subtitle: 'Finalized',
                description: 'Delivered shipments whose LC is settled.',
                clickable: false,
              },
            ] : [
              // Tab 3: Payment Release KPIs - Show data in table
              { 
                icon: <AttachMoney />, 
                label: 'Ready for Payment', 
                value: lcsForPaymentRelease.length, 
                color: '#ff9800',
                subtitle: 'Documents Verified',
                description: 'Show LCs ready for payment release.',
                clickable: true,
                selected: paymentReleaseFilter === 'READY_FOR_PAYMENT',
                onClick: () => {
                  setSearchTerm('');
                  setAmountMin('');
                  setAmountMax('');
                  setPaymentReleaseFilter('READY_FOR_PAYMENT');
                  setCurrentPage(0);
                },
                debug: `Payment Release Array Length: ${lcsForPaymentRelease.length}, Has Data: ${lcsForPaymentRelease.length > 0 ? 'YES' : 'NO'}`
              },
              {
                icon: <CheckCircle />,
                // F9: was all PAYMENT_RELEASED LCs with no date filter,
                // so "today" showed the all-time count. Now only LCs
                // whose bridge payment (PAY_<lcId>) landed today.
                label: 'Released Today',
                value: releasedTodayLCs.length,
                color: '#4caf50',
                subtitle: 'Payments Sent',
                description: 'Show LCs with payments released today.',
                clickable: true,
                selected: paymentReleaseFilter === 'RELEASED_TODAY',
                onClick: () => {
                  setSearchTerm('');
                  setAmountMin('');
                  setAmountMax('');
                  setPaymentReleaseFilter('RELEASED_TODAY');
                  setCurrentPage(0);
                }
              },
              {
                icon: <CurrencyExchange />,
                // F9: was the sum of ALL PAYMENT_RELEASED LCs while the
                // subtitle said "This Month" — and the amounts arrive
                // as strings, so the reduce concatenated and rendered
                // "$NaNM" live. Now only this month's releases, with
                // Number() coercion.
                label: 'Total Released',
                value: `$${(releasedThisMonthLCs.reduce((s, lc) => s + Number(lc.amount || 0), 0) / 1000000).toFixed(1)}M`,
                color: '#2196F3',
                subtitle: 'This Month',
                description: 'Show payments released this month.',
                clickable: true,
                selected: paymentReleaseFilter === 'TOTAL_RELEASED',
                onClick: () => {
                  setSearchTerm('');
                  setAmountMin('');
                  setAmountMax('');
                  setPaymentReleaseFilter('TOTAL_RELEASED');
                  setCurrentPage(0);
                }
              },
              {
                icon: <Assignment />,
                // F10: was the hardcoded literal '1.2d'. Now computed
                // from real data — mean request → release time across
                // released LCs (bridge payment date minus request
                // date). '—' only when no release has a known date.
                label: 'Avg Release Time',
                value: avgReleaseTimeMs === null ? '—' : formatReleaseDuration(avgReleaseTimeMs),
                color: '#9b30b7',
                subtitle: 'Request → Release',
                description: 'Average time from LC request to payment release.',
                clickable: false,
              },
            ];

            return kpis.map((kpi: any, index) => {
              // Debug log to see actual KPI values being rendered
              if (index === 0) {
                devLog(`[BANKS] 🎯 Rendering KPI cards for Tab ${activeTab}:`, kpis.map(k => `${k.label}: ${k.value}`));
              }
              
              return (
              <Grid item xs={12} sm={6} md={3} key={index}>
                <PortalKpiCard
                  brand="BANKS"
                  icon={kpi.icon}
                  label={kpi.label}
                  value={kpi.value}
                  color={kpi.color}
                  subtitle={kpi.subtitle}
                  selected={Boolean(kpi.clickable && ((kpi.method && selectedPaymentMethod === kpi.method) || kpi.selected))}
                  onClick={kpi.clickable ? (kpi.onClick || (() => { if (kpi.method) setSelectedPaymentMethod(kpi.method); })) : undefined}
                />
              </Grid>
            );
            });
          })()}
        </Grid>

        {/* Main Tabs - 5 Tabs Like ShippingPortal */}
        <PortalCard brand="BANKS" noPadding>
          {/* Parent Tabs */}
          <PortalTabBar
            brand="BANKS"
            variant="parent"
            fullWidth
            value={activeParentTab}
            onChange={(e, v) => {
              setActiveParentTab(v);
              setActiveChildTab(0); // Reset to first child when switching parent
              setCurrentPage(0); // Reset pagination
            }}
            tabs={tabStructure.map((parent) => ({ label: parent.label, icon: parent.icon }))}
          />
          
          {/* Child Tabs — only when the parent groups more than one
              section. A single-child parent (Analytics, since User
              Management / Audit Trail moved to Settings) opens its one
              section directly instead of showing a redundant second bar. */}
          {tabStructure[activeParentTab] && tabStructure[activeParentTab].children.length > 1 && (
            <PortalTabBar
              brand="BANKS"
              variant="child"
              scrollable
              value={activeChildTab}
              onChange={(e, v) => {
                setActiveChildTab(v);
                setCurrentPage(0); // Reset pagination when switching child tabs
              }}
              tabs={tabStructure[activeParentTab].children.map((child) => ({ label: child.label, icon: child.icon }))}
            />
          )}
        </PortalCard>

        {/* Tab 0: Payment Methods Selection */}
        {activeTab === 0 && (
          <Box>
            {/* Selected Payment Method Content */}
            <UnifiedPaymentWorkflow
              contracts={contracts}
              letterOfCredits={letterOfCredits}
              forexAllocations={forexAllocations}
              documentaryCollections={documentaryCollections}
              advancePayments={advancePayments}
              consignments={consignments}
              pendingDocuments={pendingDocuments}
              selectedPaymentMethod={selectedPaymentMethod}
              rowsPerPage={rowsPerPage}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              onRowsPerPageChange={setRowsPerPage}
            onCreatePayment={(method, data) => {
              console.log('Create payment:', method, data);
              // 0.3: banks cannot request an LC — POST /banking/lc/request is
              // EXPORTER/ECTA-only and chaincode RequestLC is ECTAMSP-only.
              // There is no bank-side create-and-issue API route, so the
              // bank flow is Approve (REQUESTED) then Issue (APPROVED) on an
              // LC the exporter/ECTA requested. Do not open the LC form.
              if (method === 'LC') {
                showInfo(
                  'LCs Are Requested by the Exporter',
                  'A Letter of Credit is requested by the exporter (or ECTA) for an ECTA-approved contract. Once it appears here as REQUESTED, approve it, then issue it from the APPROVED state.',
                  'Bank actions: Payment Methods tab → open the LC → Approve LC → Issue LC (POST /banking/lc/:id/issue).'
                );
                return;
              }
              setSelectedContract(contracts.length > 0 ? contracts[0] : null);
              setDialogType(method.toLowerCase() as any);
              setDialogOpen(true);
            }}
            onProcessStep={async (paymentId, step) => {
              devLog('[BANKS] Process step:', paymentId, step);
              
              if (step === 'Approve Request') {
                // Handle LC approval request
                const lc = letterOfCredits.find((l: any) => l.lcId === paymentId || l.id === paymentId);
                if (lc) {
                  devLog('[BANKS] Approving LC:', lc.lcId);
                  await handleApproveLC(lc.lcId, lc.exporterId);
                  return;
                }
                showError('LC Not Found', `Could not find LC ${paymentId}`, 'Please refresh and try again');
                return;
              }
              
              if (step === 'Issue LC') {
                // Handle issuing approved LC (send MT700)
                const lc = letterOfCredits.find((l: any) => l.lcId === paymentId || l.id === paymentId);
                if (lc) {
                  // Check if LC is already issued
                  if (lc.status === 'ISSUED') {
                    showInfo('LC Already Issued', `LC ${paymentId} has already been issued`);
                    return;
                  }
                  
                  // Check if LC is approved
                  if (lc.status !== 'APPROVED') {
                    showWarning('LC Not Approved', `LC ${paymentId} must be approved before issuing`, 'Current status: ' + lc.status);
                    return;
                  }
                  
                  // Issue the LC (send MT700)
                  try {
                    const token = localStorage.getItem('authToken');
                    const response = await apiFetch(`/banking/lc/${lc.lcId}/issue`, {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        terms: lc.terms || 'Payment against shipping documents as per UCP 600',
                      }),
                    });
                    
                    const result = await response.json();
                    if (result.success) {
                      // S3 (2026-11-18, banks-tabs-status fix): the old
                      // copy claimed "no SWIFT message was sent by this
                      // action", but the issue route auto-creates an MT700
                      // in DRAFT on every issue. Report the real outcome
                      // from the response (mt700MessageId when created).
                      const mt700Id = (result as any)?.data?.mt700MessageId as string | undefined;
                      showSuccess(
                        'LC Issued Successfully',
                        `LC ${lc.lcId} issued`,
                        mt700Id
                          ? `The Letter of Credit has been issued and is now active. An MT700 advice message (${mt700Id}) was auto-created as a DRAFT — review, approve and send it from the SWIFT Messages tab.`
                          : 'The Letter of Credit has been issued and is now active. No MT700 message was auto-created — compose one on the SWIFT Messages tab to advise the beneficiary.'
                      );
                      loadBankingData();
                    } else {
                      showError('LC Issue Failed', result.error?.message || 'Failed to issue LC');
                    }
                  } catch (error: any) {
                    showError('Network Error', 'Failed to issue LC', error.message);
                  }
                  return;
                }
                
                // If not found in LCs, check if it's a contract (for backward compatibility)
                const contractId = paymentId.replace(/^CONTRACT/, '');
                const contract = contracts.find((c: any) => 
                  c.contractId === contractId || 
                  c.contractId === paymentId ||
                  String(c.contractId) === String(contractId) ||
                  String(c.contractId) === String(paymentId)
                );
                
                if (contract) {
                  devLog('[BANKS] Found contract:', contract.contractId, 'Status:', contract.status);
                  // 0.3: no bank-side "Issue LC" from a bare contract — the
                  // LC must first be requested by the exporter/ECTA and
                  // approved by the bank. Open the contract details instead.
                  showInfo(
                    'LC Must Be Requested First',
                    `Contract ${contract.contractId} has no Letter of Credit yet. The exporter (or ECTA) requests the LC; the bank then approves it (REQUESTED) and issues it (APPROVED).`,
                    'Bank actions: Payment Methods tab → open the LC → Approve LC → Issue LC (POST /banking/lc/:id/issue).'
                  );
                  handleViewContractDetails(contract);
                  return;
                }
                
                showError('LC/Contract Not Found', `Could not find LC or contract for ${paymentId}`, 'Please refresh and try again');
                return;
              }
              
              if (step === 'Reject LC') {
                const lc = letterOfCredits.find((item: any) => item.lcId === paymentId || item.id === paymentId);
                if (!lc) {
                  showError('LC Not Found', `Could not find LC ${paymentId}`, 'Please refresh and try again');
                  return;
                }
                if (lc.status !== 'REQUESTED') {
                  showWarning('LC Cannot Be Rejected', `LC ${lc.lcId} is ${lc.status}. Only pending requests can be rejected.`);
                  return;
                }
                setValidationData({
                  entityId: lc.lcId,
                  entityType: 'LETTER OF CREDIT',
                  title: `Reject LC Request - ${lc.lcId}`,
                  readOnly: false,
                  showApprovalOption: false,
                  summary: [
                    { label: 'LC ID', value: lc.lcId },
                    { label: 'Contract ID', value: lc.contractId || 'N/A' },
                    { label: 'Exporter', value: lc.exporterId || 'N/A' },
                    { label: 'Amount', value: `${lc.currency || 'USD'} ${Number(lc.amount || 0).toLocaleString()}` },
                    { label: 'Issuing Bank', value: lc.issuingBank || 'N/A' },
                    { label: 'Advising Bank', value: lc.advisingBank || 'N/A' },
                    { label: 'Status', value: lc.status },
                  ],
                  prerequisites: [
                    { label: 'LC Request', status: 'PASSED', details: 'This LC is awaiting bank review.' },
                    { label: 'Contract Reference', status: lc.contractId ? 'PASSED' : 'WARNING', details: lc.contractId || 'No contract reference is available.' },
                  ],
                  documents: [],
                  additionalInfo: 'A rejection is recorded on the consortium ledger with the bank signer and reason. The LC cannot be approved after rejection.',
                });
                setValidationDialogOpen(true);
                return;
              }
              
              if (step === 'Verify Documents') {
                // LC document examination: open the examination dialog for
                // this LC (POST /banking/lc/:lcId/examine-documents).
                const lc = letterOfCredits.find((l: any) => l.lcId === paymentId || l.id === paymentId);
                if (!lc) {
                  showError('LC Not Found', `Could not find LC ${paymentId}`, 'Please refresh and try again');
                  return;
                }
                setSelectedLC({ ...lc, documents: (lc as any).documents || [] });
                setDocumentExaminationOpen(true);
                return;
              }

              if (step === 'Release Payment') {
                // UTILIZED LC with verified documents → PAYMENT_RELEASED.
                const lc = letterOfCredits.find((l: any) => l.lcId === paymentId || l.id === paymentId);
                if (!lc) {
                  showError('LC Not Found', `Could not find LC ${paymentId}`, 'Please refresh and try again');
                  return;
                }
                // Open Material-UI confirmation dialog
                setPaymentConfirmData({
                  lcId: lc.lcId,
                  exporterId: lc.exporterId,
                  amount: lc.amount,
                  currency: lc.currency,
                });
                setPaymentConfirmOpen(true);
                return;
              }

              // For other steps, show info
              showInfo('Process Step', `Processing ${step} for payment ${paymentId}`);
            }}
            onViewDetails={(payment) => {
              console.log('View details:', payment);
              
              // Handle Letter of Credit
              if (selectedPaymentMethod === 'LC' && payment.lcId) {
                const lc = letterOfCredits.find(l => l.lcId === payment.id);
                if (lc) {
                  handleViewLCDetails(lc);
                  return;
                }
              }
              
              // Handle approved-contract rows (not LCs yet)
              if (payment.isContract && payment.contractData) {
                handleViewContractDetails(payment.contractData);
                return;
              }
              
              // Find related contract for the payment
              const contract = contracts.find(c => 
                c.contractId === payment.contractId || 
                c.contractId === payment.ContractID
              );
              
              // Get payment method config
              const methodConfig = PAYMENT_METHODS.find(m => m.id === selectedPaymentMethod);
              
              // Calculate dates based on payment data
              const createdDate = payment.createdAt || payment.requestDate || payment.timestamp || new Date().toISOString();
              const formattedDate = new Date(createdDate).toLocaleDateString();
              
              // Determine exporter info
              const exporterID = payment.exporter || payment.exporterId || payment.exporterID || payment.ExporterID || 'Unknown';
              
              // Determine amount info
              const amount = payment.amount || payment.Amount || payment.value || payment.permitAmount || 0;
              const currency = payment.currency || payment.Currency || contract?.currency || 'USD';
              
              // Build comprehensive summary
              setValidationData({
                entityId: payment.id,
                entityType: selectedPaymentMethod === 'CAD' ? 'DOCUMENTARY COLLECTION' :
                           selectedPaymentMethod === 'ADVANCE' ? 'ADVANCE PAYMENT' :
                           selectedPaymentMethod === 'CONSIGNMENT' ? 'CONSIGNMENT' :
                           'PAYMENT',
                title: `${methodConfig?.name || selectedPaymentMethod} Details - ${payment.id}`,
                summary: [
                  { label: 'Transaction ID', value: payment.id || 'N/A' },
                  { label: 'Payment Method', value: methodConfig?.name || selectedPaymentMethod },
                  { label: 'Exporter ID', value: exporterID },
                  { label: 'Amount', value: `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
                  { label: 'Status', value: payment.status || 'PENDING' },
                  { label: 'Current Step', value: methodConfig?.steps[payment.currentStep] || 'Starting' },
                  { label: 'Progress', value: `${Math.round((payment.currentStep / (methodConfig?.steps.length || 1)) * 100)}% Complete` },
                  { label: 'Created Date', value: formattedDate },
                  { label: 'Contract Reference', value: payment.contractId || payment.ContractID || contract?.contractId || 'Not linked' },
                  { label: 'Buyer Name', value: contract?.buyerName || payment.buyerName || 'N/A' },
                  { label: 'Buyer Country', value: contract?.buyerCountry || payment.buyerCountry || 'N/A' },
                  { label: 'Coffee Type', value: contract?.coffeeType || 'N/A' },
                  { label: 'Quantity', value: contract ? `${contract.quantity.toLocaleString()} kg` : 'N/A' },
                  { label: 'Bank Name', value: payment.bankName || payment.issuingBank || payment.payingBank || contract?.buyerBank || 'N/A' },
                ],
                prerequisites: [
                  {
                    label: 'Contract Verification',
                    status: contract ? 'PASSED' : 'WARNING',
                    details: contract ? 
                      `Contract ${contract.contractId} verified - ${contract.status}` : 
                      'No contract linked to this payment'
                  },
                  {
                    label: 'ECTA Approval',
                    status: contract?.status === 'APPROVED' ? 'PASSED' : 'WARNING',
                    details: contract ? 
                      `Contract status: ${contract.status}` : 
                      'Contract approval status unknown'
                  },
                  {
                    label: 'Exporter Registration',
                    status: 'PASSED',
                    details: `Exporter ${exporterID} is registered and licensed by ECTA`
                  },
                  {
                    label: 'Payment Authorization',
                    status: payment.status !== 'PENDING' && payment.status !== 'REQUESTED' ? 'PASSED' : 'WARNING',
                    details: payment.status !== 'PENDING' && payment.status !== 'REQUESTED' ? 
                      'Payment has been authorized and is being processed' : 
                      'Awaiting authorization'
                  },
                  {
                    label: 'Amount Verification',
                    status: contract && Math.abs(amount - contract.totalValue) < 0.01 ? 'PASSED' : 'WARNING',
                    details: contract ? 
                      (Math.abs(amount - contract.totalValue) < 0.01 ? 
                        `Payment amount matches contract value: ${currency} ${amount.toLocaleString()}` :
                        `Payment: ${currency} ${amount.toLocaleString()} | Contract: ${contract.currency} ${contract.totalValue.toLocaleString()}`) :
                      'Cannot verify - no contract linked'
                  },
                ],
                documents: [
                  { 
                    id: '1', 
                    name: `${methodConfig?.name} Request Form`, 
                    type: 'PDF', 
                    status: 'AVAILABLE', 
                    uploadedDate: formattedDate, 
                    size: '156 KB',
                    category: 'PAYMENT_REQUEST'
                  },
                  { 
                    id: '2', 
                    name: 'Sales Contract Copy', 
                    type: 'PDF', 
                    status: contract ? 'AVAILABLE' : 'MISSING', 
                    uploadedDate: contract?.registrationDate ? new Date(contract.registrationDate).toLocaleDateString() : 'N/A', 
                    size: contract ? '245 KB' : 'N/A',
                    category: 'CONTRACT'
                  },
                  { 
                    id: '3', 
                    name: 'Commercial Invoice', 
                    type: 'PDF', 
                    status: contract ? 'AVAILABLE' : 'PENDING', 
                    uploadedDate: formattedDate, 
                    size: '189 KB',
                    category: 'INVOICE'
                  },
                  { 
                    id: '4', 
                    name: 'Bank Swift Message', 
                    type: 'SWIFT', 
                    status: payment.swiftReference ? 'AVAILABLE' : 'PENDING', 
                    uploadedDate: payment.swiftReference ? formattedDate : 'N/A', 
                    size: payment.swiftReference ? '23 KB' : 'N/A',
                    category: 'BANK_DOCUMENT'
                  },
                  { 
                    id: '5', 
                    name: 'Exporter License', 
                    type: 'PDF', 
                    status: 'AVAILABLE', 
                    uploadedDate: formattedDate, 
                    size: '98 KB',
                    category: 'LICENSE'
                  },
                ],
                complianceChecks: [
                  {
                    label: 'NBE Forex Regulations',
                    status: 'COMPLIANT',
                    details: 'Complies with National Bank of Ethiopia export payment and forex allocation regulations (Directive No. FXD/01/2021)'
                  },
                  {
                    label: selectedPaymentMethod === 'LC' ? 'UCP 600 Standards' :
                           selectedPaymentMethod === 'CAD' ? 'URC 522 Standards' :
                           'Payment Standards',
                    status: 'COMPLIANT',
                    details: selectedPaymentMethod === 'LC' ? 
                      'Letter of Credit complies with ICC Uniform Customs and Practice (UCP 600)' :
                      selectedPaymentMethod === 'CAD' ?
                      'Documentary Collection follows ICC Uniform Rules for Collections (URC 522)' :
                      'Payment method follows international banking standards'
                  },
                  {
                    label: 'Trade Sanctions Check',
                    status: 'COMPLIANT',
                    details: contract?.buyerCountry ? 
                      `${contract.buyerCountry} is not subject to international trade sanctions (OFAC, UN, EU)` : 
                      'Buyer country verified against sanctions lists'
                  },
                  {
                    label: 'AML/CFT Screening',
                    status: 'COMPLIANT',
                    details: `Anti-Money Laundering and Counter-Terrorism Financing checks passed for exporter ${exporterID} and buyer ${contract?.buyerName || 'verified party'}`
                  },
                  {
                    label: 'Export License Validity',
                    status: 'COMPLIANT',
                    details: `Exporter ${exporterID} holds valid ECTA export license`
                  },
                ],
                additionalInfo: payment.status === 'PAID' || payment.status === 'SETTLED' ?
                  `This ${methodConfig?.name} has been completed successfully. All payments have been processed.` :
                  `This ${methodConfig?.name} is currently at step "${methodConfig?.steps[payment.currentStep] || 'Starting'}". Next step: "${methodConfig?.steps[payment.currentStep + 1] || 'Complete'}". Review all details before processing.`
              });
              setValidationDialogOpen(true);
            }}
          />

          {/* LC Bulk Operations - Only shown when Letter of Credit is selected */}
          {selectedPaymentMethod === 'LC' && (
            <Box sx={{ mt: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <PrimaryButton 
                brand="BANKS"
                disabled={bulkApproving || selectedLCIds.length === 0 || letterOfCredits.filter((lc: any) => selectedLCIds.includes(lc.lcId) && lc.status === 'REQUESTED').length === 0}
                onClick={() => handleBulkApproveLC()}
              >
                Bulk Approve ({selectedLCIds.length > 0 ? selectedLCIds.filter(id => {
                  const lc = letterOfCredits.find((l: any) => l.lcId === id);
                  return lc && lc.status === 'REQUESTED';
                }).length : 0})
              </PrimaryButton>
              <PrimaryButton 
                brand="BANKS"
                onClick={() => {
                  // Reset standby form and open dialog
                  setStandbyForm({
                    standbyLCNumber: '',
                    contractId: '',
                    amount: '',
                    currency: 'USD',
                    expiryDate: '',
                    type: 'PERFORMANCE',
                    purpose: '',
                    beneficiary: '',
                    applicant: '',
                    terms: '',
                    issuingBank: 'Commercial Bank of Ethiopia',
                    advisingBank: '',
                  });
                  setStandbyDialogOpen(true);
                }}
              >
                Issue Standby LC
              </PrimaryButton>
            </Box>
          )}

          {/* Payments — raw payment records (GET /payments). The View Details
              button opens the payment details dialog, which is the only
              place the Settle Payment button renders (VERIFIED /
              SWIFT_RECEIVED). Without this table the dialog was unreachable. */}
          <Paper sx={{ mt: 3, p: 2 }}>
            <Typography variant="h6" fontWeight={700} gutterBottom>
              Payments ({payments.length})
            </Typography>
            {payments.length === 0 ? (
              <Typography variant="body2" color="textSecondary">
                No payment records found. Payments appear here once recorded on the ledger or in the PostgreSQL mirror.
              </Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Payment ID</TableCell>
                      <TableCell>Contract</TableCell>
                      <TableCell>Exporter</TableCell>
                      <TableCell>Amount</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {payments.map((payment: any) => (
                      <TableRow key={payment.paymentId || payment.paymentID || payment.id} hover>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                          {payment.paymentId || payment.paymentID || payment.id}
                        </TableCell>
                        <TableCell>{payment.contractId || payment.contractID || '—'}</TableCell>
                        <TableCell>{payment.exporterId || payment.exporterID || '—'}</TableCell>
                        <TableCell>
                          {(payment.currency || 'USD')} {(payment.amount || 0).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <StatusChip label={payment.status || 'PENDING'} status={payment.status} />
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => {
                                setSelectedPaymentForDetails(payment);
                                setPaymentDetailsOpen(true);
                              }}
                            >
                              View Details
                            </Button>
                            {/* 0.4: opens the verification dialog for this
                                payment. VerifyPaymentDocuments requires
                                DOCUMENTS_SUBMITTED (chaincode payment.go), so
                                the button only appears in that state — a
                                PENDING payment has no submitted documents to
                                verify yet. */}
                            {String(payment.status || '').toUpperCase() === 'DOCUMENTS_SUBMITTED' && (
                              <PrimaryButton brand="BANKS"
                                size="small"
                                onClick={() => {
                                  setSelectedPayment({
                                    ...payment,
                                    paymentID: payment.paymentId || payment.paymentID || payment.id,
                                  });
                                  setVerificationDialogOpen(true);
                                }}
                              >
                                Verify Documents
                              </PrimaryButton>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Box>
      )}

      {/* Tab 1: Forex Allocations ONLY */}
      {activeTab === 1 && (
        <PortalCard brand="BANKS" title="Forex Allocation Management">
          {/* Search and Filter Controls */}
          <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField
              size="small"
              placeholder="Search forex allocations..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(0);
              }}
              sx={{ minWidth: 300 }}
              InputProps={{
                startAdornment: <CommentIcon sx={{ mr: 1, color: 'black' }} />,
              }}
            />
            <TextField
              select
              size="small"
              label="Filter by Status"
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setCurrentPage(0);
              }}
              sx={{ minWidth: 150 }}
            >
              <MenuItem value="ALL">All Status</MenuItem>
              <MenuItem value="REQUESTED">Requested (Awaiting Allocation)</MenuItem>
              <MenuItem value="CONFIRMED">Confirmed (NBE)</MenuItem>
              <MenuItem value="ALLOCATED">Allocated</MenuItem>
              <MenuItem value="CONFIRMED_OR_ALLOCATED">Confirmed / Allocated</MenuItem>
              <MenuItem value="UTILIZED">Utilized</MenuItem>
              <MenuItem value="REJECTED">Rejected</MenuItem>
            </TextField>
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                setSearchTerm('');
                setFilterStatus('ALL');
                setCurrentPage(0);
              }}
            >
              Clear Filters
            </Button>
            
            {/* NEW: Repatriation Button */}
            <PrimaryButton brand="BANKS"
              startIcon={<AttachMoney />}
              onClick={() => setRepatriationDialogOpen(true)}
              sx={{ ml: 'auto' }}
            >
              Forex Management / Repatriation
            </PrimaryButton>
            <SecondaryButton brand="BANKS"
              startIcon={<AttachMoney />}
              onClick={() => setRepatriationRecordingOpen(true)}
            >
              Record Repatriation
            </SecondaryButton>
            
            <SecondaryButton brand="BANKS"
              size="small"
              startIcon={<Description />}
              onClick={() => {
                const csv = generateForexCSV(getFilteredForex());
                downloadCSV(csv, 'Forex-Allocations.csv');
              }}
              sx={{ fontWeight: 600 }}
            >
              Export CSV
            </SecondaryButton>
            <Box sx={{ flexGrow: 1 }} />
            <Typography variant="body2" color="black">
              Showing {getPaginatedData(getFilteredForex()).length} of {getFilteredForex().length} allocations
            </Typography>
          </Box>

                    {forexAllocations.length === 0 ? (
            <Alert severity="warning">
              No forex allocation requests yet. When an LC is issued, it will appear here as a forex allocation request.
            </Alert>
          ) : getFilteredForex().length === 0 ? (
            <Alert severity="warning">
              No forex allocations match your search criteria.
            </Alert>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: '11%' }}><strong>Forex ID</strong></TableCell>
                    <TableCell sx={{ width: '11%' }}><strong>LC Reference</strong></TableCell>
                    <TableCell sx={{ width: '10%' }}><strong>Exporter</strong></TableCell>
                    <TableCell sx={{ width: '11%' }}><strong>Buyer</strong></TableCell>
                    <TableCell sx={{ width: '10%' }}><strong>Allocated Amount</strong></TableCell>
                    <TableCell sx={{ width: '9%' }}><strong>Exchange Rate</strong></TableCell>
                    <TableCell sx={{ width: '9%' }}><strong>Retention</strong></TableCell>
                    <TableCell sx={{ width: '9%' }}><strong>Conversion</strong></TableCell>
                    <TableCell sx={{ width: '8%' }}><strong>Status</strong></TableCell>
                    <TableCell sx={{ width: '6%' }}><strong>Expiry</strong></TableCell>
                    <TableCell align="right" sx={{ width: '6%' }}><strong>Actions</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {getPaginatedData(getFilteredForex()).map((forex) => {
                    // For REQUESTED status, use requestedAmount; for ALLOCATED, use allocatedAmount
                    const displayAmount = forex.status === 'REQUESTED' || forex.isDraft ? (forex.requestedAmount || 0) : (forex.allocatedAmount || 0);
                    const exchangeRate = Number(forex.exchangeRate) || 0;
                    const retentionRate = Number(forex.retentionRate) || 0;
                    const usdRetention = displayAmount * retentionRate / 100;
                    const etbConversion = displayAmount * (100 - retentionRate) / 100 * exchangeRate;
                    
                    return (
                      <TableRow key={forex.forexId}>
                        <TableCell>{forex.forexId}</TableCell>
                        <TableCell>{forex.lcId || 'N/A'}</TableCell>
                        <TableCell>{forex.exporterId || 'N/A'}</TableCell>
                        <TableCell>
                          {forex.buyerName || forex.BuyerName || 'N/A'}
                        </TableCell>
                        <TableCell>
                          <strong>${displayAmount.toLocaleString()}</strong>
                          {forex.isDraft ? <Chip label="LC draft — not on ledger" size="small" sx={{ ml: 1, bgcolor: '#607d8b', color: '#fff' }} /> : forex.status === 'REQUESTED' && <Chip label="Requested" size="small" sx={{ ml: 1, bgcolor: '#ff9800', color: '#fff' }} />}
                        </TableCell>
                        <TableCell>{exchangeRate > 0 ? `${exchangeRate.toFixed(2)} ETB/USD` : 'Pending NBE rate'}</TableCell>
                        <TableCell>
                          {exchangeRate > 0 && retentionRate >= 0 ? `$${usdRetention.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD (${retentionRate}%)` : 'Pending allocation'}
                        </TableCell>
                        <TableCell>
                          {exchangeRate > 0 && retentionRate >= 0 ? `${etbConversion.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB (${100 - retentionRate}%)` : 'Pending allocation'}
                        </TableCell>
                        <TableCell>
                          <StatusChip
                            label={forex.status || 'PENDING'}
                            status={chipStatus(forex.status)}
                          />
                        </TableCell>
                        <TableCell>
                          {forex.expiryDate ? new Date(forex.expiryDate).toLocaleDateString() : 'N/A'}
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                            <SecondaryButton brand="BANKS"
                              size="small"
                              startIcon={<Visibility />}
                              onClick={() => {
                                setSelectedForex(forex);
                                setForexDetailsOpen(true);
                              }}
                            >
                              View Details
                            </SecondaryButton>
                            
                            <PrimaryButton brand="BANKS"
                              size="small"
                              disabled={!forex.isDraft && forex.status !== 'REQUESTED' && forex.status !== 'CONFIRMED'}
                              startIcon={<CheckCircle />}
                              loadingLabel="Allocating…"
                              ledgerWrite
                              onClick={async (event) => {
                                event.stopPropagation();
                                if (forex.isDraft) {
                                  await handleAllocateForex(forex);
                                  return;
                                }
                                devLog('[BANKS] Allocate Forex button clicked', forex);
                                setAllocationPolicyReady(false);
                                try {
                                  const currency = String(forex.currency || 'USD').toUpperCase();
                                  const [rateResponse, policyResponse] = await Promise.all([
                                    apiFetch(`/forex/rates/${encodeURIComponent(currency)}/current`, { method: 'GET' }),
                                    apiFetch('/forex/retention-policy/COFFEE', { method: 'GET' }),
                                  ]);
                                  const [rateResult, policyResult] = await Promise.all([rateResponse.json(), policyResponse.json()]);
                                  const activeRate = Number(rateResult.data?.midRate ?? rateResult.data?.MidRate);
                                  const retentionRate = Number(policyResult.data?.retentionRate ?? policyResult.data?.RetentionRate);
                                  if (!rateResult.success || !policyResult.success || !Number.isFinite(activeRate) || activeRate <= 0 || !Number.isFinite(retentionRate) || retentionRate < 0) {
                                    showError('NBE Ledger Data Required', 'An active exchange rate and COFFEE retention policy are required before forex can be allocated.');
                                    return;
                                  }
                                  setSelectedForex(forex);
                                  setAllocationPolicyReady(true);
                                
                                // Auto-generate approval reference with timestamp
                                const approvalRef = `FOREX-ALLOC-${Date.now()}`;
                                
                                setAllocationForm({
                                  forexId: forex.forexId,
                                  lcId: forex.lcId || '',
                                  amount: forex.requestedAmount || forex.allocatedAmount || 0,
                                  exchangeRate: activeRate,
                                  retentionRate,
                                  officer: user?.fullName || user?.username || 'Bank Officer',
                                  approvalRef: approvalRef,
                                  expiryDate: forex.expiryDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
                                });
                                setAllocationDialogOpen(true);
                                } catch (error) {
                                  showError('NBE Ledger Data Required', 'Unable to load the current exchange rate and retention policy.');
                                }
                              }}
                            >
                              {forex.isDraft ? 'Request Forex' : 'Allocate Forex'}
                            </PrimaryButton>

                            {/* Reject: REQUESTED/CONFIRMED → REJECTED
                                (chaincode RejectForex; impossible once
                                ALLOCATED). Utilise: ALLOCATED → UTILIZED. */}
                            {(forex.status === 'REQUESTED' || forex.status === 'CONFIRMED') && !forex.isDraft && (
                              <DangerButton brand="BANKS"
                                size="small"
                                color="error"
                                onClick={async (event) => {
                                  event.stopPropagation();
                                  await handleRejectForex(forex);
                                }}
                              >
                                Reject
                              </DangerButton>
                            )}
                            {forex.status === 'ALLOCATED' && (
                              <SecondaryButton brand="BANKS"
                                size="small"
                                onClick={async (event) => {
                                  event.stopPropagation();
                                  await handleUtilizeForex(forex);
                                }}
                              >
                                Utilise
                              </SecondaryButton>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* Pagination Controls */}
          {getFilteredForex().length > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" color="black">Rows per page:</Typography>
                <TextField
                  select
                  size="small"
                  value={rowsPerPage}
                  onChange={(e) => handleChangeRowsPerPage(parseInt(e.target.value))}
                  sx={{ width: 80 }}
                >
                  <MenuItem value={5}>5</MenuItem>
                  <MenuItem value={10}>10</MenuItem>
                  <MenuItem value={25}>25</MenuItem>
                  <MenuItem value={50}>50</MenuItem>
                  <MenuItem value={100}>100</MenuItem>
                </TextField>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography variant="body2" color="black">
                  Page {currentPage + 1} shows items {currentPage * rowsPerPage + 1}-{Math.min((currentPage + 1) * rowsPerPage, getFilteredForex().length)} of {getFilteredForex().length}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={currentPage === 0}
                    onClick={() => handleChangePage(currentPage - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={currentPage >= Math.ceil(getFilteredForex().length / rowsPerPage) - 1}
                    onClick={() => handleChangePage(currentPage + 1)}
                  >
                    Next
                  </Button>
                </Box>
              </Box>
            </Box>
          )}

          <Box sx={{ mt: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              <CurrencyExchange sx={{ mr: 1, verticalAlign: 'middle', fontSize: 20 }} />
              Forex Allocation Summary
            </Typography>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} sm={4}>
                <Typography variant="body2" color="black">Total Allocated</Typography>
                <Typography variant="h6">
                  ${forexAllocations.reduce((sum, f) => sum + (f.allocatedAmount || 0), 0).toLocaleString()}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Typography variant="body2" color="black">USD Retained</Typography>
                <Typography variant="h6">
                  ${persistedForexAllocations.reduce((sum, f) => sum + ((f.allocatedAmount || 0) * (f.retentionRate || 0) / 100), 0).toLocaleString()}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Typography variant="body2" color="black">Active Allocations</Typography>
                <Typography variant="h6">
                  {persistedForexAllocations.filter(f => f.status === 'ALLOCATED').length}
                </Typography>
              </Grid>
            </Grid>
          </Box>
        </PortalCard>
      )}

      {/* Tab 9: LC Discrepancies - NEW */}
      {activeTab === 9 && (
        <Box sx={{ mt: 2 }}>
          <LCDiscrepancyTab onStatsUpdate={setLcDiscrepancyStats} />
        </Box>
      )}

      {/* Dialogs and Modals */}
      {/* Contract Detail Dialog */}
            <PortalDialog brand="BANKS" open={!!selectedContract && dialogType === null} onClose={() => setSelectedContract(null)} maxWidth="md" title="Contract Details" actions={<>
          <GhostButton brand="BANKS" onClick={() => setSelectedContract(null)}>
            Close
          </GhostButton>
          <AnimatedButton
            variant="contained"
            startIcon={<Description />}
            onClick={() => handleOpenDialog('lc', selectedContract!)}
          >
            LC Terms
          </AnimatedButton>
        </>}>

          {selectedContract && (
            <Box sx={{ pt: 2 }}>
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <Typography variant="body1">{selectedContract.buyerName}</Typography>
                  <Typography variant="caption" color="black">{selectedContract.buyerCountry}</Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="black">Coffee Type</Typography>
                  <Typography variant="body1">{selectedContract.coffeeType}</Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="black">Quantity</Typography>
                  <Typography variant="body1">{selectedContract.quantity.toLocaleString()} kg</Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="black">Price per Kg</Typography>
                  <Typography variant="body1">${selectedContract.pricePerKg.toFixed(2)}</Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="black">Total Value</Typography>
                  <Typography variant="body1" color="black" fontWeight={600}>
                    ${selectedContract.totalValue.toLocaleString()} {selectedContract.currency}
                  </Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="black">Status</Typography>
                  <StatusChip label={selectedContract.status} status={chipStatus(selectedContract.status)} />
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="black">Registration Date</Typography>
                  <Typography variant="body1">{new Date(selectedContract.registrationDate).toLocaleDateString()}</Typography>
                </Grid>
              </Grid>
              
              <Alert severity="info" sx={{ mt: 2 }}>
                This contract has been approved by ECTA. You can now issue a Letter of Credit for this contract.
              </Alert>

              {/* Blockchain Verification */}
              <Box sx={{ mt: 3 }}>
                <BlockchainSignatureVerification
                  entityType="CONTRACT"
                  entityId={selectedContract.contractId || ''}
                />
              </Box>
            </Box>
          )}
        
      </PortalDialog>

      {/* KPI Data Dialog - Shows data in table format */}
            <PortalDialog brand="BANKS" open={kpiDataDialogOpen} onClose={() => setKpiDataDialogOpen(false)} maxWidth="lg" title={kpiDataDialogTitle} actions={<>
          <GhostButton brand="BANKS" onClick={() => {
            setKpiDataDialogOpen(false);
            setKpiDialogPage(0);
          }}>Close</GhostButton>
          <PrimaryButton brand="BANKS"
            startIcon={<Description />}
            onClick={() => {
              // Real client-side CSV export of the rows in this dialog
              // (same generate*/downloadCSV helpers the forex/SWIFT tabs use).
              if (!kpiDataDialogType || kpiDataDialogData.length === 0) {
                showError('Nothing to Export', 'There are no rows in this view to export.');
                return;
              }
              const csv = kpiDataDialogType === 'forex'
                ? generateForexCSV(kpiDataDialogData as ForexAllocation[])
                : kpiDataDialogType === 'lc'
                  ? generateLCCSV(kpiDataDialogData as LetterOfCredit[])
                  : generateSwiftCSV(kpiDataDialogData);
              const safeTitle = (kpiDataDialogTitle || kpiDataDialogType).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
              downloadCSV(csv, `${safeTitle || kpiDataDialogType}-export.csv`);
              showSuccess('Export Complete', `${kpiDataDialogData.length} row(s) exported to CSV.`);
            }}
          >
            Export CSV
          </PrimaryButton>
        </>}>

          {kpiDataDialogType === 'forex' && kpiDataDialogData.length > 0 && (
            <>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>Forex ID</strong></TableCell>
                      <TableCell><strong>LC Reference</strong></TableCell>
                      <TableCell><strong>Exporter</strong></TableCell>
                      <TableCell><strong>Buyer</strong></TableCell>
                      <TableCell><strong>Allocated Amount</strong></TableCell>
                      <TableCell><strong>Exchange Rate</strong></TableCell>
                      <TableCell><strong>Status</strong></TableCell>
                      <TableCell><strong>Expiry Date</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {kpiDataDialogData
                      .slice(kpiDialogPage * kpiDialogRowsPerPage, (kpiDialogPage + 1) * kpiDialogRowsPerPage)
                      .map((forex: ForexAllocation) => (
                        <TableRow key={forex.forexId}>
                          <TableCell>{forex.forexId}</TableCell>
                          <TableCell>{forex.lcId || 'N/A'}</TableCell>
                          <TableCell>{forex.exporterId || 'N/A'}</TableCell>
                          <TableCell>{forex.buyerName || forex.BuyerName || 'N/A'}</TableCell>
                          <TableCell><strong>${(forex.allocatedAmount || 0).toLocaleString()}</strong></TableCell>
                          <TableCell>{forex.exchangeRate > 0 ? `${forex.exchangeRate.toFixed(2)} ETB/USD` : 'Pending NBE rate'}</TableCell>
                          <TableCell>
                            <StatusChip 
                              label={forex.status || 'PENDING'} 
                              status={chipStatus(forex.status)}
                            />
                          </TableCell>
                          <TableCell>
                            {forex.expiryDate ? new Date(forex.expiryDate).toLocaleDateString() : 'N/A'}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Pagination */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" color="black">Rows per page:</Typography>
                  <PortalField
                    select
                    size="small"
                    value={kpiDialogRowsPerPage}
                    onChange={(e) => {
                      setKpiDialogRowsPerPage(parseInt(e.target.value));
                      setKpiDialogPage(0);
                    }}
                    sx={{ width: 80 }}
                  >
                    <MenuItem value={5}>5</MenuItem>
                    <MenuItem value={10}>10</MenuItem>
                    <MenuItem value={25}>25</MenuItem>
                    <MenuItem value={50}>50</MenuItem>
                  </PortalField>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Typography variant="body2" color="black">
                    Page {kpiDialogPage + 1} shows items {kpiDialogPage * kpiDialogRowsPerPage + 1}-{Math.min((kpiDialogPage + 1) * kpiDialogRowsPerPage, kpiDataDialogData.length)} of {kpiDataDialogData.length}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={kpiDialogPage === 0}
                      onClick={() => setKpiDialogPage(kpiDialogPage - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={kpiDialogPage >= Math.ceil(kpiDataDialogData.length / kpiDialogRowsPerPage) - 1}
                      onClick={() => setKpiDialogPage(kpiDialogPage + 1)}
                    >
                      Next
                    </Button>
                  </Box>
                </Box>
              </Box>
            </>
          )}
          
          {kpiDataDialogType === 'lc' && kpiDataDialogData.length > 0 && (
            <>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>LC ID</strong></TableCell>
                      <TableCell><strong>Contract ID</strong></TableCell>
                      <TableCell><strong>Exporter</strong></TableCell>
                      <TableCell><strong>Buyer</strong></TableCell>
                      <TableCell><strong>Amount</strong></TableCell>
                      <TableCell><strong>Status</strong></TableCell>
                      <TableCell><strong>Expiry Date</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {kpiDataDialogData
                      .slice(kpiDialogPage * kpiDialogRowsPerPage, (kpiDialogPage + 1) * kpiDialogRowsPerPage)
                      .map((lc: LetterOfCredit) => (
                        <TableRow key={lc.lcId}>
                          <TableCell>{lc.lcId}</TableCell>
                          <TableCell>{lc.contractId}</TableCell>
                          <TableCell>{lc.exporterId}</TableCell>
                          <TableCell>{lc.buyerName || '—'}</TableCell>
                          <TableCell><strong>${lc.amount?.toLocaleString()} {lc.currency}</strong></TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <StatusChip label={lc.status} status={chipStatus(lc.status)} />
                              {lc.blockchainVerified && lc.txId && (
                                <BlockchainBadge 
                                  txId={lc.txId}
                                  entityType="LC"
                                  entityId={lc.lcId}
                                  verified={true}
                                  compact={true}
                                />
                              )}
                            </Box>
                          </TableCell>
                          <TableCell>
                            {lc.expiryDate ? new Date(lc.expiryDate).toLocaleDateString() : 'N/A'}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Pagination */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" color="black">Rows per page:</Typography>
                  <PortalField
                    select
                    size="small"
                    value={kpiDialogRowsPerPage}
                    onChange={(e) => {
                      setKpiDialogRowsPerPage(parseInt(e.target.value));
                      setKpiDialogPage(0);
                    }}
                    sx={{ width: 80 }}
                  >
                    <MenuItem value={5}>5</MenuItem>
                    <MenuItem value={10}>10</MenuItem>
                    <MenuItem value={25}>25</MenuItem>
                    <MenuItem value={50}>50</MenuItem>
                  </PortalField>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Typography variant="body2" color="black">
                    Page {kpiDialogPage + 1} shows items {kpiDialogPage * kpiDialogRowsPerPage + 1}-{Math.min((kpiDialogPage + 1) * kpiDialogRowsPerPage, kpiDataDialogData.length)} of {kpiDataDialogData.length}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={kpiDialogPage === 0}
                      onClick={() => setKpiDialogPage(kpiDialogPage - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={kpiDialogPage >= Math.ceil(kpiDataDialogData.length / kpiDialogRowsPerPage) - 1}
                      onClick={() => setKpiDialogPage(kpiDialogPage + 1)}
                    >
                      Next
                    </Button>
                  </Box>
                </Box>
              </Box>
            </>
          )}
          
          {kpiDataDialogType === 'swift' && kpiDataDialogData.length > 0 && (
            <>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                    <TableCell><strong>Message ID</strong></TableCell>
                    <TableCell><strong>Type</strong></TableCell>
                    <TableCell><strong>SWIFT Reference</strong></TableCell>
                    <TableCell><strong>Sender BIC</strong></TableCell>
                    <TableCell><strong>Receiver BIC</strong></TableCell>
                    <TableCell><strong>Amount</strong></TableCell>
                    <TableCell><strong>Status</strong></TableCell>
                    <TableCell><strong>Date</strong></TableCell>
                    <TableCell><strong>Actions</strong></TableCell>
                  </TableRow>
                  </TableHead>
                  <TableBody>
                    {kpiDataDialogData
                      .slice(kpiDialogPage * kpiDialogRowsPerPage, (kpiDialogPage + 1) * kpiDialogRowsPerPage)
                      .map((swift: any) => (
                        <TableRow key={swift.messageId}>
                          <TableCell>{swift.messageId}</TableCell>
                          <TableCell><Chip label={swift.messageType} size="small" color="primary" /></TableCell>
                          <TableCell>{swift.swiftReference || 'N/A'}</TableCell>
                          <TableCell>{swift.senderBic || 'N/A'}</TableCell>
                          <TableCell>{swift.receiverBic || 'N/A'}</TableCell>
                          <TableCell><strong>${(swift.amount || 0).toLocaleString()} {swift.currency}</strong></TableCell>
                          <TableCell>
                            <StatusChip 
                              label={swift.status || 'PENDING'} 
                              status={chipStatus(swift.status)}
                            />
                          </TableCell>
                          <TableCell>
                            {swift.sentDate ? new Date(swift.sentDate).toLocaleDateString() : 
                             swift.createdAt ? new Date(swift.createdAt).toLocaleDateString() : 'N/A'}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Pagination */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" color="black">Rows per page:</Typography>
                  <PortalField
                    select
                    size="small"
                    value={kpiDialogRowsPerPage}
                    onChange={(e) => {
                      setKpiDialogRowsPerPage(parseInt(e.target.value));
                      setKpiDialogPage(0);
                    }}
                    sx={{ width: 80 }}
                  >
                    <MenuItem value={5}>5</MenuItem>
                    <MenuItem value={10}>10</MenuItem>
                    <MenuItem value={25}>25</MenuItem>
                    <MenuItem value={50}>50</MenuItem>
                  </PortalField>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Typography variant="body2" color="black">
                    Page {kpiDialogPage + 1} shows items {kpiDialogPage * kpiDialogRowsPerPage + 1}-{Math.min((kpiDialogPage + 1) * kpiDialogRowsPerPage, kpiDataDialogData.length)} of {kpiDataDialogData.length}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={kpiDialogPage === 0}
                      onClick={() => setKpiDialogPage(kpiDialogPage - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={kpiDialogPage >= Math.ceil(kpiDataDialogData.length / kpiDialogRowsPerPage) - 1}
                      onClick={() => setKpiDialogPage(kpiDialogPage + 1)}
                    >
                      Next
                    </Button>
                  </Box>
                </Box>
              </Box>
            </>
          )}

          {kpiDataDialogData.length === 0 && (
            <Alert severity="info" sx={{ mt: 2 }}>
              No data available for this selection.
            </Alert>
          )}
        
      </PortalDialog>

      {/* Forex Allocation Details Dialog */}
            <PortalDialog brand="BANKS" open={forexDetailsOpen} onClose={() => setForexDetailsOpen(false)} maxWidth="md" title="Forex Allocation Details" icon={<CurrencyExchange />} actions={<>
          <GhostButton brand="BANKS" onClick={() => setForexDetailsOpen(false)}>Close</GhostButton>
          {/* Bank actions on forex: Allocate (REQUESTED), Reject (REQUESTED/CONFIRMED), Utilise (ALLOCATED) */}
          {selectedForex && selectedForex.status === 'REQUESTED' && (
            <>
              <PrimaryButton 
                brand="BANKS"
                onClick={async () => {
                  // Close details dialog and open allocation dialog
                  setForexDetailsOpen(false);
                  
                  // Fetch NBE exchange rate and retention policy
                  setAllocationPolicyReady(false);
                  try {
                    const token = localStorage.getItem('authToken');
                    const currency = String(selectedForex.currency || 'USD').toUpperCase();
                    
                    const [rateResponse, policyResponse] = await Promise.all([
                      apiFetch(`/forex/rates/${encodeURIComponent(currency)}/current`, {
                        method: 'GET',
                        headers: token ? { 'Authorization': `Bearer ${token}` } : undefined,
                      }),
                      apiFetch('/forex/retention-policy/COFFEE', {
                        method: 'GET',
                        headers: token ? { 'Authorization': `Bearer ${token}` } : undefined,
                      }),
                    ]);
                    
                    const [rateResult, policyResult] = await Promise.all([
                      rateResponse.json(),
                      policyResponse.json()
                    ]);
                    
                    const activeRate = Number(rateResult.data?.midRate ?? rateResult.data?.MidRate);
                    const retentionRate = Number(policyResult.data?.retentionRate ?? policyResult.data?.RetentionRate);
                    
                    if (!rateResult.success || !policyResult.success || !Number.isFinite(activeRate) || activeRate <= 0 || !Number.isFinite(retentionRate) || retentionRate < 0) {
                      showError('NBE Ledger Data Required', 'An active exchange rate and COFFEE retention policy are required before forex can be allocated.');
                      return;
                    }
                    
                    // Auto-generate approval reference with timestamp
                    const approvalRef = `FOREX-ALLOC-${Date.now()}`;
                    
                    setAllocationForm({
                      forexId: selectedForex.forexId,
                      lcId: selectedForex.lcId || '',
                      amount: selectedForex.requestedAmount || 0,
                      exchangeRate: activeRate,
                      retentionRate: retentionRate,
                      officer: user?.fullName || user?.username || 'Bank Officer',
                      approvalRef: approvalRef,
                      expiryDate: selectedForex.expiryDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
                    });
                    setAllocationPolicyReady(true);
                  } catch (error) {
                    showError('NBE Ledger Data Required', 'Unable to load the current exchange rate and retention policy.');
                  }
                  
                  setAllocationDialogOpen(true);
                }}
                startIcon={<CheckCircle />}
              >
                Allocate Forex
              </PrimaryButton>
              <DangerButton brand="BANKS"
                onClick={() => handleRejectForex(selectedForex)}
                loadingLabel="Rejecting…"
                ledgerWrite
                color="error"
              >
                Reject
              </DangerButton>
            </>
          )}
          {selectedForex && selectedForex.status === 'CONFIRMED' && (
            <DangerButton brand="BANKS"
              onClick={() => handleRejectForex(selectedForex)}
              loadingLabel="Rejecting…"
              ledgerWrite
              color="error"
            >
              Reject
            </DangerButton>
          )}
          {selectedForex && selectedForex.status === 'ALLOCATED' && (
            <PrimaryButton brand="BANKS" onClick={() => handleUtilizeForex(selectedForex)}
            loadingLabel="Utilising…"
            ledgerWrite
            startIcon={<CheckCircle />}
            >
              Utilise
            </PrimaryButton>
          )}
        </>}>

          {selectedForex && (
            <Box sx={{ pt: 2 }}>
              <Grid container spacing={3}>
                {/* Forex ID & LC Reference */}
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">Forex ID</Typography>
                  <Typography variant="body1" fontWeight={600}>{selectedForex.forexId}</Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">LC Reference</Typography>
                  <Typography variant="body1" fontWeight={600}>{selectedForex.lcId || 'N/A'}</Typography>
                </Grid>

                {/* Exporter & Status */}
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">Exporter ID</Typography>
                  <Typography variant="body1">{selectedForex.exporterId || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">Status</Typography>
                  <StatusChip 
                    label={selectedForex.status || 'PENDING'} 
                    status={chipStatus(selectedForex.status)}
                  />
                </Grid>

                {/* Divider */}
                <Grid item xs={12}>
                  <Divider />
                  <Typography variant="subtitle2" sx={{ mt: 2, mb: 1, color: '#9b30b7' }}>
                    {selectedForex.status === 'REQUESTED' ? 'Requested Allocation' : 'Allocation Breakdown'}
                  </Typography>
                </Grid>

                {/* Amount (Requested or Allocated) */}
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">
                    {selectedForex.status === 'REQUESTED' ? 'Requested Amount' : 'Allocated Amount'}
                  </Typography>
                  <Typography variant="h6" color="primary" fontWeight={700}>
                    ${(selectedForex.status === 'REQUESTED' ? (selectedForex.requestedAmount || 0) : (selectedForex.allocatedAmount || 0)).toLocaleString()} USD
                  </Typography>
                </Grid>

                {/* Exchange Rate */}
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">Exchange Rate</Typography>
                  {selectedForex.status === 'REQUESTED' || !selectedForex.exchangeRate || selectedForex.exchangeRate === 0 ? (
                    <Typography variant="h6" fontWeight={600} color="warning.main">
                      Pending Allocation
                    </Typography>
                  ) : (
                    <Typography variant="h6" fontWeight={600}>
                      {Number(selectedForex.exchangeRate).toFixed(2)} ETB/USD
                    </Typography>
                  )}
                </Grid>

                {/* USD Retention */}
                <Grid item xs={12} md={6}>
                  <Paper sx={{ p: 2, bgcolor: '#f5f5f5', border: '1px solid #e0e0e0' }}>
                    <Typography variant="body2" color="text.secondary">
                      {selectedForex.retentionRate || 0}% USD Retention
                    </Typography>
                    {selectedForex.status === 'REQUESTED' || !selectedForex.retentionRate || selectedForex.retentionRate === 0 ? (
                      <>
                        <Typography variant="h5" fontWeight={700} color="warning.main">
                          Pending Allocation
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Retention rate must match the active NBE policy recorded on the ledger.
                        </Typography>
                      </>
                    ) : (
                      <>
                        <Typography variant="h5" fontWeight={700} color="#1976d2">
                          ${((selectedForex.allocatedAmount || 0) * selectedForex.retentionRate / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Retained in USD account
                        </Typography>
                      </>
                    )}
                  </Paper>
                </Grid>

                {/* ETB Conversion */}
                <Grid item xs={12} md={6}>
                  <Paper sx={{ p: 2, bgcolor: '#f5f5f5', border: '1px solid #e0e0e0' }}>
                    <Typography variant="body2" color="text.secondary">
                      {100 - selectedForex.retentionRate}% ETB Conversion
                    </Typography>
                    {selectedForex.status === 'REQUESTED' || selectedForex.exchangeRate === 0 ? (
                      <>
                        <Typography variant="h5" fontWeight={700} color="warning.main">
                          Pending Allocation
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Conversion amount will be calculated upon allocation
                        </Typography>
                      </>
                    ) : (
                      <>
                        <Typography variant="h5" fontWeight={700} color="#2e7d32">
                          {((selectedForex.allocatedAmount || 0) * (100 - selectedForex.retentionRate) / 100 * selectedForex.exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Converted to Ethiopian Birr
                        </Typography>
                      </>
                    )}
                  </Paper>
                </Grid>

                {/* Expiry Date */}
                <Grid item xs={12}>
                  <Divider sx={{ my: 1 }} />
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">Expiry Date</Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {selectedForex.expiryDate ? new Date(selectedForex.expiryDate).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    }) : 'N/A'}
                  </Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">Currency</Typography>
                  <Typography variant="body1" fontWeight={600}>{selectedForex.currency || 'USD'}</Typography>
                </Grid>

                {/* Info Alert */}
                {selectedForex.status === 'ALLOCATED' && (
                  <Grid item xs={12}>
                    <Alert severity="success" sx={{ mt: 2 }}>
                      <Typography variant="body2">
                        <strong>Forex Allocated:</strong> This allocation is active and available for the exporter. 
                        The exchange and retention rates shown above are recorded on the ledger.
                      </Typography>
                    </Alert>
                  </Grid>
                )}
                
                {/* Info Alert for REQUESTED */}
                {selectedForex.status === 'REQUESTED' && (
                  <Grid item xs={12}>
                    <Alert severity="info" sx={{ mt: 2 }}>
                      <Typography variant="body2">
                        <strong>Forex Allocation Requested:</strong> This request is awaiting NBE confirmation. The bank can allocate only after NBE confirms it — allocation uses the active NBE exchange rate and the explicitly recorded retention rate.
                      </Typography>
                    </Alert>
                  </Grid>
                )}
              </Grid>

              
{/* EXPERT PATTERN: Progressive Disclosure */}
              <Box sx={{ mt: 3 }}>
                <Divider sx={{ my: 2 }} />
                <Typography variant="h6" gutterBottom>Activity Timeline</Typography>
                {forexDetailsOpen && (
                  <BusinessActivityTimeline entityType="FOREX" entityId={selectedForex.forexId || ''} />
                )}
                <Divider sx={{ my: 3 }} />
                <Accordion>
                  <AccordionSummary expandIcon={<ExpandMore />}>
                    <Typography>🔐 Blockchain Verification</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    {forexDetailsOpen && <BlockchainSignatureVerification entityType="FOREX_ALLOCATION" entityId={selectedForex.forexId || ''} />}
                  </AccordionDetails>
                </Accordion>
              </Box>
            </Box>
          )}
        
      </PortalDialog>

      {/* Payment Details Dialog */}
            <PortalDialog brand="BANKS" open={paymentDetailsOpen} onClose={() => setPaymentDetailsOpen(false)} maxWidth="md" title="Payment Details" icon={<Payment />} actions={<>
          <Button
            variant="outlined"
            size="small"
            startIcon={<Assignment />}
            onClick={() => {
              setAuditEntityType('PAYMENT');
              setAuditEntityId(selectedPaymentForDetails?.paymentId || '');
              setShowAuditTrail(true);
            }}
            sx={{ textTransform: 'none', mr: 'auto' }}
          >
            View Audit Trail
          </Button>
          <GhostButton brand="BANKS" onClick={() => setPaymentDetailsOpen(false)}>Close</GhostButton>
          {selectedPaymentForDetails && ['VERIFIED', 'SWIFT_RECEIVED'].includes(String(selectedPaymentForDetails.status || '').toUpperCase()) && (
            <PrimaryButton brand="BANKS"
              variant="contained"
              onClick={() => {
                setSettleForm({
                  exchangeRate: selectedPaymentForDetails.exchangeRate ? String(selectedPaymentForDetails.exchangeRate) : '',
                  retentionRate: '40',
                  payingBank: selectedPaymentForDetails.payingBank || 'Commercial Bank of Ethiopia',
                  payingBankBIC: selectedPaymentForDetails.payingBankBIC || 'CBETETAA',
                  swiftReference: selectedPaymentForDetails.swiftReference || '',
                  nbeApprovalRef: '',
                });
                setSettleDialogOpen(true);
              }}
              sx={{ textTransform: 'none' }}
            >
              Settle Payment
            </PrimaryButton>
          )}
        </>}>

          {selectedPaymentForDetails && (
            <Box sx={{ pt: 2 }}>
              <Grid container spacing={3}>
                {/* Payment ID & Contract Reference */}
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">Payment ID</Typography>
                  <Typography variant="body1" fontWeight={600}>{selectedPaymentForDetails.paymentId}</Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">Contract ID</Typography>
                  <Typography variant="body1" fontWeight={600}>{selectedPaymentForDetails.contractId || 'N/A'}</Typography>
                </Grid>

                {/* Exporter & Status */}
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">Exporter ID</Typography>
                  <Typography variant="body1">{selectedPaymentForDetails.exporterId || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">Status</Typography>
                  <StatusChip 
                    label={selectedPaymentForDetails.status || 'PENDING'} 
                    status={selectedPaymentForDetails.status} 
                  />
                </Grid>

                {/* Divider */}
                <Grid item xs={12}>
                  <Divider />
                  <Typography variant="subtitle2" sx={{ mt: 2, mb: 1, color: '#9b30b7' }}>
                    Payment Information
                  </Typography>
                </Grid>

                {/* Amount */}
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">Amount</Typography>
                  <Typography variant="h6" color="primary" fontWeight={700}>
                    {(selectedPaymentForDetails.currency || 'USD')} {(selectedPaymentForDetails.amount || 0).toLocaleString()}
                  </Typography>
                </Grid>

                {/* Credit Advice Number */}
                {selectedPaymentForDetails.creditAdviceNumber && (
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" color="text.secondary">Credit Advice Number</Typography>
                    <Typography variant="body1" fontWeight={600} sx={{ fontFamily: 'monospace' }}>
                      {selectedPaymentForDetails.creditAdviceNumber}
                    </Typography>
                  </Grid>
                )}

                {/* SWIFT Reference */}
                {selectedPaymentForDetails.swiftReference && (
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" color="text.secondary">SWIFT Reference</Typography>
                    <Typography variant="body1" fontWeight={600} sx={{ fontFamily: 'monospace' }}>
                      {selectedPaymentForDetails.swiftReference}
                    </Typography>
                  </Grid>
                )}

                {/* Divider */}
                <Grid item xs={12}>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="subtitle2" sx={{ mb: 1, color: '#9b30b7' }}>
                    Banking Details
                  </Typography>
                </Grid>

                {/* Receiving Bank */}
                {selectedPaymentForDetails.receivingBank && (
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" color="text.secondary">Receiving Bank</Typography>
                    <Typography variant="body1" fontWeight={600}>{selectedPaymentForDetails.receivingBank}</Typography>
                    {selectedPaymentForDetails.receivingBankBIC && (
                      <Typography variant="caption" color="text.secondary">
                        BIC: {selectedPaymentForDetails.receivingBankBIC}
                      </Typography>
                    )}
                  </Grid>
                )}

                {/* Paying Bank */}
                {selectedPaymentForDetails.payingBank && (
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" color="text.secondary">Paying Bank</Typography>
                    <Typography variant="body1" fontWeight={600}>{selectedPaymentForDetails.payingBank}</Typography>
                    {selectedPaymentForDetails.payingBankBIC && (
                      <Typography variant="caption" color="text.secondary">
                        BIC: {selectedPaymentForDetails.payingBankBIC}
                      </Typography>
                    )}
                  </Grid>
                )}

                {/* Beneficiary */}
                {selectedPaymentForDetails.beneficiaryName && (
                  <Grid item xs={12}>
                    <Typography variant="body2" color="text.secondary">Beneficiary</Typography>
                    <Typography variant="body1" fontWeight={600}>{selectedPaymentForDetails.beneficiaryName}</Typography>
                    {selectedPaymentForDetails.beneficiaryAccount && (
                      <Typography variant="caption" color="text.secondary">
                        Account: {selectedPaymentForDetails.beneficiaryAccount}
                      </Typography>
                    )}
                  </Grid>
                )}

                {/* Dates */}
                <Grid item xs={12}>
                  <Divider sx={{ my: 1 }} />
                </Grid>
                
                {selectedPaymentForDetails.receivedDate && (
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" color="text.secondary">Received Date</Typography>
                    <Typography variant="body1" fontWeight={600}>
                      {new Date(selectedPaymentForDetails.receivedDate).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </Typography>
                  </Grid>
                )}

                {selectedPaymentForDetails.settlementDate && (
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" color="text.secondary">Settlement Date</Typography>
                    <Typography variant="body1" fontWeight={600}>
                      {new Date(selectedPaymentForDetails.settlementDate).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </Typography>
                  </Grid>
                )}

                {/* Remarks */}
                {selectedPaymentForDetails.remarks && (
                  <Grid item xs={12}>
                    <Alert severity="info">
                      <Typography variant="body2">
                        <strong>Remarks:</strong> {selectedPaymentForDetails.remarks}
                      </Typography>
                    </Alert>
                  </Grid>
                )}
              </Grid>

              {/* Blockchain Verification - Component handles all messaging */}
              <Box sx={{ mt: 3 }}>
                <BlockchainSignatureVerification
                  entityType="PAYMENT"
                  entityId={selectedPaymentForDetails.paymentId || ''}
                />
              </Box>
            </Box>
          )}
        
      </PortalDialog>

      {/* Settle Payment Dialog — slice-6 fix: the settle step had no UI */}
            <PortalDialog brand="BANKS" open={settleDialogOpen} onClose={() => setSettleDialogOpen(false)} maxWidth="sm" title={<>Settle Payment {selectedPaymentForDetails?.paymentId ? `— ${selectedPaymentForDetails.paymentId}` : ''}</>} actions={<>
          <GhostButton brand="BANKS" onClick={() => setSettleDialogOpen(false)}>Cancel</GhostButton>
          <PrimaryButton brand="BANKS"
            variant="contained"
            onClick={handleSettlePayment}
            loading={settling}
            loadingLabel="Settling…"
            ledgerWrite
            disabled={settling || !(Number(settleForm.exchangeRate) > 0) || !(Number(settleForm.retentionRate) > 0) || !(Number(settleForm.retentionRate) <= 100) || !settleForm.payingBank || !validateBIC(settleForm.payingBankBIC, 'Paying bank BIC').valid || !settleForm.swiftReference || !settleForm.nbeApprovalRef}
          >
            Settle Payment
          </PrimaryButton>
        </>}>

          <Box sx={{ pt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <PortalField
                  label="Exchange Rate (ETB/USD) *"
                  type="number"
                  value={settleForm.exchangeRate}
                  onChange={(e) => setSettleForm({ ...settleForm, exchangeRate: e.target.value })}
                  fullWidth
                  required
                  error={settleForm.exchangeRate !== '' && !(Number(settleForm.exchangeRate) > 0)}
                  helperText={settleForm.exchangeRate !== '' && !(Number(settleForm.exchangeRate) > 0) ? 'Rate must be greater than 0 — a 0 rate is rejected, never settled at a default rate.' : 'Use the live NBE rate; 0 is not accepted.'}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <PortalField
                  label="Retention Rate (%) *"
                  type="number"
                  value={settleForm.retentionRate}
                  onChange={(e) => setSettleForm({ ...settleForm, retentionRate: e.target.value })}
                  fullWidth
                  required
                  error={settleForm.retentionRate !== '' && !(Number(settleForm.retentionRate) > 0 && Number(settleForm.retentionRate) <= 100)}
                  helperText={settleForm.retentionRate !== '' && !(Number(settleForm.retentionRate) > 0 && Number(settleForm.retentionRate) <= 100) ? 'Retention must be greater than 0 and at most 100.' : undefined}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <PortalField
                  label="Paying Bank *"
                  value={settleForm.payingBank}
                  onChange={(e) => setSettleForm({ ...settleForm, payingBank: e.target.value })}
                  fullWidth
                  required
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <PortalField
                  label="Paying Bank BIC *"
                  value={settleForm.payingBankBIC}
                  onChange={(e) => setSettleForm({ ...settleForm, payingBankBIC: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11) })}
                  fullWidth
                  required
                  helperText="8 or 11 characters, e.g. CBETETAA"
                  error={settleForm.payingBankBIC.length > 0 && !validateBIC(settleForm.payingBankBIC, 'Paying bank BIC').valid}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <PortalField
                  label="SWIFT Reference *"
                  value={settleForm.swiftReference}
                  onChange={(e) => setSettleForm({ ...settleForm, swiftReference: e.target.value })}
                  fullWidth
                  required
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <PortalField
                  label="NBE Approval Reference *"
                  value={settleForm.nbeApprovalRef}
                  onChange={(e) => setSettleForm({ ...settleForm, nbeApprovalRef: e.target.value })}
                  fullWidth
                  required
                />
              </Grid>
            </Grid>
          </Box>
        
      </PortalDialog>

      {/* Issue Standby LC Dialog — Issue 6 (2026-11-14): standby-LC issuance
          was API-only (POST /banking/lc/standby/issue). Fields are exactly
          the route's validators; the contract must be APPROVED or COMPLETED
          on the ledger (chaincode IssueStandbyLC enforces it). */}
      <PortalDialog brand="BANKS" open={standbyDialogOpen} onClose={() => setStandbyDialogOpen(false)} maxWidth="md" title="Issue Standby Letter of Credit" actions={<>
        <GhostButton brand="BANKS" onClick={() => setStandbyDialogOpen(false)}>Cancel</GhostButton>
        <PrimaryButton brand="BANKS"
          variant="contained"
          onClick={handleIssueStandbyLC}
          loading={issuingStandby}
          loadingLabel="Issuing…"
          ledgerWrite
          disabled={issuingStandby || !standbyForm.standbyLCNumber.trim() || !standbyForm.contractId || !(Number(standbyForm.amount) > 0) || !standbyForm.currency.trim() || !standbyForm.expiryDate || !standbyForm.type || !standbyForm.purpose.trim() || !standbyForm.beneficiary.trim() || !standbyForm.applicant.trim()}
        >
          Issue Standby LC
        </PrimaryButton>
      </>}>
        <Box sx={{ pt: 2 }}>
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2">
              <strong>Standby LC (UCP 600 / ISP98):</strong> a bank guarantee — performance, advance payment, bid bond or financial — issued against an ECTA-approved contract. The guarantee is written to the ledger first; the issue is confirmed only when the ledger transaction succeeds.
            </Typography>
          </Alert>
          {standbyResult && (
            <Alert severity="success" sx={{ mb: 3 }}>
              <Typography variant="body2">
                <strong>Issued:</strong> {standbyResult.standbyLCNumber} ({standbyResult.standbyLCId}) — status ISSUED.
              </Typography>
              <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                <strong>Ledger txId:</strong> {standbyResult.txId}
              </Typography>
            </Alert>
          )}
          {standbyError && (
            <Alert severity="error" sx={{ mb: 3 }}>
              <Typography variant="body2">
                <strong>Issue failed:</strong> {standbyError}
              </Typography>
            </Alert>
          )}
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <PortalField
                label="Standby LC Number *"
                value={standbyForm.standbyLCNumber}
                onChange={(e) => setStandbyForm({ ...standbyForm, standbyLCNumber: e.target.value })}
                fullWidth
                required
                helperText="Must be unique — a duplicate number is rejected with 409."
              />
            </Grid>
            <Grid item xs={12} md={6}>
              {contracts.length > 0 ? (
                <PortalField
                  label="Contract *"
                  select
                  value={standbyForm.contractId}
                  onChange={(e) => {
                    const selected = contracts.find(c => c.contractId === e.target.value);
                    setStandbyForm(prev => ({
                      ...prev,
                      contractId: e.target.value,
                      beneficiary: selected?.exporterId || prev.beneficiary,
                      applicant: selected?.exporterId || prev.applicant,
                    }));
                  }}
                  fullWidth
                  required
                  helperText="Only ECTA-approved contracts can carry a standby LC."
                >
                  {contracts.map((c) => (
                    <MenuItem key={c.contractId} value={c.contractId}>
                      {c.contractId} — {c.exporterId} ({c.totalValue?.toLocaleString()} {c.currency})
                    </MenuItem>
                  ))}
                </PortalField>
              ) : (
                <PortalField
                  label="Contract ID *"
                  value={standbyForm.contractId}
                  onChange={(e) => setStandbyForm({ ...standbyForm, contractId: e.target.value })}
                  fullWidth
                  required
                  helperText="Contract must exist and be APPROVED or COMPLETED."
                />
              )}
            </Grid>
            <Grid item xs={12} md={6}>
              <PortalField
                label="Amount *"
                type="number"
                value={standbyForm.amount}
                onChange={(e) => setStandbyForm({ ...standbyForm, amount: e.target.value })}
                fullWidth
                required
                error={standbyForm.amount !== '' && !(Number(standbyForm.amount) > 0)}
                helperText={standbyForm.amount !== '' && !(Number(standbyForm.amount) > 0) ? 'Amount must be greater than 0.' : undefined}
                inputProps={{ step: '0.01', min: 0 }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <PortalField
                label="Currency *"
                value={standbyForm.currency}
                onChange={(e) => setStandbyForm({ ...standbyForm, currency: e.target.value })}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <PortalField
                label="Expiry Date *"
                type="date"
                value={standbyForm.expiryDate}
                onChange={(e) => setStandbyForm({ ...standbyForm, expiryDate: e.target.value })}
                fullWidth
                required
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <PortalField
                label="Type *"
                select
                value={standbyForm.type}
                onChange={(e) => setStandbyForm({ ...standbyForm, type: e.target.value })}
                fullWidth
                required
              >
                <MenuItem value="PERFORMANCE">Performance Guarantee</MenuItem>
                <MenuItem value="ADVANCE_PAYMENT">Advance Payment Guarantee</MenuItem>
                <MenuItem value="BID_BOND">Bid Bond</MenuItem>
                <MenuItem value="FINANCIAL">Financial Guarantee</MenuItem>
              </PortalField>
            </Grid>
            <Grid item xs={12}>
              <PortalField
                label="Purpose *"
                value={standbyForm.purpose}
                onChange={(e) => setStandbyForm({ ...standbyForm, purpose: e.target.value })}
                fullWidth
                required
                placeholder="e.g. Performance guarantee for coffee export contract"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <PortalField
                label="Beneficiary *"
                value={standbyForm.beneficiary}
                onChange={(e) => setStandbyForm({ ...standbyForm, beneficiary: e.target.value })}
                fullWidth
                required
                helperText="Defaults to the selected contract's exporter."
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <PortalField
                label="Applicant *"
                value={standbyForm.applicant}
                onChange={(e) => setStandbyForm({ ...standbyForm, applicant: e.target.value })}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12}>
              <PortalField
                label="Terms"
                value={standbyForm.terms}
                onChange={(e) => setStandbyForm({ ...standbyForm, terms: e.target.value })}
                fullWidth
                multiline
                rows={2}
                placeholder="Payable on first written demand with beneficiary statement"
                helperText="Optional — defaults to payable on first written demand."
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <PortalField
                label="Issuing Bank"
                value={standbyForm.issuingBank}
                onChange={(e) => setStandbyForm({ ...standbyForm, issuingBank: e.target.value })}
                fullWidth
                helperText="Optional — defaults to the contract's buyer bank."
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <PortalField
                label="Advising Bank"
                value={standbyForm.advisingBank}
                onChange={(e) => setStandbyForm({ ...standbyForm, advisingBank: e.target.value })}
                fullWidth
                helperText="Optional — defaults to the contract's exporter bank."
              />
            </Grid>
          </Grid>
        </Box>
      </PortalDialog>

      {/* LC Details Dialog */}
            <PortalDialog brand="BANKS" open={dialogOpen && dialogType === 'lcDetails'} onClose={handleCloseDialog} maxWidth="md" title={<>Letter of Credit Details
          {lcDetailsLoading && (
            <CircularProgress size={20} sx={{ ml: 2, verticalAlign: 'middle' }} />
          )}</>} icon={<Description />} actions={<>
          <GhostButton brand="BANKS" onClick={handleCloseDialog}>Close</GhostButton>
          {/* REQUESTED status: Show Approve and Reject buttons */}
          {selectedLC && selectedLC.status === 'REQUESTED' && (
            <>
              <PrimaryButton brand="BANKS"
                startIcon={<CheckCircle />}
                loadingLabel="Approving…"
                ledgerWrite
                onClick={() => handleApproveLC(selectedLC.lcId, selectedLC.exporterId)}
              >
                Approve LC
              </PrimaryButton>
              <DangerButton brand="BANKS"
                startIcon={<Cancel />}
                loadingLabel="Rejecting…"
                ledgerWrite
                onClick={() => handleRejectLC(selectedLC.lcId)}
              >
                Reject LC
              </DangerButton>
            </>
          )}
          {/* APPROVED status: Show Issue button */}
          {selectedLC && selectedLC.status === 'APPROVED' && (
            <PrimaryButton brand="BANKS"
              startIcon={<AccountBalance />}
              loadingLabel="Issuing…"
              ledgerWrite
              onClick={async () => {
                try {
                  const token = localStorage.getItem('authToken');
                  const response = await apiFetch(`/banking/lc/${selectedLC.lcId}/issue`, {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${token}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ 
                      terms: selectedLC.terms || 'Standard UCP 600 terms and conditions apply' 
                    }),
                  });
                  const result = await response.json();
                  if (result.success) {
                    showSuccess('LC Issued', `LC ${selectedLC.lcId} has been issued successfully`);
                    loadBankingData();
                    handleCloseDialog();
                  } else {
                    showError('LC Issue Failed', result.error?.message || 'Failed to issue LC');
                  }
                } catch (error: any) {
                  showError('Network Error', 'Failed to issue LC', error.message);
                }
              }}
            >
              Issue LC
            </PrimaryButton>
          )}
          {selectedLC && selectedLC.status === 'ISSUED' && (
            <>
              <Button
                variant="outlined"
                color="secondary"
                startIcon={<CloudUpload />}
                onClick={() => {
                  setUploadEntityId(selectedLC.lcId);
                  setUploadEntityType('LC');
                  setDocumentUploadDialogOpen(true);
                }}
              >
                Upload Documents
              </Button>
              <SecondaryButton brand="BANKS"
                sx={{ fontWeight: 600 }}
                onClick={() => {
                  setDialogType('lcAmend');
                  setAmendmentForm({
                    amendmentReason: '',
                    newAmount: selectedLC.amount.toString(),
                    newExpiryDate: selectedLC.expiryDate,
                    newTerms: '',
                  });
                }}
              >
                Amend LC
              </SecondaryButton>
            </>
          )}
        </>}>

          {selectedLC && (
            <Box sx={{ pt: 2, position: 'relative' }}>
              {lcDetailsLoading && (
                <Box sx={{ 
                  position: 'absolute', 
                  top: 0, 
                  left: 0, 
                  right: 0, 
                  bottom: 0, 
                  bgcolor: 'rgba(255,255,255,0.7)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  zIndex: 1
                }}>
                  <CircularProgress />
                </Box>
              )}
              <Grid container spacing={3}>
                {/* LC Information */}
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="black" gutterBottom>
                    LC Information
                  </Typography>
                  <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="black">LC ID</Typography>
                        <Typography variant="body1" fontWeight={600}>{selectedLC.lcId}</Typography>
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="black">Status</Typography>
                        <StatusChip 
                          label={selectedLC.status} 
                          status={chipStatus(selectedLC.status)}
                        />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="black">Contract Reference</Typography>
                        <Typography variant="body1">{selectedLC.contractId}</Typography>
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="black">Exporter ID</Typography>
                        <Typography variant="body1">{selectedLC.exporterId}</Typography>
                      </Grid>
                      
                      {/* ✅ Actor tracking: WHO performed actions */}
                      {selectedLC.approvedByMsp && (
                        <Grid item xs={12} md={6}>
                          <Typography variant="body2" color="black">Approved By</Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                            <Chip 
                              label={selectedLC.approvedByMsp}
                              size="small"
                              color={selectedLC.approvedByMsp === 'BanksMSP' ? 'success' : selectedLC.approvedByMsp === 'ECTAMSP' ? 'warning' : 'default'}
                              sx={{ fontWeight: 600 }}
                            />
                            <Typography variant="caption" color="text.secondary">
                              {selectedLC.approvedByMsp === 'BanksMSP' ? '(Bank)' : 
                               selectedLC.approvedByMsp === 'ECTAMSP' ? '(ECTA - unusual)' :
                               selectedLC.approvedByMsp === 'ExportersMSP' ? '(Exporter - error)' : ''}
                            </Typography>
                          </Box>
                        </Grid>
                      )}
                      
                      {selectedLC.issuedByMsp && (
                        <Grid item xs={12} md={6}>
                          <Typography variant="body2" color="black">Issued By</Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                            <Chip 
                              label={selectedLC.issuedByMsp}
                              size="small"
                              color={selectedLC.issuedByMsp === 'BanksMSP' ? 'success' : 'warning'}
                              sx={{ fontWeight: 600 }}
                            />
                            <Typography variant="caption" color="text.secondary">
                              {selectedLC.issuedByMsp === 'BanksMSP' ? '(Bank)' : '(Unusual)'}
                            </Typography>
                          </Box>
                        </Grid>
                      )}
                    </Grid>
                  </Paper>
                </Grid>

                {/* Banking Details */}
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="black" gutterBottom>
                    Banking Details
                  </Typography>
                  <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="black">Issuing Bank (Buyer's Bank)</Typography>
                        <Typography variant="body1" fontWeight={600}>
                          {selectedLC.issuingBank || 'N/A'}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="black">Advising Bank (Exporter's Bank)</Typography>
                        <Typography variant="body1" fontWeight={600}>
                          {selectedLC.advisingBank || selectedLC.bankName || 'N/A'}
                        </Typography>
                      </Grid>
                    </Grid>
                  </Paper>
                </Grid>

                {/* Financial Details */}
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="black" gutterBottom>
                    Financial Details
                  </Typography>
                  <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="black">LC Amount</Typography>
                        <Typography variant="h6" color="black" fontWeight={600}>
                          ${selectedLC.amount.toLocaleString()} {selectedLC.currency}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="black">Currency</Typography>
                        <Typography variant="body1">{selectedLC.currency}</Typography>
                      </Grid>
                    </Grid>
                  </Paper>
                </Grid>

                {/* Shipment & Transport */}
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="black" gutterBottom>
                    Shipment & Transport
                  </Typography>
                  <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="black">Transport Mode</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                          {selectedLC.transportMode === 'AIR' ? (
                            <>
                              <FlightTakeoff color="secondary" />
                              <Typography variant="body1">Air Freight</Typography>
                              <Chip label="1-3 days transit" size="small" color="secondary" />
                            </>
                          ) : (
                            <>
                              <DirectionsBoat sx={{ color: '#9b30b7' }} />
                              <Typography variant="body1">Sea Freight</Typography>
                              <Chip 
                                label="25-35 days transit" 
                                size="small" 
                                sx={{ bgcolor: '#9b30b7', color: '#fff', fontWeight: 600 }}
                              />
                            </>
                          )}
                        </Box>
                      </Grid>
                    </Grid>
                    {selectedLC.transportMode === 'AIR' && (
                      <Alert severity="info" sx={{ mt: 2 }}>
                        <Typography variant="body2">
                          <strong>Faster Payment Realization:</strong> Air freight shipments reach buyers faster,
                          enabling quicker document presentation and payment settlement (typically 3-7 days vs 30-40 days for sea freight).
                        </Typography>
                      </Alert>
                    )}
                  </Paper>
                </Grid>

                {/* Timeline */}
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="black" gutterBottom>
                    Timeline
                  </Typography>
                  <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="black">Request Date</Typography>
                        <Typography variant="body1">
                          {selectedLC.requestDate ? new Date(selectedLC.requestDate).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          }) : 'N/A'}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="black">Expiry Date</Typography>
                        <Typography variant="body1" fontWeight={600}>
                          {(() => {
                            console.log('[BANKS] Expiry Date Debug:', {
                              expiryDate: selectedLC.expiryDate,
                              ExpiryDate: (selectedLC as any).ExpiryDate,
                              expiry_date: (selectedLC as any).expiry_date,
                              allKeys: Object.keys(selectedLC).filter(k => k.toLowerCase().includes('expiry'))
                            });
                            return selectedLC.expiryDate ? new Date(selectedLC.expiryDate).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            }) : 'N/A';
                          })()}
                        </Typography>
                      </Grid>
                      <Grid item xs={12}>
                        <Typography variant="body2" color="black">Days Remaining</Typography>
                        <Typography variant="body1">
                          {selectedLC.expiryDate ? Math.max(0, Math.ceil((new Date(selectedLC.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))) : 'N/A'} days
                        </Typography>
                      </Grid>
                    </Grid>
                  </Paper>
                </Grid>

                {/* Recent Shipments Section */}
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="black" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LocalShipping />
                    Recent Shipments
                  </Typography>
                  <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                    {selectedLC.relatedShipments && selectedLC.relatedShipments.length > 0 ? (
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell><strong>Shipment ID</strong></TableCell>
                              <TableCell><strong>Status</strong></TableCell>
                              <TableCell><strong>Transport</strong></TableCell>
                              <TableCell><strong>Date</strong></TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {selectedLC.relatedShipments.slice(0, 5).map((shipment: any) => {
                              // Normalize status - handle various field names
                              const shipmentStatus = (
                                shipment.status || 
                                shipment.Status || 
                                shipment.shipmentStatus || 
                                'UNKNOWN'
                              ).toUpperCase();
                              
                              const statusColors: Record<string, any> = {
                                'CREATED': 'default',
                                'PENDING': 'default',
                                'QUALITY_CONTROL': 'info',
                                'APPROVED': 'warning',
                                'REQUESTED': 'warning',
                                'SHIPPED': 'info',
                                'IN_TRANSIT': 'info',
                                'DELIVERED': 'success',
                                'CUSTOMS_CLEARED': 'success',
                                'UNKNOWN': 'error'
                              };
                              
                              return (
                                <TableRow key={shipment.shipmentId || shipment.id}>
                                  <TableCell>
                                    <Typography variant="body2" fontWeight={600}>
                                      {shipment.shipmentId || shipment.id || 'N/A'}
                                    </Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Chip 
                                      label={shipmentStatus.replace(/_/g, ' ')} 
                                      size="small"
                                      color={statusColors[shipmentStatus] || 'default'}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2">
                                      {shipment.transportMode === 'AIR' ? '✈️ Air' : 
                                       shipment.transportMode === 'SEA' ? '🚢 Sea' : 
                                       shipment.transportMode || 'In Transit'}
                                    </Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2">
                                      {shipment.actualDeparture ? 
                                        new Date(shipment.actualDeparture).toLocaleDateString() : 
                                        shipment.estimatedDeparture ? 
                                        new Date(shipment.estimatedDeparture).toLocaleDateString() :
                                        shipment.createdAt ? 
                                        new Date(shipment.createdAt).toLocaleDateString() : 
                                        'N/A'}
                                    </Typography>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    ) : (
                      <Alert severity="info">
                        No shipments recorded for this LC yet. Shipments will appear here once the exporter creates them.
                      </Alert>
                    )}
                  </Paper>
                </Grid>

                {/* Document Compliance Check */}
                {documentChecklist && (
                  <Grid item xs={12}>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      ✅ Document Compliance Check
                    </Typography>
                    
                    {/* Validation Summary */}
                    <Alert 
                      severity={
                        documentChecklist.validation?.canApprove || documentChecklist.validation?.canIssue
                          ? 'success' 
                          : 'warning'
                      }
                      sx={{ mb: 2 }}
                      icon={
                        documentChecklist.validation?.canApprove || documentChecklist.validation?.canIssue
                          ? <CheckCircle />
                          : <Warning />
                      }
                    >
                      <Typography variant="body2" fontWeight={600}>
                        {documentChecklist.validation?.canApprove || documentChecklist.validation?.canIssue
                          ? `✅ All requirements met for ${documentChecklist.currentStage}`
                          : `⚠️ ${documentChecklist.validation?.missingDocuments?.length || documentChecklist.validation?.missingRequirements?.length || 0} requirement(s) not met`
                        }
                      </Typography>
                      {documentChecklist.validation?.reason && (
                        <Typography variant="body2" sx={{ mt: 0.5 }}>
                          {documentChecklist.validation.reason}
                        </Typography>
                      )}
                    </Alert>

                    {/* Current Stage Badge */}
                    <Box sx={{ mb: 2 }}>
                      <Chip 
                        label={`Current Stage: ${documentChecklist.currentStage}`}
                        color={
                          documentChecklist.currentStage === 'APPROVAL' ? 'warning' :
                          documentChecklist.currentStage === 'ISSUANCE' ? 'info' :
                          'success'
                        }
                        sx={{ fontWeight: 600 }}
                      />
                    </Box>

                    {/* Requirements Checklist Table */}
                    <TableContainer component={Paper}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell width="40%"><strong>Requirement</strong></TableCell>
                            <TableCell width="20%"><strong>Category</strong></TableCell>
                            <TableCell width="15%"><strong>Required</strong></TableCell>
                            <TableCell width="25%"><strong>Status</strong></TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {documentChecklist.checklist?.requirements?.map((req: any, index: number) => (
                            <TableRow 
                              key={req.documentType + index}
                              sx={{ 
                                bgcolor: req.status === 'MISSING' && req.required ? 'error.lighter' : 'transparent'
                              }}
                            >
                              <TableCell>
                                <Box>
                                  <Typography variant="body2" fontWeight={600}>
                                    {(req.documentType || req.type || 'Document').replace(/_/g, ' ')}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {req.description}
                                  </Typography>
                                  {req.fileName && (
                                    <Typography variant="caption" display="block" color="success.main" sx={{ mt: 0.5 }}>
                                      📄 {req.fileName}
                                    </Typography>
                                  )}
                                </Box>
                              </TableCell>
                              <TableCell>
                                <Chip 
                                  label={req.category} 
                                  size="small"
                                  variant="outlined"
                                  sx={{ fontSize: '0.7rem' }}
                                />
                              </TableCell>
                              <TableCell>
                                {req.required ? (
                                  <Chip label="Required" size="small" color="error" />
                                ) : (
                                  <Chip label="Optional" size="small" color="default" />
                                )}
                              </TableCell>
                              <TableCell>
                                <Chip 
                                  label={req.status}
                                  size="small"
                                  color={
                                    req.status === 'AVAILABLE' ? 'success' :
                                    req.status === 'MISSING' ? 'error' : 
                                    'default'
                                  }
                                  icon={
                                    req.status === 'AVAILABLE' ? <CheckCircle sx={{ fontSize: 16 }} /> :
                                    req.status === 'MISSING' ? <Close sx={{ fontSize: 16 }} /> :
                                    undefined
                                  }
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>

                    {/* Additional Validation Details */}
                    {documentChecklist.validation?.validationDetails && (
                      <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                        <Typography variant="caption" fontWeight={600} display="block" gutterBottom>
                          Validation Details:
                        </Typography>
                        <Grid container spacing={1}>
                          {documentChecklist.validation.validationDetails.contractStatus && (
                            <Grid item xs={6}>
                              <Typography variant="caption">
                                Contract Status: <strong>{documentChecklist.validation.validationDetails.contractStatus}</strong>
                              </Typography>
                            </Grid>
                          )}
                          {documentChecklist.validation.validationDetails.exporterLicenseStatus && (
                            <Grid item xs={6}>
                              <Typography variant="caption">
                                License Status: <strong>{documentChecklist.validation.validationDetails.exporterLicenseStatus}</strong>
                              </Typography>
                            </Grid>
                          )}
                          {documentChecklist.validation.validationDetails.requiredCount !== undefined && (
                            <Grid item xs={6}>
                              <Typography variant="caption">
                                Required Documents: <strong>{documentChecklist.validation.validationDetails.requiredCount}</strong>
                              </Typography>
                            </Grid>
                          )}
                          {documentChecklist.validation.validationDetails.availableCount !== undefined && (
                            <Grid item xs={6}>
                              <Typography variant="caption">
                                Available Documents: <strong>{documentChecklist.validation.validationDetails.availableCount}</strong>
                              </Typography>
                            </Grid>
                          )}
                        </Grid>
                      </Box>
                    )}
                  </Grid>
                )}

                {/* Exporter Historical Trend - Show before approval */}
                {selectedLC.status === 'REQUESTED' && selectedLC.exporterId && (
                  <Grid item xs={12}>
                    <Divider sx={{ my: 2 }} />
                    <ExporterHistoricalTrend
                      exporterId={selectedLC.exporterId}
                      contractId={selectedLC.contractId}
                    />
                  </Grid>
                )}

                {/* Workflow Status */}
                <Grid item xs={12}>
                  <Alert severity={selectedLC.status === 'ISSUED' ? 'success' : 'info'}>
                    {selectedLC.status === 'ISSUED' ? (
                      <>
                        <strong>LC Active:</strong> This Letter of Credit has been issued and is active. 
                        Bank should now allocate forex for this LC. After forex allocation and NBE monitoring, exporter can proceed with shipment.
                      </>
                    ) : selectedLC.status === 'APPROVED' ? (
                      <>
                        <strong>LC Approved:</strong> This Letter of Credit has been approved and is ready for issuance.
                      </>
                    ) : (
                      <>
                        <strong>LC Pending:</strong> This Letter of Credit is awaiting approval from the issuing bank.
                      </>
                    )}
                  </Alert>
                </Grid>

                {/* LC Documents Management */}
                <Grid item xs={12}>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    📄 Available Documents for Review
                  </Typography>
                  
                  {selectedLC.documents && selectedLC.documents.length > 0 ? (
                    <TableContainer component={Paper} sx={{ mt: 2 }}>
                      <Table>
                        <TableHead>
                          <TableRow>
                            <TableCell><strong>Document Type</strong></TableCell>
                            <TableCell><strong>File Name</strong></TableCell>
                            <TableCell><strong>Uploaded</strong></TableCell>
                            <TableCell><strong>Status</strong></TableCell>
                            <TableCell align="right"><strong>Actions</strong></TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {selectedLC.documents.map((doc: any) => (
                            <TableRow key={doc.documentId}>
                              <TableCell>
                                <Chip 
                                  label={(doc.documentType || doc.type || 'Document').replace(/_/g, ' ')} 
                                  size="small" 
                                  color="primary" 
                                  variant="outlined"
                                />
                              </TableCell>
                              <TableCell>{doc.fileName || doc.filename || 'N/A'}</TableCell>
                              <TableCell>
                                {doc.uploadedAt || doc.uploaded_at ? new Date(doc.uploadedAt || doc.uploaded_at).toLocaleDateString() : 'N/A'}
                              </TableCell>
                              <TableCell>
                                <Chip 
                                  label={doc.status || doc.verificationStatus || 'Active'} 
                                  size="small" 
                                  color={doc.status === 'verified' || doc.verificationStatus === 'verified' ? 'success' : 'default'}
                                />
                              </TableCell>
                              <TableCell align="right">
                                <Tooltip title="View Document">
                                  <IconButton
                                    size="small"
                                    onClick={() => {
                                      window.open(
                                        `${API_BASE_URL}/documents/${doc.documentId}/view?token=${localStorage.getItem('authToken')}`,
                                        '_blank'
                                      );
                                    }}
                                  >
                                    <VisibilityIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Download">
                                  <IconButton
                                    size="small"
                                    onClick={() => {
                                      window.open(
                                        `${API_BASE_URL}/documents/${doc.documentId}/download?token=${localStorage.getItem('authToken')}`,
                                        '_blank'
                                      );
                                    }}
                                  >
                                    <DownloadIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  ) : (
                    <Alert severity="info" sx={{ mt: 2 }}>
                      No documents available for this LC yet.
                    </Alert>
                  )}
                  
                  {/* Supporting Documents Section */}
                  <Box sx={{ mt: 2 }}>
                    <Alert severity="info" sx={{ mb: 2 }}>
                      <Typography variant="body2">
                        <strong>Note:</strong> For final payment release, UCP 600 requires these critical documents: 
                        Commercial Invoice, Bill of Lading, and Packing List. Supporting documents (Certificate of Origin, 
                        Quality Certificate, Insurance Certificate, Export Permit, etc.) must be signed by ECTA, Customs, 
                        and Shipping authorities at their respective portals before LC document examination.
                      </Typography>
                    </Alert>
                  </Box>
                </Grid>

                {/* Next Steps */}
                {selectedLC.status === 'ISSUED' && (
                  <Grid item xs={12}>
                    <Paper sx={{ p: 2, bgcolor: 'primary.50', border: '1px solid', borderColor: 'primary.200' }}>
                      <Typography variant="subtitle2" gutterBottom>
                        <TrendingUp sx={{ mr: 1, verticalAlign: 'middle' }} />
                        Next Steps in Export Process:
                      </Typography>
                      <Typography variant="body2" component="div">
                        1. <strong>Bank Forex Allocation:</strong> Bank allocates foreign exchange using the active NBE retention policy recorded on the ledger<br />
                        2. <strong>Quality Inspection:</strong> ECTA conducts quality inspection and issues export permit<br />
                        3. <strong>Shipment Preparation:</strong> Exporter prepares shipment with required documents<br />
                        4. <strong>Document Submission:</strong> Exporter submits shipping documents to bank<br />
                        5. <strong>Payment Release:</strong> Bank verifies documents and releases payment via SWIFT
                      </Typography>
                    </Paper>
                  </Grid>
                )}

                {/* Blockchain Verification - Component handles all messaging */}
                <Grid item xs={12}>
                  <Divider sx={{ my: 2 }} />
                  
                  {/* Business Activity Timeline - Shows WHO did WHAT */}
                  <BusinessActivityTimeline
                    entityType="LC"
                    entityId={selectedLC.lcId}
                  />
                  
                  <Divider sx={{ my: 3 }} />
                  
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    🔐 Cryptographic Signatures & Blockchain Verification
                  </Typography>
                  <BlockchainSignatureVerification
                    entityType="LETTER_OF_CREDIT"
                    entityId={selectedLC.lcId}
                  />
                </Grid>
              </Grid>
            </Box>
          )}
        
      </PortalDialog>

      {/* LC Amendment Dialog */}
            <PortalDialog brand="BANKS" open={dialogOpen && dialogType === 'lcAmend'} onClose={handleCloseDialog} maxWidth="md" title="Amend Letter of Credit" icon={<Description />} actions={<>
          <GhostButton brand="BANKS" onClick={() => {
            handleCloseDialog();
            setDialogType('lcDetails');
          }}>
            Cancel
          </GhostButton>
          <AnimatedButton
            variant="contained"
            onClick={handleAmendLC}
            disabled={!amendmentForm.amendmentReason.trim() || amendmentForm.amendmentReason.trim().length > 500 || (amendmentForm.newAmount !== '' && !(Number(amendmentForm.newAmount) > 0))}
          >
            Submit Amendment
          </AnimatedButton>
        </>}>

          {selectedLC && (
            <>
              <Alert severity="warning" sx={{ mb: 3 }}>
                <strong>UCP 600 Article 10: LC Amendments</strong><br />
                All amendments require agreement of all parties. Only issued LCs can be amended.
              </Alert>

              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="black">
                    Current LC Details
                  </Typography>
                  <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                    <Typography variant="body2">
                      <strong>LC ID:</strong> {selectedLC.lcId}<br />
                      <strong>Current Amount:</strong> ${selectedLC.amount.toLocaleString()} {selectedLC.currency}<br />
                      <strong>Current Expiry:</strong> {selectedLC.expiryDate ? new Date(selectedLC.expiryDate).toLocaleDateString() : 'N/A'}<br />
                      <strong>Status:</strong> {selectedLC.status}
                    </Typography>
                  </Paper>
                </Grid>

                <Grid item xs={12}>
                  <PortalField
                    fullWidth
                    label="Amendment Reason *"
                    value={amendmentForm.amendmentReason}
                    onChange={(e) => setAmendmentForm({...amendmentForm, amendmentReason: e.target.value})}
                    multiline
                    rows={2}
                    helperText={amendmentForm.amendmentReason.trim().length > 500 ? 'Reason must be at most 500 characters — the ledger rejects longer reasons.' : 'Explain why the LC needs to be amended (max 500 characters)'}
                    inputProps={{ maxLength: 500 }}
                    error={amendmentForm.amendmentReason.trim().length > 500}
                    required
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <PortalField
                    fullWidth
                    label="New Amount (USD)"
                    type="number"
                    value={amendmentForm.newAmount}
                    onChange={(e) => setAmendmentForm({...amendmentForm, newAmount: e.target.value})}
                    helperText={amendmentForm.newAmount !== '' && !(Number(amendmentForm.newAmount) > 0) ? 'New amount must be greater than 0 — the ledger rejects 0 or negative amounts.' : 'Leave empty to keep current amount'}
                    error={amendmentForm.newAmount !== '' && !(Number(amendmentForm.newAmount) > 0)}
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <PortalField
                    fullWidth
                    label="New Expiry Date"
                    type="date"
                    value={amendmentForm.newExpiryDate}
                    onChange={(e) => setAmendmentForm({...amendmentForm, newExpiryDate: e.target.value})}
                    InputLabelProps={{ shrink: true }}
                    helperText="Leave empty to keep current date"
                  />
                </Grid>

                <Grid item xs={12}>
                  <PortalField
                    fullWidth
                    label="New Terms and Conditions"
                    value={amendmentForm.newTerms}
                    onChange={(e) => setAmendmentForm({...amendmentForm, newTerms: e.target.value})}
                    multiline
                    rows={3}
                    helperText="Leave empty to keep current terms"
                  />
                </Grid>
              </Grid>

              <Alert severity="info" sx={{ mt: 3 }}>
                <strong>Amendment Process:</strong><br />
                1. Amendment will be recorded on blockchain<br />
                2. All parties will be notified of the changes<br />
                3. Original LC will show amendment history<br />
                4. Bank forex allocation may need adjustment
              </Alert>
            </>
          )}
        
      </PortalDialog>

      {/* LC Terms Dialog — review-only (0.3). Banks cannot request an LC:
          POST /banking/lc/request is EXPORTER/ECTA-only and chaincode
          RequestLC is ECTAMSP-only; there is no bank-side create-and-issue
          API route. The bank flow is Approve (REQUESTED) then Issue
          (APPROVED) via POST /banking/lc/:id/issue. LEG 1 (F6c): the
          fields are disabled — the dialog used to show editable inputs
          with only a Close button, implying an unsaved edit. */}
            <PortalDialog brand="BANKS" open={dialogOpen && dialogType === 'lc'} onClose={handleCloseDialog} maxWidth="md" title="Letter of Credit Terms" icon={<Description />} actions={<>
          <GhostButton brand="BANKS" onClick={handleCloseDialog}>Close</GhostButton>
        </>}>

          {selectedContract && (
            <>
              <Alert severity="warning" sx={{ mb: 3 }}>
                <strong>Banks do not request LCs from this portal.</strong><br />
                The exporter (or ECTA) requests the LC for this approved contract. Once it appears as REQUESTED, the bank approves it, then issues it from the APPROVED state (open the LC from the Payment Methods tab → Approve LC → Issue LC).
              </Alert>
              <Alert severity="info" sx={{ mb: 3 }}>
                <strong>International Trade Finance</strong><br />
                LC provides payment guarantee to exporter. After issuance, bank allocates forex per NBE policy.
              </Alert>

              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="black">
                    Contract Details
                  </Typography>
                  <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                    <Typography variant="body2">
                      <strong>Contract:</strong> {selectedContract.contractId}<br />
                      <strong>Exporter:</strong> {selectedContract.exporterId}<br />
                      <strong>Buyer:</strong> {selectedContract.buyerName} ({selectedContract.buyerCountry})<br />
                      <strong>Amount:</strong> ${selectedContract.totalValue.toLocaleString()} {selectedContract.currency}
                    </Typography>
                  </Paper>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <PortalField
                    fullWidth
                    disabled
                    label="Issuing Bank (Buyer's Bank) *"
                    value={lcForm.issuingBank}
                    onChange={(e) => setLcForm({...lcForm, issuingBank: e.target.value})}
                    placeholder="e.g., Deutsche Bank AG, Frankfurt"
                    helperText="Bank that opens/issues the LC on behalf of the buyer"
                    required
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <PortalField
                    fullWidth
                    disabled
                    label="Advising Bank (Exporter's Bank) *"
                    value={lcForm.advisingBank}
                    onChange={(e) => setLcForm({...lcForm, advisingBank: e.target.value})}
                    placeholder="e.g., Commercial Bank of Ethiopia"
                    helperText="Bank that advises/notifies exporter of the LC"
                    required
                  />
                </Grid>

                <Grid item xs={12}>
                  <PortalField
                    fullWidth
                    disabled
                    label="Beneficiary (Exporter) *"
                    value={lcForm.beneficiary}
                    onChange={(e) => setLcForm({...lcForm, beneficiary: e.target.value})}
                    placeholder="Exporter company name and account"
                    helperText="Exporter who will receive payment under the LC"
                    required
                  />
                </Grid>

                <Grid item xs={12}>
                  <PortalField
                    fullWidth
                    disabled
                    label="LC Terms"
                    value={lcForm.terms}
                    onChange={(e) => setLcForm({...lcForm, terms: e.target.value})}
                    multiline
                    rows={3}
                    helperText="Payment terms as per UCP 600 (Uniform Customs and Practice)"
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <PortalField
                    fullWidth
                    disabled
                    label="LC Validity (Days)"
                    type="number"
                    value={lcForm.expiryDays}
                    onChange={(e) => setLcForm({...lcForm, expiryDays: e.target.value})}
                    helperText="Typically 90-180 days for coffee exports"
                  />
                </Grid>

                {/* Supporting Documents Section */}
                <Grid item xs={12}>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Description /> Supporting Documents
                  </Typography>
                  <Alert severity="info" sx={{ mb: 2 }}>
                    <Typography variant="caption">
                      <strong>For LC Issuance Review:</strong> Proforma Invoice (preliminary invoice), Purchase Order (buyer's PO), 
                      Sales Contract (signed agreement). These documents help the bank assess the transaction before issuing the LC.
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
                      <strong>Note:</strong> Commercial Invoice, Bill of Lading, and other export documents are required LATER when the exporter ships the goods and presents documents for LC payment.
                    </Typography>
                  </Alert>
                  <Button
                    variant="outlined"
                    startIcon={<CloudUpload />}
                    onClick={() => {
                      setUploadEntityId(selectedContract.contractId);
                      setUploadEntityType('CONTRACT');
                      setDocumentUploadDialogOpen(true);
                    }}
                    fullWidth
                  >
                    Upload LC Application Documents
                  </Button>
                </Grid>
              </Grid>

              <Alert severity="warning" sx={{ mt: 3 }}>
                <strong>Correct LC Flow:</strong><br />
                1. Exporter/ECTA requests the LC for this approved contract<br />
                2. Bank approves the REQUESTED LC<br />
                3. Bank issues the APPROVED LC (MT700)<br />
                4. Bank allocates foreign exchange per NBE policy<br />
                5. Bank verifies documents and releases payment
              </Alert>
            </>
          )}
        
      </PortalDialog>

      {/* Payment Method Forms Dialog */}
      <PaymentMethodForms
        open={dialogOpen && (dialogType === 'cad' || dialogType === 'advance' || dialogType === 'consignment')}
        type={dialogType as 'cad' | 'advance' | 'consignment' | null}
        selectedContract={selectedContract}
        onClose={handleCloseDialog}
        onSubmit={handlePaymentMethodSubmit}
      />

      {/* Document Verification Dialog */}
      <DocumentVerificationPanel
        open={verificationDialogOpen}
        paymentId={selectedPayment?.paymentID || ''}
        paymentData={selectedPayment}
        onClose={() => {
          setVerificationDialogOpen(false);
          setSelectedPayment(null);
        }}
        onVerify={handleDocumentVerification}
      />

      {/* Document Upload Dialog */}
      <DocumentUploadDialog
        open={documentUploadDialogOpen}
        entityId={uploadEntityId}
        entityType={uploadEntityType}
        onClose={() => {
          setDocumentUploadDialogOpen(false);
          setUploadEntityId('');
          setUploadEntityType('');
        }}
        onUploadComplete={(docs) => {
          showSuccess('Documents Uploaded', `Successfully uploaded ${docs.length} document(s)`);
          setDocumentUploadDialogOpen(false);
        }}
      />

      <NotificationDialog
        open={notification.open}
        onClose={closeNotification}
        type={notification.type}
        title={notification.title}
        message={notification.message}
        details={notification.details}
        txId={notification.txId}
      />

      {/* Forex Allocation Dialog */}
      <ForexAllocationDialog
        open={allocationDialogOpen}
        form={allocationForm}
        ratePolicyReady={allocationPolicyReady}
        onChange={(f) => {
          devLog('[BANKS] Forex form changed:', f);
          setAllocationForm(f);
        }}
        onClose={() => {
          devLog('[BANKS] Closing allocation dialog');
          setAllocationDialogOpen(false);
        }}
        onConfirm={async (f) => {
          devLog('[BANKS] Allocation confirmed:', f);
          if (!f.forexId || !f.lcId) {
            showError('Validation', 'Forex ID and LC Reference are required');
            return;
          }
          // Pass the full selected forex object with form updates
          await handleAllocateForex({
            ...selectedForex, // Include all original forex data (status, contractId, exporterId, currency, etc.)
            forexId: f.forexId,
            lcId: f.lcId,
            requestedAmount: f.amount, // Use the form amount as requestedAmount
            allocatedAmount: f.amount, // Also set as allocatedAmount for compatibility
            exchangeRate: f.exchangeRate,
            retentionRate: f.retentionRate,
            officer: f.officer,
            approvalRef: f.approvalRef,
            expiryDate: f.expiryDate,
          });
        }}
      />

      {/* Utilize Forex Dialog */}
      <PortalDialog
        brand="BANKS"
        open={utilizeDialogOpen}
        onClose={() => setUtilizeDialogOpen(false)}
        title="Utilize Forex"
        icon={<CheckCircle />}
        actions={
          <>
            <GhostButton brand="BANKS" onClick={() => setUtilizeDialogOpen(false)}>
              Cancel
            </GhostButton>
            <PrimaryButton
              brand="BANKS"
              onClick={confirmUtilizeForex}
              startIcon={<CheckCircle />}
            >
              Confirm Utilization
            </PrimaryButton>
          </>
        }
      >
        <Box sx={{ pt: 2 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Enter the amount to utilize from this forex allocation. You can utilize the full amount or a partial amount.
          </Typography>
          
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Forex ID"
                value={utilizeForm.forexId}
                disabled
                size="small"
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Available Amount (USD)"
                value={`$${utilizeForm.maxAmount.toLocaleString()}`}
                disabled
                size="small"
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Amount to Utilize (USD)"
                type="number"
                value={utilizeForm.utilizedAmount || ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? 0 : Number(e.target.value);
                  setUtilizeForm({ ...utilizeForm, utilizedAmount: val });
                }}
                inputProps={{
                  min: 0,
                  max: utilizeForm.maxAmount,
                  step: 0.01
                }}
                size="small"
                helperText={`Maximum: $${utilizeForm.maxAmount.toLocaleString()}`}
                required
              />
            </Grid>
          </Grid>
          
          <Alert severity="info" sx={{ mt: 2 }}>
            <strong>Forex Utilization:</strong> This marks the forex as used for the shipment/payment. 
            Once utilized, the amount is considered spent and cannot be reused.
          </Alert>
        </Box>
      </PortalDialog>

      {/* SWIFT Compose Dialog */}
      <SwiftComposeDialog
        open={swiftComposeOpen}
        form={swiftForm}
        onChange={(f) => setSwiftForm(f)}
        onClose={() => setSwiftComposeOpen(false)}
        onConfirm={async (f) => {
          if (f.messageType === 'MT700' && !f.linkedLcId) {
            showError('Validation', 'Linked LC ID is required for MT700');
            return;
          }
          // LEG3 M-7: close ONLY on success — on failure the dialog
          // stays open with the form contents intact so the user can
          // fix the error instead of retyping everything.
          const created = await handleCreateSwiftMessage(f);
          if (created) setSwiftComposeOpen(false);
        }}
      />

      {/* Document Validation Dialog */}
      <DocumentValidationDialog
        open={validationDialogOpen}
        onClose={() => {
          setValidationDialogOpen(false);
          setValidationData(null);
        }}
        data={validationData}
        readOnly={validationData?.readOnly ?? (validationData?.entityId && !validationData.entityId.includes('REQUESTED'))} // Read-only unless this item explicitly enables review actions
        showApprovalOption={validationData?.showApprovalOption}
        onApprove={(notes) => {
          if (validationData && validationData.entityId.startsWith('LC')) {
            // Extract LC ID and exporter ID
            const lcId = validationData.entityId;
            const lc = letterOfCredits.find(l => l.lcId === lcId);
            if (lc) {
              handleApproveLC(lc.lcId, lc.exporterId);
            }
          }
          showSuccess('Approval Successful', `${validationData?.entityType} approved successfully.${notes ? `\n\nNotes: ${notes}` : ''}`);
          setValidationDialogOpen(false);
          setValidationData(null);
        }}
        onReject={async (reason) => {
          if (validationData?.entityType === 'LETTER OF CREDIT') {
            try {
              const response = await apiFetch(`/banking/lc/${encodeURIComponent(validationData.entityId)}/reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rejectionReason: reason }),
              });
              const result = await response.json();
              if (!response.ok || !result.success) {
                showError('LC Rejection Failed', result.error?.message || 'Failed to reject LC');
                return;
              }
              showSuccess('LC Rejected', `LC ${validationData.entityId} was rejected and recorded on the consortium ledger.`);
              await loadBankingData();
              return;
            } catch (error: any) {
              showError('Network Error', 'Failed to reject LC', error?.message || 'Please try again');
              return;
            }
          }
          showError(
            `${validationData?.entityType} Rejected`,
            `${validationData?.entityId} has been rejected.\n\nReason: ${reason}\n\nThe applicant will be notified to address the issues and resubmit.`
          );
          setValidationDialogOpen(false);
          setValidationData(null);
        }}
        approveLabel="Approve LC"
        rejectLabel="Reject LC"
      />

      {/* Tab 4: SWIFT Messages */}
      {activeTab === 4 && (
        <PortalCard brand="BANKS" title="SWIFT Message Management">
          <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<SendOutlined />}
              onClick={() => {
                setSearchTerm('');
                setFilterStatus('ALL');
                setCurrentPage(0);
              }}
            >
              Reset Filters
            </Button>
            <PrimaryButton brand="BANKS"
              size="small"
              startIcon={<Description />}
              onClick={() => {
                // 0.15: a new message can only be created from here — it
                // starts as DRAFT; approve/send happen per-row below.
                setSwiftForm({
                  messageID: `MSG${Date.now()}`,
                  messageType: 'MT103',
                  swiftReference: `REF${Date.now()}`,
                  senderBIC: 'CBETETAA',
                  receiverBIC: '',
                  amount: '',
                  currency: 'USD',
                  valueDate: '',
                  beneficiary: '',
                  remittanceInfo: '',
                  linkedLcId: '',
                  linkedPaymentId: '',
                  applicant: '',
                  lcExpiryDate: '',
                });
                setSwiftComposeOpen(true);
              }}
            >
              Compose / New SWIFT Message
            </PrimaryButton>
          </Box>

          <Alert severity="info" sx={{ mb: 3 }}>
            Manage and review all SWIFT messages linked to LCs and payments. Search, filter, and paginate directly in the SWIFT tab.
          </Alert>

          <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField
              size="small"
              placeholder="Search SWIFT messages..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(0);
              }}
              sx={{ minWidth: 300 }}
              InputProps={{
                startAdornment: <MessageOutlined sx={{ mr: 1, color: 'black' }} />,
              }}
            />
            <TextField
              select
              size="small"
              label="Status"
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setCurrentPage(0);
              }}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="ALL">All Status</MenuItem>
              <MenuItem value="DRAFT">Draft</MenuItem>
              <MenuItem value="NBE_APPROVED">NBE Approved</MenuItem>
              <MenuItem value="APPROVED">Approved</MenuItem>
              <MenuItem value="SENT">Sent</MenuItem>
              <MenuItem value="RECEIVED">Received</MenuItem>
              <MenuItem value="PROCESSING">Processing</MenuItem>
              <MenuItem value="SETTLED">Settled</MenuItem>
              <MenuItem value="REJECTED">Rejected</MenuItem>
            </TextField>
            <TextField
              size="small"
              placeholder="Min amount"
              value={amountMin}
              onChange={(e) => {
                setAmountMin(e.target.value);
                setCurrentPage(0);
              }}
              sx={{ width: 140 }}
            />
            <TextField
              size="small"
              placeholder="Max amount"
              value={amountMax}
              onChange={(e) => {
                setAmountMax(e.target.value);
                setCurrentPage(0);
              }}
              sx={{ width: 140 }}
            />
            <SecondaryButton brand="BANKS"
              size="small"
              startIcon={<Description />}
              onClick={() => {
                const csv = generateSwiftCSV(getFilteredSwiftMessages());
                downloadCSV(csv, 'SWIFT-Messages.csv');
              }}
            >
              Export CSV
            </SecondaryButton>
          </Box>

          {getFilteredSwiftMessages().length === 0 ? (
            <Alert severity="warning">No SWIFT messages available for the selected filters.</Alert>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: '15%' }}><strong>Message ID</strong></TableCell>
                    <TableCell sx={{ width: '8%' }}><strong>Type</strong></TableCell>
                    <TableCell sx={{ width: '15%' }}><strong>SWIFT Reference</strong></TableCell>
                    <TableCell sx={{ width: '10%' }}><strong>Sender BIC</strong></TableCell>
                    <TableCell sx={{ width: '10%' }}><strong>Receiver BIC</strong></TableCell>
                    <TableCell sx={{ width: '12%' }}><strong>Amount</strong></TableCell>
                    <TableCell sx={{ width: '10%' }}><strong>Status</strong></TableCell>
                    <TableCell sx={{ width: '8%' }}><strong>Date</strong></TableCell>
                    <TableCell align="right" sx={{ width: '12%' }}><strong>Actions</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {getPaginatedData(getFilteredSwiftMessages()).map((msg: any) => (
                    <TableRow key={msg.messageId}>
                      <TableCell>{msg.messageId}</TableCell>
                      <TableCell>{msg.messageType}</TableCell>
                      <TableCell>{msg.swiftReference || 'N/A'}</TableCell>
                      <TableCell>{msg.senderBic || 'N/A'}</TableCell>
                      <TableCell>{msg.receiverBic || 'N/A'}</TableCell>
                      <TableCell><strong>${(msg.amount || 0).toLocaleString()} {msg.currency || 'USD'}</strong></TableCell>
                      <TableCell><StatusChip label={msg.status || 'N/A'} status={chipStatus(msg.status)} /></TableCell>
                      <TableCell>{msg.sentDate ? new Date(msg.sentDate).toLocaleDateString() : msg.createdAt ? new Date(msg.createdAt).toLocaleDateString() : 'N/A'}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <SecondaryButton brand="BANKS"
                            size="small"
                            startIcon={<Visibility />}
                            onClick={() => {
                              void openSwiftMessageDetails(msg);
                            }}
                          >
                            View Details
                          </SecondaryButton>
                          {/* 0.15: lifecycle actions on the EXISTING message,
                              gated on the chaincode states (swift.go):
                              DRAFT/NBE_APPROVED → APPROVED → SENT →
                              RECEIVED → PROCESSING → SETTLED; any
                              non-terminal state → REJECTED. */}
                          {(msg.status === 'DRAFT' || msg.status === 'NBE_APPROVED') && (
                            <PrimaryButton brand="BANKS"
                              size="small"
                              loadingLabel="Approving…"
                              ledgerWrite
                              onClick={() => handleSwiftLifecycleAction(msg, 'approve')}
                            >
                              Approve
                            </PrimaryButton>
                          )}
                          {msg.status === 'APPROVED' && (
                            <PrimaryButton brand="BANKS"
                              size="small"
                              startIcon={<SendOutlined />}
                              loadingLabel="Sending…"
                              ledgerWrite
                              onClick={() => handleSwiftLifecycleAction(msg, 'send')}
                            >
                              Send
                            </PrimaryButton>
                          )}
                          {msg.status === 'SENT' && (
                            <PrimaryButton brand="BANKS"
                              size="small"
                              loadingLabel="Receiving…"
                              ledgerWrite
                              onClick={() => handleSwiftLifecycleAction(msg, 'receive')}
                            >
                              Receive
                            </PrimaryButton>
                          )}
                          {msg.status === 'RECEIVED' && (
                            <PrimaryButton brand="BANKS"
                              size="small"
                              loadingLabel="Processing…"
                              ledgerWrite
                              onClick={() => handleSwiftLifecycleAction(msg, 'process')}
                            >
                              Process
                            </PrimaryButton>
                          )}
                          {msg.status === 'PROCESSING' && (
                            <PrimaryButton brand="BANKS"
                              size="small"
                              loadingLabel="Settling…"
                              ledgerWrite
                              onClick={() => handleSwiftLifecycleAction(msg, 'settle')}
                            >
                              Settle
                            </PrimaryButton>
                          )}
                          {!['SETTLED', 'REJECTED', 'CANCELLED', 'FAILED'].includes(msg.status) && (
                            <DangerButton brand="BANKS"
                              size="small"
                              color="error"
                              loadingLabel="Rejecting…"
                              ledgerWrite
                              onClick={() => handleSwiftLifecycleAction(msg, 'reject')}
                            >
                              Reject
                            </DangerButton>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {getFilteredSwiftMessages().length > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" color="black">Rows per page:</Typography>
                <TextField
                  select
                  size="small"
                  value={rowsPerPage}
                  onChange={(e) => handleChangeRowsPerPage(parseInt(e.target.value))}
                  sx={{ width: 80 }}
                >
                  <MenuItem value={5}>5</MenuItem>
                  <MenuItem value={10}>10</MenuItem>
                  <MenuItem value={25}>25</MenuItem>
                  <MenuItem value={50}>50</MenuItem>
                  <MenuItem value={100}>100</MenuItem>
                </TextField>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography variant="body2" color="black">
                  Page {currentPage + 1} shows items {currentPage * rowsPerPage + 1}-{Math.min((currentPage + 1) * rowsPerPage, getFilteredSwiftMessages().length)} of {getFilteredSwiftMessages().length}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={currentPage === 0}
                    onClick={() => handleChangePage(currentPage - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={currentPage >= Math.ceil(getFilteredSwiftMessages().length / rowsPerPage) - 1}
                    onClick={() => handleChangePage(currentPage + 1)}
                  >
                    Next
                  </Button>
                </Box>
              </Box>
            </Box>
          )}
        </PortalCard>
      )}

      {/* Tab 2: Document Examination */}
      {activeTab === 2 && (
        <PortalCard brand="BANKS" title="Document Examination">
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2">
              Review and examine export documents submitted by exporters for compliance with LC terms and UCP 600 standards.
            </Typography>
          </Alert>

          <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField
              size="small"
              placeholder="Search documents..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(0);
              }}
              sx={{ minWidth: 280 }}
            />
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                setSearchTerm('');
                setAmountMin('');
                setAmountMax('');
                setDocumentExaminationFilter('PENDING_EXAMINATION');
                setCurrentPage(0);
              }}
            >
              Clear Filters
            </Button>
            <Box sx={{ flexGrow: 1 }} />
            <Typography variant="body2" color="black">
              Showing {getPaginatedData(getFilteredDocumentExaminationLCs()).length} of {getFilteredDocumentExaminationLCs().length}
            </Typography>
          </Box>

          {getFilteredDocumentExaminationLCs().length === 0 ? (
            <Alert severity="warning">
              No documents pending examination for the selected filter.
            </Alert>
          ) : (
            <Box>
              <Typography variant="h6" sx={{ mb: 2 }}>
                {documentExaminationFilter === 'VERIFIED' ? 'Verified Documents' : 'LCs Pending Document Examination'} ({getFilteredDocumentExaminationLCs().length})
              </Typography>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: '15%' }}><strong>LC ID</strong></TableCell>
                      <TableCell sx={{ width: '20%' }}><strong>Exporter</strong></TableCell>
                      <TableCell sx={{ width: '15%' }}><strong>Amount</strong></TableCell>
                      <TableCell sx={{ width: '12%' }}><strong>Status</strong></TableCell>
                      <TableCell sx={{ width: '13%' }}><strong>Submitted Date</strong></TableCell>
                      <TableCell align="right" sx={{ width: '25%' }}><strong>Actions</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {getPaginatedData(getFilteredDocumentExaminationLCs()).map((lc) => (
                      <TableRow key={lc.lcId}>
                        <TableCell>{lc.lcId}</TableCell>
                        <TableCell>{lc.exporterId}</TableCell>
                        <TableCell>
                          <strong>${lc.amount?.toLocaleString()} {lc.currency}</strong>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <StatusChip label={lc.status} status={chipStatus(lc.status)} />
                            {(lc.approvedByMsp || lc.issuedByMsp) && (
                              <Chip 
                                label="Blockchain"
                                size="small"
                                icon={<Verified />}
                                color="primary"
                                variant="outlined"
                                sx={{ fontWeight: 600 }}
                              />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          {lc.requestDate ? new Date(lc.requestDate).toLocaleDateString() : 'N/A'}
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                            <SecondaryButton brand="BANKS"
                              size="small"
                              startIcon={<Assignment />}
                              onClick={() => {
                                setAuditEntityType('LC');
                                setAuditEntityId(lc.lcId);
                                setShowAuditTrail(true);
                              }}
                            >
                              Audit Trail
                            </SecondaryButton>
                            <SecondaryButton brand="BANKS"
                              size="small"
                              startIcon={<Visibility />}
                              onClick={() => handleViewLCDetails(lc)}
                            >
                              View Details
                            </SecondaryButton>
                            {/* Show different button text based on LC status */}
                            {lc.status === 'UTILIZED' || lc.status === 'PAYMENT_RELEASED' || lc.status === 'SETTLED' ? (
                              <SecondaryButton brand="BANKS"
                                size="small"
                                startIcon={<Visibility />}
                                onClick={() => {
                                  console.log('[TAB3] 🔘 View Examination (Completed) button clicked for LC:', lc.lcId);
                                  // ✅ OPEN DIALOG IMMEDIATELY with loading state
                                  setSelectedLC({ ...lc, documents: lc.documents || [] });
                                  setDocumentExaminationOpen(true);
                                  setLcDetailsLoading(true);
                                  // ✅ Fetch LC details AND shipment documents in background (read-only mode)
                                  (async () => {
                                    try {
                                      // Step 1: Fetch LC details
                                      const apiUrl = `${API_BASE_URL}/banking/lc/${lc.lcId}`;
                                      console.log('[TAB3] Fetching LC details from:', apiUrl);
                                      const response = await apiFetch(`/banking/lc/${encodeURIComponent(lc.lcId)}`, {
                                        headers: getAuthHeaders(),
                                      });
                                      console.log('[TAB3] LC Response status:', response.status, response.statusText);
                                      
                                      let lcData = lc;
                                      if (response.ok) {
                                        const result = await response.json();
                                        console.log('[TAB3] LC Response data received');
                                        if (result.success && result.data) {
                                          console.log('[TAB3] ✅ Fetched LC with', result.data.documents?.length || 0, 'documents');
                                          lcData = result.data;
                                        } else {
                                          console.warn('[TAB3] API returned no data, keeping cached LC');
                                        }
                                      } else {
                                        const errorText = await response.text();
                                        console.error('[TAB3] LC API failed:', response.status, errorText);
                                      }
                                      
                                      // Step 2: Find related shipment
                                      console.log('[TAB3] 🚢 Looking for shipment related to LC:', lc.lcId, 'Contract:', lcData.contractId);
                                      const shipmentsResponse = await apiFetch(`/shipping/shipments`, {
                                        headers: getAuthHeaders(),
                                      });
                                      
                                      let shipmentDocuments: any[] = [];
                                      if (shipmentsResponse.ok) {
                                        const shipmentsResult = await shipmentsResponse.json();
                                        console.log('[TAB3] Shipments fetched:', shipmentsResult.data?.length || 0);
                                        
                                        // Find shipment for this LC by contract_id (shipments table doesn't have lc_id column)
                                        const relatedShipment = shipmentsResult.data?.find((s: any) => 
                                          s.contractId === lcData.contractId
                                        );
                                        
                                        if (relatedShipment) {
                                          console.log('[TAB3] ✅ Found related shipment:', relatedShipment.shipmentId, 'Status:', relatedShipment.status);
                                          
                                          // Step 3: Fetch documents from SHIPMENT entity
                                          console.log('[TAB3] 📄 Fetching SHIPMENT documents for:', relatedShipment.shipmentId);
                                          const shipmentDocsResponse = await apiFetch(
                                            `/documents/entity/SHIPMENT/${encodeURIComponent(relatedShipment.shipmentId)}`,
                                            { headers: getAuthHeaders() }
                                          );
                                          
                                          if (shipmentDocsResponse.ok) {
                                            const shipmentDocsResult = await shipmentDocsResponse.json();
                                            if (shipmentDocsResult.success && shipmentDocsResult.data) {
                                              console.log('[TAB3] ✅ Fetched', shipmentDocsResult.data.length, 'SHIPMENT documents');
                                              shipmentDocuments = [...shipmentDocuments, ...shipmentDocsResult.data];
                                            }
                                          }
                                          
                                          // Step 4: Fetch documents from CUSTOMS_DECLARATION entity (fallback for incorrectly stored docs)
                                          console.log('[TAB3] 📄 Fetching CUSTOMS_DECLARATION documents for:', relatedShipment.shipmentId);
                                          const customsDocsResponse = await apiFetch(
                                            `/documents/entity/CUSTOMS_DECLARATION/${encodeURIComponent(relatedShipment.shipmentId)}`,
                                            { headers: getAuthHeaders() }
                                          );
                                          
                                          if (customsDocsResponse.ok) {
                                            const customsDocsResult = await customsDocsResponse.json();
                                            if (customsDocsResult.success && customsDocsResult.data) {
                                              console.log('[TAB3] ✅ Fetched', customsDocsResult.data.length, 'CUSTOMS_DECLARATION documents');
                                              shipmentDocuments = [...shipmentDocuments, ...customsDocsResult.data];
                                            }
                                          }
                                          
                                          // B8/D3: normalise the raw /documents/entity/* rows
                                          // to camelCase and drop duplicates of the detail
                                          // rows — see normalizeEntityDocument. A blind
                                          // append of snake_case rows (status 'active')
                                          // made the Compliant gate false forever.
                                          const allDocuments = mergeEntityDocuments(lcData.documents || [], shipmentDocuments);
                                          console.log('[TAB3] 📚 Total documents (LC + Shipment):', allDocuments.length);
                                          
                                          lcData = { 
                                            ...lcData, 
                                            documents: allDocuments,
                                            relatedShipment: relatedShipment 
                                          };
                                        } else {
                                          console.log('[TAB3] ⚠️ No shipment found for LC:', lc.lcId);
                                        }
                                      } else {
                                        console.error('[TAB3] Failed to fetch shipments:', shipmentsResponse.status);
                                      }
                                      
                                      // Step 5: Update selected LC with all documents
                                      setSelectedLC(lcData);
                                      
                                    } catch (error) {
                                      console.error('[TAB3] Error fetching documents:', error);
                                    } finally {
                                      setLcDetailsLoading(false);
                                    }
                                  })();
                                }}
                              >
                                View Examination
                              </SecondaryButton>
                            ) : (
                            <PrimaryButton brand="BANKS"
                              size="small"
                              startIcon={<CheckCircle />}
                              onClick={() => {
                                console.log('[TAB3] 🔘 Examine Documents button clicked for LC:', lc.lcId);
                                // ✅ OPEN DIALOG IMMEDIATELY with loading state
                                setSelectedLC({ ...lc, documents: lc.documents || [] });
                                setDocumentExaminationOpen(true);
                                setLcDetailsLoading(true);
                                // ✅ Fetch LC details AND shipment documents in background
                                (async () => {
                                  try {
                                    // Step 1: Fetch LC details
                                    const apiUrl = `${API_BASE_URL}/banking/lc/${lc.lcId}`;
                                    console.log('[TAB3] Fetching LC details from:', apiUrl);
                                    const response = await apiFetch(`/banking/lc/${encodeURIComponent(lc.lcId)}`, {
                                      headers: getAuthHeaders(),
                                    });
                                    console.log('[TAB3] LC Response status:', response.status, response.statusText);
                                    
                                    let lcData = lc;
                                    if (response.ok) {
                                      const result = await response.json();
                                      console.log('[TAB3] LC Response data received');
                                      if (result.success && result.data) {
                                        console.log('[TAB3] ✅ Fetched LC with', result.data.documents?.length || 0, 'documents');
                                        lcData = result.data;
                                      } else {
                                        console.warn('[TAB3] API returned no data, keeping cached LC');
                                      }
                                    } else {
                                      const errorText = await response.text();
                                      console.error('[TAB3] LC API failed:', response.status, errorText);
                                    }
                                    
                                    // Step 2: Fetch shipments to find related shipment
                                    console.log('[TAB3] 🚢 Looking for shipment related to LC:', lc.lcId, 'Contract:', lcData.contractId);
                                    // D2 (2026-11-18, merge fix): GET /shipments/all does
                                    // not exist — it matched /:shipmentID with id 'all'
                                    // and 404'd, so this whole shipment-doc merge was
                                    // skipped. Use /shipping/shipments, the working
                                    // endpoint the "View Examination" path already
                                    // uses (200, {success, data: camelCase rows}).
                                    const shipmentsResponse = await apiFetch('/shipping/shipments', {
                                      headers: getAuthHeaders(),
                                    });
                                    
                                    if (shipmentsResponse.ok) {
                                      const shipmentsResult = await shipmentsResponse.json();
                                      const shipments = shipmentsResult.success ? shipmentsResult.data : shipmentsResult;
                                      console.log('[TAB3] Shipments fetched:', shipments?.length || 0);
                                      
                                      // Find shipment(s) for this contract
                                      const relatedShipments = (shipments || []).filter((s: any) => 
                                        s.contract_id === lcData.contractId || s.contractId === lcData.contractId
                                      );
                                      
                                      if (relatedShipments.length > 0) {
                                        const relatedShipment = relatedShipments[0];
                                        console.log('[TAB3] ✅ Found related shipment:', relatedShipment.shipmentId || relatedShipment.shipment_id, 'Status:', relatedShipment.status);
                                        
                                        // Step 3: Fetch documents for the shipment
                                        const shipmentId = relatedShipment.shipment_id || relatedShipment.shipmentId;
                                        console.log('[TAB3] 📄 Fetching SHIPMENT documents for:', shipmentId);
                                        
                                        let shipmentDocuments: any[] = [];
                                        
                                        // Fetch SHIPMENT documents
                                        const shipmentDocsResponse = await apiFetch(
                                          `/documents/entity/SHIPMENT/${encodeURIComponent(shipmentId)}`,
                                          { headers: getAuthHeaders() }
                                        );
                                        if (shipmentDocsResponse.ok) {
                                          const shipmentDocsResult = await shipmentDocsResponse.json();
                                          if (shipmentDocsResult.success && shipmentDocsResult.data) {
                                            shipmentDocuments = [...shipmentDocuments, ...shipmentDocsResult.data];
                                          }
                                        }
                                        console.log('[TAB3] ✅ Fetched', shipmentDocuments.length, 'SHIPMENT documents');
                                        
                                        // Fetch CUSTOMS_DECLARATION documents
                                        console.log('[TAB3] 📄 Fetching CUSTOMS_DECLARATION documents for:', shipmentId);
                                        const customsDocsResponse = await apiFetch(
                                          `/documents/entity/CUSTOMS_DECLARATION/${encodeURIComponent(shipmentId)}`,
                                          { headers: getAuthHeaders() }
                                        );
                                        if (customsDocsResponse.ok) {
                                          const customsDocsResult = await customsDocsResponse.json();
                                          if (customsDocsResult.success && customsDocsResult.data) {
                                            shipmentDocuments = [...shipmentDocuments, ...customsDocsResult.data];
                                          }
                                        }
                                        console.log('[TAB3] ✅ Fetched', shipmentDocuments.filter((d: any) => normalizeEntityDocument(d).entityType === 'CUSTOMS_DECLARATION').length, 'CUSTOMS_DECLARATION documents');

                                        // B8/D3: normalise the raw /documents/entity/* rows
                                        // to camelCase and drop duplicates of the detail
                                        // rows — see normalizeEntityDocument.
                                        const allDocuments = mergeEntityDocuments(lcData.documents || [], shipmentDocuments);
                                        console.log('[TAB3] 📚 Total documents (LC + Shipment):', allDocuments.length);
                                        
                                        lcData = { 
                                          ...lcData, 
                                          documents: allDocuments,
                                          relatedShipments: [{ shipmentId, status: relatedShipment.status }]
                                        };
                                      } else {
                                        console.log('[TAB3] ⚠️ No shipment found for LC:', lc.lcId);
                                      }
                                    } else {
                                      console.error('[TAB3] Failed to fetch shipments:', shipmentsResponse.status);
                                    }
                                    
                                    // Step 5: Update selected LC with all documents
                                    setSelectedLC(lcData);
                                    
                                  } catch (error) {
                                    console.error('[TAB3] Error fetching documents:', error);
                                  } finally {
                                    setLcDetailsLoading(false);
                                  }
                                })();
                              }}
                            >
                              Examine Documents
                            </PrimaryButton>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Pagination Controls */}
              {getFilteredDocumentExaminationLCs().length > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" color="black">Rows per page:</Typography>
                    <TextField
                      select
                      size="small"
                      value={rowsPerPage}
                      onChange={(e) => handleChangeRowsPerPage(parseInt(e.target.value))}
                      sx={{ width: 80 }}
                    >
                      <MenuItem value={5}>5</MenuItem>
                      <MenuItem value={10}>10</MenuItem>
                      <MenuItem value={25}>25</MenuItem>
                      <MenuItem value={50}>50</MenuItem>
                      <MenuItem value={100}>100</MenuItem>
                    </TextField>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Typography variant="body2" color="black">
                      Page {currentPage + 1} shows items {currentPage * rowsPerPage + 1}-{Math.min((currentPage + 1) * rowsPerPage, getFilteredDocumentExaminationLCs().length)} of {getFilteredDocumentExaminationLCs().length}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={currentPage === 0}
                        onClick={() => handleChangePage(currentPage - 1)}
                      >
                        Previous
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={currentPage >= Math.ceil(getFilteredDocumentExaminationLCs().length / rowsPerPage) - 1}
                        onClick={() => handleChangePage(currentPage + 1)}
                      >
                        Next
                      </Button>
                    </Box>
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </PortalCard>
      )}

      {/* Tab 3: Payment Release */}
      {activeTab === 3 && (
        <PortalCard brand="BANKS" title="Payment Release">
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2">
              Release payments for LCs where documents have been verified and accepted.
            </Typography>
          </Alert>

          <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField
              size="small"
              placeholder="Search payment releases..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(0);
              }}
              sx={{ minWidth: 280 }}
            />
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                setSearchTerm('');
                setAmountMin('');
                setAmountMax('');
                setPaymentReleaseFilter('READY_FOR_PAYMENT');
                setCurrentPage(0);
              }}
            >
              Clear Filters
            </Button>
            <Box sx={{ flexGrow: 1 }} />
            <Typography variant="body2" color="black">
              Showing {getPaginatedData(getFilteredPaymentReleaseLCs()).length} of {getFilteredPaymentReleaseLCs().length}
            </Typography>
          </Box>

          {getFilteredPaymentReleaseLCs().length === 0 ? (
            <Alert severity="warning">
              No LCs ready for payment release for the selected filter.
            </Alert>
          ) : (
            <Box>
              <Typography variant="h6" sx={{ mb: 2 }}>
                {paymentReleaseFilter === 'RELEASED_TODAY' ? 'Payments Released Today' : paymentReleaseFilter === 'TOTAL_RELEASED' ? 'Total Released Payments' : 'LCs Ready for Payment Release'} ({getFilteredPaymentReleaseLCs().length})
              </Typography>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: '15%' }}><strong>LC ID</strong></TableCell>
                      <TableCell sx={{ width: '20%' }}><strong>Exporter</strong></TableCell>
                      <TableCell sx={{ width: '15%' }}><strong>Amount</strong></TableCell>
                      <TableCell sx={{ width: '12%' }}><strong>Status</strong></TableCell>
                      <TableCell sx={{ width: '13%' }}><strong>Verified Date</strong></TableCell>
                      <TableCell align="right" sx={{ width: '25%' }}><strong>Actions</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {getPaginatedData(getFilteredPaymentReleaseLCs()).map((lc) => (
                      <TableRow key={lc.lcId}>
                        <TableCell>{lc.lcId}</TableCell>
                        <TableCell>{lc.exporterId}</TableCell>
                        <TableCell>
                          <strong>${lc.amount?.toLocaleString()} {lc.currency}</strong>
                        </TableCell>
                        <TableCell>
                          <StatusChip label={lc.status} status={chipStatus(lc.status)} />
                        </TableCell>
                        <TableCell>
                          {lc.requestDate ? new Date(lc.requestDate).toLocaleDateString() : 'N/A'}
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                            <SecondaryButton brand="BANKS"
                              size="small"
                              startIcon={<Assignment />}
                              onClick={() => {
                                setAuditEntityType('LC');
                                setAuditEntityId(lc.lcId);
                                setShowAuditTrail(true);
                              }}
                            >
                              Audit Trail
                            </SecondaryButton>
                            <SecondaryButton brand="BANKS"
                              size="small"
                              startIcon={<Visibility />}
                              onClick={() => handleViewLCDetails(lc)}
                            >
                              View Details
                            </SecondaryButton>
                            {/* ✅ Only show "Release Payment" button if status is UTILIZED (ready but not yet released) */}
                            {lc.status === 'UTILIZED' ? (
                              <PrimaryButton brand="BANKS"
                                size="small"
                                startIcon={<Payment />}
                                loadingLabel="Releasing…"
                                ledgerWrite
                                onClick={async () => {
                                  // Open Material-UI confirmation dialog
                                  setPaymentConfirmData({
                                    lcId: lc.lcId,
                                    exporterId: lc.exporterId,
                                    amount: lc.amount,
                                    currency: lc.currency,
                                  });
                                  setPaymentConfirmOpen(true);
                                }}
                              >
                                Release Payment
                              </PrimaryButton>
                            ) : lc.status === 'PAYMENT_RELEASED' ? (
                              <Chip 
                                icon={<CheckCircle />} 
                                label="Payment Released" 
                                color="success" 
                                size="small" 
                              />
                            ) : null}
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Pagination Controls */}
              {getFilteredPaymentReleaseLCs().length > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" color="black">Rows per page:</Typography>
                    <TextField
                      select
                      size="small"
                      value={rowsPerPage}
                      onChange={(e) => handleChangeRowsPerPage(parseInt(e.target.value))}
                      sx={{ width: 80 }}
                    >
                      <MenuItem value={5}>5</MenuItem>
                      <MenuItem value={10}>10</MenuItem>
                      <MenuItem value={25}>25</MenuItem>
                      <MenuItem value={50}>50</MenuItem>
                      <MenuItem value={100}>100</MenuItem>
                    </TextField>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Typography variant="body2" color="black">
                      Page {currentPage + 1} shows items {currentPage * rowsPerPage + 1}-{Math.min((currentPage + 1) * rowsPerPage, getFilteredPaymentReleaseLCs().length)} of {getFilteredPaymentReleaseLCs().length}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={currentPage === 0}
                        onClick={() => handleChangePage(currentPage - 1)}
                      >
                        Previous
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={currentPage >= Math.ceil(getFilteredPaymentReleaseLCs().length / rowsPerPage) - 1}
                        onClick={() => handleChangePage(currentPage + 1)}
                      >
                        Next
                      </Button>
                    </Box>
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </PortalCard>
      )}

      {/* Tab 6: Analytics */}
      {activeTab === 6 && (
        <AnalyticsDashboard />
      )}

      {/* Tab 5: LC Settlements */}
      {activeTab === 5 && (
        <Box>
          <Typography variant="h5" gutterBottom sx={{ color: '#9b30b7', fontWeight: 700 }}>
            💰 LC Settlement Tracking
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Track LC settlement and payment processing for delivered shipments.
          </Typography>
          
          {deliveredShipments.length === 0 ? (
            <Alert severity="info">
              No delivered shipments requiring LC settlement at this time.
            </Alert>
          ) : (
            <Grid container spacing={3}>
              {deliveredShipments.map((shipment: any) => {
                const shipmentId = shipment.shipmentId || shipment.shipmentID;
                const contractId = shipment.contractId || shipment.contractID;
                const lc = letterOfCredits.find(l => l.contractId === contractId);
                // F16: the export permit precedes shipment in the
                // workflow and is ECTA-owned there — do not offer a
                // re-issue for a shipment whose contract already has
                // one. The permits list carries contractId (no
                // shipmentId), so the gate matches on contractId.
                const existingPermit = permitForContract(contractId);

                return (
                  <Grid item xs={12} key={shipmentId}>
                    <Card sx={{ boxShadow: 3 }}>
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                          <Box>
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                              {shipmentId}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Contract: {contractId} {lc && `| LC: ${lc.lcId}`}
                            </Typography>
                          </Box>
                          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            {existingPermit ? (
                              <Chip
                                label={`Permit Issued (${existingPermit.permitId})`}
                                color="success"
                                icon={<CheckCircle />}
                              />
                            ) : (
                              <SecondaryButton brand="BANKS"
                                size="small"
                                startIcon={<Description />}
                                loadingLabel="Issuing permit…"
                                ledgerWrite
                                onClick={() => handleIssueExportPermit(shipment)}
                                sx={{ textTransform: 'none' }}
                              >
                                Issue Export Permit
                              </SecondaryButton>
                            )}
                            <Chip
                              label="Delivered"
                              color="success"
                              icon={<CheckCircle />}
                            />
                          </Box>
                        </Box>
                        
                        <Divider sx={{ my: 2 }} />
                        
                        <PostDeliveryWorkflowPanel
                          shipmentId={shipmentId}
                          userRole="BANK"
                          onRefresh={() => {
                            loadBankingData();
                          }}
                        />
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          )}
        </Box>
      )}

      {/* Audit Trail Viewer */}
      {showAuditTrail && auditEntityType && (
        <AuditTrailViewer
          open={showAuditTrail}
          entityType={auditEntityType as 'LC' | 'PAYMENT' | 'FOREX'}
          entityId={auditEntityId}
          onClose={() => setShowAuditTrail(false)}
        />
      )}

      {/* ==================== DOCUMENT EXAMINATION DIALOG ==================== */}
      {/* Shows ALL documents attached to LC with comprehensive review interface */}
            <PortalDialog brand="BANKS" open={documentExaminationOpen} onClose={() => setDocumentExaminationOpen(false)} maxWidth="lg" title={<>Document Examination - LC {selectedLC?.lcId}</>} icon={<Description />} contentSx={{ mt: 2 }} actions={<>
          <GhostButton brand="BANKS"
            onClick={() => setDocumentExaminationOpen(false)}
          >
            Close
          </GhostButton>
          {selectedLC?.documents?.every((d: any) => ['verified', 'approved', 'compliant'].includes(d.verificationStatus || d.status)) && (
            <PrimaryButton
              brand="BANKS"
              startIcon={<CheckCircle />}
              loadingLabel="Examining…"
              ledgerWrite
              onClick={async () => {
                await handleExamineLCDocuments(selectedLC.lcId, true, '');
                setDocumentExaminationOpen(false);
              }}
              sx={{ ml: 1 }}
            >
              Mark LC as Compliant & Ready for Payment
            </PrimaryButton>
          )}
        </>}>

          {/* Loading Indicator */}
          {lcDetailsLoading && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
              <CircularProgress size={24} />
              <Typography variant="body2" color="text.secondary">
                Loading complete document package...
              </Typography>
            </Box>
          )}
          
          {selectedLC && (
            <>
              {/* LC Summary */}
              <Alert severity="info" sx={{ mb: 3 }}>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="caption" color="text.secondary">LC Amount:</Typography>
                    <Typography variant="body1" fontWeight="bold">
                      ${selectedLC.amount?.toLocaleString()} {selectedLC.currency}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="caption" color="text.secondary">Exporter:</Typography>
                    <Typography variant="body1" sx={{ wordBreak: 'break-word' }}>{selectedLC.exporterId}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="caption" color="text.secondary">Buyer:</Typography>
                    <Typography variant="body1" sx={{ wordBreak: 'break-word' }}>{selectedLC.buyerName || 'N/A'}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="caption" color="text.secondary">Status:</Typography>
                    <Typography variant="body1" fontWeight="bold" sx={{ wordBreak: 'break-word' }}>{selectedLC.status}</Typography>
                  </Grid>
                </Grid>
              </Alert>

              {/* Document Checklist */}
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Assignment />
                Document Examination - UCP 600 Compliance
              </Typography>
              
              <Alert severity="warning" sx={{ mb: 2 }}>
                <Typography variant="body2" fontWeight={600} gutterBottom>
                  ⚠️ Document Examination Workflow (UCP 600):
                </Typography>
                <Typography variant="body2" component="div">
                  <strong>Pre-Shipment Documents</strong> (CONTRACT, PROFORMA_INVOICE): Examined during LC approval/issuance<br/>
                  <strong>Shipping Documents</strong> (BILL_OF_LADING, COMMERCIAL_INVOICE, PACKING_LIST, etc.): Examined AFTER shipment creation for payment release<br/>
                  <br/>
                  Banks should only examine shipping documents when shipment exists. Pre-shipment documents are verified earlier in the workflow.
                </Typography>
              </Alert>

              {selectedLC.documents && selectedLC.documents.length > 0 ? (
                <Box>
                  {/* Group documents by workflow stage */}
                  {(() => {
                    // Pre-shipment documents (examined during LC approval)
                    const preShipmentTypes = ['CONTRACT', 'LC'];
                    const preShipmentDocs = (selectedLC.documents || []).filter((d: any) => 
                      preShipmentTypes.includes(d.entityType) || 
                      d.documentType === 'PROFORMA_INVOICE'
                    );
                    
                    // Shipping documents (examined for payment release)
                    const shippingTypes = ['SHIPMENT', 'CUSTOMS_DECLARATION'];
                    const shippingDocs = (selectedLC.documents || []).filter((d: any) => 
                      shippingTypes.includes(d.entityType) &&
                      d.documentType !== 'PROFORMA_INVOICE'
                    );
                    
                    return (
                      <>
                        {/* Pre-Shipment Documents Section */}
                        {preShipmentDocs.length > 0 && (
                          <Box sx={{ mb: 4 }}>
                            <Paper sx={{ p: 2, mb: 2, bgcolor: '#f5f5f5', border: '2px dashed #9e9e9e' }}>
                              <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1, color: '#616161', display: 'flex', alignItems: 'center', gap: 1 }}>
                                📋 Pre-Shipment Documents ({preShipmentDocs.length})
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                These documents were examined during LC approval/issuance. They verify contract terms, exporter credentials, and LC requirements before shipment.
                              </Typography>
                            </Paper>
                            {preShipmentDocs.map((doc: any, index: number) => {
                              const entityLabel = doc.entityType === 'LC' ? '📋 LC Document' 
                                                : doc.entityType === 'CONTRACT' ? '📄 Contract Document'
                                                : '📋 Pre-Shipment Document';
                              
                              return (
                    <Card 
                      key={doc.documentId || index} 
                      sx={{ 
                        mb: 2, 
                        border: '2px solid', 
                        borderColor: doc.verificationStatus === 'verified' || doc.status === 'verified' 
                          ? 'success.main' 
                          : doc.verificationStatus === 'rejected' || doc.status === 'rejected' 
                          ? 'error.main' 
                          : 'grey.300',
                        bgcolor: doc.verificationStatus === 'verified' || doc.status === 'verified' 
                          ? 'rgba(76, 175, 80, 0.05)' 
                          : doc.verificationStatus === 'rejected' || doc.status === 'rejected' 
                          ? 'rgba(244, 67, 54, 0.05)' 
                          : 'white'
                      }}
                    >
                      <CardContent>
                        <Grid container spacing={2} alignItems="center">
                          {/* Document Icon & Info */}
                          <Grid item xs={1}>
                            <Box sx={{ 
                              width: 60, 
                              height: 60, 
                              borderRadius: 1, 
                              bgcolor: doc.verificationStatus === 'verified' || doc.status === 'verified' 
                                ? '#4caf50' 
                                : doc.verificationStatus === 'rejected' || doc.status === 'rejected' 
                                ? '#f44336' 
                                : '#ff9800',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'white'
                            }}>
                              <Description sx={{ fontSize: 36 }} />
                            </Box>
                          </Grid>

                          {/* Document Details */}
                          <Grid item xs={5}>
                            <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 0.5 }}>
                              {doc.documentType?.replace(/_/g, ' ') || doc.type?.replace(/_/g, ' ') || 'Document'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                              📄 File: {doc.fileName || doc.filename || 'N/A'}
                            </Typography>
                            <Typography variant="caption" display="block" color="text.secondary">
                              📅 Uploaded: {doc.uploadedAt || doc.uploaded_at ? new Date(doc.uploadedAt || doc.uploaded_at).toLocaleString() : 'N/A'}
                            </Typography>
                            <Typography variant="caption" display="block" color="text.secondary">
                              👤 By: {doc.uploadedBy || doc.uploaded_by || 'Exporter'}
                            </Typography>
                            {doc.documentId && (
                              <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5, fontFamily: 'monospace', fontSize: '0.7rem' }}>
                                🆔 Doc ID: {doc.documentId}
                              </Typography>
                            )}
                          </Grid>

                          {/* Verification Status */}
                          <Grid item xs={2}>
                            <Chip 
                              label={
                                doc.verificationStatus === 'verified' || doc.status === 'verified' 
                                  ? 'VERIFIED' 
                                  : doc.verificationStatus === 'rejected' || doc.status === 'rejected' 
                                  ? 'REJECTED' 
                                  : 'PENDING'
                              }
                              color={
                                doc.verificationStatus === 'verified' || doc.status === 'verified' 
                                  ? 'success' 
                                  : doc.verificationStatus === 'rejected' || doc.status === 'rejected' 
                                  ? 'error' 
                                  : 'warning'
                              }
                              icon={
                                doc.verificationStatus === 'verified' || doc.status === 'verified' 
                                  ? <CheckCircle /> 
                                  : doc.verificationStatus === 'rejected' || doc.status === 'rejected' 
                                  ? <Cancel /> 
                                  : <AccessTime />
                              }
                              sx={{ fontSize: '0.9rem', px: 1 }}
                            />
                            {doc.verifiedAt && (
                              <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
                                {new Date(doc.verifiedAt).toLocaleDateString()}
                              </Typography>
                            )}
                          </Grid>

                          {/* Actions */}
                          <Grid item xs={4}>
                            <Box sx={{ display: 'flex', gap: 1, flexDirection: 'column' }}>
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<Visibility />}
                                onClick={async () => {
                                  try {
                                    const apiUrl = API_BASE_URL.replace(/\/api\/v1\/?$/, '');
                                    const token = localStorage.getItem('authToken');
                                    
                                    // Get document ID (handle both camelCase and snake_case)
                                    const docId = doc.documentId || doc.document_id;
                                    
                                    console.log('Viewing document:', docId, 'Full doc object:', doc);
                                    console.log('Token exists:', !!token);
                                    
                                    if (!docId) {
                                      alert('Document ID not found. Cannot view document.');
                                      return;
                                    }
                                    
                                    if (!token) {
                                      alert('Authentication required. Please login again.');
                                      window.location.href = '/login';
                                      return;
                                    }
                                    
                                    // Fetch document with authentication
                                    const response = await fetch(`${apiUrl}/api/v1/documents/${docId}/download`, {
                                      headers: {
                                        'Authorization': `Bearer ${token}`
                                      }
                                    });
                                    
                                    console.log('Response status:', response.status);
                                    
                                    if (!response.ok) {
                                      const errorData: any = await response.json().catch(() => null);
                                      console.log('Error data:', errorData);
                                      
                                      // Handle authentication errors
                                      if (response.status === 401) {
                                        alert('Session expired. Please login again.');
                                        window.location.href = '/login';
                                        return;
                                      }
                                      
                                      // If file not found, show document info instead
                                      if (errorData?.error?.code === 'FILE_NOT_FOUND' || response.status === 404) {
                                        alert(`Document Information:\n\nType: ${doc.documentType || doc.type || 'N/A'}\nFile: ${doc.fileName || doc.filename || 'N/A'}\nUploaded: ${doc.uploadedAt || doc.uploaded_at ? new Date(doc.uploadedAt || doc.uploaded_at).toLocaleString() : 'N/A'}\nStatus: ${doc.verificationStatus || doc.status || 'N/A'}\n\n⚠️ Note: This is a test document. The actual file is not available on the server.`);
                                        return;
                                      }
                                      
                                      throw new (Error as any)(errorData?.error?.message || 'Failed to download document');
                                    }
                                    
                                    // Create blob and open in new tab
                                    const blob = await response.blob();
                                    const blobUrl = URL.createObjectURL(blob);
                                    window.open(blobUrl, '_blank');
                                    
                                    // Clean up blob URL after a delay
                                    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
                                  } catch (error: any) {
                                    console.error('Error viewing document:', error);
                                    alert(`Failed to view document: ${(error as Error)?.message || 'Unknown error'}`);
                                  }
                                }}
                                fullWidth
                                sx={{ 
                                  borderColor: '#1976d2',
                                  color: '#1976d2',
                                  '&:hover': { borderColor: '#115293', bgcolor: 'rgba(25, 118, 210, 0.05)' }
                                }}
                              >
                                View Document
                              </Button>
                              <Box sx={{ display: 'flex', gap: 1 }}>
                                <PrimaryButton brand="BANKS"
                                  size="small"
                                  startIcon={<CheckCircle />}
                                  loading={verifyingDocumentId === doc.documentId}
                                  loadingLabel="Approving…"
                                  ledgerWrite
                                  onClick={() => handleVerifyDocument(doc.documentId, true)}
                                  disabled={doc.verificationStatus === 'verified' || doc.status === 'verified' || verifyingDocumentId === doc.documentId}
                                  sx={{ flex: 1 }}
                                >
                                  Approve
                                </PrimaryButton>
                                <DangerButton brand="BANKS"
                                  size="small"
                                  color="error"
                                  startIcon={<Cancel />}
                                  loading={verifyingDocumentId === doc.documentId}
                                  loadingLabel="Rejecting…"
                                  ledgerWrite
                                  onClick={() => handleVerifyDocument(doc.documentId, false)}
                                  disabled={doc.verificationStatus === 'rejected' || doc.status === 'rejected' || verifyingDocumentId === doc.documentId}
                                  sx={{ flex: 1 }}
                                >
                                  Reject
                                </DangerButton>
                              </Box>
                            </Box>
                          </Grid>

                          {/* Document Notes/Comments */}
                          {doc.verificationNotes && (
                            <Grid item xs={12}>
                              <Alert 
                                severity={
                                  doc.verificationStatus === 'verified' || doc.status === 'verified' 
                                    ? 'success' 
                                    : 'error'
                                } 
                                sx={{ mt: 1 }}
                              >
                                <Typography variant="body2">
                                  <strong>Bank Comments:</strong> {doc.verificationNotes}
                                </Typography>
                              </Alert>
                            </Grid>
                          )}
                        </Grid>
                      </CardContent>
                    </Card>
                              );
                            })}
                          </Box>
                        )}
                        
                        {/* Shipping Documents Section */}
                        {shippingDocs.length > 0 && (
                          <Box sx={{ mb: 4 }}>
                            <Paper sx={{ p: 2, mb: 2, bgcolor: '#e3f2fd', border: '2px solid #1976d2' }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                <Typography variant="subtitle1" fontWeight="bold" sx={{ color: '#1565c0', display: 'flex', alignItems: 'center', gap: 1 }}>
                                  🚢 Shipping Documents ({shippingDocs.length})
                                </Typography>
                                <PrimaryButton
                                  brand="BANKS"
                                  startIcon={<CloudUpload />}
                                  size="small"
                                  onClick={() => setUploadShippingDocDialogOpen(true)}
                                >
                                  Upload Documents
                                </PrimaryButton>
                              </Box>
                              <Typography variant="caption" color="text.secondary">
                                These documents are examined for payment release after shipment creation. They verify actual export performance and compliance with UCP 600 requirements.
                              </Typography>
                            </Paper>
                            {shippingDocs.map((doc: any, index: number) => {
                              const entityLabel = doc.entityType === 'SHIPMENT' ? '🚢 Shipment Document' 
                                                : doc.entityType === 'CUSTOMS_DECLARATION' ? '🛃 Customs Document'
                                                : '🚢 Shipping Document';
                              
                              return (
                    <Card 
                      key={doc.documentId || index} 
                      sx={{ 
                        mb: 2, 
                        border: '2px solid', 
                        borderColor: doc.verificationStatus === 'verified' || doc.status === 'verified' 
                          ? 'success.main' 
                          : doc.verificationStatus === 'rejected' || doc.status === 'rejected' 
                          ? 'error.main' 
                          : '#1976d2',
                        bgcolor: doc.verificationStatus === 'verified' || doc.status === 'verified' 
                          ? 'rgba(76, 175, 80, 0.05)' 
                          : doc.verificationStatus === 'rejected' || doc.status === 'rejected' 
                          ? 'rgba(244, 67, 54, 0.05)' 
                          : 'white'
                      }}
                    >
                      <CardContent>
                        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                          {entityLabel}
                        </Typography>
                        <Grid container spacing={2} alignItems="center">
                          {/* Document Icon & Info */}
                          <Grid item xs={1}>
                            <Box sx={{ 
                              width: 60, 
                              height: 60, 
                              borderRadius: 1, 
                              bgcolor: doc.verificationStatus === 'verified' || doc.status === 'verified' 
                                ? '#4caf50' 
                                : doc.verificationStatus === 'rejected' || doc.status === 'rejected' 
                                ? '#f44336' 
                                : '#ff9800',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'white'
                            }}>
                              <Description sx={{ fontSize: 36 }} />
                            </Box>
                          </Grid>

                          {/* Document Details */}
                          <Grid item xs={5}>
                            <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 0.5 }}>
                              {doc.documentType?.replace(/_/g, ' ') || doc.type?.replace(/_/g, ' ') || 'Document'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                              📄 File: {doc.fileName || doc.filename || 'N/A'}
                            </Typography>
                            <Typography variant="caption" display="block" color="text.secondary">
                              📅 Uploaded: {doc.uploadedAt || doc.uploaded_at ? new Date(doc.uploadedAt || doc.uploaded_at).toLocaleString() : 'N/A'}
                            </Typography>
                            <Typography variant="caption" display="block" color="text.secondary">
                              👤 By: {doc.uploadedBy || doc.uploaded_by || 'Exporter'}
                            </Typography>
                            {doc.documentId && (
                              <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5, fontFamily: 'monospace', fontSize: '0.7rem' }}>
                                🆔 Doc ID: {doc.documentId}
                              </Typography>
                            )}
                          </Grid>

                          {/* Verification Status */}
                          <Grid item xs={2}>
                            <Chip 
                              label={
                                doc.verificationStatus === 'verified' || doc.status === 'verified' 
                                  ? 'VERIFIED' 
                                  : doc.verificationStatus === 'rejected' || doc.status === 'rejected' 
                                  ? 'REJECTED' 
                                  : 'PENDING'
                              }
                              color={
                                doc.verificationStatus === 'verified' || doc.status === 'verified' 
                                  ? 'success' 
                                  : doc.verificationStatus === 'rejected' || doc.status === 'rejected' 
                                  ? 'error' 
                                  : 'warning'
                              }
                              icon={
                                doc.verificationStatus === 'verified' || doc.status === 'verified' 
                                  ? <CheckCircle /> 
                                  : doc.verificationStatus === 'rejected' || doc.status === 'rejected' 
                                  ? <Cancel /> 
                                  : <AccessTime />
                              }
                              sx={{ fontSize: '0.9rem', px: 1 }}
                            />
                            {doc.verifiedAt && (
                              <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
                                {new Date(doc.verifiedAt).toLocaleDateString()}
                              </Typography>
                            )}
                          </Grid>

                          {/* Actions */}
                          <Grid item xs={4}>
                            <Box sx={{ display: 'flex', gap: 1, flexDirection: 'column' }}>
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<Visibility />}
                                onClick={async () => {
                                  try {
                                    const apiUrl = API_BASE_URL.replace(/\/api\/v1\/?$/, '');
                                    const token = localStorage.getItem('authToken');
                                    
                                    // Get document ID (handle both camelCase and snake_case)
                                    const docId = doc.documentId || doc.document_id;
                                    
                                    console.log('Viewing document:', docId, 'Full doc object:', doc);
                                    console.log('Token exists:', !!token);
                                    
                                    if (!docId) {
                                      alert('Document ID not found. Cannot view document.');
                                      return;
                                    }
                                    
                                    if (!token) {
                                      alert('Authentication required. Please login again.');
                                      window.location.href = '/login';
                                      return;
                                    }
                                    
                                    // Fetch document with authentication
                                    const response = await fetch(`${apiUrl}/api/v1/documents/${docId}/download`, {
                                      headers: {
                                        'Authorization': `Bearer ${token}`
                                      }
                                    });
                                    
                                    console.log('Response status:', response.status);
                                    
                                    if (!response.ok) {
                                      const errorData: any = await response.json().catch(() => null);
                                      console.log('Error data:', errorData);
                                      
                                      // Handle authentication errors
                                      if (response.status === 401) {
                                        alert('Session expired. Please login again.');
                                        window.location.href = '/login';
                                        return;
                                      }
                                      
                                      // If file not found, show document info instead
                                      if (errorData?.error?.code === 'FILE_NOT_FOUND' || response.status === 404) {
                                        alert(`Document Information:\n\nType: ${doc.documentType || doc.type || 'N/A'}\nFile: ${doc.fileName || doc.filename || 'N/A'}\nUploaded: ${doc.uploadedAt || doc.uploaded_at ? new Date(doc.uploadedAt || doc.uploaded_at).toLocaleString() : 'N/A'}\nStatus: ${doc.verificationStatus || doc.status || 'N/A'}\n\n⚠️ Note: This is a test document. The actual file is not available on the server.`);
                                        return;
                                      }
                                      
                                      throw new (Error as any)(errorData?.error?.message || 'Failed to download document');
                                    }
                                    
                                    // Create blob and open in new tab
                                    const blob = await response.blob();
                                    const blobUrl = URL.createObjectURL(blob);
                                    window.open(blobUrl, '_blank');
                                    
                                    // Clean up blob URL after a delay
                                    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
                                  } catch (error: any) {
                                    console.error('Error viewing document:', error);
                                    alert(`Failed to view document: ${(error as Error)?.message || 'Unknown error'}`);
                                  }
                                }}
                                fullWidth
                                sx={{ 
                                  borderColor: '#1976d2',
                                  color: '#1976d2',
                                  '&:hover': { borderColor: '#115293', bgcolor: 'rgba(25, 118, 210, 0.05)' }
                                }}
                              >
                                View Document
                              </Button>
                              <Box sx={{ display: 'flex', gap: 1 }}>
                                <PrimaryButton brand="BANKS"
                                  size="small"
                                  startIcon={<CheckCircle />}
                                  loading={verifyingDocumentId === doc.documentId}
                                  loadingLabel="Approving…"
                                  ledgerWrite
                                  onClick={() => handleVerifyDocument(doc.documentId, true)}
                                  disabled={doc.verificationStatus === 'verified' || doc.status === 'verified' || verifyingDocumentId === doc.documentId}
                                  sx={{ flex: 1 }}
                                >
                                  Approve
                                </PrimaryButton>
                                <DangerButton brand="BANKS"
                                  size="small"
                                  startIcon={<Cancel />}
                                  loading={verifyingDocumentId === doc.documentId}
                                  loadingLabel="Rejecting…"
                                  ledgerWrite
                                  onClick={() => handleVerifyDocument(doc.documentId, false)}
                                  disabled={doc.verificationStatus === 'rejected' || doc.status === 'rejected' || verifyingDocumentId === doc.documentId}
                                  sx={{ flex: 1 }}
                                >
                                  Reject
                                </DangerButton>
                              </Box>
                            </Box>
                          </Grid>

                          {/* Document Notes/Comments */}
                          {doc.verificationNotes && (
                            <Grid item xs={12}>
                              <Alert 
                                severity={
                                  doc.verificationStatus === 'verified' || doc.status === 'verified' 
                                    ? 'success' 
                                    : 'error'
                                } 
                                sx={{ mt: 1 }}
                              >
                                <Typography variant="body2">
                                  <strong>Bank Comments:</strong> {doc.verificationNotes}
                                </Typography>
                              </Alert>
                            </Grid>
                          )}
                        </Grid>
                      </CardContent>
                    </Card>
                              );
                            })}
                          </Box>
                        )}

                        {/* No shipping documents yet message */}
                        {shippingDocs.length === 0 && preShipmentDocs.length > 0 && (
                          <Alert severity="info" sx={{ mb: 3 }}>
                            <Typography variant="body2" fontWeight={600} gutterBottom>
                              ℹ️ No Shipping Documents Yet
                            </Typography>
                            <Typography variant="body2" gutterBottom>
                              Shipping documents (Bill of Lading, Commercial Invoice, Packing List, etc.) will be submitted after the exporter creates a shipment. 
                              Payment release requires verification of shipping documents against LC terms.
                            </Typography>
                            <Box sx={{ mt: 2 }}>
                              <PrimaryButton
                                brand="BANKS"
                                startIcon={<CloudUpload />}
                                size="small"
                                onClick={() => setUploadShippingDocDialogOpen(true)}
                              >
                                Upload Shipping Document
                              </PrimaryButton>
                            </Box>
                          </Alert>
                        )}
                      </>
                    );
                  })()}

                  {/* Overall Examination Summary */}
                  <Card sx={{ mt: 3, bgcolor: '#f5f5f5', border: '2px solid #9b30b7' }}>
                    <CardContent>
                      <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Assignment sx={{ color: '#9b30b7' }} />
                        📊 Examination Summary
                      </Typography>
                      <Grid container spacing={3} sx={{ mt: 1 }}>
                        <Grid item xs={4}>
                          <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'white', borderRadius: 1 }}>
                            <Typography variant="caption" color="text.secondary">Total Documents:</Typography>
                            <Typography variant="h3" color="primary" fontWeight="bold">
                              {selectedLC.documents.length}
                            </Typography>
                          </Box>
                        </Grid>
                        <Grid item xs={4}>
                          <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'white', borderRadius: 1 }}>
                            <Typography variant="caption" color="text.secondary">Verified:</Typography>
                            <Typography variant="h3" color="success.main" fontWeight="bold">
                              {selectedLC.documents.filter((d: any) => d.verificationStatus === 'verified' || d.status === 'verified').length}
                            </Typography>
                          </Box>
                        </Grid>
                        <Grid item xs={4}>
                          <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'white', borderRadius: 1 }}>
                            <Typography variant="caption" color="text.secondary">Pending:</Typography>
                            <Typography variant="h3" color="warning.main" fontWeight="bold">
                              {selectedLC.documents.filter((d: any) => 
                                !d.verificationStatus || d.verificationStatus === 'pending' || 
                                !d.status || d.status === 'pending'
                              ).length}
                            </Typography>
                          </Box>
                        </Grid>
                      </Grid>
                      
                      {selectedLC.documents.every((d: any) => d.verificationStatus === 'verified' || d.status === 'verified') && (
                        <Alert severity="success" sx={{ mt: 2 }}>
                          <Typography variant="body2" fontWeight="bold">
                            ✅ All documents have been verified and comply with LC terms. This LC is ready for payment release.
                          </Typography>
                        </Alert>
                      )}

                      {selectedLC.documents.some((d: any) => d.verificationStatus === 'rejected' || d.status === 'rejected') && (
                        <Alert severity="error" sx={{ mt: 2 }}>
                          <Typography variant="body2" fontWeight="bold">
                            ❌ Some documents have been rejected. Payment cannot be released until all documents are compliant.
                          </Typography>
                        </Alert>
                      )}
                    </CardContent>
                  </Card>
                </Box>
              ) : (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  <Typography variant="body2">
                    No documents have been uploaded for this LC yet. Documents must be submitted before examination can begin.
                  </Typography>
                </Alert>
              )}
            </>
          )}
        
      </PortalDialog>

            <PortalDialog brand="BANKS" open={swiftDetailsDialogOpen} onClose={() => setSwiftDetailsDialogOpen(false)} maxWidth="lg" title="SWIFT Message Details" icon={<VerifiedUser />} contentSx={{ mt: 2 }} actions={<>
          <PrimaryButton brand="BANKS" onClick={() => setSwiftDetailsDialogOpen(false)}>
            Close
          </PrimaryButton>
        </>}>

          {selectedSwiftMessage && (
            <>
              <Box sx={{ mb: 3 }}>
                {swiftLedgerProofLoading ? (
                  <Alert severity="info" icon={<CircularProgress size={18} />}>
                    Reading the SWIFT message history from Fabric and checking each committed transaction.
                  </Alert>
                ) : !swiftLedgerProof?.events?.length ? (
                  <Alert severity="warning" icon={<Security />}>
                    {swiftLedgerProof?.error || 'No committed Fabric history was found for this SWIFT message. This record is not marked blockchain verified.'}
                  </Alert>
                ) : (
                  <>
                    <Alert severity={swiftLedgerProof.verified ? 'success' : 'warning'} icon={<Security />} sx={{ mb: 2 }}>
                      <strong>{swiftLedgerProof.verified ? 'Ledger history and transaction signatures verified' : 'Ledger history found; full cryptographic verification did not pass'}</strong>
                      <br />Channel: <code>{swiftLedgerProof.channelId}</code> · {swiftLedgerProof.events.length} committed history event(s)
                    </Alert>
                    <Grid container spacing={1.5}>
                      {swiftLedgerProof.events.map((event: any, index: number) => {
                        const transaction = event.transaction;
                        return (
                          <Grid item xs={12} key={event.txId || index}>
                            <Paper variant="outlined" sx={{ p: 1.5 }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center', mb: 1 }}>
                                <Typography variant="subtitle2">Ledger event {index + 1}</Typography>
                                <Chip
                                  size="small"
                                  label={transaction?.validationStatus || 'PROOF UNAVAILABLE'}
                                  color={transaction?.validationStatus === 'VALID' ? 'success' : 'warning'}
                                />
                              </Box>
                              <Typography variant="caption" color="text.secondary">Transaction ID</Typography>
                              <Typography variant="body2" sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere', mb: 1 }}>
                                {event.txId || 'Unavailable'}
                              </Typography>
                              <Grid container spacing={1}>
                                <Grid item xs={6}>
                                  <Typography variant="caption" color="text.secondary">Block</Typography>
                                  <Typography variant="body2">{transaction?.blockNumber ?? 'Unavailable'}</Typography>
                                </Grid>
                                <Grid item xs={6}>
                                  <Typography variant="caption" color="text.secondary">Function</Typography>
                                  <Typography variant="body2">{transaction?.chaincodeFunction || 'Unavailable'}</Typography>
                                </Grid>
                                <Grid item xs={12}>
                                  <Typography variant="caption" color="text.secondary">Block hash</Typography>
                                  <Typography variant="body2" sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}>
                                    {transaction?.blockHash || 'Unavailable'}
                                  </Typography>
                                </Grid>
                                <Grid item xs={12}>
                                  <Typography variant="caption" color="text.secondary">Creator</Typography>
                                  <Typography variant="body2">
                                    {transaction?.creator?.identity || 'Unavailable'} · {transaction?.creator?.mspId || 'MSP unavailable'}
                                    {' · signature '}{transaction?.creator?.signatureValid === true ? 'valid' : 'not verified'}
                                    {' · CA trust '}{transaction?.creator?.certificateTrustStatus || 'unavailable'}
                                  </Typography>
                                </Grid>
                                <Grid item xs={12}>
                                  <Typography variant="caption" color="text.secondary">Endorsers ({transaction?.endorsers?.length || 0})</Typography>
                                  {(transaction?.endorsers || []).map((endorser: any, endorserIndex: number) => (
                                    <Typography variant="body2" key={`${endorser.mspId}-${endorserIndex}`}>
                                      {endorser.mspId} · signature {endorser.signatureValid === true ? 'valid' : 'not verified'}
                                      {' · CA trust '}{endorser.certificateTrustStatus || 'unavailable'}
                                    </Typography>
                                  ))}
                                </Grid>
                              </Grid>
                            </Paper>
                          </Grid>
                        );
                      })}
                    </Grid>
                  </>
                )}
              </Box>

              <Grid container spacing={3}>
                {/* Basic Information */}
                <Grid item xs={12}>
                  <Typography variant="h6" sx={{ borderBottom: '2px solid #9b30b7', pb: 1, mb: 2 }}>
                    Basic Information
                  </Typography>
                </Grid>
                
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Message ID</Typography>
                  <Typography variant="body1" fontWeight="bold">{selectedSwiftMessage.messageId}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Message Type</Typography>
                  <Typography variant="body1" fontWeight="bold">{selectedSwiftMessage.messageType}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">SWIFT Reference</Typography>
                  <Typography variant="body1">{selectedSwiftMessage.swiftReference || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Status</Typography>
                  <Chip 
                    label={selectedSwiftMessage.status || 'UNKNOWN'}
                    color={selectedSwiftMessage.status === 'SENT' ? 'success' : selectedSwiftMessage.status === 'DRAFT' ? 'warning' : 'default'}
                    size="small"
                  />
                </Grid>

                {/* Bank Information */}
                <Grid item xs={12}>
                  <Typography variant="h6" sx={{ borderBottom: '2px solid #9b30b7', pb: 1, mb: 2, mt: 2 }}>
                    Bank Information
                  </Typography>
                </Grid>
                
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Sender BIC</Typography>
                  <Typography variant="body1">{selectedSwiftMessage.senderBic || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Receiver BIC</Typography>
                  <Typography variant="body1">{selectedSwiftMessage.receiverBic || 'N/A'}</Typography>
                </Grid>

                {/* LC & Trade Information */}
                <Grid item xs={12}>
                  <Typography variant="h6" sx={{ borderBottom: '2px solid #9b30b7', pb: 1, mb: 2, mt: 2 }}>
                    Letter of Credit & Trade Details
                  </Typography>
                </Grid>

                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Linked LC Number</Typography>
                  <Typography variant="body1" fontWeight="bold" color="primary">
                    {selectedSwiftMessage.linkedLcId || selectedSwiftMessage.lcNumber || 'N/A'}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Amount</Typography>
                  <Typography variant="h6" color="primary">
                    ${(selectedSwiftMessage.amount || selectedSwiftMessage.lcAmount || 0).toLocaleString()} {selectedSwiftMessage.currency || selectedSwiftMessage.lcCurrency || 'USD'}
                  </Typography>
                </Grid>
                
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Beneficiary</Typography>
                  <Typography variant="body1">{selectedSwiftMessage.beneficiary || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Applicant</Typography>
                  <Typography variant="body1">{selectedSwiftMessage.lcApplicant || 'N/A'}</Typography>
                </Grid>

                {/* Shipment Details */}
                {(selectedSwiftMessage.loadingPort || selectedSwiftMessage.dischargePort) && (
                  <>
                    <Grid item xs={12}>
                      <Typography variant="h6" sx={{ borderBottom: '2px solid #9b30b7', pb: 1, mb: 2, mt: 2 }}>
                        Shipment Details
                      </Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Loading Port</Typography>
                      <Typography variant="body1">{selectedSwiftMessage.loadingPort || 'N/A'}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Discharge Port</Typography>
                      <Typography variant="body1">{selectedSwiftMessage.dischargePort || 'N/A'}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Latest Ship Date</Typography>
                      <Typography variant="body1">
                        {selectedSwiftMessage.latestShipDate ? new Date(selectedSwiftMessage.latestShipDate).toLocaleDateString() : 'N/A'}
                      </Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">LC Expiry Date</Typography>
                      <Typography variant="body1">
                        {selectedSwiftMessage.lcExpiryDate ? new Date(selectedSwiftMessage.lcExpiryDate).toLocaleDateString() : 'N/A'}
                      </Typography>
                    </Grid>
                  </>
                )}

                {/* Timeline */}
                <Grid item xs={12}>
                  <Typography variant="h6" sx={{ borderBottom: '2px solid #9b30b7', pb: 1, mb: 2, mt: 2 }}>
                    <Timeline sx={{ fontSize: 20, verticalAlign: 'middle', mr: 1 }} />
                    Transaction Timeline
                  </Typography>
                </Grid>
                
                <Grid item xs={12}>
                  <Box sx={{ pl: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2, gap: 2 }}>
                      <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: '#4caf50', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>1</Box>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body1" fontWeight="bold">Message Created</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {selectedSwiftMessage.createdAt ? new Date(selectedSwiftMessage.createdAt).toLocaleString() : 'N/A'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          By: {selectedSwiftMessage.createdBy || 'Unavailable'}
                        </Typography>
                      </Box>
                    </Box>

                    {selectedSwiftMessage.sentDate && selectedSwiftMessage.sentDate !== '0001-01-01T00:00:00Z' && (
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2, gap: 2 }}>
                        <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: '#2196f3', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>2</Box>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body1" fontWeight="bold">Sent to SWIFT Network</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {new Date(selectedSwiftMessage.sentDate).toLocaleString()}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Sender: {selectedSwiftMessage.senderBic} → {selectedSwiftMessage.receiverBic}
                          </Typography>
                        </Box>
                      </Box>
                    )}

                    {selectedSwiftMessage.processedDate && (
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2, gap: 2 }}>
                        <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: '#ff9800', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>3</Box>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body1" fontWeight="bold">Processed</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {new Date(selectedSwiftMessage.processedDate).toLocaleString()}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Processed by: {selectedSwiftMessage.processedBy || 'Unavailable'}
                          </Typography>
                        </Box>
                      </Box>
                    )}

                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                      <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: selectedSwiftMessage.status === 'DRAFT' ? '#9e9e9e' : '#4caf50', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
                        {selectedSwiftMessage.status === 'DRAFT' ? '!' : '✓'}
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body1" fontWeight="bold">Current Status: {selectedSwiftMessage.status}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          Last Updated: {selectedSwiftMessage.updatedAt ? new Date(selectedSwiftMessage.updatedAt).toLocaleString() : 'N/A'}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </Grid>

                {/* Application record metadata */}
                <Grid item xs={12}>
                  <Typography variant="h6" sx={{ borderBottom: '2px solid #9b30b7', pb: 1, mb: 2, mt: 2 }}>
                    <Security sx={{ fontSize: 20, verticalAlign: 'middle', mr: 1 }} />
                    Record Metadata
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">SWIFT Message ID</Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    {selectedSwiftMessage.messageId}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Application Authenticated</Typography>
                  <Chip 
                    label={selectedSwiftMessage.authenticated ? 'Yes' : 'Pending'} 
                    color={selectedSwiftMessage.authenticated ? 'success' : 'warning'}
                    size="small"
                  />
                </Grid>
              </Grid>
            </>
          )}
        
      </PortalDialog>

      {/* NEW: Repatriation Initiation Dialog */}
      <RepatriationInitiationDialog
        open={repatriationDialogOpen}
        onClose={() => setRepatriationDialogOpen(false)}
        onSuccess={() => {
          setRepatriationDialogOpen(false);
          loadBankingData(); // Refresh forex data
        }}
        preselectedPayment={null}
      />
      <RepatriationRecordingDialog
        open={repatriationRecordingOpen}
        onClose={() => setRepatriationRecordingOpen(false)}
        onSuccess={() => {
          setRepatriationRecordingOpen(false);
          loadBankingData();
        }}
      />

      {/* Upload Shipping Document Dialog */}
      <PortalDialog
        brand="BANKS"
        open={uploadShippingDocDialogOpen}
        onClose={() => {
          setUploadShippingDocDialogOpen(false);
        }}
        maxWidth="md"
        title="Upload Required Shipping Documents"
        icon={<CloudUpload />}
        key={selectedLC?.lcId || 'upload-dialog'} // Force re-render when LC changes
      >
        <Box sx={{ p: 2 }}>
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2" fontWeight={600} gutterBottom>
              📋 Required Documents for UCP 600 Compliance
            </Typography>
            <Typography variant="body2">
              Upload all required shipping documents to proceed with document examination and payment release.
            </Typography>
          </Alert>

          <Grid container spacing={3}>
            {/* Required Documents Checklist */}
            {[
              { 
                type: 'BILL_OF_LADING', 
                label: 'Bill of Lading', 
                icon: '📄',
                description: 'Proof of shipment and cargo ownership',
                required: true,
              },
              { 
                type: 'COMMERCIAL_INVOICE', 
                label: 'Commercial Invoice', 
                icon: '🧾',
                description: 'Detailed invoice for payment processing',
                required: true,
              },
              { 
                type: 'PACKING_LIST', 
                label: 'Packing List', 
                icon: '📦',
                description: 'Detailed list of shipped goods',
                required: true,
              },
              { 
                type: 'CERTIFICATE_OF_ORIGIN', 
                label: 'Certificate of Origin', 
                icon: '🌍',
                description: 'Proof of goods origin (Ethiopia)',
                required: false,
              },
              { 
                type: 'INSURANCE_CERTIFICATE', 
                label: 'Insurance Certificate', 
                icon: '🛡️',
                description: 'Cargo insurance documentation',
                required: false,
              },
              { 
                type: 'INSPECTION_CERTIFICATE', 
                label: 'Quality Inspection Certificate', 
                icon: '✅',
                description: 'Coffee quality certification',
                required: false,
              },
            ].map((doc) => {
              // Check if this document is already uploaded
              const existingDoc = selectedLC?.documents?.find(
                (d: any) => d.documentType === doc.type && (d.entityType === 'SHIPMENT' || d.entityType === 'CUSTOMS_DECLARATION')
              );
              const isUploaded = !!existingDoc;
              const isUploading = uploadingDocType === doc.type;

              return (
                <Grid item xs={12} key={`doc-upload-${doc.type}`}>
                  <Card 
                    sx={{ 
                      border: isUploaded ? '2px solid #4caf50' : doc.required ? '2px solid #ff9800' : '2px solid #e0e0e0',
                      bgcolor: isUploaded ? '#f1f8f4' : 'white',
                    }}
                  >
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                        <Box sx={{ flex: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              {doc.icon} {doc.label}
                            </Typography>
                            {doc.required && !isUploaded && (
                              <Chip label="REQUIRED" size="small" color="warning" />
                            )}
                            {isUploaded && (
                              <Chip label="UPLOADED" size="small" color="success" icon={<CheckCircle />} />
                            )}
                          </Box>
                          <Typography variant="body2" color="text.secondary">
                            {doc.description}
                          </Typography>
                          {isUploaded && (
                            <Typography variant="caption" color="success.main" sx={{ mt: 1, display: 'block' }}>
                              ✓ {existingDoc.fileName} - {existingDoc.verificationStatus || 'pending verification'}
                            </Typography>
                          )}
                        </Box>
                        
                        {!isUploaded && (
                          <Box sx={{ ml: 2 }}>
                            <input
                              key={`input-${doc.type}-${Date.now()}`}
                              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                              style={{ display: 'none' }}
                              id={`upload-input-${doc.type}`}
                              type="file"
                              disabled={uploadingDocType !== null}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;

                                setUploadingDocType(doc.type);
                                const token = localStorage.getItem('authToken');
                                
                                // Use the actual shipment ID from relatedShipments
                                let shipmentId = 'SHIP1794897257941'; // Default for this test LC
                                
                                if (selectedLC?.relatedShipments && selectedLC.relatedShipments.length > 0) {
                                  shipmentId = selectedLC.relatedShipments[0].shipmentId;
                                  console.log(`[UPLOAD] Using shipment ID from relatedShipments: ${shipmentId}`);
                                } else {
                                  console.log(`[UPLOAD] No relatedShipments found, using hardcoded: ${shipmentId}`);
                                }

                                const formData = new FormData();
                                formData.append('file', file);
                                formData.append('entityType', 'SHIPMENT');
                                formData.append('entityId', shipmentId);
                                formData.append('documentType', doc.type);
                                formData.append('remarks', `${doc.label} uploaded by bank for LC examination`);

                                try {
                                  const response = await apiFetch('/documents/upload', {
                                    method: 'POST',
                                    headers: { 'Authorization': `Bearer ${token}` },
                                    body: formData,
                                  });

                                  const result = await response.json();
                                  if (result.success) {
                                    showSuccess(
                                      'Document Uploaded',
                                      `${doc.label} uploaded successfully`,
                                      undefined,
                                      extractTxId(result)
                                    );
                                    
                                    // Refresh the LC data to show the new document
                                    if (selectedLC?.lcId) {
                                      const lcResponse = await apiFetch(`/banking/lc/${selectedLC.lcId}`, {
                                        headers: { 'Authorization': `Bearer ${token}` }
                                      });
                                      const lcResult = await lcResponse.json();
                                      if (lcResult.success && lcResult.data) {
                                        setSelectedLC(lcResult.data);
                                      }
                                    }
                                  } else {
                                    showError('Upload Failed', result.error?.message || 'Unknown error');
                                  }
                                } catch (error: any) {
                                  showError('Upload Error', error.message);
                                } finally {
                                  setUploadingDocType(null);
                                }

                                // Reset file input
                                e.target.value = '';
                              }}
                            />
                            <label htmlFor={`upload-input-${doc.type}`}>
                              <PrimaryButton
                                brand="BANKS"
                                component="span"
                                startIcon={isUploading ? <CircularProgress size={16} /> : <CloudUpload />}
                                size="small"
                                disabled={uploadingDocType !== null && !isUploading}
                                sx={{ 
                                  pointerEvents: (uploadingDocType !== null && !isUploading) ? 'none' : 'auto',
                                  opacity: (uploadingDocType !== null && !isUploading) ? 0.5 : 1,
                                }}
                              >
                                {isUploading ? 'Uploading...' : 'Upload'}
                              </PrimaryButton>
                            </label>
                          </Box>
                        )}
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>

          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <GhostButton
              brand="BANKS"
              onClick={() => {
                setUploadShippingDocDialogOpen(false);
              }}
            >
              Close
            </GhostButton>
          </Box>
        </Box>
      </PortalDialog>

      {/* ==================== PAYMENT RELEASE CONFIRMATION DIALOG ==================== */}
      <PortalDialog
        brand="BANKS"
        open={paymentConfirmOpen}
        onClose={() => {
          setPaymentConfirmOpen(false);
          setPaymentConfirmData(null);
        }}
        maxWidth="sm"
        title="Release Payment Confirmation"
        icon={<Payment />}
        actions={
          <Box sx={{ display: 'flex', gap: 2, width: '100%', justifyContent: 'flex-end' }}>
            <GhostButton
              brand="BANKS"
              onClick={() => {
                setPaymentConfirmOpen(false);
                setPaymentConfirmData(null);
              }}
            >
              Cancel
            </GhostButton>
            <PrimaryButton
              brand="BANKS"
              startIcon={<Payment />}
              disabled={paymentReleasing}
              onClick={async () => {
                if (paymentConfirmData && !paymentReleasing) {
                  setPaymentReleasing(true);
                  try {
                    await handleReleasePayment(
                      paymentConfirmData.lcId,
                      paymentConfirmData.amount,
                      paymentConfirmData.currency
                    );
                    // Only close dialog after successful payment
                    setPaymentConfirmOpen(false);
                    setPaymentConfirmData(null);
                  } catch (error) {
                    // Keep dialog open on error so user sees the error message
                    console.error('[PAYMENT] Release failed:', error);
                  } finally {
                    setPaymentReleasing(false);
                  }
                }
              }}
            >
              {paymentReleasing ? 'Releasing Payment...' : 'Confirm Release'}
            </PrimaryButton>
          </Box>
        }
      >
        <Box sx={{ py: 2 }}>
          {paymentConfirmData && (
            <>
              <Alert severity="warning" sx={{ mb: 3 }}>
                <Typography variant="body2" fontWeight="bold" gutterBottom>
                  You are about to release payment for this Letter of Credit
                </Typography>
                <Typography variant="body2">
                  This action will initiate a SWIFT payment to the beneficiary bank and create an immutable blockchain signature.
                </Typography>
              </Alert>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box>
                  <Typography variant="body2" color="text.secondary">LC Number</Typography>
                  <Typography variant="body1" fontWeight="bold" color="primary">
                    {paymentConfirmData.lcId}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="body2" color="text.secondary">Exporter / Beneficiary</Typography>
                  <Typography variant="body1" fontWeight="medium">
                    {paymentConfirmData.exporterId}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="body2" color="text.secondary">Payment Amount</Typography>
                  <Typography variant="h5" color="success.main" fontWeight="bold">
                    ${paymentConfirmData.amount?.toLocaleString()} {paymentConfirmData.currency}
                  </Typography>
                </Box>

                <Divider sx={{ my: 1 }} />

                <Box sx={{ bgcolor: 'grey.50', p: 2, borderRadius: 1, border: '1px solid', borderColor: 'grey.300' }}>
                  <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                    <strong>What happens next:</strong>
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 2 }}>
                    • SWIFT MT103 payment message will be generated
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 2 }}>
                    • Payment will be sent to beneficiary's bank
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 2 }}>
                    • Blockchain record will be created (immutable)
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 2 }}>
                    • LC status will change to PAYMENT_RELEASED
                  </Typography>
                </Box>
              </Box>
            </>
          )}
        </Box>
      </PortalDialog>

    </PortalShell>
    </ThemeProvider>
  );
};

export default BanksPortal;
