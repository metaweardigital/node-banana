/**
 * BFL (Black Forest Labs) Provider for Generate API Route
 *
 * Handles image generation using the FLUX API.
 * Async submit + poll via polling_url.
 * Supports text-to-image and image-to-image (Kontext, Flex, Pro models).
 */

import { GenerationInput, GenerationOutput } from "@/lib/providers/types";

const BFL_API_BASE = "https://api.bfl.ai/v1";

/** Extract a clean error message from an API error response */
function parseBflError(responseText: string, statusCode: number): string {
  if (responseText.trimStart().startsWith("<!") || responseText.trimStart().startsWith("<html")) {
    return `Server error (HTTP ${statusCode}). The BFL API may be temporarily unavailable.`;
  }
  try {
    const errorJson = JSON.parse(responseText);
    return errorJson.detail || errorJson.error?.message || errorJson.error || errorJson.message || responseText;
  } catch {
    return responseText;
  }
}

/**
 * Generate image using BFL FLUX API (async submit + poll)
 */
export async function generateWithBfl(
  requestId: string,
  apiKey: string,
  input: GenerationInput
): Promise<GenerationOutput> {
  const modelId = input.model.id;
  console.log(`[API:${requestId}] BFL generation - Model: ${modelId}, Images: ${input.images?.length || 0}, Prompt: ${input.prompt.length} chars`);

  // Build payload
  const payload: Record<string, unknown> = {
    prompt: input.prompt,
  };

  // Apply user parameters (width, height, seed, output_format, etc.)
  if (input.parameters) {
    for (const [key, value] of Object.entries(input.parameters)) {
      if (value !== null && value !== undefined && value !== '' && key !== 'model') {
        payload[key] = value;
      }
    }
  }

  // Handle image inputs for image-to-image models (Kontext, Flex, Pro)
  // FLUX.2 Pro/Flex support up to 8 reference images (input_image, input_image_2..input_image_8)
  if (input.dynamicInputs) {
    for (const [key, value] of Object.entries(input.dynamicInputs)) {
      if (key.startsWith("input_image") && value) {
        payload[key] = Array.isArray(value) ? value[0] : value;
      }
    }
  }
  // Fallback: if no dynamic input_image but images array provided, use first as input_image
  if (!payload.input_image && input.images && input.images.length > 0) {
    payload.input_image = input.images[0];
  }

  const endpoint = `${BFL_API_BASE}/${modelId}`;
  console.log(`[API:${requestId}] BFL endpoint: ${endpoint}, payload keys: ${Object.keys(payload).join(", ")}`);

  // Submit generation request
  const submitResponse = await fetch(endpoint, {
    method: "POST",
    headers: {
      "x-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!submitResponse.ok) {
    const errorText = await submitResponse.text();
    const errorDetail = parseBflError(errorText, submitResponse.status);

    console.error(`[API:${requestId}] BFL submit failed: ${submitResponse.status} - ${errorDetail}`);

    if (submitResponse.status === 429) {
      return { success: false, error: "BFL: Rate limit exceeded (max 24 concurrent tasks). Try again in a moment." };
    }
    if (submitResponse.status === 401 || submitResponse.status === 403) {
      return { success: false, error: "BFL: Invalid API key. Check your BFL_API_KEY." };
    }
    return { success: false, error: `BFL: ${errorDetail}` };
  }

  const submitResult = await submitResponse.json();
  const pollingUrl = submitResult.polling_url;
  const taskId = submitResult.id;

  if (!pollingUrl && !taskId) {
    console.error(`[API:${requestId}] No polling_url or id in BFL submit response`);
    return { success: false, error: "BFL: No task ID returned from API" };
  }

  console.log(`[API:${requestId}] BFL task submitted: ${taskId}`);

  // Poll for completion
  const maxWaitTime = 5 * 60 * 1000; // 5 minutes
  const pollInterval = 500; // 0.5 seconds as recommended
  const startTime = Date.now();
  let lastStatus = "";

  const pollEndpoint = pollingUrl || `${BFL_API_BASE}/get_result?id=${taskId}`;

  while (true) {
    if (Date.now() - startTime > maxWaitTime) {
      console.error(`[API:${requestId}] BFL generation timed out after 5 minutes`);
      return { success: false, error: "BFL: Generation timed out after 5 minutes" };
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    try {
      const pollResponse = await fetch(pollEndpoint, {
        headers: {
          "x-key": apiKey,
        },
      });

      const elapsedSec = Math.round((Date.now() - startTime) / 1000);

      if (!pollResponse.ok) {
        // 404 may mean task not yet registered
        if (pollResponse.status === 404) {
          if (lastStatus !== "pending") {
            console.log(`[API:${requestId}] BFL poll (${elapsedSec}s): 404 - task not yet registered`);
            lastStatus = "pending";
          }
          continue;
        }

        const errorText = await pollResponse.text();
        const errorDetail = parseBflError(errorText, pollResponse.status);
        console.error(`[API:${requestId}] BFL poll failed: ${pollResponse.status} - ${errorDetail}`);
        return { success: false, error: `BFL: ${errorDetail}` };
      }

      const pollData = await pollResponse.json();
      const currentStatus = pollData.status || "";

      if (currentStatus !== lastStatus) {
        console.log(`[API:${requestId}] BFL status (${elapsedSec}s): ${lastStatus || "none"} → ${currentStatus}`);
        lastStatus = currentStatus;
      }

      // Check for completion
      if (currentStatus === "Ready") {
        const imageUrl = pollData.result?.sample;

        if (!imageUrl) {
          return { success: false, error: "BFL: No image URL in completed result" };
        }

        console.log(`[API:${requestId}] BFL image ready, fetching: ${imageUrl.substring(0, 80)}...`);

        // Fetch the image (URLs expire after 10 minutes)
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
          return { success: false, error: `BFL: Failed to fetch image: ${imageResponse.status}` };
        }

        const imageBuffer = await imageResponse.arrayBuffer();
        const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
        const mimeType = contentType.includes("png") ? "image/png" : "image/jpeg";
        const imageBase64 = Buffer.from(imageBuffer).toString("base64");

        const sizeMB = imageBuffer.byteLength / (1024 * 1024);
        console.log(`[API:${requestId}] SUCCESS - BFL image complete (${sizeMB.toFixed(2)}MB)`);

        return {
          success: true,
          outputs: [{ type: "image", data: `data:${mimeType};base64,${imageBase64}` }],
        };
      }

      // Check for failure statuses
      if (currentStatus === "Error" || currentStatus === "Failed") {
        const failureReason = pollData.error || pollData.details || "Generation failed";
        console.error(`[API:${requestId}] BFL generation failed: ${failureReason}`);
        return { success: false, error: `BFL: ${failureReason}` };
      }

      if (currentStatus === "Content Moderated" || currentStatus === "Request Moderated") {
        console.error(`[API:${requestId}] BFL content moderated`);
        return { success: false, error: "BFL: Content was moderated. Try adjusting your prompt." };
      }

      // Continue polling for Pending or other statuses
    } catch (pollError) {
      const message = pollError instanceof Error ? pollError.message : String(pollError);
      console.error(`[API:${requestId}] BFL poll error: ${message}`);
      return { success: false, error: `BFL: ${message}` };
    }
  }
}
