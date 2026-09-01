# Committed

Committed is a Next.js habit tracker that runs on the web and as a native Android app through Capacitor.

## Web development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the web app.

## Android

The native Android project is in [`android/`](android). It packages the static site generated in `out/`.

To refresh the Android app after web changes:

```bash
npm run android:sync
```

To open the project in Android Studio:

```bash
npm run android:open
```

To build a shareable debug APK, make sure `JAVA_HOME` points to a JDK (Android Studio's bundled JBR is fine), then run:

```bash
npm run android:debug
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.

Before publishing to Google Play, change `appId` in `capacitor.config.ts` to a reverse-domain ID you control. The native app uses edge-to-edge system bars and safe-area CSS variables so content clears Android's status and navigation bars.
