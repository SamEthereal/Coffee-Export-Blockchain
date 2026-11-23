/**
 * Ethiopian Coffee Export Consortium Blockchain System (CECBS)
 * IPFS Service (Hybrid Decentralized Storage with Graceful Fallback)
 *
 * Communicates with Kubo IPFS RPC API (/api/v0) using standard HTTP requests.
 * Zero external client dependencies; resilient against offline daemons, slow
 * network timeouts, and local test runners.
 */

import http from 'http';
import https from 'https';
import crypto from 'crypto';
import path from 'path';

// Resilient logger resolution: use application winston logger when available, console as fallback
let logger: { info: (msg: string, ...args: any[]) => void; warn: (msg: string, ...args: any[]) => void; error: (msg: string, ...args: any[]) => void } = console;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const loggerModule = require('../utils/logger');
  if (loggerModule && (loggerModule.logger || loggerModule.default)) {
    logger = loggerModule.logger || loggerModule.default;
  }
} catch {
  logger = console;
}

export interface IpfsUploadResult {
  success: boolean;
  cid?: string;
  size?: number;
  error?: string;
}

export interface IpfsStatus {
  enabled: boolean;
  available: boolean;
  apiUrl: string;
  gatewayUrl: string;
  version?: string;
  peerId?: string;
}

export class IpfsService {
  private static instance: IpfsService;

  private enabled: boolean;
  private host: string;
  private port: number;
  private protocol: string;
  private gatewayUrl: string;
  private timeoutMs: number;

  // Cache availability check for a short window to avoid spamming the daemon
  private lastAvailabilityCheck: number = 0;
  private cachedAvailability: boolean = false;
  private readonly availabilityCacheTtlMs: number = 15000; // 15 seconds

  private constructor() {
    this.enabled = process.env.USE_IPFS !== 'false' && process.env.IPFS_ENABLED !== 'false';
    this.host = process.env.IPFS_HOST || '127.0.0.1';
    this.port = parseInt(process.env.IPFS_PORT || '5001', 10);
    this.protocol = (process.env.IPFS_PROTOCOL || 'http').toLowerCase();
    
    // Gateway URL for external browser/viewer links
    const rawGateway = process.env.IPFS_GATEWAY || 'http://localhost:8080/ipfs/';
    this.gatewayUrl = rawGateway.endsWith('/') ? rawGateway : `${rawGateway}/`;
    
    this.timeoutMs = parseInt(process.env.IPFS_TIMEOUT_MS || '4000', 10);

    logger.info(`[IPFS] Initialized IpfsService (enabled=${this.enabled}, target=${this.protocol}://${this.host}:${this.port}, gateway=${this.gatewayUrl})`);
  }

  public static getInstance(): IpfsService {
    if (!IpfsService.instance) {
      IpfsService.instance = new IpfsService();
    }
    return IpfsService.instance;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public getGatewayUrl(cid: string): string {
    if (!cid) return '';
    const cleanCid = cid.trim();
    return `${this.gatewayUrl}${cleanCid}`;
  }

  /**
   * Healthcheck to see if the IPFS Kubo daemon is online and responding.
   */
  public async isAvailable(forceCheck = false): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    const now = Date.now();
    if (!forceCheck && now - this.lastAvailabilityCheck < this.availabilityCacheTtlMs) {
      return this.cachedAvailability;
    }

    try {
      const response = await this.sendRpcRequest('/api/v0/version', 'POST', null, 2000);
      const isOk = response.statusCode >= 200 && response.statusCode < 300;
      this.cachedAvailability = isOk;
      this.lastAvailabilityCheck = now;
      return isOk;
    } catch {
      this.cachedAvailability = false;
      this.lastAvailabilityCheck = now;
      return false;
    }
  }

