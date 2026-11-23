/**
 * Blockchain Signature Service (Facade)
 * Backwards-compatible adapter delegating to unified SignatureService
 */

import { SignatureService, BlockchainSignatureData } from './signatureService';

export { BlockchainSignatureData };

export class BlockchainSignatureService {
  public static getInstance(): SignatureService {
    return SignatureService.getInstance();
  }
}

export default BlockchainSignatureService;
