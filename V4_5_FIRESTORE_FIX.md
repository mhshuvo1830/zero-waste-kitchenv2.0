# PantryLoop V4.5 Firestore Snapshot Fix

The V4.4 sign-in flow could authenticate successfully and then fail with:

`snap.exists is not a function`

Reason: the app uses Firebase compat Firestore. In the compat/v8-style API, `DocumentSnapshot.exists` is a boolean property. V4.4 accidentally used the modular API form `snapshot.exists()`.

V4.5 changes both Firestore document checks to `snapshot.exists`.

After uploading the files to GitHub Pages, hard-refresh with Ctrl+Shift+R.
