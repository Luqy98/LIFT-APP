// Fingerprint support via WebAuthn with the PRF extension.
// The phone's secure hardware returns a secret (32 bytes) only after a fingerprint check; that secret
// protects a second copy of the data key (see crypto.js). Nothing here leaves the device.
// If the phone/Chrome can't return a PRF secret, enabling fails with a clear message: there is no weaker fallback.
import { randomBytes, b64 } from './crypto.js';

// Inside the Android app the browser's WebAuthn isn't available, so the app's native fingerprint plugin is used instead.
// A random 32-byte secret is stored in the Android Keystore behind the fingerprint (the key is bound to it and is
// invalidated if fingerprints change). It plays the same role as the WebAuthn secret: it only unlocks a second
// copy of the data key, and the PIN always still works.
const nativeBio = () => (window.Capacitor?.isNativePlatform?.() ? window.Capacitor.Plugins?.NativeBiometric || null : null);
const NB_USER = 'lift';
const NB_BIOMETRY_CURRENT_SET = 1;

function nativeError(e) {
  const m = String((e && (e.message || e.errorMessage)) || e || '');
  if (/cancel|user_cancel|negative|dismiss/i.test(m)) return new Error('Fingerprint check was cancelled.');
  if (/invalidat|key.*(not|no longer)|KeyPermanently/i.test(m)) return new Error('Your fingerprints changed on this phone. Use your PIN, then turn fingerprint unlock off and on again.');
  if (/lockout|too many/i.test(m)) return new Error('Too many wrong tries. Wait a moment or use your PIN.');
  return new Error('Fingerprint check failed. Use your PIN.');
}

async function nativeDerive(credId) {
  const NB = nativeBio();
  try {
    const r = await NB.getSecureCredentials({ server: credId, reason: 'Unlock LIFT', title: 'Unlock LIFT', negativeButtonText: 'Use PIN' });
    return b64.dec(r.password);
  } catch (e) { throw nativeError(e); }
}

async function nativeEnroll() {
  const NB = nativeBio();
  const bytes = randomBytes(32);
  const credId = 'lift-vault-' + [...randomBytes(8)].map((n) => n.toString(16).padStart(2, '0')).join('');
  try {
    await NB.setCredentials({ username: NB_USER, password: b64.enc(bytes), server: credId, accessControl: NB_BIOMETRY_CURRENT_SET, title: 'Turn on fingerprint', negativeButtonText: 'Cancel' });
  } catch (e) { throw nativeError(e); }
  // Read it back once so fingerprint unlock is only switched on if it truly works.
  const back = await nativeDerive(credId);
  if (back.length !== bytes.length || back.some((v, i) => v !== bytes[i])) {
    try { await NB.deleteCredentials({ server: credId }); } catch { /* ignore */ }
    throw new Error('The phone returned a different secret. Keep using your PIN.');
  }
  return { credId, salt: '', bytes };
}

/** Remove the stored fingerprint secret (native app only). */
export async function forget(credId) {
  try { await nativeBio()?.deleteCredentials({ server: credId }); } catch { /* ignore */ }
}

export async function fingerprintAvailable() {
  const NB = nativeBio();
  if (NB) {
    try { return !!(await NB.isAvailable()).isAvailable; } catch { return false; }
  }
  try {
    return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch { return false; }
}

function explain(e) {
  if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) return new Error('Fingerprint check was cancelled or timed out.');
  if (e && e.name === 'NotSupportedError') return new Error('This phone or Chrome version does not support fingerprint keys for Gym Log.');
  if (e && e.name === 'InvalidStateError') return new Error('A fingerprint key for Gym Log already exists. Try again.');
  return e instanceof Error ? e : new Error('Fingerprint check failed.');
}

const prfOf = (cred) => {
  const r = cred.getClientExtensionResults?.().prf?.results?.first;
  return r ? new Uint8Array(r) : null;
};

/** Ask for the fingerprint to read the secret for an existing credential. Returns 32 bytes or throws. */
export async function derive(credId, salt) {
  if (nativeBio()) return nativeDerive(credId);
  let cred;
  try {
    cred = await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        allowCredentials: [{ type: 'public-key', id: b64.dec(credId), transports: ['internal', 'hybrid'] }],
        userVerification: 'required',
        timeout: 60000,
        extensions: { prf: { eval: { first: b64.dec(salt) } } },
      },
    });
  } catch (e) { throw explain(e); }
  const bytes = prfOf(cred);
  if (!bytes) throw new Error('Your phone did not return a fingerprint secret. Use your PIN.');
  return bytes;
}

/** Create a fingerprint-protected credential. Resolves { credId, salt, bytes } or throws a readable Error. */
export async function enroll() {
  if (nativeBio()) return nativeEnroll();
  const salt = b64.enc(randomBytes(32));
  let cred;
  try {
    cred = await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(32),
        rp: { name: 'Gym Log' },
        user: { id: randomBytes(16), name: 'gymlog', displayName: 'Gym Log' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
        attestation: 'none',
        timeout: 60000,
        extensions: { prf: { eval: { first: b64.dec(salt) } } },
      },
    });
  } catch (e) { throw explain(e); }
  const credId = b64.enc(new Uint8Array(cred.rawId));
  const ext = cred.getClientExtensionResults?.().prf;
  if (!ext || ext.enabled === false) throw new Error('This phone or Chrome version can’t use fingerprint with Gym Log (the secure-key feature it needs is missing). Keep using your PIN.');
  // Some browsers only return the secret on a later sign-in, so read it back with a second fingerprint touch.
  const bytes = prfOf(cred) || await derive(credId, salt);
  return { credId, salt, bytes };
}
