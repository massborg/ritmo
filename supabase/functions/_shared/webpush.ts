// Web Push with only the standard Web Crypto API (no libraries): message encryption (RFC 8291, aes128gcm,
// RFC 8188) and the server's signed identity (VAPID, RFC 8292). Push services (Apple, Google, Mozilla, Microsoft)
// only ever see the encrypted message. No Deno-specific code, so the unit tests run it in Node too.

const enc = new TextEncoder();
type Bytes = Uint8Array<ArrayBuffer>;
export const b64u = (b: Bytes) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64u = (s: string): Bytes => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const concat = (...xs: Bytes[]) => { const out = new Uint8Array(xs.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of xs) { out.set(x, i); i += x.length; } return out; };
const subtle = () => globalThis.crypto.subtle;

async function hmac(key: Bytes, data: Bytes): Promise<Bytes> {
  const k = await subtle().importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await subtle().sign('HMAC', k, data));
}

/** A P-256 key pair as base64url: public is the 65-byte uncompressed point, private the 32-byte scalar. */
export interface KeyPair { publicKey: string; privateKey: string }

export async function generateKeyPair(): Promise<KeyPair> {
  const k = await subtle().generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const raw = new Uint8Array(await subtle().exportKey('raw', k.publicKey));
  const jwk = await subtle().exportKey('jwk', k.privateKey);
  return { publicKey: b64u(raw), privateKey: jwk.d! };
}

function jwkFor(pair: KeyPair) {
  const pub = unb64u(pair.publicKey);
  return { kty: 'EC', crv: 'P-256', x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), d: pair.privateKey, ext: true };
}

/**
 * Encrypt a message for one browser subscription (RFC 8291). salt and the sender's one-time key are random;
 * they can be given for testing against the RFC's worked example.
 */
export async function encrypt(plaintext: Bytes, uaPublic: string, authSecret: string, fixed?: { salt: Bytes; local: KeyPair }): Promise<Bytes> {
  const ua = unb64u(uaPublic);
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  let localPub: Bytes, localPriv: CryptoKey;
  if (fixed) {
    localPub = unb64u(fixed.local.publicKey);
    localPriv = await subtle().importKey('jwk', jwkFor(fixed.local), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  } else {
    const k = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
    localPub = new Uint8Array(await subtle().exportKey('raw', k.publicKey));
    localPriv = k.privateKey;
  }
  const uaKey = await subtle().importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await subtle().deriveBits({ name: 'ECDH', public: uaKey }, localPriv, 256));
  // Combine the shared secret with the subscription's auth secret, then derive the content key and nonce
  const prkKey = await hmac(unb64u(authSecret), shared);
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), ua, localPub, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const key = await subtle().importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const sealed = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(plaintext, new Uint8Array([2]))));
  // Header: salt, record size (4096), key length, sender's public key
  const header = concat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([localPub.length]), localPub);
  return concat(header, sealed);
}

/** The VAPID Authorization header value for a push service (signed with ES256, valid 12 hours). */
export async function vapidAuth(endpoint: string, vapid: KeyPair, subject: string, now = Date.now()): Promise<string> {
  const aud = new URL(endpoint).origin;
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const key = await subtle().importKey('jwk', jwkFor(vapid), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await subtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`)));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${vapid.publicKey}`;
}

export interface Subscription { endpoint: string; p256dh: string; auth: string }

/** Send one message. Returns the push service's status: 201 sent, 404/410 the subscription is gone. */
export async function sendPush(sub: Subscription, payload: unknown, vapid: KeyPair, subject: string, ttlSeconds = 6 * 3600): Promise<number> {
  const body = await encrypt(enc.encode(JSON.stringify(payload)), sub.p256dh, sub.auth);
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { Authorization: await vapidAuth(sub.endpoint, vapid, subject), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(ttlSeconds), Urgency: 'normal' },
    body,
  });
  await r.body?.cancel();
  return r.status;
}
