/**
 * AES-256-GCM column encryption for PII (broker.client_id_enc / demat / dp_id;
 * personal_vault.ciphertext).
 *
 * KEY MANAGEMENT:
 *   - The wrapping key (KEK) lives in Supabase Vault.
 *   - Per-record we generate a random 12-byte IV and a 32-byte DEK; the DEK
 *     is wrapped with the KEK (Vault.encrypt) — wrapped DEK is stored in
 *     `kms_key_id` (a Vault secret reference).
 *   - This module is the ONLY place plaintext PII is handled.
 *
 * For MVP simplicity, the `EncryptedField` shape stores `iv || ciphertext ||
 * authTag` concatenated; the bytea column is one blob. Matches the schema
 * (`ciphertext bytea`, `iv bytea`).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

export interface EncryptedField {
  iv: Buffer;
  ciphertext: Buffer; // ciphertext + auth tag concatenated (last TAG_LEN bytes)
}

const assertKey = (key: Buffer) => {
  if (key.length !== KEY_LEN)
    throw new Error(`key must be ${KEY_LEN} bytes, got ${key.length}`);
};

export const encryptPii = (
  plaintext: string,
  key: Buffer,
): EncryptedField => {
  assertKey(key);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return { iv, ciphertext: Buffer.concat([enc, tag]) };
};

export const decryptPii = (field: EncryptedField, key: Buffer): string => {
  assertKey(key);
  if (field.iv.length !== IV_LEN)
    throw new Error(`iv must be ${IV_LEN} bytes`);
  if (field.ciphertext.length < TAG_LEN)
    throw new Error('ciphertext too short to contain auth tag');
  const tag = field.ciphertext.subarray(field.ciphertext.length - TAG_LEN);
  const enc = field.ciphertext.subarray(0, field.ciphertext.length - TAG_LEN);
  const decipher = createDecipheriv(ALG, key, field.iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
    'utf8',
  );
};
