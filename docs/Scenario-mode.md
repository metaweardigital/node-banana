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
│        │    Preview        │  Evasion output      │
│  9:16  │    (center)       │  Continuity [on/off] │
│  Input │                   │  ────────────────── │
│  Photo │                   │  Duration | Ratio   │
│        │                   │  Res | ☑ Last frame │
│        │                   │  [▶ Generate]       │
├────────┴───────────────────┴────────────────────┤
│  ▶ 0:00 / 1:24      🔁 loop         [Export]   │
│  ──────── scrubber bar with playhead ────────   │
│  [IN][variants][clip1][→F1][variants][clip2]... │
│  ... [→NEXT]                             1px    │
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
- **Preview image** — when a frame or variant is clicked (separate from input image)
- **Input image** — when no clip is selected and no preview active
- **Empty placeholder** — when nothing is loaded

Hover reveals a play/pause overlay. Displays clip number, duration, and model name below. Spacebar toggles play/pause.

### Right Panel — Controls (320px, scrollable)

| Section | Description |
|---------|-------------|
| **Prompt** | Main text prompt (80px textarea) |
| **Evasion** | Technique dropdown + editable transformed output textarea. Shows char diff (`+N chars`, `in → out`). Uses `applyEvasion()` from `@/utils/promptEvasion` |
| **Continuity** | Toggle (on by default) + modifier chips. Appends camera/motion instructions after evasion output to keep clip transitions consistent. Default modifiers: "Static camera", "Smooth motion", "Consistent light" |
| **Parameters** | Duration slider (1–15s), Aspect Ratio (9:16, 16:9, 1:1), Resolution (480p, 720p), "Use last frame" checkbox |
| **Generate** | Full-width button. Shows **Regenerate** (amber) when a clip is selected, **Generate** (blue) otherwise |

### Timeline (bottom bar, full-width, 200px)

- **Top row**: Play/Pause, time counter (`current / total`), loop toggle, Export button
- **Scrubber bar**: Draggable playhead with clip boundary markers and progress fill. Supports click-and-drag scrubbing (pauses during drag, resumes after)
- **Clip track**: Horizontally scrollable. All thumbnails are 70px tall with 9:16 aspect ratio.
  - `IN` thumbnail (green border) — original input image, with camera + arrow overlay buttons on hover
  - Input angle variants (violet border) — generated from IN image, appear right after IN
  - Video clips (blue border when active) — width proportional to duration, with delete button on hover
  - Last-frame thumbnails (`F1`, `F2`, ...) between clips with `→` arrows (orange border)
  - Clip angle variants (violet border) — generated from frames, appear after each frame
  - `NEXT` thumbnail (green border) — appears at end when a variant/frame is set as the next input
- **Time labels**: Second markers (every 5s)

**Thumbnail overlay buttons** (on hover for frames, variants, and IN):
- **Camera** (top-left, violet) — open angle variant picker
- **Arrow →** (bottom-left, green) — set this image as next generation input (shows as NEXT at end of timeline)
- **X** (top-right, red on hover) — delete variant

## Camera Angle Variants

Generate fresh high-quality images from frames or the input image using different camera perspectives. This combats quality degradation from chaining multiple video generations.

### Angle Presets

22 total presets organized into direct presets and grouped orbit presets:

**Direct presets** (14):

| Preset | Description |
|--------|-------------|
| Upscale | Enhance resolution and sharpness only |
| Clean up | Recreate scene removing artifacts and noise |
| Close-up | Face and upper body focus |
| Wide shot | Full environment establishing shot |
| Low angle | Dramatic perspective from below |
| High angle | Bird's eye perspective from above |
| Profile | 90-degree side view |
| Over shoulder | Over-the-shoulder with depth of field |
| Medium shot | Waist-up framing |
| Dutch angle | Tilted camera rotation |
| POV | First-person perspective |
| Behind | View from behind the subject |
| Extreme CU | Tight crop on eyes and nose |
| Mirror | Horizontally flipped reflection |

**Grouped presets** (8, in nested submenus):

| Group | Presets |
|-------|---------|
| Orbit Camera | Left 45°, Right 45°, Left 90°, Right 90° — camera moves around frozen subject |
| Orbit Person | Turn left 45°, Turn right 45°, Turn left 90°, Turn right 90° — subject rotates like a mannequin on turntable |

### Prompt Engineering

All presets append `ANGLE_LOCK` — an aggressive suffix that enforces:
- Single continuous image (anti-collage)
- Same location, background, setting
- Same person appearance: face, skin tone, ethnicity, body type, hair, makeup, clothing, accessories
- Same lighting, brightness, exposure, color temperature
- Photorealistic output

