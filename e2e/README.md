# Phase 3 browser verification

Run from the repository root on macOS with Bun, Quick Look (`qlmanage`), and a `python3` environment with pypdf.
Install the matching Playwright browsers once, then run the suite or a single project.

```sh
bunx playwright install webkit chromium
python3 -c 'import pypdf'
bun run e2e
bun run e2e -- --project=webkit-iphone
```

Playwright starts a fresh Vite dev server on port 5199 for each run. Set `E2E_REUSE_SERVER=1` to
reuse a Vite server already listening at that address; this is useful when browser tests must run
separately from the process that starts the server. Start it with `bun run dev --port 5199 --strictPort --force`,
then run `E2E_REUSE_SERVER=1 bun run e2e`.
The projects are desktop Chromium at 1440×900, Pixel 7 Chromium and iPhone 14 WebKit.
Each test starts in a fresh browser context and uses the download fallback to capture saved bytes.

| Test               | Projects    | Checks                                                                                                                                                                                                                                                                                            |
| ------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text round trip    | Desktop     | Edits a word in each of four font and spacing fixtures, including Vietnamese, then compares the reopened text layer and independent pypdf extraction with the original.                                                                                                                           |
| Flatten export     | Desktop     | Fills and checks form controls, places a typed signature and highlights a line. The form has no selectable page text, so the test appends a page from text.pdf for the highlight. It checks PDF annotations and fields, then samples the field, checkbox and signature in Quick Look and the app. |
| 1,000 pages        | All         | Times first render and the jump to page 500, flings to the last page, zooms in and back, and samples animation-frame gaps, long tasks where supported, and available JS heap.                                                                                                                     |
| Phone interactions | Both phones | Checks page zoom, viewport scale, toolbar heights, tool card caret, long-press page actions and tap-to-sign. Chromium uses two CDP touch contacts. WebKit dispatches Safari gesture events and checks cancellation. Native Safari chrome still needs a device check.                              |
| Mixed undo session | Desktop     | Appends three-pages.pdf to text.pdf to keep one document history. Compares saved text, page geometry and order, annotation counts, rich comment contents and text colours after each undo and redo and after reopening.                                                                           |

Mobile WebKit models a fling with decelerating scroll offsets because its Playwright driver lacks wheel and swipe input.
Its performance zoom uses the command palette’s Zoom in and Fit width commands.

The console reports outcomes. Saved PDFs, the Quick Look thumbnail and failure traces go in
`e2e/results/artifacts/`. The latest completed scroll measurement for each project goes in
`e2e/results/perf.json` before zoom assertions. Durations are milliseconds and heap size is bytes.
The thresholds are 3,000 ms for first render, 2,000 ms for the jump and 500 ms for a scroll frame or long task.
A null heap value means the browser does not expose it. Results are git-ignored.
