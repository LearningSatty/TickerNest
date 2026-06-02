/**
 * Diagnose why a JWT is being rejected.
 *
 * Usage:
 *   1. In the browser DevTools console, run:
 *        copy(sessionStorage.getItem('tn:jwt'))
 *      That puts the JWT on your clipboard.
 *   2. Paste it after `--token=`:
 *        npx ts-node src/scripts/debug-jwt.ts --token=<paste>
 *   3. Or set SUPABASE_URL in env and pipe the token via stdin:
 *        echo "<jwt>" | npx ts-node src/scripts/debug-jwt.ts
 *
 * The script prints the header, claims, JWKS, and verification result.
 * No external services touched besides the Supabase JWKS endpoint.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifyJwtAsync } from '../auth/jwt';

// load .env if present
function loadDotEnv() {
  const envPath = join(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) process.env[key] = val;
  }
}
loadDotEnv();

async function main() {
  // Read token
  let tok = '';
  const arg = process.argv.find((a) => a.startsWith('--token='));
  if (arg) tok = arg.slice('--token='.length);
  if (!tok && !process.stdin.isTTY) {
    tok = await new Promise((resolve) => {
      let buf = '';
      process.stdin.on('data', (chunk) => (buf += chunk.toString()));
      process.stdin.on('end', () => resolve(buf.trim()));
    });
  }
  if (!tok) {
    console.error('Pass --token=<jwt> or pipe JWT via stdin');
    process.exit(1);
  }

  // 1. Decode header + claims locally
  const parts = tok.split('.');
  if (parts.length !== 3) {
    console.error('Token is malformed — expected three "."-separated parts');
    process.exit(1);
  }
  const [headerB64, payloadB64] = parts;
  const decode = (s: string) =>
    Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  const header = JSON.parse(decode(headerB64!));
  const claims = JSON.parse(decode(payloadB64!));

  console.log('────────  Header  ────────');
  console.log(JSON.stringify(header, null, 2));
  console.log('────────  Claims  ────────');
  console.log(JSON.stringify(claims, null, 2));
  console.log('expires:', claims.exp ? new Date(claims.exp * 1000).toISOString() : '(no exp)');
  console.log('now    :', new Date().toISOString());

  // 2. Fetch JWKS if ES256
  if (header.alg === 'ES256') {
    const url = process.env['SUPABASE_URL'];
    if (!url) {
      console.error('\n❌ SUPABASE_URL not set in env or .env');
      process.exit(1);
    }
    const jwksUrl = `${url.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`;
    console.log('\n────────  Fetching JWKS  ────────');
    console.log('GET', jwksUrl);
    const res = await fetch(jwksUrl);
    if (!res.ok) {
      console.error(`❌ JWKS fetch failed: HTTP ${res.status}`);
      process.exit(1);
    }
    const body = (await res.json()) as { keys: { kid?: string; alg?: string; kty?: string }[] };
    console.log(`Got ${body.keys.length} key(s):`);
    for (const k of body.keys) {
      console.log(`   kid=${k.kid} alg=${k.alg} kty=${k.kty}`);
    }
    const matched = body.keys.find((k) => k.kid === header.kid);
    if (!matched) {
      console.error(`❌ JWKS does NOT contain a key with kid=${header.kid}`);
      console.error('   Likely: token was signed before key rotation. Sign out + sign in again.');
      process.exit(1);
    }
    console.log(`✅ Found matching kid=${header.kid}`);

    // 3. Try full verification
    console.log('\n────────  Verifying  ────────');
    try {
      const verified = await verifyJwtAsync(tok, {
        keyResolver: async (kid) => body.keys.find((k) => k.kid === kid) as never ?? null,
      });
      console.log('✅ Token VERIFIED — sub:', verified.sub);
    } catch (e) {
      console.error('❌ Verification failed:', (e as Error).message);
      process.exit(1);
    }
  } else if (header.alg === 'HS256') {
    const sec = process.env['SUPABASE_JWT_SECRET'];
    if (!sec) {
      console.error('❌ HS256 token but SUPABASE_JWT_SECRET not set');
      process.exit(1);
    }
    try {
      const verified = await verifyJwtAsync(tok, { hsSecret: sec });
      console.log('✅ Token VERIFIED — sub:', verified.sub);
    } catch (e) {
      console.error('❌ Verification failed:', (e as Error).message);
      process.exit(1);
    }
  } else {
    console.error('❌ Unsupported alg:', header.alg);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Script error:', e);
  process.exit(1);
});
