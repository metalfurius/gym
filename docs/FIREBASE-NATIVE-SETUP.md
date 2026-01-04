# Firebase Native Platform Setup

This guide explains how to configure Firebase for the native iOS and Android builds of My Workout Tracker using Capacitor.

## Overview

The web version of the app uses Firebase JavaScript SDK loaded from CDN. For native mobile apps, Firebase works through the WebView, but for advanced features like push notifications, you may want to add native Firebase SDKs.

## Current Web-Based Firebase (Works Out of the Box)

The current setup uses Firebase JavaScript SDK which works in Capacitor's WebView:

```javascript
// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
```

**This works on both iOS and Android without any additional configuration!**

## Optional: Native Firebase Configuration

If you need native Firebase features (push notifications, analytics, etc.), follow these steps:

### Step 1: Get Firebase Configuration Files

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (`gymm-178fb`)
3. Go to Project Settings > Your apps

### Step 2: Android Setup

1. In Firebase Console, click "Add app" > Android
2. Enter package name: `es.codeoverdose.myworkouttracker`
3. Download `google-services.json`
4. Place it in: `android/app/google-services.json`

The Android build.gradle is already configured to use this file:

```groovy
// android/app/build.gradle
try {
    def servicesJSON = file('google-services.json')
    if (servicesJSON.text) {
        apply plugin: 'com.google.gms.google-services'
    }
} catch(Exception e) {
    logger.info("google-services.json not found...")
}
```

### Step 3: iOS Setup

1. In Firebase Console, click "Add app" > iOS
2. Enter bundle ID: `es.codeoverdose.myworkouttracker`
3. Download `GoogleService-Info.plist`
4. Place it in: `ios/App/App/GoogleService-Info.plist`

To add it to Xcode:
```bash
# After placing the file, open Xcode
npm run cap:open:ios
# Then drag GoogleService-Info.plist into the App folder in Xcode
```

## Environment-Specific Firebase Projects

For different environments (development, staging, production), you can use separate Firebase projects:

### Option 1: Multiple Firebase Projects

Create separate Firebase projects for each environment:
- `gymm-dev` for development
- `gymm-staging` for staging  
- `gymm-178fb` for production

Then use environment-specific config files:
- `google-services-dev.json`
- `google-services-staging.json`
- `google-services.json` (production)

### Option 2: Single Project with Different Credentials

Use the same Firebase project but with different web app configurations in `js/firebase-config.js` and use environment detection:

```javascript
import { getEnvironmentConfig, isDevelopment } from './env-config.js';

// Different API keys for different environments
const firebaseConfigs = {
  development: { /* dev config */ },
  staging: { /* staging config */ },
  production: { /* prod config */ }
};

const config = getEnvironmentConfig();
const firebaseConfig = firebaseConfigs[config.name];
```

## Firebase Security Rules

Make sure your Firestore security rules are properly configured to protect user data:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own data
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Testing Firebase on Native Apps

### Using Development Mode

1. Build for development:
   ```bash
   npm run cap:build:android:dev
   # or
   npm run cap:build:ios:dev
   ```

2. Run on device/emulator:
   ```bash
   npm run cap:open:android
   # or
   npm run cap:open:ios
   ```

3. Check browser console in Chrome DevTools (Android) or Safari Web Inspector (iOS)

### Debugging Firebase Issues

1. **Enable verbose logging** in development:
   ```javascript
   import { isDebugEnabled } from './env-config.js';
   
   if (isDebugEnabled()) {
     firebase.firestore.setLogLevel('debug');
   }
   ```

2. **Check network requests** in browser DevTools

3. **Verify authentication state**:
   ```javascript
   import { auth } from './firebase-config.js';
   auth.onAuthStateChanged(user => {
     console.log('Auth state:', user ? user.uid : 'signed out');
   });
   ```

## Troubleshooting

### Common Issues

1. **"Firebase: Error (auth/unauthorized-domain)"**
   - Add your app's domain to Firebase Console > Authentication > Settings > Authorized domains
   - For Capacitor apps, the domain is `localhost` or `capacitor://localhost`

2. **"Network error" on Android**
   - Ensure `android/app/src/main/AndroidManifest.xml` has internet permission:
     ```xml
     <uses-permission android:name="android.permission.INTERNET" />
     ```

3. **Firebase not loading on iOS**
   - Check that WebView has network access
   - Verify the app transport security settings in `Info.plist`

### Debug Resources

- [Firebase Web SDK Documentation](https://firebase.google.com/docs/web/setup)
- [Capacitor + Firebase Guide](https://capacitorjs.com/docs/guides/firebase)
- [Firebase Console](https://console.firebase.google.com/)
