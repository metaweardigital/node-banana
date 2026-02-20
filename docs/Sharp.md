# SHARP Integration — Image to 3D Node

## Overview

[SHARP](https://github.com/apple/ml-sharp) (by Apple) performs photorealistic 3D scene reconstruction from a single image. It generates a 3D Gaussian splat representation in under one second via a single feedforward neural network pass.

**Paper:** [arXiv:2512.10685](https://arxiv.org/abs/2512.10685)
**Project page:** [apple.github.io/ml-sharp](https://apple.github.io/ml-sharp/)

## Current Implementation

### Node: `imageTo3d`

| Property | Value |
|----------|-------|
| Type | `imageTo3d` |
| Input handles | `image` (left, 50%) |
| Output handles | `image` (right, 50%) — rendered point cloud view |
| Backend | Local SHARP CLI via `/api/sharp` route |
| Download | `.ply` file download button in node |
| Keyboard shortcut | `Shift + 3` |
| Add via UI | Floating Action Bar → "SHARP 3D" |

### Workflow

```
[Prompt] → [Generate Image] → [SHARP 3D] → [Output]
                                    ↓
                              (download .ply)

[Image Input] → [SHARP 3D] → [Generate Image] (use novel view as reference)
```

### Files

**Created:**
- `src/app/api/sharp/route.ts` — API route (POST /api/sharp)
- `src/components/nodes/ImageTo3dNode.tsx` — Node component
- `src/store/execution/imageTo3dExecutor.ts` — Execution logic
- `scripts/render_ply.py` — Fallback point cloud renderer (no CUDA)

**Modified:**
- `src/types/nodes.ts` — `ImageTo3dNodeData` interface, `"imageTo3d"` in `NodeType` union
- `src/store/utils/nodeDefaults.ts` — Default data (300x300)
- `src/store/execution/executeNode.ts` — Dispatch case
- `src/store/execution/index.ts` — Export
- `src/store/workflowStore.ts` — Added to `executeWorkflow`, `regenerateNode`, `executeSelectedNodes`
- `src/components/nodes/index.ts` — Export
- `src/components/WorkflowCanvas.tsx` — Node type registration, handle types, keyboard shortcut
- `src/components/ConnectionDropMenu.tsx` — IMAGE_TARGET_OPTIONS + IMAGE_SOURCE_OPTIONS
- `src/components/FloatingActionBar.tsx` — Add node button
- `src/store/utils/connectedInputs.ts` — Extract `outputImage` from imageTo3d nodes
- `src/lib/quickstart/validation.ts` — Default data + dimensions

### API Route Details

```
POST /api/sharp
Body: { image: string (base64 data URL) }
Response: {
  success: boolean,
  plyBase64?: string,           // raw .ply file as base64
  renderedView?: string,        // base64 data URL of rendered preview
  error?: string
}
```

**Processing flow:**
1. Write base64 image to temp directory
2. Call `sharp predict -i <input> -o <output>` via `execFile`
3. Read output `.ply` file
4. Try SHARP native render (`sharp render`) — requires CUDA
5. If no CUDA: fall back to `scripts/render_ply.py` (Python point cloud renderer)
6. Return `.ply` + rendered preview image
7. Cleanup temp files in `finally` block

**Timeout:** 10 minutes (first run downloads 2.6GB model checkpoint)

### Rendering Pipeline

SHARP's `sharp render` command requires NVIDIA CUDA GPU. On Apple Silicon (MPS), we use a fallback:

| Platform | Prediction | Rendering |
|----------|-----------|-----------|
| CUDA GPU | `sharp predict` (< 1s) | `sharp render` (native, high quality) |
| Apple Silicon (MPS) | `sharp predict` (< 1s) | `scripts/render_ply.py` (point cloud fallback) |
| CPU | `sharp predict` (slower) | `scripts/render_ply.py` (point cloud fallback) |

The fallback renderer (`render_ply.py`):
- Reads `.ply` Gaussian splat data
- Converts SH DC coefficients to RGB (`color = 0.5 + C0 * f_dc`)
- Applies sigmoid to opacity values
- Renders front-view orthographic projection with alpha compositing
- Outputs 1024x768 PNG

## SHARP Setup

### Prerequisites

```bash
# Install Miniforge (macOS ARM64)
brew install miniforge

# Create environment and install
conda create -n sharp python=3.13 -y
conda activate sharp
git clone https://github.com/apple/ml-sharp.git ~/ml-sharp
cd ~/ml-sharp
pip install -r requirements.txt

# Verify
sharp --help
```

### Environment Configuration

Add to `.env.local`:
```
SHARP_PATH=/opt/homebrew/Caskroom/miniforge/base/envs/sharp/bin/sharp
SHARP_CHECKPOINT=                   # Optional: path to manual checkpoint
```

The full path to the `sharp` binary is required because the Next.js dev server doesn't run inside the conda environment. Find it with `conda run -n sharp which sharp`.

### Model Checkpoint

- Auto-downloads on first run to `~/.cache/torch/hub/checkpoints/`
- Size: ~2.6GB (`sharp_2572gikvuh.pt`)
- Manual download: `wget https://ml-site.cdn-apple.com/models/sharp/sharp_2572gikvuh.pt`

### Output Format

- `.ply` files (3D Gaussian Splats)
- OpenCV coordinate convention: x-right, y-down, z-forward
- Scene center at roughly `(0, 0, +z)`
- Compatible with macOS Preview, Xcode, and public 3DGS renderers

## Future Vision

The long-term goal is an **AI virtual camera studio**:

```
[Generate Scene] → [SHARP 3D] → [Pick Angle] → [AI Re-render] → [Clean Output]
```

### Planned Enhancements

1. **Orbit filmstrip** — render 8-12 frames around the reconstructed scene server-side, display as scrubable strip in the node. User picks the angle, that frame becomes the output.

2. **Camera parameter sliders** — expose angle/elevation/distance controls in the node UI. Adjusting them re-renders the view server-side via the Python renderer.

3. **AI clean render** — chain the rough point cloud render into a Generate Image node (img2img) to get a photorealistic final frame. SHARP acts as a 3D proxy, AI as the final renderer.

4. **Multi-shot consistency** — generate one hero image, then produce consistent multi-angle shots of the same scene for turnarounds, product shots, or cinematic sequences.

5. **Custom WebGL renderer** — lightweight Gaussian splat viewer directly in the node using a minimal WebGL shader on `<canvas>` (no Three.js dependency). Would enable interactive rotation without server roundtrips.

6. **Improved fallback renderer** — current point cloud renderer is basic orthographic projection. Could be improved with:
   - Perspective projection with configurable FOV
   - Proper Gaussian splatting (not just points)
   - Multiple render angles in a single pass
   - GPU acceleration via Metal/MPS for macOS

## References

- [SHARP GitHub](https://github.com/apple/ml-sharp)
- [SHARP Paper](https://arxiv.org/abs/2512.10685)
- [SHARP Project Page](https://apple.github.io/ml-sharp/)
- [3D Gaussian Splatting](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/)
- [gaussian-splats-3d (Three.js viewer)](https://github.com/mkkellogg/GaussianSplats3D)
