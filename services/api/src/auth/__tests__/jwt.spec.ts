import { createHmac, generateKeyPairSync, createSign, KeyObject } from 'node:crypto';
import { verifyJwt, verifyJwtAsync, Jwk } from '../jwt';

const b64url = (b: Buffer | string) =>
  Buffer.from(b)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const sign = (
  payload: Record<string, unknown>,
  secret: string,
  alg: 'HS256' | string = 'HS256',
): string => {
  const header = b64url(JSON.stringify({ alg, typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest();
  return `${header}.${body}.${b64url(sig)}`;
};

const SECRET = 'super-secret-12345678901234567890';

describe('verifyJwt (HS256, sync)', () => {
  it('accepts a valid HS256 token and returns claims', () => {
    const tok = sign(
      { sub: 'user-123', email: 'a@b.c', exp: 9999999999, role: 'authenticated' },
      SECRET,
    );
    const c = verifyJwt(tok, SECRET);
    expect(c.sub).toBe('user-123');
    expect(c.email).toBe('a@b.c');
    expect(c.role).toBe('authenticated');
  });

  it('rejects tokens signed with a different secret', () => {
    const tok = sign({ sub: 'u', exp: 9999999999 }, 'other');
    expect(() => verifyJwt(tok, SECRET)).toThrow(/invalid signature/);
  });

  it('rejects expired tokens', () => {
    const tok = sign({ sub: 'u', exp: 1000 }, SECRET);
    expect(() => verifyJwt(tok, SECRET, 5000)).toThrow(/expired/);
  });

  it('rejects nbf in the future', () => {
    const tok = sign({ sub: 'u', nbf: 9000 }, SECRET);
    expect(() => verifyJwt(tok, SECRET, 5000)).toThrow(/not yet valid/);
  });

  it('rejects unsupported algorithms (defence in depth against alg=none)', () => {
    const header = b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
    const body = b64url(JSON.stringify({ sub: 'u' }));
    const tok = `${header}.${body}.`;
    expect(() => verifyJwt(tok, SECRET)).toThrow(/unsupported alg/);
  });

  it('rejects malformed tokens (not three parts)', () => {
    expect(() => verifyJwt('aaa.bbb', SECRET)).toThrow(/malformed/);
  });

  it('rejects tokens missing a sub claim', () => {
    const tok = sign({ email: 'x' }, SECRET);
    expect(() => verifyJwt(tok, SECRET)).toThrow(/missing sub/);
  });
});

// ─── ES256 (async, real EC P-256 key) ────────────────────────────────────────

interface EcKeypair {
  privateKey: KeyObject;
  jwk: Jwk;
}

function makeEcKeypair(kid: string): EcKeypair {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pub = publicKey.export({ format: 'jwk' }) as Record<string, string>;
  const jwk: Jwk = {
    kty: 'EC',
    alg: 'ES256',
    crv: 'P-256',
    ...(pub['x'] !== undefined && { x: pub['x'] }),
    ...(pub['y'] !== undefined && { y: pub['y'] }),
    kid,
  };
  return { privateKey, jwk };
}

function signEs256(payload: Record<string, unknown>, kp: EcKeypair, kid: string): string {
  const header = b64url(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid }));
  const body = b64url(JSON.stringify(payload));
  const sigDer = createSign('sha256').update(`${header}.${body}`).sign(kp.privateKey);
  // Convert DER → JOSE 64-byte (r||s) format that JWT spec mandates.
  const jose = derToJose(sigDer);
  return `${header}.${body}.${b64url(jose)}`;
}

function derToJose(der: Buffer): Buffer {
  // ASN.1 DER: 0x30 <total> 0x02 <rLen> <r> 0x02 <sLen> <s>
  if (der[0] !== 0x30) throw new Error('not DER');
  let p = 2;
  if (der[p] !== 0x02) throw new Error('expected r INTEGER');
  const rLen = der[++p]!;
  p++;
  let r = der.subarray(p, p + rLen);
  p += rLen;
  if (der[p] !== 0x02) throw new Error('expected s INTEGER');
  const sLen = der[++p]!;
  p++;
  let s = der.subarray(p, p + sLen);
  // strip optional leading 0x00; left-pad to 32 bytes
  if (r[0] === 0x00) r = r.subarray(1);
  if (s[0] === 0x00) s = s.subarray(1);
  const out = Buffer.alloc(64);
  r.copy(out, 32 - r.length);
  s.copy(out, 64 - s.length);
  return out;
}

describe('verifyJwtAsync (ES256)', () => {
  it('accepts a valid ES256 token using a JWKS keyResolver', async () => {
    const kp = makeEcKeypair('kid-1');
    const tok = signEs256({ sub: 'user-x', email: 'x@y.z', exp: 9999999999 }, kp, 'kid-1');
    const claims = await verifyJwtAsync(tok, {
      keyResolver: async (k) => (k === 'kid-1' ? kp.jwk : null),
    });
    expect(claims.sub).toBe('user-x');
    expect(claims.email).toBe('x@y.z');
  });

  it('rejects ES256 tokens signed by a different key', async () => {
    const kpA = makeEcKeypair('kid-a');
    const kpB = makeEcKeypair('kid-b');
    // Sign with kpA but tag header with kid-b → resolver returns kpB → verify fails.
    const tok = signEs256({ sub: 'u', exp: 9999999999 }, kpA, 'kid-b');
    await expect(
      verifyJwtAsync(tok, {
        keyResolver: async (k) => (k === 'kid-b' ? kpB.jwk : null),
      }),
    ).rejects.toThrow(/invalid signature/);
  });

  it('rejects when the kid is not in the JWKS', async () => {
    const kp = makeEcKeypair('only-key');
    const tok = signEs256({ sub: 'u', exp: 9999999999 }, kp, 'unknown-kid');
    await expect(
      verifyJwtAsync(tok, {
        keyResolver: async (k) => (k === 'only-key' ? kp.jwk : null),
      }),
    ).rejects.toThrow(/no JWK matches/);
  });

  it('rejects ES256 tokens missing kid in the header', async () => {
    const kp = makeEcKeypair('kid-1');
    // Signing helper writes header with kid='', then body+sig.
    const header = b64url(JSON.stringify({ alg: 'ES256', typ: 'JWT' }));
    const body = b64url(JSON.stringify({ sub: 'u', exp: 9999999999 }));
    const sigDer = createSign('sha256').update(`${header}.${body}`).sign(kp.privateKey);
    const jose = derToJose(sigDer);
    const tok = `${header}.${body}.${b64url(jose)}`;
    await expect(
      verifyJwtAsync(tok, {
        keyResolver: async () => kp.jwk,
      }),
    ).rejects.toThrow(/missing kid/);
  });

  it('rejects expired ES256 tokens', async () => {
    const kp = makeEcKeypair('kid-x');
    const tok = signEs256({ sub: 'u', exp: 1000 }, kp, 'kid-x');
    await expect(
      verifyJwtAsync(tok, {
        keyResolver: async () => kp.jwk,
        now: 5000,
      }),
    ).rejects.toThrow(/expired/);
  });

  it('still verifies HS256 tokens through the async path', async () => {
    const tok = sign({ sub: 'hs-user', exp: 9999999999 }, SECRET);
    const c = await verifyJwtAsync(tok, { hsSecret: SECRET });
    expect(c.sub).toBe('hs-user');
  });
});
