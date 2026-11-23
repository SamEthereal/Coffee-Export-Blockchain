/**
 * Real Blockchain Signature Service (Facade)
 * Backwards-compatible adapter delegating to unified SignatureService
 */

import { SignatureService, BlockchainTransactionSignature } from './signatureService';

export { BlockchainTransactionSignature };

export class RealBlockchainSignatureService {
  public static getInstance(): SignatureService {
    return SignatureService.getInstance();
  }
}

export default RealBlockchainSignatureService;
