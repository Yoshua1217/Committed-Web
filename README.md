# Committed

Committed is a Next.js habit tracker that runs on the web and as a native Android app through Capacitor.

## Web development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the web app.

## Infinite canvas

Choose **Infinite canvas** when creating a note or adding a surface. **Whiteboard** remains a separate page type with its original writing board, minimap, and erasing tools. Infinite canvas uses its own editor and does not replace whiteboards.

- Scroll/trackpad pans; Ctrl/Cmd + scroll zooms around the cursor; Shift + scroll pans horizontally. Space-drag and middle-button drag also pan.
- P draws over objects; V selects, moves, and resizes them; C connects them. Double-click or Enter edits text. Shift-resize preserves proportions; Alt-drag bypasses alignment snapping.
- The right toolkit contains shapes, notes, section borders, fill/border controls, typography, grouping, locking, and arrangement. Fill opacity does not fade the text.
- `1` fits the selection or all content; `0` returns to 100%. Changes use the existing private note object collections with a local recovery journal.

`npm run dev:canvas-lab` opens the isolated visual/interaction fixture at `/ink-lab` on port 3012. `npm run dev:canvas-workspace` tests the real note and persistence flow against the local Firebase emulators; start auth, Firestore, and Storage using `firebase.ink-tests.json` first. Both commands remove their temporary route on exit.

The canvas, handwriting, and PDF annotation modes share Committed’s pen toolbar, with selection, shape catalogue, sticky notes, and attached connectors. Chrome follows the app’s light/dark theme; shape colors remain editable. In typed notes, **Drawing** inserts an editable drawing block at the cursor, shown in the formatted view and saved with the note’s surfaces. Removing its Markdown marker does not erase the drawing; it can be restored from the surface menu.

Deferred until the current canvas is accepted: further existing-note integration, nested canvases, media/research tools, presentation/export improvements, and advanced mind mapping. Revisit these after the current interaction and appearance review.

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
