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
