# LIFT for Android

The Android app is the same web app, bundled inside a Capacitor shell (see `.github/workflows/android.yml`).
Data is stored in the app's own private storage. The app is built without the internet permission.

To build: push a tag that starts with `apk-` (for example `apk-2.3.0`). The APK appears under Releases.
Required repository secrets: `LIFT_KEYSTORE_B64` (the signing keystore, base64) and `LIFT_KEYSTORE_PASSWORD`.
Keep a copy of the keystore: updates only install over an existing app if they are signed with the same key.