Orbit camera presets additionally enforce "FROZEN like a statue" — zero pose change, no arm/leg/hand/foot movement. Orbit person presets use "mannequin on a turntable" — rigid body rotation only.

### Generation Flow

1. Hover a frame/variant/IN thumbnail → click camera button (top-left)
2. Dropdown opens upward with preset list (fixed position, z-70)
3. Orbit groups open a submenu to the right (fixed position, z-80)
4. Hovering a preset shows its full prompt as a tooltip
5. Click a preset → calls `/api/generate` with:
   - `mediaType: "image"`
   - `selectedModel: { provider: "xai", modelId: "grok-imagine-image" }`
   - `images: [sourceImage]`
   - `prompt: preset.prompt` (includes ANGLE_LOCK)
   - `parameters: { aspect_ratio }` — preserves current aspect ratio
6. Result saved to `<project>/angles/angle_<timestamp>.png`
7. Variant appears as violet-bordered thumbnail next to its source

### Variant Chaining

Variants can be chained — click the camera button on any variant to generate another angle from that already-rendered image. The source image flows through `anglePickerSourceImage` state to `handleGenerateAngle`.

### NEXT Input

Click the green arrow button (bottom-left on hover) on any frame, variant, or IN image to set it as the next generation input. It appears as a green-bordered "NEXT" thumbnail at the end of the timeline. The X button on NEXT reverts to the last clip's frame.

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

## Continuity System

Each clip is generated independently, so the model has no context that it's continuing a sequence. The continuity system appends camera/motion instructions **after** the evasion-transformed prompt (evasion only applies to the creative content, not the camera instructions).

**Base instruction** (always appended when enabled):
> seamlessly continue this scene from the input frame, maintain consistent style, atmosphere, brightness, and exposure

**Toggleable modifiers** (chip buttons, multiple can be active):

| Modifier | Prompt appended |
|----------|----------------|
| Static camera | `static camera, no camera movement` |
| Slow pan | `slow smooth pan` |
| Slow zoom in | `slow subtle zoom in` |
| No cuts | `no scene cuts, no transitions` |
| Consistent light | `maintain exact same brightness, exposure, color temperature, and lighting throughout, no darkening or brightening` |
| Smooth motion | `smooth continuous motion, no sudden movements` |
| Eye contact | `person looking directly at camera, direct eye contact with viewer, facing the camera` |

**Defaults**: Enabled with "Static camera" + "Smooth motion" + "Consistent light" active.

**Prompt assembly order**: `[evasion(user prompt)]. [base continuity], [modifier1], [modifier2]`

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
- **Keyboard**: Spacebar toggles play/pause (ignored when focused on input/textarea/select)

## Core Workflow

1. Upload a reference image (left panel) — auto-cropped to aspect ratio
2. Write a prompt (right panel)
3. Select evasion technique — preview transformed output
4. Click **Generate** — clip appears on timeline
5. Last frame is extracted and set as next input (if enabled)
6. Optionally generate angle variants from frames or IN image to get clean camera angles
7. Use arrow button on any variant/frame to set as NEXT input for continued generation
8. Click a clip to load its prompt/technique, modify, and regenerate or generate next
9. Export all clips as a single MP4

## Data Model

```typescript
interface AngleVariant {
  id: string;
  clipId: string;              // parent clip ID or "__input__" for IN variants
  presetId: string;            // which angle preset was used
  image: string | null;        // data URL or API URL
  imagePath: string | null;    // relative path on disk
  status: "generating" | "done" | "error";
  error?: string;
}

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
  angleVariants: AngleVariant[];     // angle variants generated from this clip's frame
  status: "idle" | "generating" | "done" | "error";
  error?: string;
}
```

## State Persistence

- App mode (`workflow` or `scenario`) persists in `localStorage` under `node-banana-app-mode`
- Scenario state saves to disk as JSON in the project directory via `/api/scenario`
- Saved fields: `inputImagePath`, `originalInputImagePath`, `inputAngleVariants`, `prompt`, `evasionTechnique`, `continuityEnabled`, `activeModifiers`, `duration`, `aspectRatio`, `resolution`, `useLastFrame`, `clips` (with paths and angle variants), `activeClipId`
- `originalInputImagePath` tracks the first uploaded image separately so the IN thumbnail always shows the original even when a variant is set as current input
- On load, `"generating"` status clips/variants are reset to avoid stuck state

## Disk Structure

```
<project>/
  inputs/          # Uploaded input images
  generations/     # Generated video files
  frames/          # Extracted last-frame PNGs
  angles/          # Generated angle variant PNGs
  exports/         # Stitched export MP4s
  scenario.json    # Persisted state
```
