# MeetPulse Desktop workspace

The desktop app opens directly into a local workspace. There is no account or sign-in: everything lives on the device.

## Meetings and assistant

- One collapsible sidebar holds meetings grouped by client and project, content search, date filters and tags. Unclassified meetings remain available.
- Recording preparation accepts a title, client and project. These are free-form local names.
- Saved meetings offer Analysis, Transcript and optional Split view. Details and context can be edited without taking permanent reading space.
- Assistant opens a resizable panel with Chat and Coach. Chat supports the current meeting or a selected client/project/date range, with clickable source timestamps.
- Coach is off for each new recording. Enable it to review new finalized chunks every 30, 60 or 120 seconds, or update manually. Its suggestions include evidence, questions and next steps. Closing the panel keeps an enabled Coach running; pausing the recording pauses reviews.
- Assistant initially inherits the analysis model. Its settings allow a separate installed local model or saved API provider connection. API keys are read by Rust from existing settings, not copied into chat records. The UI identifies local/API inference.

Sessions, messages, suggestions, live fragments and references live in SQLite. Saving or recovering a recording binds its assistant session to the saved meeting in the same transaction. Deleting a meeting removes its index and conversations and invalidates references from other conversations.

## Semantic search

Enable the local search model from Assistant settings. The download contains the pinned `intfloat/multilingual-e5-small` ONNX model and tokenizer (487,351,240 bytes). SHA-256 verification is mandatory. Downloads can pause/resume; cancellation removes partial files while keeping verified complete files.

Search combines local normalized embeddings and SQLite FTS5 after filtering by client/project/date. Indexing runs in the background, pauses during recordings, and updates after transcript changes. Until the model/index is ready, the assistant reports partial coverage and uses text search. Meeting content is never sent out to generate embeddings. Selecting a remote generative model sends the retrieved excerpts to that provider.

## PDF templates

The two PDF export buttons generate independent documents from the full transcript and the current analysis editor snapshot. Export does not publish anything or generate new AI content.

- Shared branding: `frontend/src/lib/pdf/branding.ts`.
- Document layouts: `frontend/src/lib/pdf/templates.tsx`.
- Generation: a lazy-loaded Web Worker with a ready handshake and a Markdown entity decoder that does not require the DOM.
- Fonts and logo are local. Reports use selectable text, A4 pages, timestamps, headers and page numbering. Saving uses the existing native Tauri dialog.

## Verification

From `frontend`:

```powershell
corepack pnpm run build
node node_modules/typescript/bin/tsc --noEmit
node tests/desktop/browser-smoke.cjs
python tests/desktop/verify_reports.py
```

The browser test needs Playwright, with `NODE_PATH` pointing at the bundled runtime if it is not installed in the project. `PLAYWRIGHT_CHANNEL=msedge` uses installed Edge. It serves `out/` temporarily, simulates Tauri IPC, and verifies navigation, citations, both real PDF workers, unsaved edits and Coach behavior. Its screenshots/PDFs go into ignored `.next-validation/desktop-qa/`.

From the repository root:

```powershell
cargo test -p meetpulse --lib desktop
```

The real embedding test is ignored unless requested explicitly. Set `MEETPULSE_EMBEDDING_TEST_DIR` to a directory containing the pinned `onnx/model.onnx` and `tokenizer.json`, then run `cargo test -p meetpulse --lib desktop -- --include-ignored`. Model downloads for tests belong in an ignored validation directory; production models are managed under the Tauri app data directory.
