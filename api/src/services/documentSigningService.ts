/**
 * Document Signing Service (Facade)
 * Backwards-compatible adapter delegating to unified SignatureService
 */

import { SignatureService, DocumentSigningOptions } from './signatureService';

export { DocumentSigningOptions };

export const signDocumentFile = (options: DocumentSigningOptions) =>
  SignatureService.getInstance().signDocumentFile(options);

export const persistDocumentLedgerProof = (
  database: any,
  signatureId: string,
  documentId: string,
  documentHash: string,
  detachedSignatureCreated: boolean,
  txId: string
) =>
  SignatureService.getInstance().persistDocumentLedgerProof(
    signatureId,
    documentId,
    documentHash,
    detachedSignatureCreated,
    txId,
    database
  );

export default {
  signDocumentFile,
  persistDocumentLedgerProof,
};
