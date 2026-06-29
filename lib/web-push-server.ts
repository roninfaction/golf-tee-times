/**
 * Edge-compatible Web Push (RFC 8291 / VAPID) using Web Crypto API.
 * Works on Cloudflare Workers — no Node.js built-ins required.
 * VAPID private key must be PKCS8 DER format, base64url-encoded.
 */

const enc = new TextEncoder();

function toAB(u: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (u instanceof ArrayBuffer) return u;
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

function b64uDecode(s: string): ArrayBuffer {
  return toAB(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));
}

function b64uEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function hkdf(salt: ArrayBuffer, ikm: ArrayBuffer, info: ArrayBuffer, length: number): Promise<ArrayBuffer> {
  const saltKey = await crypto.subtle.importKey("raw", salt, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prk = await crypto.subtle.sign("HMAC", saltKey, ikm);
  const prkKey = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const t1Input = new Uint8Array([...new Uint8Array(info), 0x01]);
  const okm = await crypto.subtle.sign("HMAC", prkKey, t1Input);
  return (okm as ArrayBuffer).slice(0, length);
}

async function encryptPayload(p256dh: string, auth: string, plaintext: string): Promise<ArrayBuffer> {
  const recipientPublicBytes = b64uDecode(p256dh);
  const recipientKey = await crypto.subtle.importKey(
    "raw", recipientPublicBytes,
    { name: "ECDH", namedCurve: "P-256" },
    true, []
  );

  const ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const ephemeralPublicBytes = await crypto.subtle.exportKey("raw", ephemeral.publicKey);

  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: recipientKey },
    ephemeral.privateKey, 256
  );

  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const authBytes = b64uDecode(auth);

  // RFC 8291: IKM = HKDF(salt=auth, ikm=ecdh_secret, info="WebPush: info\x00" || ua_pub || as_pub, len=32)
  const prkInfo = concat(
    enc.encode("WebPush: info\x00"),
    new Uint8Array(recipientPublicBytes),
    new Uint8Array(ephemeralPublicBytes)
  );
  const ikm = await hkdf(authBytes, sharedSecret, toAB(prkInfo), 32);

  // RFC 8291: CEK and nonce from HKDF(salt=random_salt, ikm=IKM, info=..., len=N)
  const cekRaw = await hkdf(toAB(saltBytes), ikm, toAB(enc.encode("Content-Encoding: aes128gcm\x00")), 16);
  const nonceRaw = await hkdf(toAB(saltBytes), ikm, toAB(enc.encode("Content-Encoding: nonce\x00")), 12);

  const aesKey = await crypto.subtle.importKey("raw", cekRaw, { name: "AES-GCM" }, false, ["encrypt"]);
  const padded = toAB(new Uint8Array([...enc.encode(plaintext), 0x02]));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: new Uint8Array(nonceRaw) },
    aesKey,
    padded
  );

  // RFC 8188 aes128gcm record header: salt(16) + rs_uint32be(4) + idlen(1) + keyid(idlen)
  const ephPub = new Uint8Array(ephemeralPublicBytes);
  const header = new Uint8Array(16 + 4 + 1 + ephPub.length);
  header.set(saltBytes, 0);
  new DataView(header.buffer).setUint32(16, 4096, false);
  header[20] = ephPub.length;
  header.set(ephPub, 21);

  const result = new Uint8Array(header.length + ciphertext.byteLength);
  result.set(header, 0);
  result.set(new Uint8Array(ciphertext), header.length);
  return toAB(result);
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

// Sign a VAPID JWT given an already-imported ECDSA CryptoKey — avoids re-importing the key
// for every subscription when sending bulk notifications.
async function signVapidJwt(aud: string, privateKey: CryptoKey): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + 43200;
  const sub = process.env.VAPID_SUBJECT ?? "mailto:noreply@golfpack.app";
  const header = b64uEncode(enc.encode(JSON.stringify({ alg: "ES256", typ: "JWT" })));
  const payload = b64uEncode(enc.encode(JSON.stringify({ aud, exp, sub })));
  const sigInput = enc.encode(`${header}.${payload}`);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, sigInput);
  return `${header}.${payload}.${b64uEncode(new Uint8Array(sig))}`;
}

async function createVapidJWT(endpoint: string, privateKeyPkcs8B64u: string): Promise<string> {
  const url = new URL(endpoint);
  const aud = `${url.protocol}//${url.host}`;
  const privateKey = await crypto.subtle.importKey(
    "pkcs8", b64uDecode(privateKeyPkcs8B64u),
    { name: "ECDSA", namedCurve: "P-256" },
    false, ["sign"]
  );
  return signVapidJwt(aud, privateKey);
}

