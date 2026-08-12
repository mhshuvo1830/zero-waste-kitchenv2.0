# PantryLoop — Deploy to mhshuvo1830.github.io

## Final live URL
https://mhshuvo1830.github.io/

## 1. Create the GitHub repository
Create a repository with this exact name:

`mhshuvo1830.github.io`

For a GitHub user site, the repository name must match `<username>.github.io`.

## 2. Upload the project files
Upload the CONTENTS of this project folder to the repository root. Do not upload only the ZIP file.

Important files that must be in the repo root:
- index.html
- styles.css
- app.js
- firebase-config.js
- manifest.json
- firestore.rules
- storage.rules
- .nojekyll
- .github/workflows/pages.yml

## 3. Enable GitHub Pages via GitHub Actions
Open:
Repository -> Settings -> Pages

Under Build and deployment, set Source to:
`GitHub Actions`

The included workflow `.github/workflows/pages.yml` deploys the static site automatically when code is pushed to `main`.

## 4. Firebase Authentication setup
Firebase project: `zerowaste2-42fda`

Open Firebase Console -> Authentication -> Sign-in method
Enable:
- Email/Password

Then open:
Authentication -> Settings -> Authorized domains

Add this domain exactly:
`mhshuvo1830.github.io`

Do not add `https://` and do not add a trailing slash.

IMPORTANT: Keep this Firebase config value unchanged:
`authDomain: "zerowaste2-42fda.firebaseapp.com"`

Do NOT replace authDomain with the GitHub Pages domain.

## 5. Firestore setup
Open Firebase Console -> Firestore Database -> Create database.

Then publish the rules included in `firestore.rules`.

The app stores each user's private app state under that authenticated user's UID path, so separate users do not share the same pantry state.

## 6. Storage setup (profile pictures)
If you want uploaded profile pictures to persist in Firebase Storage, enable Cloud Storage and publish `storage.rules`.

If Storage is not enabled, account authentication and Firestore data can still be used, but profile-picture upload will fail until Storage is configured.

## 7. Test the live app
After GitHub Pages finishes deploying, open:
https://mhshuvo1830.github.io/

Test in this order:
1. Create account
2. After successful signup, return to Sign in
3. Sign in using the same email/password
4. Add or edit an inventory item
5. Sign out
6. Sign back in
7. Confirm the user's previous data is restored
8. Create a second account and confirm it has separate data

## If signup/sign-in fails
Check the visible error shown on the login page, then verify:
- Email/Password provider is enabled
- `mhshuvo1830.github.io` is in Authorized domains
- Firestore Database exists
- Firestore rules are published
- Browser console has no blocked Firebase/CDN requests
