# Local Models via ComfyUI Provider

Implementation plan for integrating local AI models (FLUX, Stable Diffusion, etc.) into Node Banana through ComfyUI as a backend.

## Overview

ComfyUI runs on a dedicated Mac Studio in the local network, accessible via IP (e.g., `http://192.168.x.x:8188`). Node Banana (running on a dev machine) connects to it as another provider over LAN, sending prompts and receiving generated images/videos. No cloud APIs, no API keys — everything stays on the local network.

## Deployment Setup

```
┌─────────────────────┐         LAN          ┌─────────────────────────┐
│   Dev Machine       │  ◄──────────────►    │   Mac Studio            │
│                     │    192.168.x.x       │                         │
│   Node Banana       │                      │   ComfyUI Server        │
│   (Next.js :3000)   │  ── HTTP/WS ──►     │   (:8188)               │
│                     │                      │                         │
│   Browser UI        │                      │   Apple Silicon GPU     │
│                     │                      │   (M1/M2/M3/M4 Ultra)  │
│                     │                      │   MPS backend           │
│                     │                      │   Model checkpoints     │
└─────────────────────┘                      └─────────────────────────┘
```

### Mac Studio Setup (one-time)

1. Install ComfyUI on Mac Studio (supports MPS/Metal natively)
2. Download model checkpoints to `ComfyUI/models/checkpoints/`
3. Start ComfyUI with LAN access: `python main.py --listen 0.0.0.0 --port 8188`
4. Note the Mac Studio's local IP (e.g., `192.168.1.50`)

### Node Banana Configuration

1. Enable ComfyUI provider in settings
2. Enter server URL: `http://192.168.1.50:8188`
3. Test connection — done

## Why ComfyUI

- De facto standard for local image generation inference
- Built-in API server with WebSocket + REST endpoints
- Native Apple Silicon (MPS/Metal) support — runs on Mac Studio without CUDA
- Supports FLUX.1, FLUX.2, Stable Diffusion, and hundreds of community models
- Quantized models (fp8) for reduced memory usage
- Massive community with pre-built workflows
- `--listen 0.0.0.0` flag exposes API to local network

## Supported Models (via ComfyUI on Mac Studio)

Mac Studio M1/M2 Ultra has 64-192GB unified memory, which is shared between CPU and GPU. This means even large models fit comfortably.

| Model | Params | Type | Memory (approx) | Mac Studio |
|-------|--------|------|-----------------|------------|
| FLUX.1-schnell | ~12B | text-to-image (1-4 steps) | ~16GB | M1 Ultra+ |
| FLUX.1-dev | ~12B | text-to-image | ~24GB | M1 Ultra+ |
| FLUX.1-Kontext-dev | ~12B | image-to-image (editing) | ~24GB | M1 Ultra+ |
| FLUX.2-dev | 32B | text-to-image + editing | ~40GB | M2 Ultra+ |
| FLUX.2-klein-4B (fp8) | 4B | image-to-image | ~8GB | Any M-series |
| FLUX.2-klein-9B (fp8) | 9B | image-to-image | ~16GB | M1 Ultra+ |
| Stable Diffusion XL | ~6.6B | text-to-image | ~8GB | Any M-series |
| Any checkpoint/LoRA | varies | varies | varies | depends |

> Note: Apple Silicon unified memory allows running models that would require dedicated VRAM on NVIDIA GPUs. A Mac Studio M2 Ultra with 192GB can run FLUX.2-dev (32B) without issues.

## Architecture

```
Node Banana (Next.js, dev machine)
    │
    ├── /api/generate  ──►  POST http://192.168.x.x:8188/prompt
    │                           (submit ComfyUI workflow JSON)
    │
    ├── WebSocket ws://192.168.x.x:8188/ws
    │       (real-time progress updates)
    │
    └── /api/models    ──►  GET http://192.168.x.x:8188/object_info
                                (discover available nodes/models)
```

### Network Considerations

- ComfyUI must be started with `--listen 0.0.0.0` to accept LAN connections
- Image data transfers over LAN (base64 encoded) — fast on gigabit ethernet
- WebSocket connection for progress updates works across LAN
- No authentication by default — ComfyUI trusts all connections on the network
- Optional: restrict access via firewall rules on Mac Studio

## Implementation Steps

### Step 1: Add Provider Type

**File:** `src/types/providers.ts`

- Add `"comfyui"` to `ProviderType` union
- Add ComfyUI-specific config fields:
  - `serverUrl: string` (default `http://localhost:8188`, user sets to Mac Studio IP like `http://192.168.1.50:8188`)
  - `enabled: boolean`