// Internal dispatch: send a push with a pre-computed JWT (avoids re-signing per subscription).
async function dispatchWebPush(
  subscription: PushSubscription,
  notification: { title: string; body: string; data?: Record<string, string> },
  publicKey: string,
  jwt: string,
): Promise<{ ok: boolean; status?: number; body?: string; expired?: boolean }> {
  const encrypted = await encryptPayload(subscription.p256dh, subscription.auth, JSON.stringify(notification));
  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt},k=${publicKey}`,
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: "86400",
      Urgency: "high",
    },
    body: encrypted,
  });

  const ok = res.status === 201;
  // 410/404: subscription explicitly gone. 401/403: VAPID key mismatch (subscription created
  // with a different applicationServerKey — treat as unrecoverable so the DB record is cleared
  // and the user gets prompted to re-register on next app open.
  const expired = res.status === 410 || res.status === 404 || res.status === 401 || res.status === 403;
  const respBody = ok ? undefined : await res.text().catch(() => "");
  return { ok, status: res.status, body: respBody, expired };
}

export type PushSubscription = { endpoint: string; p256dh: string; auth: string };

export async function sendWebPush(
  subscription: PushSubscription,
  notification: { title: string; body: string; data?: Record<string, string> }
): Promise<{ ok: boolean; status?: number; body?: string; expired?: boolean }> {
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.error("[web-push] VAPID keys not configured. Set VAPID_PRIVATE_KEY in Cloudflare Pages environment variables.");
    return { ok: false, body: "VAPID keys not configured" };
  }

  const payload = JSON.stringify(notification);
  const encrypted = await encryptPayload(subscription.p256dh, subscription.auth, payload);
  const jwt = await createVapidJWT(subscription.endpoint, privateKey);

  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt},k=${publicKey}`,
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: "86400",
      Urgency: "high",
    },
    body: encrypted,
  });

  const ok = res.status === 201;
  const expired = res.status === 410 || res.status === 404 || res.status === 401 || res.status === 403;
  const respBody = ok ? undefined : await res.text().catch(() => "");
  return { ok, status: res.status, body: respBody, expired };
}

/** Send a push with no encrypted payload — fires push event with event.data=null on device.
 *  Used to test delivery independently of encryption. */
export async function sendEmptyPush(
  subscription: PushSubscription
): Promise<{ ok: boolean; status?: number; body?: string; expired?: boolean }> {
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.error("[web-push] VAPID keys not configured. Set VAPID_PRIVATE_KEY in Cloudflare Pages environment variables.");
    return { ok: false, body: "VAPID keys not configured" };
  }

  const jwt = await createVapidJWT(subscription.endpoint, privateKey);
  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt},k=${publicKey}`,
      TTL: "86400",
      Urgency: "high",
    },
  });

  const ok = res.status === 201;
  const expired = res.status === 410 || res.status === 404;
  const respBody = ok ? undefined : await res.text().catch(() => "");
  return { ok, status: res.status, body: respBody, expired };
}

// Max concurrent push dispatches per batch. Limits peak crypto + subrequest load per Worker invocation.
const PUSH_BATCH_SIZE = 5;

export async function sendPush({
  subscriptions, title, body, data,
}: {
  subscriptions: PushSubscription[];
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<{ expiredEndpoints: string[] }> {
  if (!subscriptions.length) return { expiredEndpoints: [] };

  const publicKey = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKeyB64u = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKeyB64u) {
    console.error("[web-push] VAPID keys not configured. Set VAPID_PRIVATE_KEY in Cloudflare Pages environment variables.");
    return { expiredEndpoints: [] };
  }

  // Import the ECDSA private key once for all subscriptions in this batch.
  // Previously imported once per subscription — O(N) imports reduced to O(1).
  const privateKey = await crypto.subtle.importKey(
    "pkcs8", b64uDecode(privateKeyB64u),
    { name: "ECDSA", namedCurve: "P-256" },
    false, ["sign"]
  );

  // Sign one VAPID JWT per unique endpoint host. In practice almost all Chrome/Edge
  // subscribers share fcm.googleapis.com, so this is typically 1-3 sign operations
  // instead of one per subscriber.
  const uniqueHosts = [...new Set(subscriptions.map(s => {
    const u = new URL(s.endpoint);
    return `${u.protocol}//${u.host}`;
  }))];
  const jwtByHost = new Map<string, string>();
  for (const host of uniqueHosts) {
    jwtByHost.set(host, await signVapidJwt(host, privateKey));
  }

  const notification = { title, body, data };
  const expiredEndpoints: string[] = [];

  // Process in fixed-size batches to cap concurrent crypto + subrequest load.
  for (let i = 0; i < subscriptions.length; i += PUSH_BATCH_SIZE) {
    const batch = subscriptions.slice(i, i + PUSH_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(sub => {
        const u = new URL(sub.endpoint);
        const jwt = jwtByHost.get(`${u.protocol}//${u.host}`)!;
        return dispatchWebPush(sub, notification, publicKey, jwt);
      })
    );
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === "fulfilled") {
        if (!r.value.ok) {
          console.error(`[web-push] sendPush failed: status=${r.value.status} body=${r.value.body}`);
        }
        if (r.value.expired) {
          expiredEndpoints.push(batch[j].endpoint);
        }
      } else {
        console.error("[web-push] sendPush threw:", r.reason);
      }
    }
  }

  return { expiredEndpoints };
}
