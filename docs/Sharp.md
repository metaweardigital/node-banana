# SHARP Integration — Image to 3D Node

## Overview

[SHARP](https://github.com/apple/ml-sharp) (by Apple) performs photorealistic 3D scene reconstruction from a single image. It generates a 3D Gaussian splat representation in under one second via a single feedforward neural network pass, which can then be rendered in real time from novel viewpoints.

**Paper:** [arXiv:2512.10685](https://arxiv.org/abs/2512.10685)
**Project page:** [apple.github.io/ml-sharp](https://apple.github.io/ml-sharp/)

## Why This Fits Node Banana

- Takes a single image as input → perfect for chaining after any image-producing node
- Sub-second inference → fast enough for interactive workflows
- Outputs standard `.ply` 3D Gaussian splats → viewable in browser with Three.js splat renderers
- Renders novel views as images → can pipe back into the existing image pipeline

## Architecture

### New Node: `imageTo3d`

| Property | Value |
|----------|-------|
| Type | `imageTo3d` |
| Input handles | `image` (from any image-producing node) |
| Output handles | `image` (rendered novel view) |
| Backend | Local SHARP CLI via API route |
| Download | `.ply` file available for download |

### Workflow Examples

```
[Prompt] → [Generate Image] → [Image to 3D] → [Output]
                                    ↓
                              (download .ply)

[Image Input] → [Image to 3D] → [Generate Image] (use novel view as reference)
```

## SHARP Setup (Prerequisites)

### Install SHARP locally

```bash
conda create -n sharp python=3.13
conda activate sharp
pip install -r requirements.txt  # from cloned ml-sharp repo
```

### Verify

```bash
sharp --help
```

Model checkpoint auto-downloads on first run to `~/.cache/torch/hub/checkpoints/`.

Manual download:
```bash
wget https://ml-site.cdn-apple.com/models/sharp/sharp_2572gikvuh.pt
```

### CLI Usage

```bash
# Predict 3D Gaussians from images
sharp predict -i /path/to/input/images -o /path/to/output/gaussians

# With manual checkpoint
sharp predict -i /path/to/input/images -o /path/to/output -c sharp_2572gikvuh.pt

# Render video orbit (CUDA only)
sharp predict -i /path/to/input/images -o /path/to/output --render
sharp render -i /path/to/output/gaussians -o /path/to/output/renderings
```

### Output Format

- `.ply` files (3D Gaussian Splats)
- OpenCV coordinate convention: x-right, y-down, z-forward
- Scene center at roughly `(0, 0, +z)`
- Compatible with public 3DGS renderers (may need re-centering)

## Implementation Plan

### Phase 1: Backend API Route

**File:** `src/app/api/sharp/route.ts`

1. Accept a base64 image from the request body
2. Write it to a temp file
3. Shell out to `sharp predict -i <tmpdir> -o <outdir>`
4. Read the output `.ply` file
5. Optionally render a novel view frame
6. Return the `.ply` file (as download URL) and rendered image (as base64)

```typescript
// Pseudocode
POST /api/sharp
Body: { image: string (base64 data URL) }
Response: {
  plyUrl: string,        // URL to download .ply file
  renderedView: string,  // base64 rendered novel view image
}
```

### Phase 2: Frontend Node Component

**New files:**
- `src/components/nodes/ImageTo3dNode.tsx`

**Modified files:**
- `src/types/index.ts` — add `ImageTo3dData` interface and `imageTo3d` to `NodeType`
- `src/store/workflowStore.ts` — add default data, dimensions, execution logic
- `src/components/nodes/index.ts` — export new node
- `src/components/WorkflowCanvas.tsx` — register node type
- `src/components/ConnectionDropMenu.tsx` — add to connection menus

**Node UI:**
- Thumbnail preview of the rendered novel view
- Camera angle controls (orbit angle, elevation)
- Download `.ply` button
- Status indicator during processing

### Phase 3: 3D Viewer (Optional Enhancement)

Add an in-browser Gaussian splat viewer using `@mkkellogg/gaussian-splats-3d` or similar Three.js-based renderer. This would allow interactive 3D exploration directly in the node.

## Technical Notes

- **CUDA requirement:** Video rendering (`--render`) requires CUDA GPU. Basic prediction works on CPU and MPS (Apple Silicon).
- **Processing time:** ~1 second for prediction on GPU, longer on CPU
- **Model size:** Checkpoint is downloaded once (~several hundred MB)
- **Coordinate system:** OpenCV conventions — may need transformation for Three.js (which uses y-up)

## Environment

Add to `.env.local`:
```
SHARP_PATH=sharp                    # Path to sharp CLI (default: assumes in PATH)
SHARP_CHECKPOINT=                   # Optional: path to manual checkpoint
```

## References

- [SHARP GitHub](https://github.com/apple/ml-sharp)
- [SHARP Paper](https://arxiv.org/abs/2512.10685)
- [SHARP Project Page](https://apple.github.io/ml-sharp/)
- [3D Gaussian Splatting](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/)
- [gaussian-splats-3d (Three.js viewer)](https://github.com/mkkellogg/GaussianSplats3D)
