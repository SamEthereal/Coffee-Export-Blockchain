/**
 * LC Document Requirements Configuration
 * Based on UCP 600 (Uniform Customs and Practice for Documentary Credits)
 * International Chamber of Commerce standards for LC compliance
 * 
 * Reference: [Content rephrased for compliance with licensing restrictions]
 * - UCP 600 governs documentary credits globally
 * - Banks examine documents strictly per LC terms
 * - Non-conforming documents can be refused
 * 
 * Sources:
 * - https://www.greengubregroup.com/lesson-17-lc-documentation-bank-compliance
 * - https://www.itechguides.com/what-documents-do-banks-require-for-a-documentary-credit/
 */

export interface LCDocumentRequirement {
  documentType: string;
  required: boolean;
  stage: 'APPROVAL' | 'ISSUANCE' | 'PAYMENT_RELEASE';
  description: string;
  validationRules: string[];
  category: 'FINANCIAL' | 'TRANSPORT' | 'QUALITY' | 'LEGAL' | 'TRADE';
}

/**
 * Mandatory documents required at each LC stage
 * 
 * APPROVAL Stage: Bank reviews contract and trade terms before approving LC request
 * ISSUANCE Stage: Bank issues LC to advising bank after approval
 * PAYMENT_RELEASE Stage: Bank releases payment when compliant documents are presented
 */
export const LC_DOCUMENT_REQUIREMENTS: Record<string, LCDocumentRequirement[]> = {
  
  // === STAGE 1: LC APPROVAL (Before LC is issued) ===
  APPROVAL: [
    {
      documentType: 'SALES_CONTRACT',
      required: true,
      stage: 'APPROVAL',
      description: 'Signed sales contract between buyer and seller',
      validationRules: [
        'Must be signed by both parties',
        'Must contain buyer and seller details',
        'Must specify quantity, price, and coffee type',
        'Must include payment terms',
        'Must include delivery terms (Incoterm)',
      ],
      category: 'LEGAL',
    },
    {
      documentType: 'PROFORMA_INVOICE',
      required: true,
      stage: 'APPROVAL',
      description: 'Proforma invoice showing estimated costs',
      validationRules: [
        'Must match contract value',
        'Must show breakdown of costs',
        'Must include exporter and buyer details',
        'Must specify currency',
      ],
      category: 'FINANCIAL',
    },
    {
      documentType: 'CERTIFICATE_OF_ORIGIN',
      required: true,
      stage: 'APPROVAL',
      description: 'Certificate proving coffee origin (Ethiopia)',
      validationRules: [
        'Must be issued by Chamber of Commerce or authorized body',
        'Must show country of origin as Ethiopia',
        'Must include HS code',
        'Must match contract description',
      ],
      category: 'TRADE',
    },
    {
      documentType: 'ICO_CERTIFICATE',
      required: true,
      stage: 'APPROVAL',
      description: 'International Coffee Organization certificate',
      validationRules: [
        'Must be valid ICO certificate',
        'Must match quantity in contract',
        'Must show coffee grade and type',
      ],
      category: 'QUALITY',
    },
    {
      documentType: 'QUALITY_CERTIFICATE',
      required: true,
      stage: 'APPROVAL',
      description: 'Quality and grading certificate',
      validationRules: [
        'Must be from authorized testing lab',
        'Must include cupping score if applicable',
        'Must confirm coffee grade matches contract',
        'Must include moisture content and defect count',
      ],
      category: 'QUALITY',
    },
  ],

  // === STAGE 2: LC ISSUANCE (Documents needed for bank to issue LC) ===
  ISSUANCE: [
    {
      documentType: 'EXPORTER_LICENSE',
      required: true,
      stage: 'ISSUANCE',
      description: 'Valid exporter license from ECTA',
      validationRules: [
        'License must be active (not suspended/revoked)',
        'Must match exporter ID',
        'Must be within validity period',
      ],
      category: 'LEGAL',
    },
    {
      documentType: 'CONTRACT_APPROVAL',
      required: true,
      stage: 'ISSUANCE',
      description: 'ECTA approval of the sales contract',
      validationRules: [
        'Contract status must be APPROVED',
        'Approval must be from authorized ECTA official',
        'Must have blockchain verification',
      ],
      category: 'LEGAL',
    },
    {
      documentType: 'FOREX_ALLOCATION',
      required: false,
      stage: 'ISSUANCE',
      description: 'NBE forex allocation (if LC payment method)',
      validationRules: [
        'Allocation must be for this specific contract',
        'Amount must match or exceed LC value',
        'Must be in ALLOCATED status',
      ],
      category: 'FINANCIAL',
    },
  ],

  // === STAGE 3: PAYMENT RELEASE (Documents for bank to release payment) ===
  PAYMENT_RELEASE: [
    {
      documentType: 'COMMERCIAL_INVOICE',
      required: true,
      stage: 'PAYMENT_RELEASE',
      description: 'Final commercial invoice',
      validationRules: [
        'Must match LC amount (within tolerance if specified)',
        'Must be signed by beneficiary',
        'Description must match LC exactly',
        'All names must match LC spelling exactly',
        'Must show LC number',
      ],
      category: 'FINANCIAL',
    },
    {
      documentType: 'BILL_OF_LADING',
      required: true,
      stage: 'PAYMENT_RELEASE',
      description: 'Transport document (B/L or Air Waybill)',
      validationRules: [
        'Must be within shipment date window specified in LC',
        'Port of loading must match LC',
        'Port of discharge must match LC',
        'Consignee must match LC',
        'Must be clean (no damage remarks)',
        'Date must be within presentation period (typically 21 days)',
      ],
      category: 'TRANSPORT',
    },
    {
      documentType: 'PACKING_LIST',
      required: true,
      stage: 'PAYMENT_RELEASE',
      description: 'Detailed packing list',
      validationRules: [
        'Must match quantity on invoice',
        'Packaging must match LC requirements (e.g., 60kg bags)',
        'Gross and net weight must be specified',
        'Number of packages must match',
      ],
      category: 'TRANSPORT',
    },
    {
      documentType: 'INSPECTION_CERTIFICATE',
      required: true,
      stage: 'PAYMENT_RELEASE',
      description: 'Pre-shipment inspection certificate (SGS/BV/equivalent)',
      validationRules: [
        'Must be from recognized inspection company',
        'Must confirm goods match contract description',
        'Must include quality parameters',
        'Date must be before or on shipment date',
      ],
      category: 'QUALITY',
    },
    {
      documentType: 'INSURANCE_CERTIFICATE',
      required: true,
      stage: 'PAYMENT_RELEASE',
      description: 'Marine/cargo insurance certificate',
      validationRules: [
        'Coverage must be at least 110% of CIF value (if CIF term)',
        'Must cover specified risks',
        'Must be in currency of LC',
        'Beneficiary must be as per LC',
        'Coverage period must include transport',
      ],
      category: 'FINANCIAL',
    },
    {
      documentType: 'PHYTOSANITARY_CERTIFICATE',
      required: true,
      stage: 'PAYMENT_RELEASE',
      description: 'Plant health certificate',
      validationRules: [
        'Must be issued by Ministry of Agriculture or authorized body',
        'Must certify coffee is free from pests and diseases',
        'Must include treatment details if applicable',
        'Must be within validity period',
      ],
      category: 'QUALITY',
    },
    {
      documentType: 'CUSTOMS_DECLARATION',
      required: true,
      stage: 'PAYMENT_RELEASE',
      description: 'Export customs clearance',
      validationRules: [
        'Must show customs clearance completed',
        'HS code must match',
        'Value must match commercial invoice',
        'Must be stamped by customs authority',
      ],
      category: 'LEGAL',
    },
  ],
};