  /**
   * Uploads a file buffer to IPFS Kubo via /api/v0/add.
   * Graceful fallback: If IPFS is offline or errors, returns { success: false, error: ... }
   * without throwing, allowing callers to fall back to local disk storage seamlessly.
   */
  public async uploadFile(fileBuffer: Buffer, fileName: string): Promise<IpfsUploadResult> {
    if (!this.enabled) {
      return { success: false, error: 'IPFS storage is disabled in configuration' };
    }

    // Fast check: verify daemon is alive
    const available = await this.isAvailable();
    if (!available) {
      logger.warn(`[IPFS] Kubo daemon is not reachable at ${this.protocol}://${this.host}:${this.port}; falling back to local storage`);
      return { success: false, error: 'IPFS daemon unreachable' };
    }

    try {
      const sanitizedFilename = path.basename(fileName || 'document.bin');
      const boundary = `----WebKitFormBoundary${crypto.randomBytes(16).toString('hex')}`;
      
      const header = Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${sanitizedFilename}"\r\n` +
        `Content-Type: application/octet-stream\r\n\r\n`
      );
      const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
      const body = Buffer.concat([header, fileBuffer, footer]);

      const headers = {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length.toString(),
      };

      const result = await this.sendRpcRequest(
        '/api/v0/add?pin=true&wrap-with-directory=false',
        'POST',
        body,
        this.timeoutMs,
        headers
      );

      if (result.statusCode < 200 || result.statusCode >= 300) {
        throw new Error(`Kubo responded with status ${result.statusCode}: ${result.body.toString('utf8')}`);
      }

      // /api/v0/add returns JSON, potentially newline-delimited if multiple chunks
      const lines = result.body.toString('utf8').trim().split('\n');
      const lastLine = lines[lines.length - 1];
      const parsed = JSON.parse(lastLine);

      const cid = parsed.Hash || parsed.cid;
      const size = parsed.Size ? parseInt(parsed.Size, 10) : fileBuffer.length;

      if (!cid) {
        throw new Error(`Kubo response did not contain a valid Hash (CID): ${result.body.toString('utf8')}`);
      }

      logger.info(`[IPFS] Successfully pinned ${sanitizedFilename} to IPFS -> CID: ${cid} (${size} bytes)`);
      return {
        success: true,
        cid,
        size
      };
    } catch (err: any) {
      logger.warn(`[IPFS] Upload failed for ${fileName}: ${err.message}. Gracefully continuing without IPFS.`);
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Retrieves a file from IPFS by CID via /api/v0/cat.
   * Returns Buffer if found, or null if missing/failed.
   */
  public async downloadFile(cid: string): Promise<Buffer | null> {
    if (!this.enabled || !cid) {
      return null;
    }

    const cleanCid = cid.trim();

    try {
      const result = await this.sendRpcRequest(
        `/api/v0/cat?arg=${encodeURIComponent(cleanCid)}`,
        'POST',
        null,
        this.timeoutMs * 2 // Give download a bit more time
      );

      if (result.statusCode >= 200 && result.statusCode < 300) {
        return result.body;
      }

      logger.warn(`[IPFS] Failed to cat CID ${cleanCid}: HTTP ${result.statusCode}`);
      return null;
    } catch (err: any) {
      logger.warn(`[IPFS] Download error for CID ${cleanCid}: ${err.message}`);
      return null;
    }
  }

  /**
   * Diagnostic summary of the IPFS subsystem
   */
  public async getStatus(): Promise<IpfsStatus> {
    const status: IpfsStatus = {
      enabled: this.enabled,
      available: false,
      apiUrl: `${this.protocol}://${this.host}:${this.port}`,
      gatewayUrl: this.gatewayUrl,
    };

    if (!this.enabled) {
      return status;
    }

    try {
      const res = await this.sendRpcRequest('/api/v0/version', 'POST', null, 2500);
      if (res.statusCode >= 200 && res.statusCode < 300) {
        status.available = true;
        const parsed = JSON.parse(res.body.toString('utf8'));
        status.version = parsed.Version || parsed.version;
      }
    } catch {
      status.available = false;
    }

    return status;
  }

  /**
   * Low-level helper to send an HTTP request to the Kubo RPC API
   */
  private sendRpcRequest(
    endpoint: string,
    method: 'GET' | 'POST' = 'POST',
    data: Buffer | null = null,
    timeoutMs: number = 4000,
    extraHeaders: Record<string, string> = {}
  ): Promise<{ statusCode: number; body: Buffer }> {
    return new Promise((resolve, reject) => {
      const isHttps = this.protocol === 'https';
      const client = isHttps ? https : http;

      const options: http.RequestOptions = {
        hostname: this.host,
        port: this.port,
        path: endpoint,
        method,
        timeout: timeoutMs,
        headers: {
          ...extraHeaders,
        },
      };

      const req = client.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 500,
            body: Buffer.concat(chunks),
          });
        });
      });

      req.on('timeout', () => {
        req.destroy(new Error(`IPFS request to ${endpoint} timed out after ${timeoutMs}ms`));
      });

      req.on('error', (err) => {
        reject(err);
      });

      if (data && data.length > 0) {
        req.write(data);
      }
      req.end();
    });
  }
}

export default IpfsService.getInstance();
