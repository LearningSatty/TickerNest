/**
 * Supabase JWT verification.
 *
 * Supports both:
 *   • HS256 — legacy Supabase projects, signed with the project JWT secret.
 *   • ES256 — new Supabase projects (rolled out 2024+), signed with an EC P-256
 *             private key; the matching JWK is fetched from the project's
 *             /auth/v1/.well-known/jwks.json.
 *
 * Pure module: clock injected, no implicit network IO.  The JWKS fetch is
 * delegated to a `keyResolver` argument so tests can stub it.
 *
 * Algorithm dispatch is driven by the JWT header's `alg`. We refuse `none`
 * and any alg we don't explicitly recognise — defence in depth.
 */
import { createHmac, createPublicKey, createVerify, timingSafeEqual, KeyObject } from 'node:crypto';

export interface JwtClaims {
  sub: string;
  email?: string;
  aud?: string;
  role?: string;
  exp?: number;
  nbf?: number;
}

interface JwtHeader {
  alg: string;
  typ?: string;
  kid?: string;
}

export interface Jwk {
  kty: string;
  alg?: string;
  crv?: string;
  x?: string;
  y?: string;
  n?: string;
  e?: string;
  kid?: string;
}

/** Caller supplies a way to look up a public key by kid (for ES256/RS256). */
export type KeyResolver = (kid: string) => Promise<Jwk | null>;

const b64urlDecode = (s: string): Buffer =>
  Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

// ─── HS256 (synchronous) ─────────────────────────────────────────────────────

export const verifyJwt = (
  token: string,
  secret: string,
  now: number = Math.floor(Date.now() / 1000),
): JwtClaims => {
  const { header, headerB64, payloadB64, sig } = decodeParts(token);
  if (header.alg !== 'HS256') throw new Error(`unsupported alg: ${header.alg}`);

  const expected = createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  if (
    expected.length !== sig.length ||
    !timingSafeEqual(expected, sig)
  ) {
    throw new Error('invalid signature');
  }
  return validateClaims(payloadB64, now);
};

// ─── HS256 + ES256 dispatch (async, for production paths) ────────────────────

export const verifyJwtAsync = async (
  token: string,
  opts: {
    hsSecret?: string;
    keyResolver?: KeyResolver;
    now?: number;
  },
): Promise<JwtClaims> => {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const { header, headerB64, payloadB64, sig } = decodeParts(token);

  if (header.alg === 'HS256') {
    if (!opts.hsSecret) throw new Error('HS256 token but no secret configured');
    const expected = createHmac('sha256', opts.hsSecret)
      .update(`${headerB64}.${payloadB64}`)
      .digest();
    if (
      expected.length !== sig.length ||
      !timingSafeEqual(expected, sig)
    ) {
      throw new Error('invalid signature');
    }
    return validateClaims(payloadB64, now);
  }

  if (header.alg === 'ES256') {
    if (!opts.keyResolver) throw new Error('ES256 token but no keyResolver configured');
    if (!header.kid) throw new Error('ES256 token missing kid header');
    const jwk = await opts.keyResolver(header.kid);
    if (!jwk) throw new Error(`no JWK matches kid ${header.kid}`);
    const pubKey = jwkToPublicKey(jwk);
    // node accepts the JOSE-flavoured 64-byte (r||s) signature directly when
    // using the `dsaEncoding: 'ieee-p1363'` option. Convert beforehand to DER.
    const der = joseSignatureToDer(sig);
    const ok = createVerify('sha256')
      .update(`${headerB64}.${payloadB64}`)
      .verify(pubKey, der);
    if (!ok) throw new Error('invalid signature');
    return validateClaims(payloadB64, now);
  }

  throw new Error(`unsupported alg: ${header.alg}`);
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function decodeParts(token: string): {
  header: JwtHeader;
  headerB64: string;
  payloadB64: string;
  sig: Buffer;
} {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed jwt');
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];
  const header = JSON.parse(b64urlDecode(headerB64).toString('utf8')) as JwtHeader;
  return { header, headerB64, payloadB64, sig: b64urlDecode(sigB64) };
}

function validateClaims(payloadB64: string, now: number): JwtClaims {
  const claims = JSON.parse(b64urlDecode(payloadB64).toString('utf8')) as JwtClaims;
  if (!claims.sub) throw new Error('missing sub claim');
  if (claims.exp != null && now >= claims.exp) throw new Error('jwt expired');
  if (claims.nbf != null && now < claims.nbf) throw new Error('jwt not yet valid');
  return claims;
}

function jwkToPublicKey(jwk: Jwk): KeyObject {
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') {
    throw new Error(`unsupported jwk kty=${jwk.kty} crv=${jwk.crv}`);
  }
  // Node accepts the JWK directly via createPublicKey({ key, format: 'jwk' }).
  // Cast through unknown — Node's typings expect a JsonWebKey but our Jwk is
  // structurally compatible.
  return createPublicKey({
    key: jwk as unknown as import('node:crypto').JsonWebKey,
    format: 'jwk',
  });
}

/** Convert JOSE 64-byte (r||s) signature → ASN.1 DER expected by Node's verify. */
function joseSignatureToDer(sig: Buffer): Buffer {
  if (sig.length !== 64) throw new Error(`ES256 signature must be 64 bytes, got ${sig.length}`);
  const r = trimLeadingZeros(sig.subarray(0, 32));
  const s = trimLeadingZeros(sig.subarray(32, 64));
  // DER: 0x30 <total-len> 0x02 <r-len> <r> 0x02 <s-len> <s>
  const total = 2 + r.length + 2 + s.length;
  const out = Buffer.alloc(2 + total);
  out[0] = 0x30;
  out[1] = total;
  out[2] = 0x02;
  out[3] = r.length;
  r.copy(out, 4);
  out[4 + r.length] = 0x02;
  out[5 + r.length] = s.length;
  s.copy(out, 6 + r.length);
  return out;
}

/** Trim leading zeros, but keep one byte if the high bit is set so DER reads
 *  the integer as positive. */
function trimLeadingZeros(buf: Buffer): Buffer {
  let i = 0;
  while (i < buf.length - 1 && buf[i] === 0x00) i++;
  let trimmed = buf.subarray(i);
  // If high bit is set, prepend 0x00 so DER doesn't interpret as negative.
  if (trimmed[0] !== undefined && (trimmed[0]! & 0x80) !== 0) {
    trimmed = Buffer.concat([Buffer.from([0x00]), trimmed]);
  }
  return trimmed;
}
