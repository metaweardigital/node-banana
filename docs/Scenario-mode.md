# Scenario Mode

Scenario Mode is a video editor-style interface for chaining AI video generations. Unlike the node-based workflow editor, it provides a linear, streamlined layout focused on iterative video generation.

## How to Access

From the Welcome Modal, click **Scenario Mode** (5th option). Click **Back** (top-left) to return to the Welcome Modal.

## Layout

Full-screen, no header. Three-column layout with a fixed timeline bar at the bottom.

```
┌────────┬───────────────────┬────────────────────┐
│        │                   │  Prompt             │
│  9:16  │                   │  Evasion toggle     │
│  Input │    9:16 Video     │  Language/translate  │
│  Photo │    Preview        │  Negative prompt    │
│        │    (center)       │  Style modifiers    │
│        │                   │  ────────────────── │
│        │                   │  Duration | AR      │
│        │                   │  Resolution         │
│        │                   │  [▶ Generate]       │
├────────┴───────────────────┴────────────────────┤
│  ▶ 0:00 / 1:24                       zoom +/-  │
│  [clip1][clip2][clip3][+]                       │
│  ─────────────────── timeline ──────────────    │
└─────────────────────────────────────────────────┘
```

## Panels

### Left Panel — Input Photo (250px)

Upload or drag & drop an image. Displays a 9:16 preview. When "Use last frame" is enabled, this auto-updates with the last frame of the previous clip.

### Center Panel — Video Preview (flex)

Shows the currently selected clip or a placeholder when empty. Hover reveals play/pause overlay. Displays clip number, duration, and model name below the preview.

### Right Panel — Control Center (320px, scrollable)

All generation controls in one place:

| Section | Description |
|---------|-------------|
| **Prompt** | Main text prompt for the scene |
| **Evasion** | Toggle on/off with technique selector (Context Framing, Role Play, Metaphor) |
| **Language** | Language selector for prompt translation — serves as additional evasion layer |
| **Negative Prompt** | Collapsible section for things to avoid |
| **Style** | Tag chips (cinematic, slow motion, dramatic lighting, etc.) |
| **Parameters** | Duration (1–15s), Aspect Ratio (9:16, 16:9, 1:1), Resolution (480p, 720p) |
| **Generate** | Full-width button with "Use last frame" checkbox |

### Timeline (140px, full-width bottom bar)

- **Top row**: Play/Pause all, time counter, zoom controls
- **Clip track**: Horizontally scrollable thumbnails, click to select, "+" to add
- **Time axis**: Second markers with tick marks

## Core Workflow

1. Upload a reference image (left panel)
2. Write a prompt and configure settings (right panel)
3. Click **Generate** — clip appears on timeline
4. With "Use last frame" enabled, the last frame of the generated clip becomes the input for the next generation
5. Repeat to build a video sequence

## State Persistence

App mode (`workflow` or `scenario`) persists in `localStorage` under `node-banana-app-mode`, so page refresh stays in Scenario Mode.

## Future Plans

- **Variants**: Alternative versions of each clip segment, toggle with eye icon
- **Branching timeline**: Fork from any clip to explore different directions
- **Segment regeneration**: Re-generate any clip (not just the last) and cascade changes
- **Backend integration**: Connect to Grok/xAI video generation API
