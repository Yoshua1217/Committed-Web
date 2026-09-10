# Handwriting workspace

Implemented September 8, 2026 for the Committed product vision. Infinite canvas is intentionally excluded. This document distinguishes implemented behavior from remaining work; it does not claim every long-term item in the vision is complete.

## Using the workspace

- **New note** opens a chooser. Typed notes are the default focused option; handwriting and PDF import are also available.
- Use **+** in a note to add typed, handwritten, or PDF tabs. Tab options support rename, duplicate, close, delete, and restore. Tabs can be reordered and opened in split view.
- **Page options → Duplicate note** copies every tab and the underlying PDFs, images, and recordings. An interrupted copy is labelled incomplete and retained for recovery. Global search can include indexed handwriting, PDF text, page labels, and extra typed tabs across notebooks.
- **Settings → Courses** is the shared class list. Attach notebooks and synced Google Calendar layers and choose a paper default. An explicit notebook association takes precedence over a calendar association.
- Write with a stylus; fingers pan by default. Pinch to zoom. **Focus** expands the writing area. The pen barrel button or eraser tip temporarily erases when the hardware reports the standard pointer button flags.
- Hold or double-click a saved pen to edit its name, colour, width, pressure, opacity, and smoothing. Pens can be reordered, duplicated, and made the default. The last selected tool is remembered for each handwriting tab on that device.
- **Lasso** supports freehand and rectangular selection. It can split a connected stroke at the selection boundary. Move or resize the selection directly, or use the selection controls for rotation, recolouring, grouping, copy/paste, and deletion.
- **Insert into typed notes** uploads a cropped transparent PNG to Firebase and lets you choose a typed tab. Main Notes inserts at the last typed cursor; extra typed tabs append it. The source remains editable and an accompanying link returns to its page.
- **Pages** contains thumbnails, page labels, bookmarks, reordering, duplication, and recently deleted pages. **Templates** creates Cornell, graph, and dotted pages, or reuses saved pages containing ink, labels, and study covers.
- Import PDFs from the tab menu or drop a PDF onto the tab bar. Original files upload to Firebase Storage; page structure and annotations sync through Firestore. PDF text is indexed at import. Blank pages can be inserted, pages reordered or removed, and an annotated PDF exported with all pages, bookmarked pages, or a range.
- **Replace PDF** in PDF tab options preserves annotations for a replacement with matching page count, dimensions, and rotations. The old PDF and annotations are retained as a closed tab that can be restored from **+**. Incompatible revisions must be imported separately.
- **Select PDF text** offers text blocks to highlight, copy, or insert into typed notes. **Annotations** lists highlights and labels/comments; text objects can be edited there.
- Use **Cover** or **Cover for study** to conceal an answer. Study covers reveal on tap.
- **Convert to text** uses on-device ML Kit in Android, with a language-model download on first use. Recognized text is reviewed before insertion, searchable indexing, or task creation. Web offers manual reviewed transcription.

## Latency and persistence

The writing path uses native pointer events, coalesced samples, and raw pen updates where supported. The first dot and incremental segments are drawn directly to a separate live canvas. React state, Firestore writes, history, recognition, and enhancement are outside ordinary pointer-move drawing. Enhancement touches the completed stroke after pen-up, then appends it to settled ink. Paper, PDF imagery, settled ink, and live ink have separate layers.

Normal append operations preserve unchanged object identities. Metadata acknowledgements do not reserialize or redraw the whole page. The recovery journal contains unacknowledged object changes rather than an entire lecture page. Long continuous strokes split into bounded Firestore objects.

Firestore uses persistent caching with multiple-tab support. Typed text and extra typed tabs have independent local recovery journals. Completed ink actions are journaled before cloud submission. Recovery and undo preserve unrelated objects added by another device; simultaneous edits to the same object still follow Firestore's last-write behavior. PDFs have an IndexedDB file cache after upload/download.

The browser integration test exposed a Firebase SDK internal assertion during development reconnects. A clean reload recovered the SDK. Local journals protect unsynced work from that failure; they are not a claim that the upstream SDK issue is fixed. Browser storage quotas still apply, and the UI reports when ink recovery storage is full.

