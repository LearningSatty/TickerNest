import { randomBytes } from 'node:crypto';
import { encryptPii, decryptPii } from '../crypto';

const key = () => randomBytes(32);

describe('PII column encryption (AES-256-GCM)', () => {
  it('roundtrips a value', () => {
    const k = key();
    const enc = encryptPii('PAN-ABCDE1234F', k);
    expect(decryptPii(enc, k)).toBe('PAN-ABCDE1234F');
  });

  it('rejects a wrong key (auth tag mismatch)', () => {
    const enc = encryptPii('TPIN-987654', key());
    expect(() => decryptPii(enc, key())).toThrow();
  });

  it('rejects ciphertext tampering (bit flip)', () => {
    const k = key();
    const enc = encryptPii('NOMINEE-Jane Doe', k);
    enc.ciphertext[0] = (enc.ciphertext[0]! ^ 0x80) & 0xff;
    expect(() => decryptPii(enc, k)).toThrow();
  });

  it('rejects IV tampering', () => {
    const k = key();
    const enc = encryptPii('DEMAT-1234567890', k);
    enc.iv[0] = (enc.iv[0]! ^ 0x80) & 0xff;
    expect(() => decryptPii(enc, k)).toThrow();
  });

  it('two encryptions of the same plaintext produce different ciphertexts (random IV)', () => {
    const k = key();
    const a = encryptPii('same-value', k);
    const b = encryptPii('same-value', k);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(a.iv.equals(b.iv)).toBe(false);
  });

  it('rejects keys of the wrong length', () => {
    const tooShort = randomBytes(16);
    expect(() => encryptPii('x', tooShort)).toThrow(/32 bytes/);
  });

  it('rejects truncated ciphertext (no auth tag possible)', () => {
    const k = key();
    const enc = encryptPii('x', k);
    enc.ciphertext = Buffer.alloc(8); // shorter than 16-byte tag
    expect(() => decryptPii(enc, k)).toThrow(/auth tag/);
  });
});