/**
 * Get required documents for a specific LC stage
 */
export function getRequiredDocuments(stage: 'APPROVAL' | 'ISSUANCE' | 'PAYMENT_RELEASE'): LCDocumentRequirement[] {
  return LC_DOCUMENT_REQUIREMENTS[stage] || [];
}

/**
 * Get all mandatory documents across all stages
 */
export function getAllMandatoryDocuments(): LCDocumentRequirement[] {
  return Object.values(LC_DOCUMENT_REQUIREMENTS)
    .flat()
    .filter(doc => doc.required);
}

/**
 * Check if document set meets requirements for a stage
 */
export function validateDocumentsForStage(
  stage: 'APPROVAL' | 'ISSUANCE' | 'PAYMENT_RELEASE',
  availableDocuments: string[]
): {
  isValid: boolean;
  missingRequired: string[];
  availableOptional: string[];
} {
  const required = getRequiredDocuments(stage);
  const mandatoryDocs = required.filter(doc => doc.required);
  
  const missingRequired = mandatoryDocs
    .filter(req => !availableDocuments.includes(req.documentType))
    .map(doc => doc.documentType);
  
  const optionalDocs = required.filter(doc => !doc.required);
  const availableOptional = optionalDocs
    .filter(opt => availableDocuments.includes(opt.documentType))
    .map(doc => doc.documentType);
  
  return {
    isValid: missingRequired.length === 0,
    missingRequired,
    availableOptional,
  };
}

/**
 * Common LC discrepancies that cause rejection (from UCP 600 practice)
 */
export const COMMON_LC_DISCREPANCIES = [
  'Misspelled names (even one character)',
  'Wrong Incoterm or missing location',
  'Bill of Lading date not within shipment window',
  'Different product description from LC',
  'Missing or incorrect HS code',
  'Missing stamp or signature on required documents',
  'Quantity mismatch between documents',
  'Incorrect packaging details',
  'Wrong number of document copies',
  'Documents presented after presentation period',
  'Incorrect insurance coverage amount',
  'Wrong consignee or notify party on B/L',
];

/**
 * Document categories for UI grouping
 */
export const DOCUMENT_CATEGORIES = {
  FINANCIAL: 'Financial Documents',
  TRANSPORT: 'Transport Documents',
  QUALITY: 'Quality & Certification Documents',
  LEGAL: 'Legal & Regulatory Documents',
  TRADE: 'Trade Documents',
};
