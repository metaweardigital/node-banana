/**
 * ComfyUI Provider for Generate API Route
 *
 * Handles image generation using a local ComfyUI server.
 * - Builds ComfyUI workflow JSON from parameters
 * - Submits via POST {serverUrl}/prompt
 * - Polls GET {serverUrl}/history/{promptId} until complete
 * - Fetches result image via GET {serverUrl}/view?filename=...
 * - Returns base64 image
 */

import { GenerationInput, GenerationOutput } from "@/lib/providers/types";

const POLL_INTERVAL = 1000; // 1 second
const MAX_POLL_TIME = 300_000; // 5 minutes

/**
 * Build a text-to-image ComfyUI workflow JSON
 */
function buildTxt2ImgWorkflow(
  checkpoint: string,
  prompt: string,
  negativePrompt: string,
  params: Record<string, unknown>
): Record<string, unknown> {
  const seed = (params.seed as number) ?? Math.floor(Math.random() * 2 ** 32);
  const steps = (params.steps as number) ?? 20;
  const cfg = (params.cfg as number) ?? 7;
  const width = (params.width as number) ?? 512;
  const height = (params.height as number) ?? 512;
  const samplerName = (params.sampler_name as string) ?? "euler";
  const scheduler = (params.scheduler as string) ?? "normal";
  const denoise = (params.denoise as number) ?? 1.0;

  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: checkpoint },
    },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: { text: prompt, clip: ["1", 1] },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: negativePrompt, clip: ["1", 1] },
    },
    "4": {
      class_type: "EmptyLatentImage",
      inputs: { width, height, batch_size: 1 },
    },
    "5": {
      class_type: "KSampler",
      inputs: {
        seed,
        steps,
        cfg,
        sampler_name: samplerName,
        scheduler,
        denoise,
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["4", 0],
      },
    },
    "6": {
      class_type: "VAEDecode",
      inputs: { samples: ["5", 0], vae: ["1", 2] },
    },
    "7": {
      class_type: "SaveImage",
      inputs: { filename_prefix: "NodeBanana", images: ["6", 0] },
    },
  };
}

/**
 * Build an image-to-image ComfyUI workflow JSON
 */
function buildImg2ImgWorkflow(
  checkpoint: string,
  prompt: string,
  negativePrompt: string,
  imageBase64: string,
  params: Record<string, unknown>
): Record<string, unknown> {
  const seed = (params.seed as number) ?? Math.floor(Math.random() * 2 ** 32);
  const steps = (params.steps as number) ?? 20;
  const cfg = (params.cfg as number) ?? 7;
  const samplerName = (params.sampler_name as string) ?? "euler";
  const scheduler = (params.scheduler as string) ?? "normal";
  const denoise = (params.denoise as number) ?? 0.75;

  // Strip data URL prefix if present
  const base64Data = imageBase64.replace(/^data:image\/[^;]+;base64,/, "");

  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: checkpoint },
    },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: { text: prompt, clip: ["1", 1] },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: negativePrompt, clip: ["1", 1] },
    },
    "4": {
      class_type: "LoadImageFromBase64",
      inputs: { image: base64Data },
    },
    "5": {
      class_type: "VAEEncode",
      inputs: { pixels: ["4", 0], vae: ["1", 2] },
    },
    "6": {
      class_type: "KSampler",
      inputs: {
        seed,
        steps,
        cfg,
        sampler_name: samplerName,
        scheduler,
        denoise,
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["5", 0],
      },
    },
    "7": {
      class_type: "VAEDecode",
      inputs: { samples: ["6", 0], vae: ["1", 2] },
    },
    "8": {
      class_type: "SaveImage",
      inputs: { filename_prefix: "NodeBanana", images: ["7", 0] },
    },
  };
}

/**
 * Generate image using a local ComfyUI server
 */
