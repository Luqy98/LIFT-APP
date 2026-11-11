// Fingerprint support via WebAuthn with the PRF extension.
// The phone's secure hardware returns a secret (32 bytes) only after a fingerprint check; that secret
// protects a second copy of the data key (see crypto.js). Nothing here leaves the device.
// If the phone/Chrome can't return a PRF secret, enabling fails with a clear message: there is no weaker fallback.
import { randomBytes, b64 } from './crypto.js';

export async function fingerprintAvailable() {
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
