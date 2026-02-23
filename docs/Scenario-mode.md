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
│        │    Preview        │  Controls [on/off]   │
│  9:16  │    (center)       │   ▶ Camera           │
│  Input │                   │   ▶ Lighting         │
│  Photo │                   │   ▶ Lens             │
│        │                   │   ▶ Mood             │
│        │                   │   ▶ Color            │
│        │                   │   ▶ Body             │
│        │                   │   ▶ Scene            │
│        │                   │  Image model [Grok]  │
│        │                   │  Appearance ref [on]  │
│        │                   │  Duration | Ratio    │
│        │                   │  Res                 │
│        │                   │  [▶ Generate/Cancel] │
├────────┴───────────────────┴────────────────────┤
│  ▶ 0:00 / 1:24      🔁 loop         [Export]   │
│  ──────── scrubber bar with playhead ────────   │
│  [IN][variants][clip1][→F1][variants][clip2]... │
│  ... [→NEXT]                             1px    │
└─────────────────────────────────────────────────┘
```

## Panels

### Left Panel — Input Photo (350px)

Upload or drag & drop an image. The image is center-cropped to match the selected aspect ratio before saving. The last frame of the most recently generated clip is always auto-set as the next input for chaining. The Back and New buttons sit inline in the panel header.

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
| **Controls** | Toggle (on by default) + collapsible cinematic groups (Camera, Lighting, Lens, Mood, Color, Body, Scene). Multiple groups can be open simultaneously. Each chip shows a tooltip with its full prompt on hover |
| **Image model** | Toggle between **Grok** (xAI `grok-imagine-image-pro`) and **NanoBanana** (Gemini `nano-banana-pro`) for angle variant image generation. Video generation always uses xAI |
| **Appearance reference** | Toggle (on by default). When enabled, both angle variant generation and video generation composite the original input image alongside the current frame to preserve full appearance consistency (face, clothing, accessories, tattoos, etc.) |
| **Parameters** | Duration slider (1–15s), Aspect Ratio (9:16, 16:9, 1:1), Resolution (480p, 720p) |
| **Generate** | Full-width button. Shows **Cancel** (red) during generation, **Regenerate** (amber) when a clip is selected, **Generate** (blue) otherwise. Cancel aborts the API call and removes the placeholder clip |

### Timeline (bottom bar, full-width, 200px)

- **Top row**: Play/Pause, time counter (`current / total`), loop toggle, Export button
- **Scrubber bar**: Draggable playhead with clip boundary markers and progress fill. Supports click-and-drag scrubbing (pauses during drag, resumes after)
- **Clip track**: Horizontally scrollable. All thumbnails are 200px tall with dynamic aspect ratio matching the selected ratio (9:16, 16:9, or 1:1).
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

**Error variant thumbnails** show the error icon, a truncated error message (3 lines max), and a dismiss X button (top-right). Click the X to remove the failed variant.

## Cinematic Controls System

Replaces the old flat "Continuity" chip toggles with organized, collapsible category groups using professional cinematography terminology from `docs/SKILL.md`.

**Base instruction** (always appended when Controls is enabled):
> seamlessly continue this scene from the input frame, maintain consistent style, atmosphere, brightness, and exposure

### Cinematic Groups

Groups use single-select (radio) behavior except Scene which is multi-select. Active chip styling: blue for single-select, green for multi-select (Scene).

| Group | Type | Options |
|-------|------|---------|
| **Camera** | Single-select | Static (default), Slow push in, Pull back, Slow pan, Tracking, Orbit, Crane, Handheld, Steadicam |
| **Lighting** | Single-select | Golden hour, Rim light, Soft diffused, Low key, High key, Neon, Volumetric, Natural, Candlelight |
| **Lens** | Single-select | Shallow DoF, Deep focus, 85mm portrait, 35mm wide, Anamorphic, Tilt-shift |
| **Mood** | Single-select | Misty, Foggy, Rainy, Moody, Ethereal, Gritty, Dreamy, Serene |
| **Color** | Single-select | Warm tones, Cool tones, Desaturated, Vibrant, Teal & Orange, Pastel, Monochrome, Film noir |
| **Body** | Single-select | Frozen pose (default), Natural pose, Action allowed |
| **Scene** | Multi-select | Smooth motion (default), No cuts, Consistent light (default), Eye contact, Empty scene |

**Prompt assembly order**: `[evasion(user prompt)]. [base continuity], [camera], [lighting], [lens], [mood], [color], [body], [scene modifiers]`

### Body Control

The Body control affects both video generation (via prompt) and angle variant generation (appended to preset prompts). This prevents the "creepy half-body twist" artifact where AI rotates only part of the body:

- **Frozen pose**: "FROZEN like a statue, completely rigid, ZERO movement, like a mannequin" — best for orbit/turnaround shots
- **Natural pose**: Allows subtle adjustments (weight shift, head tilt) but no major pose changes
- **Action allowed**: Person can move freely — for custom prompts like kneeling, sitting, walking

## Camera Angle Variants

Generate fresh high-quality images from frames or the input image using different camera perspectives. This combats quality degradation from chaining multiple video generations.

### Angle Presets

25+ presets organized into 5 fly-out submenu groups:

| Group | Presets |
|-------|---------|
| **Enhance** | Upscale, Clean up |
| **Framing** | Close-up, Wide shot, Medium shot, Extreme CU |
| **Angle** | Low angle, High angle, Profile, Over shoulder, Dutch angle, POV, Behind, Mirror flip |
| **Orbit Camera** | Left 45°, Right 45°, Left 90°, Right 90° — camera moves around frozen subject |
| **Orbit Person** | Turn left 45°/90°/135°, Turn right 45°/90°/135°, Turn 180° — subject rotates like a mannequin on turntable |
| **Custom** | Free-text input with `CUSTOM_LOCK` (identity + location preserved, pose changes allowed) |

### Prompt Engineering

**ANGLE_LOCK** (all presets except Custom):
- Single continuous image (anti-collage)
- Same location, background, setting
- Same person appearance: face, skin tone, ethnicity, body type, hair, makeup, clothing, accessories
- Same lighting, brightness, exposure, color temperature
- "DO NOT alter the person's appearance in any way"
- Photorealistic output

**CUSTOM_LOCK** (Custom option only):
- Same as ANGLE_LOCK but without "DO NOT alter the person's appearance in any way"
- Allows pose/action changes while preserving identity and location

Orbit Person presets additionally enforce accessory rotation: "All accessories (necklaces, watches, bracelets, bags, hats, glasses, earrings, belts) rotate WITH the body — they must appear from the correct angle for the new viewing direction, NOT remain front-facing."

### Appearance Reference Composite

When **Appearance reference** toggle is ON and the source image differs from the original upload (e.g. after a 180° turnaround), the system composites the original photo next to the current frame before sending to the API. This works for both **angle variant generation** (images) and **video generation**.

1. Creates a side-by-side canvas: LEFT = current frame (70% width), RIGHT = original appearance reference (30% width), separated by a white line
2. Prepends to prompt: "The input contains TWO images side by side... LARGE image on the LEFT is the scene to edit/animate... SMALL image on the RIGHT is ONLY an appearance reference..."
3. Instructs model to output a SINGLE image/video based on LEFT only, using RIGHT to maintain EXACT consistency of: face, skin tone, hair style and color, makeup, clothing, accessories (jewelry, watches, glasses, hats, bags, belts), tattoos, and every other visible detail

This preserves full appearance consistency even when the person is facing away from camera or when zooming out from a close-up. Toggle OFF when not needed (e.g. Upscale, or when working with a different person).

### Generation Flow

1. Hover a frame/variant/IN thumbnail → click camera button (top-left)
2. Dropdown opens upward with grouped submenus (Enhance, Framing, Angle, Orbit Camera, Orbit Person)
3. Hovering a preset shows its full prompt as a tooltip
4. Click a preset → calls `/api/generate` with:
   - `mediaType: "image"`
   - `selectedModel`: depends on Image model toggle — xAI (`grok-imagine-image-pro`) or Gemini (`nano-banana-pro`)
   - `images: [sourceImage]` (or composite if face reference enabled)
   - `prompt: preset.prompt + body control prompt` (includes ANGLE_LOCK/CUSTOM_LOCK)
   - `parameters: { aspect_ratio }` — preserves current aspect ratio
   - Gemini additionally sends `resolution: "2K"`
5. Result saved to `<project>/angles/angle_<timestamp>.png`
6. Variant appears as violet-bordered thumbnail next to its source

### Custom Angle

Click **Custom** at bottom of angle picker → textarea appears. Type your instruction (e.g. "kneeling down", "looking over left shoulder"), hit Enter or click Generate. The prompt wraps with `CUSTOM_LOCK` (preserves identity + location, allows pose changes).

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

## Video Generation

### Generate / Cancel

The generate button has three states:
- **Blue "Generate"** — starts video generation
- **Red "Cancel"** — appears during generation, aborts the API call via `AbortController` and removes the placeholder clip
- **Amber "Regenerate"** — when a clip is selected

### Last Frame Auto-Chain

After each clip generates, the last frame is always extracted and set as the next input (hardcoded, no toggle). This ensures continuous scene chaining.

1. Creates an off-screen `<video>` element
2. Seeks to `duration - 0.05s`
3. Waits 200ms for frame decode, then draws to canvas
4. Saves as PNG to `<project>/frames/lastframe_<timestamp>.png`
5. Updates the clip's `lastFrame`/`lastFramePath` fields
6. Sets as input image for the next generation

Timeout: 20 seconds. On failure, falls back gracefully (clip still works, just no frame thumbnail).

## Playback

- **Sequential**: Plays clips in order using `requestAnimationFrame` loop
- **Looping**: Toggle in timeline toolbar — restarts from beginning when reaching the end
- **Clip switching**: Tracks active clip via `prevClipRef` to avoid unnecessary re-renders. On clip change, waits two animation frames for React to render new video src before playing
- **Scrubbing**: Click-and-drag on the scrubber bar. Pauses playback during drag, resumes after mouseup if it was playing before
- **Keyboard**: Spacebar toggles play/pause (ignored when focused on input/textarea/select)

## Video Export

Uses the `useStitchVideos` hook (`src/hooks/useStitchVideos.ts`) backed by the `mediabunny` library for client-side video stitching.

1. Fetches all playable clip videos as blobs
2. Stitches them into a single MP4 using WebCodecs
3. Triggers a browser download (`scenario_export_<timestamp>.mp4`)
4. Optionally saves to `<project>/exports/` on disk

Progress states: encoding → complete / error.

## Core Workflow

1. Upload a reference image (left panel) — auto-cropped to aspect ratio
2. Write a prompt (right panel)
3. Select evasion technique — preview transformed output
4. Configure cinematic controls (Camera, Lighting, Lens, Mood, Color, Body, Scene)
5. Click **Generate** — clip appears on timeline (click Cancel to abort)
6. Last frame is extracted and auto-set as next input
7. Optionally generate angle variants from frames or IN image to get clean camera angles
8. Use arrow button on any variant/frame to set as NEXT input for continued generation
9. Click a clip to load its prompt/technique, modify, and regenerate or generate next
10. Export all clips as a single MP4

## Data Model

```typescript
interface CinematicState {
  camera: string | null;
  lighting: string | null;
  lens: string | null;
  mood: string | null;
  color: string | null;
  body: string | null;
  scene: Set<string>;
}

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
- Saved fields: `inputImagePath`, `originalInputImagePath`, `inputAngleVariants`, `prompt`, `evasionTechnique`, `continuityEnabled`, `cinematic` (camera, lighting, lens, mood, color, body, scene), `duration`, `aspectRatio`, `resolution`, `useLastFrame`, `clips` (with paths and angle variants), `activeClipId`
- `originalInputImagePath` tracks the first uploaded image separately so the IN thumbnail always shows the original even when a variant is set as current input
- Backwards compatible: loads old `activeModifiers` format and maps to new cinematic state
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
