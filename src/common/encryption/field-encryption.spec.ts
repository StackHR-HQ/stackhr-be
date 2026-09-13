import { FieldEncryptionService } from './field-encryption.service';
import { EnvKeyProvider } from './env-key-provider';
import type { KeyProvider } from './key-provider.interface';

describe('FieldEncryptionService (AES-256-GCM - ADR-010)', () => {
  let service: FieldEncryptionService;
  let keyProvider: EnvKeyProvider;

  beforeEach(() => {
    keyProvider = new EnvKeyProvider();
    service = new FieldEncryptionService(keyProvider);
  });

  it('should encrypt plaintext into versioned ciphertext format', async () => {
    const plaintext = 'Secret Salary 1500000 NGN';
    const ciphertext = await service.encrypt(plaintext);

    expect(ciphertext).toBeDefined();
    expect(ciphertext).not.toBe(plaintext);
    expect(ciphertext.startsWith('enc:v1:')).toBe(true);
  });

  it('should decrypt ciphertext back to original plaintext', async () => {
    const originalText = 'Account Number 0123456789';
    const ciphertext = await service.encrypt(originalText);
    const decryptedText = await service.decrypt(ciphertext);

    expect(decryptedText).toBe(originalText);
  });

  it('should return unencrypted string unchanged (legacy compatibility)', async () => {
    const plainText = 'Unencrypted legacy string';
    const result = await service.decrypt(plainText);

    expect(result).toBe(plainText);
  });

  it('should throw error when decrypting tampered ciphertext', async () => {
    const ciphertext = await service.encrypt('Sensitive Data');
    const tampered = ciphertext.slice(0, -4) + 'AAAA';

    await expect(service.decrypt(tampered)).rejects.toThrow();
  });

  it('should work with custom KeyProvider implementation', async () => {
    class CustomMockKeyProvider implements KeyProvider {
      async getKey(): Promise<Buffer> {
        return Promise.resolve(Buffer.from('12345678901234567890123456789012')); // 32 bytes
      }
    }

    const customService = new FieldEncryptionService(
      new CustomMockKeyProvider(),
    );
    const original = 'Tax Identification Number 987654321';
    const encrypted = await customService.encrypt(original);
    const decrypted = await customService.decrypt(encrypted);

    expect(decrypted).toBe(original);
  });
});
