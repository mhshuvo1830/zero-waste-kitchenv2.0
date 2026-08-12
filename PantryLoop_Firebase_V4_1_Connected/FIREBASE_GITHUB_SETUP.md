# PantryLoop V4.1 — Firebase + GitHub Pages Setup

The web app configuration is already connected to Firebase project **zerowaste2-42fda**.

## Required Firebase Console steps before signup/sign-in
1. Open Firebase Console → project **zerowaste2-42fda**.
2. Go to **Authentication → Sign-in method** and enable **Email/Password**.
3. Go to **Firestore Database** and create the database.
4. Publish the included `firestore.rules`. They restrict each user to their own `users/{uid}` tree.
5. For local testing, go to **Authentication → Settings → Authorized domains** and add `localhost` if it is not already listed.
6. For GitHub Pages, add `YOUR_USERNAME.github.io` to Authorized domains.
7. Profile photo upload is optional. If you want it, enable Firebase Storage and publish `storage.rules`.

## Private user data structure
```text
users/{uid}
users/{uid}/private/state
```
`state` contains that user's inventory, shopping list, waste log, and notification-read state. The supplied Firestore rules require the authenticated UID to match `{uid}`.

## Local test
Do not open `index.html` with a `file://` URL. From this project folder run:
```bash
python -m http.server 8000
```
Then open:
```text
http://localhost:8000/
```

Test flow:
1. Create account.
2. After successful signup the app returns to Sign in.
3. Sign in with the same email/password.
4. Add an inventory item and log out.
5. Sign back in and confirm it is still there.
6. Create a second user and confirm the first user's items are not visible.

## GitHub Pages
1. Create a GitHub repository and copy all files in this ZIP to the repository root.
2. Push to the `main` branch.
3. GitHub repository → **Settings → Pages → Source: GitHub Actions**.
4. The included `.github/workflows/pages.yml` deploys the site automatically.
5. Add `YOUR_USERNAME.github.io` in Firebase Authentication → Settings → Authorized domains.

Typical live URL:
```text
https://YOUR_USERNAME.github.io/YOUR_REPOSITORY/
```

## Security
The Firebase web configuration belongs in the browser app. Do **not** commit Firebase Admin SDK service-account JSON/private keys. User isolation is enforced by Authentication plus the included Firestore/Storage Security Rules.
