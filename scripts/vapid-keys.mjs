// Prints a new VAPID key pair for Web Push. Run once: node scripts/vapid-keys.mjs
// Paste both into Cloudflare as secrets (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY). Don't commit them.
const b64url = buf => Buffer.from(buf).toString("base64url");
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const raw = await crypto.subtle.exportKey("raw", publicKey);
const jwk = await crypto.subtle.exportKey("jwk", privateKey);
console.log(`VAPID_PUBLIC_KEY=${b64url(raw)}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
