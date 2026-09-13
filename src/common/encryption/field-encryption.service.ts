import { Inject, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { KeyProvider } from './key-provider.interface';

export const KEY_PROVIDER = 'KEY_PROVIDER';

@Injectable()
export class FieldEncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly ivLength = 12;
  private readonly tagLength = 16;

  constructor(
    @Inject(KEY_PROVIDER) private readonly keyProvider: KeyProvider,
  ) {}

  async encrypt(plaintext: string): Promise<string> {
    if (!plaintext) {
      return plaintext;
    }

    const key = await this.keyProvider.getKey();
    const iv = randomBytes(this.ivLength);
    const cipher = createCipheriv(this.algorithm, key, iv, {
      authTagLength: this.tagLength,
    });

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    return [
      'enc:v1',
      iv.toString('base64url'),
      authTag.toString('base64url'),
      Buffer.from(encrypted, 'base64').toString('base64url'),
    ].join(':');
  }

  async decrypt(ciphertext: string): Promise<string> {
    if (!ciphertext || !ciphertext.startsWith('enc:v1:')) {
      return ciphertext;
    }

    const [, version, ivBase64, tagBase64, encryptedBase64] =
      ciphertext.split(':');

    if (version !== 'v1' || !ivBase64 || !tagBase64 || !encryptedBase64) {
      throw new Error('Invalid ciphertext format');
    }

    const key = await this.keyProvider.getKey();
    const iv = Buffer.from(ivBase64, 'base64url');
    const authTag = Buffer.from(tagBase64, 'base64url');
    const encryptedText = Buffer.from(encryptedBase64, 'base64url').toString(
      'base64',
    );

    const decipher = createDecipheriv(this.algorithm, key, iv, {
      authTagLength: this.tagLength,
    });
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedText, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
