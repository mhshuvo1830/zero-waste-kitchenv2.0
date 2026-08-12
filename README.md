# PantryLoop — Firebase V4.6 (Firestore Snapshot Fix)

This version keeps the Firebase Auth + per-user Firestore design and changes Firebase loading to classic deferred compat scripts for better reliability on static GitHub Pages.

# PantryLoop — Firebase V4.1

PantryLoop is a zero-waste kitchen dashboard with Firebase Email/Password authentication and per-user cloud persistence.

## Firebase connection
This build contains the Web App configuration for Firebase project `zerowaste2-42fda`.

Before authentication can work, enable **Email/Password** in Firebase Authentication and create **Cloud Firestore**. Publish the included `firestore.rules`. See `FIREBASE_GITHUB_SETUP.md`.

## Auth flow
- New user selects **Create account**.
- Firebase creates the account and initializes an empty private Firestore workspace.
- The app signs the newly-created account out and returns to the **Sign in** form.
- The user signs in with email/password.
- `onAuthStateChanged` loads only that user's `users/{uid}` profile and `users/{uid}/private/state`.

## Per-user persistence
Inventory, shopping, waste, and notification state are stored under the authenticated Firebase UID. Included Firestore rules prevent one authenticated UID from accessing another user's tree.

## Run locally
```bash
python -m http.server 8000
```
Open `http://localhost:8000/`.

## GitHub Pages
A Pages workflow is included at `.github/workflows/pages.yml`. See `FIREBASE_GITHUB_SETUP.md` for the setup steps and Firebase Authorized Domains requirement.


## GitHub Pages deployment for this build

Target repository: `mhshuvo1830.github.io`

Target live URL: `https://mhshuvo1830.github.io/`

See `DEPLOY_GITHUB_MHSHUVO1830.md` for the exact deployment and Firebase Authorized Domains steps.


## V4.3 auth-loader reliability fix
- Create account / Sign in mode switching is bootstrapped inline, so the UI remains responsive while Firebase modules load.
- Tesseract OCR is lazy-loaded only when OCR is requested; it no longer blocks login/auth initialization.
- `app.js?v=4.3` cache-busts stale GitHub Pages copies.
- If the Firebase module fails to load, the login page displays a diagnostic message after 8 seconds instead of silently doing nothing.


## V4.6 fix
Firebase compat `DocumentSnapshot.exists` is a boolean property, not a function. This build fixes both cloud-state and user-profile reads (`snapshot.exists` instead of `snapshot.exists()`).


## V4.6 visual redesign
See `V4_6_REFERENCE_REDESIGN.md`. This version preserves the working Firebase V4.5 baseline while updating all module visuals to match the supplied reference screenshots.

## V4.7 Organic Auth redesign
See `V4_7_ORGANIC_AUTH_REDESIGN.md`. The working Firebase/Firestore flow is unchanged; only Login/Create Account visuals were redesigned.