### Step 2: Provider Settings UI

**File:** `src/components/ProjectSetupModal.tsx` (or wherever provider settings live)

- Add ComfyUI provider section with:
  - Enable/disable toggle
  - Server URL input (default `http://localhost:8188`, e.g., `http://192.168.1.50:8188` for Mac Studio)
  - Connection test button (ping `/system_stats` endpoint over LAN)
  - Status indicator (connected/disconnected) with GPU info from Mac Studio

### Step 3: Default Provider Settings

**File:** `src/store/utils/localStorage.ts`

- Add `comfyui` to default provider settings:
  ```ts
  comfyui: { id: "comfyui", name: "ComfyUI (Local)", enabled: false, serverUrl: "http://localhost:8188" }
  ```

### Step 4: Environment Status

**File:** `src/app/api/env-status/route.ts`

- Add `comfyui: boolean` to status response
- Check by pinging the configured server URL `/system_stats`

### Step 5: Model Discovery

**File:** `src/app/api/models/route.ts`

- Add `fetchComfyUIModels()` function
- Call ComfyUI endpoints to discover available models:
  - `GET /object_info` — lists all available nodes and their configs
  - `GET /models/checkpoints` — lists downloaded checkpoint files
  - `GET /models/loras` — lists available LoRA files
- Map checkpoint filenames to `ProviderModel` entries with:
  - `id`: checkpoint filename (e.g., `flux1-dev-fp8.safetensors`)
  - `provider`: `"comfyui"`
  - `capabilities`: inferred from model name or default to `["text-to-image"]`
  - `description`: filename + file size if available

### Step 6: Model Schema

**File:** `src/app/api/models/[modelId]/route.ts`

- Add `getComfyUISchema()` function
- Return standard parameters for image generation:
  - `width` (int, default 1024)
  - `height` (int, default 1024)
  - `steps` (int, default 20)
  - `cfg` / `guidance_scale` (float, default 7.0)
  - `sampler_name` (enum: euler, euler_a, dpmpp_2m, etc.)
  - `scheduler` (enum: normal, karras, sgm_uniform, etc.)
  - `seed` (int, default -1 for random)
  - `denoise` (float, default 1.0)
- Inputs: `prompt` (text), `negative_prompt` (text), optionally `image` (for img2img)

### Step 7: Workflow Template Builder

**New file:** `src/app/api/generate/providers/comfyui.ts`

Core function: build a ComfyUI workflow JSON (API format) from Node Banana's parameters.

```ts
function buildComfyUIWorkflow(params: {
  checkpoint: string;
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
  seed: number;
  denoise: number;
  inputImage?: string; // base64 for img2img
}): ComfyUIWorkflow
```

The workflow JSON maps to ComfyUI's node graph format:

**Text-to-image workflow:**
```
CheckpointLoaderSimple → KSampler → VAEDecode → SaveImage
CLIPTextEncode (positive) ──┘
CLIPTextEncode (negative) ──┘
EmptyLatentImage ───────────┘
```

**Image-to-image workflow:**
```
CheckpointLoaderSimple → KSampler → VAEDecode → SaveImage
CLIPTextEncode (positive) ──┘
CLIPTextEncode (negative) ──┘
LoadImage → VAEEncode ──────┘
```

### Step 8: Generation Handler

**File:** `src/app/api/generate/route.ts`

Add `generateWithComfyUI()`:

1. **Build workflow** from parameters using template builder
2. **Upload input image** (if img2img): `POST /upload/image` with multipart form data
3. **Submit workflow**: `POST /prompt` with `{ prompt: workflowJSON, client_id: uuid }`
4. **Poll for completion**: Connect to `ws://server/ws?clientId=uuid` or poll `GET /history/{prompt_id}`
5. **Retrieve result**: `GET /view?filename=...&subfolder=...&type=output`
6. **Return** base64 image data

```ts
async function generateWithComfyUI(
  serverUrl: string,
  prompt: string,
  images: string[],
  parameters: Record<string, unknown>,
  selectedModel: SelectedModel
): Promise<{ image?: string; video?: string }>
```

### Step 9: API Headers

**File:** `src/store/utils/buildApiHeaders.ts`

- Add `comfyui` case — no API key needed, but pass `X-ComfyUI-Server` header with server URL

### Step 10: UI Integration

**File:** `src/components/nodes/GenerateImageNode.tsx`

