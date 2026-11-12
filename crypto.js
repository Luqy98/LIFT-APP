// All cryptography for Gym Log. Nothing here touches the network.
//
// Design:
//   passcode --PBKDF2-SHA256 (600k iterations, random salt)--> key-encryption key (KEK)
//   KEK wraps a random 256-bit data key (DEK) with AES-GCM; the wrapped DEK is stored.
//   Every stored record is encrypted with the DEK (AES-GCM, fresh 96-bit IV, record id as AAD).
//   A wrong passcode fails the GCM auth tag, so no passcode hash is stored anywhere.
//   Changing the passcode only re-wraps the DEK; no records need re-encrypting.
//   The unwrapped DEK lives only in memory as a non-extractable CryptoKey.

const enc = new TextEncoder();
const dec = new TextDecoder();

export const KDF_ITERATIONS = 600_000;
const MAX_IMPORT_ITERATIONS = 5_000_000; // refuse absurd values from a hostile backup file
const DEK_AAD = enc.encode('gymlog/dek/v1');
const BACKUP_AAD = enc.encode('gymlog/backup/v1');

export const b64 = {
  enc(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(s);
  },
  dec(str) {
    const s = atob(str);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  },
};

export const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

async function deriveKek(secret, salt, iterations) {
  const base = await crypto.subtle.importKey(
    'raw', enc.encode(String(secret).normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function wrapRaw(raw, secret) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const kek = await deriveKek(secret, salt, KDF_ITERATIONS);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: DEK_AAD }, kek, raw);
  return {
    v: 1,
    kdf: { name: 'PBKDF2-SHA256', iterations: KDF_ITERATIONS, salt: b64.enc(salt) },
    iv: b64.enc(iv),
    ct: b64.enc(ct),
  };
}

async function unwrapRaw(wrapped, secret) {
  const kek = await deriveKek(secret, b64.dec(wrapped.kdf.salt), wrapped.kdf.iterations);
  try {
    const raw = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64.dec(wrapped.iv), additionalData: DEK_AAD }, kek, b64.dec(wrapped.ct));
    return new Uint8Array(raw);
  } catch {
    return null; // wrong passcode (auth tag mismatch)
  }
}

const importDek = (raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);

/** First-time setup: returns the wrapped key to store and the live key to use. */
export async function createVault(secret) {
  const raw = randomBytes(32);
  const wrapped = await wrapRaw(raw, secret);
  const key = await importDek(raw);
  raw.fill(0);
  return { wrapped, key };
}

/** Returns the live key, or null if the passcode is wrong. */
export async function unlockVault(wrapped, secret) {
  const raw = await unwrapRaw(wrapped, secret);
  if (!raw) return null;
  const key = await importDek(raw);
  raw.fill(0);
  return key;
}

/** Re-wraps the data key under a new passcode. Returns the new wrapped blob, or null if the old passcode is wrong. */
export async function changeSecret(wrapped, oldSecret, newSecret) {
  const raw = await unwrapRaw(wrapped, oldSecret);
  if (!raw) return null;
  const next = await wrapRaw(raw, newSecret);
  raw.fill(0);
  return next;
}

// ---- Fingerprint key slot ----------------------------------------------------
// The authenticator (WebAuthn PRF) returns 32 secret bytes only after the fingerprint check.
// HKDF turns them into a second key-encryption key that wraps the SAME data key.
// The PIN slot and this slot are independent; neither reveals the other.
const BIO_AAD = enc.encode('gymlog/dek-bio/v1');
async function bioKek(bytes) {
  const base = await crypto.subtle.importKey('raw', bytes, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('gymlog/bio-salt'), info: enc.encode('gymlog/bio/v1') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Wrap the data key (unlocked with the PIN) under fingerprint-derived bytes. Returns the slot, or null if the PIN is wrong. */
export async function addBioSlot(wrapped, secret, prfBytes) {
  const raw = await unwrapRaw(wrapped, secret);
  if (!raw) return null;
  const iv = randomBytes(12);
  const kek = await bioKek(prfBytes);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: BIO_AAD }, kek, raw);
  raw.fill(0);
  return { v: 1, iv: b64.enc(iv), ct: b64.enc(ct) };
}

/** Forgot-PIN recovery: the fingerprint opens the data key, which is re-wrapped under a new PIN. Returns the new wrapped blob, or null. */
export async function rewrapFromBio(slot, prfBytes, newSecret) {
  const kek = await bioKek(prfBytes);
  let raw;
  try {
    raw = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64.dec(slot.iv), additionalData: BIO_AAD }, kek, b64.dec(slot.ct)));
  } catch { return null; }
  const wrapped = await wrapRaw(raw, newSecret);
  raw.fill(0);
  return wrapped;
}

/** Live data key from fingerprint-derived bytes, or null if they don't match. */
export async function unlockWithBytes(slot, prfBytes) {
  const kek = await bioKek(prfBytes);
  try {
    const raw = new Uint8Array(await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64.dec(slot.iv), additionalData: BIO_AAD }, kek, b64.dec(slot.ct)));
    const key = await importDek(raw);
    raw.fill(0);
    return key;
  } catch { return null; }
}

/** Encrypt a JSON-serialisable record. `aad` (the record id) binds the ciphertext to its slot. */
export async function seal(key, obj, aad) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, enc.encode(JSON.stringify(obj)));
  return { iv, ct: new Uint8Array(ct) };
}

export async function open(key, rec, aad) {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: rec.iv, additionalData: enc.encode(aad) }, key, rec.ct);
  return JSON.parse(dec.decode(pt));
}

/** Portable encrypted backup (its own salt, so the backup passphrase can differ from the app passcode). */
export async function sealBackup(passphrase, payload) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKek(passphrase, salt, KDF_ITERATIONS);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: BACKUP_AAD }, key, enc.encode(JSON.stringify(payload)));
  return JSON.stringify({
    format: 'gymlog-backup', v: 1,
    kdf: { name: 'PBKDF2-SHA256', iterations: KDF_ITERATIONS, salt: b64.enc(salt) },
    iv: b64.enc(iv), ct: b64.enc(ct),
  });
}

export async function openBackup(passphrase, text) {
  let f;
  try { f = JSON.parse(text); } catch { throw new Error('That file is not a Gym Log backup.'); }
  if (!f || f.format !== 'gymlog-backup' || !f.kdf || !f.iv || !f.ct) {
    throw new Error('That file is not a Gym Log backup.');
  }
  const iterations = Number(f.kdf.iterations);
  if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > MAX_IMPORT_ITERATIONS) {
    throw new Error('That backup uses unsupported settings.');
  }
  const key = await deriveKek(passphrase, b64.dec(f.kdf.salt), iterations);
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64.dec(f.iv), additionalData: BACKUP_AAD }, key, b64.dec(f.ct));
    return JSON.parse(dec.decode(pt));
  } catch {
    throw new Error('Wrong backup passphrase, or the file is damaged.');
  }
}