## Data layout

```text
notes/{noteId}                                  existing typed note and ownership
  surfaces/{surfaceId}                         typed / ink / PDF metadata
    pages/{pageId}                             paper, order, labels, indexed text
      objects/{objectId}                       independent vector/object records
  surfaces/_study/cards/{cardId}               legacy flashcards (preserved for existing notes)
  recordings/{recordingId}                     legacy recording data (retained for existing notes)
userSettings/{uid}                             inkPreferences
  courses/{courseId}                           notebooks, calendars, paper
  inkTemplates/{templateId}/objects/{objectId}  reusable editable page content
Storage: note-files/{uid}/{noteId}/{fileId}     PDFs and legacy audio
Storage: note-images/{uid}/{noteId}/{imageId}   inserted images and lasso exports
```

Nested note access requires ownership of the parent note. Course and template access is scoped to the signed-in UID. Storage accepts owner PDF uploads up to 100 MB and audio up to 200 MB; existing image limits remain 5 MB. Deleting a note cleans up nested documents and its file cache/storage. Account reset also removes courses and templates.

## Verification

- 179 automated tests pass, including partial lasso and erasing, transformations, remote-safe undo, recovery of queued changes, independent whole-note copies, compatible PDF replacement, and a regression preventing serialization of 2,000 unchanged strokes when adding one stroke.
- 10 Firestore/Storage emulator tests pass for owner access, cross-account rejection, parent ownership, course/template privacy, and file type restrictions.
- Annotated PDF export is rendered and compared against source content at 0°, 90°, 180°, and 270° rotation. Text selection orientation is checked at those rotations too.
- Browser checks cover the real new-note chooser and typed editor, partial lasso-to-image insertion through Storage, PDF import/text highlighting/rotation, split view, immediate reload recovery for text and ink, page delete/restore, reusable templates, and global course settings.
- A fresh handwritten tab and its first page were also created with Firestore networking disabled, then reconnected. Whole-note copy, global text-index loading, and PDF replacement have automated coverage; their final UI additions have not had a second complete browser pass.
- Production static build and targeted lint pass. Android Java plugins compile and `assembleDebug` produces an APK. Bundled Notes HTML and PDF worker hashes match the production web output.

Physical pressure, palm rejection, barrel buttons, recognition accuracy, and actual pen-to-display latency still need testing on the tablet. No millisecond latency claim is made from mouse/browser tests.

## Build and isolated testing

```powershell
npm ci
npm test
npm run build
npx cap sync android
# With Android Studio's JDK selected as JAVA_HOME:
cd android
./gradlew.bat assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`.

The Firestore and Storage rules were successfully deployed to `committed-2f3a9` during this work to fix the tablet's insufficient-permissions error. The website itself has not been pushed or published.

Rules tests: `npm run test:ink-rules` with Java and Firebase CLI installed and the configured emulator ports free.

For isolated UI work, start `firebase emulators:start --only auth,firestore,storage --project demo-ink-workspace --config firebase.ink-tests.json`, then run `npm run dev:ink-lab`. Open `http://localhost:3012/ink-lab` and create the fixture account/workspace. The launcher stages the development route and removes its unchanged file on exit. It uses a separate Next build directory; its emulator flag is ignored by production builds.

## Remaining product work

The advanced roadmap is not complete. Automatic lecture transcription, handwriting-to-LaTeX math recognition, visual AI reasoning over diagrams/PDF regions, automatic global handwriting indexing, advanced user-managed layers, collaboration, linked scrolling, image crop, ruler/alignment/fill controls, and scribble-to-delete remain work. Saved templates currently accept ink/labels/covers rather than imported images or PDF backgrounds. Extra typed tabs use a Markdown textarea/preview; the main typed tab retains the existing richer editor.

Recognition is Android-only and uses English by default. Automatic transcription/provider choices remain unresolved. Imported PDFs require a connection for their initial upload; cached files are available afterwards. Multi-device behavior has been tested through the data model and emulator permissions, not two physical signed-in tablets.