- ComfyUI models appear in the model dropdown when provider is enabled
- No API key required — just needs server URL configured

**File:** `src/components/modals/ModelSearchDialog.tsx`

- Show ComfyUI models with local/offline indicator
- Show connection status badge

### Step 11: Connection Health Check

**New utility:** `src/utils/comfyuiClient.ts`

Simple client with:
- `ping(serverUrl)` — check if server is running
- `getModels(serverUrl)` — list available checkpoints
- `submitPrompt(serverUrl, workflow)` — submit generation job
- `waitForResult(serverUrl, promptId)` — poll until complete
- `getImage(serverUrl, filename)` — retrieve generated image

## ComfyUI API Reference

### Key Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/system_stats` | Server status + GPU info |
| GET | `/object_info` | All available node types |
| GET | `/models/checkpoints` | List checkpoint files |
| GET | `/models/loras` | List LoRA files |
| POST | `/prompt` | Submit workflow for execution |
| GET | `/history/{prompt_id}` | Get execution result |
| GET | `/view?filename=X` | Retrieve generated image |
| POST | `/upload/image` | Upload input image |
| WS | `/ws?clientId=X` | Real-time progress updates |

### Workflow JSON Format (API)

ComfyUI workflows in API format are node graphs where each node has an ID, class type, and inputs:

```json
{
  "3": {
    "class_type": "KSampler",
    "inputs": {
      "seed": 12345,
      "steps": 20,
      "cfg": 7.0,
      "sampler_name": "euler",
      "scheduler": "normal",
      "denoise": 1.0,
      "model": ["4", 0],
      "positive": ["6", 0],
      "negative": ["7", 0],
      "latent_image": ["5", 0]
    }
  },
  "4": {
    "class_type": "CheckpointLoaderSimple",
    "inputs": {
      "ckpt_name": "flux1-dev.safetensors"
    }
  }
}
```

Array values like `["4", 0]` reference another node's output (node ID, output index).

## File Changes Summary

| File | Change |
|------|--------|
| `src/types/providers.ts` | Add `"comfyui"` to ProviderType, extend config |
| `src/store/utils/localStorage.ts` | Add comfyui default settings |
| `src/store/utils/buildApiHeaders.ts` | Add comfyui header case |
| `src/store/workflowStore.ts` | Add comfyui to useProviderApiKeys |
| `src/app/api/env-status/route.ts` | Add comfyui status check |
| `src/app/api/models/route.ts` | Add fetchComfyUIModels() |
| `src/app/api/models/[modelId]/route.ts` | Add getComfyUISchema() |
| `src/app/api/generate/route.ts` | Add comfyui routing + handler |
| `src/app/api/generate/providers/comfyui.ts` | **New** — workflow builder + generation logic |
| `src/utils/comfyuiClient.ts` | **New** — ComfyUI API client utility |
| `src/components/ProjectSetupModal.tsx` | Add ComfyUI settings section |
| `src/components/modals/ModelSearchDialog.tsx` | Show ComfyUI models |
| `src/components/nodes/GenerateImageNode.tsx` | Support comfyui provider |

## Open Questions

1. **FLUX-specific workflows**: FLUX models use different node types in ComfyUI (e.g., `DualCLIPLoader` instead of `CheckpointLoaderSimple`). Should we detect model type and build appropriate workflows, or start with a generic SD workflow?
2. **Custom workflows**: Should users be able to paste their own ComfyUI workflow JSON and just override the prompt/image inputs? This would be very powerful but adds UI complexity.
3. **Progress reporting**: ComfyUI sends step-by-step progress via WebSocket. Should we show a progress bar in the node during generation?
4. **Multiple ComfyUI servers**: Support for multiple Mac Studios / local servers on the network?
5. **Video models**: ComfyUI also supports video generation (AnimateDiff, etc.). Include in v1 or defer?
6. **Mac Studio performance**: Apple Silicon MPS inference is slower than NVIDIA CUDA for diffusion models. Should we show estimated generation time based on model + hardware?
7. **Large image transfer**: Generated images are transferred over LAN as base64. For batch generation, should we consider streaming or file-based transfer?

## Future Enhancements

- **Workflow import**: Drag & drop a ComfyUI workflow JSON to auto-create Node Banana nodes
- **LoRA support**: Select and apply LoRA models as a parameter
- **Preview during generation**: Show intermediate steps via WebSocket
- **Queue management**: Show ComfyUI queue status, cancel running jobs
- **Auto-detect model type**: Automatically choose correct workflow template based on model architecture
