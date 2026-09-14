# Habit Tracker - Android APK

This project is configured for Expo SDK 54 and EAS Build.

## Run with Expo Go

```bash
npm install
npx expo start -c
```

## Build a standalone Android APK

1. Install EAS CLI:

```bash
npm install --global eas-cli
```

2. Log in to Expo:

```bash
eas login
```

3. From this project folder, run:

```bash
eas build --platform android --profile preview
```

