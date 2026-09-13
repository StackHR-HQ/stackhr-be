import * as argon2 from 'argon2';

describe('Password Hashing (argon2id - ADR-008)', () => {
  it('should generate argon2id hashes', async () => {
    const password = 'SuperSecurePassword123!';
    const hash = await argon2.hash(password, { type: argon2.argon2id });

    expect(hash).toContain('$argon2id$');
    const isValid = await argon2.verify(hash, password);
    expect(isValid).toBe(true);
  });

  it('should reject incorrect password', async () => {
    const password = 'SuperSecurePassword123!';
    const hash = await argon2.hash(password, { type: argon2.argon2id });

    const isValid = await argon2.verify(hash, 'WrongPassword123!');
    expect(isValid).toBe(false);
  });
});
