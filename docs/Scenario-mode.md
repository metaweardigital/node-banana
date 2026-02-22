# Scenario Mode

Scenario Mode is a video editor-style interface for chaining AI video generations. Unlike the node-based workflow editor, it provides a linear, streamlined layout focused on iterative video generation with prompt evasion techniques.

## How to Access

From the Welcome Modal, click **Scenario Mode** (5th option). Click **Back** (top-left of left panel) to return to the Welcome Modal.

## Layout

Full-screen, no header. Three-column layout with a fixed timeline bar at the bottom.

```
┌────────┬───────────────────┬────────────────────┐
│ ← Back │                   │  Prompt             │
│  Input │                   │  Evasion technique   │
│  New → │    Video          │  Evasion output      │
│        │    Preview        │  ────────────────── │
│  9:16  │    (center)       │  Duration | Ratio   │
│  Input │                   │  Resolution          │
│  Photo │                   │  ☑ Use last frame   │
│        │                   │  [▶ Generate]       │
├────────┴───────────────────┴────────────────────┤
│  ▶ 0:00 / 1:24      🔁 loop         [Export]   │
│  ──────── scrubber bar with playhead ────────   │
│  [IN][clip1][→F1][clip2][→F2][clip3]            │
│                                          1px    │
└─────────────────────────────────────────────────┘
```

## Panels

### Left Panel — Input Photo (350px)

Upload or drag & drop an image. The image is center-cropped to match the selected aspect ratio before saving. When "Use last frame" is enabled, this auto-updates with the last frame of the most recently generated clip. The Back and New buttons sit inline in the panel header.

### Center Panel — Video Preview (flex)

Shows one of:
- **Export progress** — progress bar when exporting
- **Generating spinner** — during video generation
- **Error message** — on generation failure
- **Active clip video** — with thumbnail behind to prevent flash on load; click to play/pause
- **Active clip thumbnail** — if video hasn't loaded yet
- **Input image** — when no clip is selected
- **Empty placeholder** — when nothing is loaded

Hover reveals a play/pause overlay. Displays clip number, duration, and model name below.

### Right Panel — Controls (320px, scrollable)

| Section | Description |
|---------|-------------|
| **Prompt** | Main text prompt (80px textarea) |
| **Evasion** | Technique dropdown + editable transformed output textarea. Shows char diff (`+N chars`, `in → out`). Uses `applyEvasion()` from `@/utils/promptEvasion` |
| **Parameters** | Duration slider (1–15s), Aspect Ratio (9:16, 16:9, 1:1), Resolution (480p, 720p), "Use last frame" checkbox |
| **Generate** | Full-width button. Shows **Regenerate** (amber) when a clip is selected, **Generate** (blue) otherwise |

### Timeline (bottom bar, full-width)

- **Top row**: Play/Pause, time counter (`current / total`), loop toggle, Export button
- **Scrubber bar**: Draggable playhead with clip boundary markers and progress fill. Supports click-and-drag scrubbing (pauses during drag, resumes after)
- **Clip track**: Horizontally scrollable. Input image thumbnail (`IN`), clip thumbnails (width proportional to duration), last-frame thumbnails (`F1`, `F2`, ...) between clips with `→` arrows. Click any frame to use it as input
- **Time labels**: Second markers (every 5s)

## Evasion System

The evasion system transforms prompts using unicode/encoding tricks to test moderation filters. It replaces the old toggle+technique+language+negative-prompt+style-tags approach with a single dropdown and live preview.

**Source**: `src/utils/promptEvasion.ts`

Techniques are organized by estimated bypass rate:

| Category | Examples | Bypass Rate |
|----------|----------|-------------|
| Invisible Characters | Variation Selectors, ZWSP, ZWJ, ZWNJ, Word Joiner, Soft Hyphens | ~85–95% |
| Homoglyphs | Cyrillic, Greek, Small Caps, Superscript | ~70–80% |
| Unicode Math Variants | Italic, Script, Fraktur, Double-Struck, Bold, Sans-Serif, Monospace | ~65–75% |
| Encoding | ROT13, Base64, Hex, HTML Entities, URL Encoding, Morse, Binary | ~40–70% |
| Advanced Unicode | Bidi Override, Zalgo, Whitespace Variants, Fullwidth, Enclosed | ~45–70% |
| Linguistic | Strategic Misspell, Vowel Removal, Pig Latin, Char Doubling | ~45–60% |
| Separators | Diacritics, Hyphenated, Underscored, Dot/Space Separated, Noise | ~30–50% |
| Well-known | Leetspeak, Mixed Case, Reversed | ~15–25% |

Each clip stores both `rawPrompt` (original) and `prompt` (evasion-applied), plus which `evasionTechnique` was used. Clicking a clip loads its prompt and technique back into the form.

## Video Export

Uses the `useStitchVideos` hook (`src/hooks/useStitchVideos.ts`) backed by the `mediabunny` library for client-side video stitching.

1. Fetches all playable clip videos as blobs
2. Stitches them into a single MP4 using WebCodecs
3. Triggers a browser download (`scenario_export_<timestamp>.mp4`)
4. Optionally saves to `<project>/exports/` on disk

Progress states: encoding → complete / error.

## Last Frame Extraction

After each clip generates, the system extracts the last frame:

1. Creates an off-screen `<video>` element
2. Seeks to `duration - 0.05s`
3. Waits 200ms for frame decode, then draws to canvas
4. Saves as PNG to `<project>/frames/lastframe_<timestamp>.png`
5. Updates the clip's `lastFrame`/`lastFramePath` fields
6. Sets as input image for the next generation (when "Use last frame" is enabled)

Timeout: 20 seconds. On failure, falls back gracefully (clip still works, just no frame thumbnail).

## Playback

- **Sequential**: Plays clips in order using `requestAnimationFrame` loop
- **Looping**: Toggle in timeline toolbar — restarts from beginning when reaching the end
- **Clip switching**: Tracks active clip via `prevClipRef` to avoid unnecessary re-renders. On clip change, waits two animation frames for React to render new video src before playing
- **Scrubbing**: Click-and-drag on the scrubber bar. Pauses playback during drag, resumes after mouseup if it was playing before

## Core Workflow

1. Upload a reference image (left panel) — auto-cropped to aspect ratio
2. Write a prompt (right panel)
3. Select evasion technique — preview transformed output
4. Click **Generate** — clip appears on timeline
5. Last frame is extracted and set as next input (if enabled)
6. Click a clip to load its prompt/technique, modify, and regenerate or generate next
7. Export all clips as a single MP4

## Clip Data Model

```typescript
interface Clip {
  id: string;
  thumbnail: string | null;         // runtime display URL
  thumbnailPath: string | null;      // relative path on disk
  videoSrc: string | null;           // blob URL or API URL
  videoPath: string | null;          // relative path on disk
  lastFrame: string | null;          // last frame data URL
  lastFramePath: string | null;      // relative path on disk
  duration: number;
  prompt: string;                    // evasion-applied prompt
  rawPrompt: string;                 // original prompt
  evasionTechnique: EvasionTechnique;
  status: "idle" | "generating" | "done" | "error";
  error?: string;
}
```

## State Persistence

- App mode (`workflow` or `scenario`) persists in `localStorage` under `node-banana-app-mode`
- Scenario state saves to disk as JSON in the project directory via `/api/scenario`
- Saved fields: `inputImagePath`, `prompt`, `evasionTechnique`, `duration`, `aspectRatio`, `resolution`, `useLastFrame`, `clips` (with paths), `activeClipId`
- On load, `"generating"` status clips are reset to `"done"` to avoid stuck state

## Disk Structure

```
<project>/
  inputs/          # Uploaded input images
  generations/     # Generated video files
  frames/          # Extracted last-frame PNGs
  exports/         # Stitched export MP4s
  thumbnails/      # (legacy, replaced by frames/)
  scenario.json    # Persisted state
```
