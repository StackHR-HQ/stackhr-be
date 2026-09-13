import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { KeyProvider } from './key-provider.interface';

@Injectable()
export class EnvKeyProvider implements KeyProvider {
  private keyBuffer: Buffer | null = null;

  async getKey(): Promise<Buffer> {
    if (this.keyBuffer) {
      return Promise.resolve(this.keyBuffer);
    }

    const rawKey =
      process.env.ENCRYPTION_KEY ??
      process.env.AUTH_SECRET ??
      'default-development-encryption-key-32bytes!';

    this.keyBuffer = createHash('sha256').update(rawKey).digest();
    return Promise.resolve(this.keyBuffer);
  }
}