export async function generateWithComfyUI(
  requestId: string,
  serverUrl: string,
  input: GenerationInput
): Promise<GenerationOutput> {
  // Normalize server URL (remove trailing slash)
  const baseUrl = serverUrl.replace(/\/+$/, "");
  const checkpoint = input.model.id;

  console.log(`[API:${requestId}] ComfyUI generation - Server: ${baseUrl}, Checkpoint: ${checkpoint}`);

  // Extract prompt and negative prompt
  const prompt = input.prompt || "";
  const negativePrompt =
    (input.dynamicInputs?.negative_prompt as string) ||
    (input.parameters?.negative_prompt as string) ||
    "";

  // Get input image if available
  let inputImage: string | null = null;
  if (input.dynamicInputs) {
    for (const [key, value] of Object.entries(input.dynamicInputs)) {
      if (key === "image" || key === "image_url") {
        inputImage = Array.isArray(value) ? value[0] : value;
        break;
      }
    }
  }
  if (!inputImage && input.images && input.images.length > 0) {
    inputImage = input.images[0];
  }

  // Build workflow
  const params = input.parameters || {};
  const workflow = inputImage
    ? buildImg2ImgWorkflow(checkpoint, prompt, negativePrompt, inputImage, params)
    : buildTxt2ImgWorkflow(checkpoint, prompt, negativePrompt, params);

  try {
    // Submit prompt to ComfyUI
    console.log(`[API:${requestId}] Submitting workflow to ComfyUI...`);
    const submitResponse = await fetch(`${baseUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow }),
    });

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text();
      throw new Error(`ComfyUI submit failed (${submitResponse.status}): ${errorText}`);
    }

    const submitData = await submitResponse.json();
    const promptId = submitData.prompt_id;

    if (!promptId) {
      throw new Error("ComfyUI did not return a prompt_id");
    }

    console.log(`[API:${requestId}] ComfyUI prompt_id: ${promptId}`);

    // Poll for completion
    const startTime = Date.now();
    let outputImages: Array<{ filename: string; subfolder: string; type: string }> | null = null;

    while (Date.now() - startTime < MAX_POLL_TIME) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

      const historyResponse = await fetch(`${baseUrl}/history/${promptId}`);
      if (!historyResponse.ok) {
        continue; // Retry on transient errors
      }

      const historyData = await historyResponse.json();
      const promptHistory = historyData[promptId];

      if (!promptHistory) {
        continue; // Not ready yet
      }

      // Check for errors
      if (promptHistory.status?.status_str === "error") {
        const errorMsg = promptHistory.status?.messages?.join("; ") || "ComfyUI execution failed";
        throw new Error(errorMsg);
      }

      // Check for outputs
      if (promptHistory.outputs) {
        // Find the SaveImage node output (look for images in any output node)
        for (const nodeOutput of Object.values(promptHistory.outputs)) {
          const output = nodeOutput as Record<string, unknown>;
          if (output.images && Array.isArray(output.images) && output.images.length > 0) {
            outputImages = output.images as Array<{ filename: string; subfolder: string; type: string }>;
            break;
          }
        }
        if (outputImages) break;
      }
    }

    if (!outputImages || outputImages.length === 0) {
      throw new Error("ComfyUI generation timed out or produced no output");
    }

    // Fetch the result image
    const img = outputImages[0];
    const viewParams = new URLSearchParams({
      filename: img.filename,
      subfolder: img.subfolder || "",
      type: img.type || "output",
    });

    console.log(`[API:${requestId}] Fetching result image: ${img.filename}`);
    const imageResponse = await fetch(`${baseUrl}/view?${viewParams.toString()}`);

    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch ComfyUI output image: ${imageResponse.status}`);
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString("base64");
    const contentType = imageResponse.headers.get("content-type") || "image/png";
    const dataUrl = `data:${contentType};base64,${base64}`;

    console.log(`[API:${requestId}] ComfyUI generation complete (${Math.round(imageBuffer.byteLength / 1024)}KB)`);

    return {
      success: true,
      outputs: [{ type: "image", data: dataUrl }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "ComfyUI generation failed";
    console.error(`[API:${requestId}] ComfyUI error: ${errorMessage}`);

    // Provide helpful error for connection failures
    if (errorMessage.includes("ECONNREFUSED") || errorMessage.includes("fetch failed")) {
      return {
        success: false,
        error: `Cannot connect to ComfyUI server at ${baseUrl}. Make sure ComfyUI is running with --listen 0.0.0.0`,
      };
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}
