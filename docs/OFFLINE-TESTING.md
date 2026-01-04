# Offline Functionality Testing Guide

This guide provides test procedures for verifying offline functionality on iOS and Android native apps built with Capacitor.

## Overview

My Workout Tracker is designed to work offline using:
- **Service Worker** - Caches static assets for offline access
- **Local Storage** - Persists user preferences and session data
- **IndexedDB** (via Firestore) - Handles offline data persistence

## Prerequisites

Before testing:
1. Build the app for your target platform
2. Have a device or emulator ready
3. Know how to enable/disable network on your test device

## Test Environments

### Android Testing
```bash
# Build and sync
npm run cap:build:android

# Open in Android Studio
npm run cap:open:android

# Run on emulator or connected device
```

### iOS Testing
```bash
# Build and sync
npm run cap:build:ios

# Open in Xcode
npm run cap:open:ios

# Run on simulator or connected device
```

## Offline Test Checklist

### 1. Initial App Load (Online)
- [ ] App loads successfully
- [ ] Firebase authentication works
- [ ] User can log in
- [ ] Routines and exercises load from Firestore
- [ ] All UI elements render correctly

### 2. Service Worker Caching
- [ ] Static assets are cached after first load
- [ ] Check DevTools > Application > Service Workers (web)
- [ ] Verify cache contains expected files

### 3. Going Offline - Basic Navigation
- [ ] Turn off WiFi/mobile data
- [ ] App remains functional
- [ ] Navigation between views works
- [ ] UI does not show errors for cached pages

### 4. Offline Data Access
- [ ] Previously loaded routines are visible
- [ ] Exercise lists are accessible
- [ ] User profile information displays
- [ ] In-progress session is preserved

### 5. Offline Workout Session
- [ ] Can start a new workout session
- [ ] Can add exercises to session
- [ ] Can log sets, reps, and weights
- [ ] Rest timer functions correctly
- [ ] Session data persists when app is backgrounded

### 6. Coming Back Online - Data Sync
- [ ] Turn WiFi/mobile data back on
- [ ] App detects connectivity change
- [ ] Pending changes sync to Firestore
- [ ] No data loss occurs
- [ ] UI updates with synced data

### 7. Edge Cases
- [ ] Intermittent connectivity handling
- [ ] Large data sets sync correctly
- [ ] Conflict resolution works (if implemented)
- [ ] App handles sync errors gracefully

## Platform-Specific Testing

### Android

#### Using Android Emulator
1. Open emulator
2. Go to Settings > Network & Internet > WiFi
3. Toggle WiFi off to simulate offline
4. Or use Android Studio's Network Inspector:
   - Run the app from Android Studio on the emulator
   - In Android Studio, go to **View > Tool Windows > App Inspection**, then open **Network Inspector**
   - Select your emulator and app process, then use the network profiles (e.g., **Offline**) to simulate connectivity loss
   - For more details, see the official docs: https://developer.android.com/studio/profile/network-profiler

#### Using Physical Device
1. Enable Airplane mode
2. Or disable WiFi and mobile data separately
3. Test app functionality
4. Re-enable connectivity and verify sync

#### Android-Specific Checks
- [ ] App works when "Data Saver" is enabled
- [ ] Background sync works with Doze mode
- [ ] App handles "No Internet" system dialog

### iOS

#### Using iOS Simulator
1. Use **Network Link Conditioner** to simulate offline or poor connectivity
2. On macOS, enable it via System Settings (or System Preferences) > Developer > Network Link Conditioner
3. Alternatively, disable WiFi or disconnect the network on the host Mac to simulate being offline
   > Note: Most iOS Simulator versions do not provide an Airplane Mode option in the Hardware > Network menu.

#### Using Physical Device
1. Control Center > Airplane Mode
2. Or Settings > WiFi > Off
3. Test app functionality
4. Re-enable and verify sync

#### iOS-Specific Checks
- [ ] App works in Low Power Mode
- [ ] Background App Refresh doesn't break data
- [ ] App handles iOS network permission prompts

## Testing Tools

### Chrome DevTools (Android)
```bash
# Connect Android device via USB with USB debugging enabled
chrome://inspect/#devices
```
- Network tab: Simulate offline
- Application tab: View Service Worker and Cache

### Safari Web Inspector (iOS)
1. Enable Web Inspector on iOS device:
   Settings > Safari > Advanced > Web Inspector
2. Connect to Mac via USB
3. Open Safari > Develop > [Device Name]

### Manual Network Testing
Use Network Link Conditioner (macOS) or similar tools to simulate:
- Slow connections (3G, Edge)
- High latency
- Packet loss
- Disconnections

## Expected Behaviors

### When Offline:
1. **Authentication** - User remains logged in (token cached)
2. **Data Display** - Cached data is shown
3. **Writes** - Queued locally, synced when online
4. **Navigation** - Works for cached pages
5. **New Content** - Shows appropriate offline message

### When Coming Online:
1. **Auto-sync** - Pending changes upload automatically
2. **Data Refresh** - Fresh data loads from server
3. **Conflict Handling** - Server wins or merge strategy
4. **UI Update** - Reflects synced state

## Reporting Issues

When reporting offline-related bugs, include:
- Platform (iOS/Android) and version
- Device model
- Steps to reproduce
- Network state when issue occurred
- Console logs (if available)
- Screenshots of any error messages

## Sample Test Script

```
Test: Offline Workout Session
Duration: 10 minutes

1. [Online] Login to app
2. [Online] Navigate to Workouts
3. [Online] Start a new workout session
4. [Offline] Disable network
5. [Offline] Add exercise "Bench Press"
6. [Offline] Log: 3 sets x 10 reps @ 135 lbs
7. [Offline] Add exercise "Squats"
8. [Offline] Log: 4 sets x 8 reps @ 225 lbs
9. [Offline] End workout session
10. [Online] Enable network
11. [Verify] Session data synced to server
12. [Verify] Can see session in history
```

## Automated Testing (Future)

Consider implementing automated offline tests using:
- **Jest** with network mocking
- **Detox** for end-to-end mobile testing
- **Appium** for cross-platform automation

## References

- [Capacitor Network Plugin](https://capacitorjs.com/docs/apis/network)
- [Firebase Offline Data](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
