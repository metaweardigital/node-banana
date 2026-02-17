/**
 * xAI Provider for Generate API Route
 *
 * Handles image and video generation using the xAI (Grok) API.
 * - Images: synchronous via /images/generations and /images/edits
 * - Video: async submit + poll via /videos/generations
 */

import { GenerationInput, GenerationOutput } from "@/lib/providers/types";
import { validateMediaUrl } from "@/utils/urlValidation";

const XAI_API_BASE = "https://api.x.ai/v1";

/**
 * Generate image using xAI API (text-to-image or image-to-image)
 */
export async function generateXaiImage(
  requestId: string,
  apiKey: string,
  input: GenerationInput
): Promise<GenerationOutput> {
  console.log(`[API:${requestId}] xAI image generation - Model: ${input.model.id}, Images: ${input.images?.length || 0}, Prompt: ${input.prompt.length} chars`);

  // Determine if this is an edit (image-to-image) or generation (text-to-image)
  let imageSource: string | null = null;

  // Check dynamic inputs first
  if (input.dynamicInputs) {
    for (const [key, value] of Object.entries(input.dynamicInputs)) {
      if ((key === "image_url" || key === "image") && value) {
        imageSource = Array.isArray(value) ? value[0] : value;
        break;
      }
    }
  }
  // Fallback to images array
  if (!imageSource && input.images && input.images.length > 0) {
    imageSource = input.images[0];
  }

  const isEdit = !!imageSource;

  if (isEdit) {
    // Image editing: POST /images/edits
    console.log(`[API:${requestId}] xAI image edit mode`);

    const payload: Record<string, unknown> = {
      model: input.model.id,
      prompt: input.prompt || "Edit this image",
      image: { url: imageSource },
      response_format: "b64_json",
    };

    // Apply user parameters (n, aspect_ratio, etc.)
    if (input.parameters) {
      for (const [key, value] of Object.entries(input.parameters)) {
        if (value !== null && value !== undefined && value !== '' && key !== 'model') {
          payload[key] = value;
        }
      }
    }

    const response = await fetch(`${XAI_API_BASE}/images/edits`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorDetail = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorDetail = errorJson.error?.message || errorJson.error || errorJson.message || errorText;
      } catch { /* keep raw text */ }

      console.error(`[API:${requestId}] xAI image edit failed: ${response.status} - ${errorDetail}`);

      if (response.status === 429) {
        return { success: false, error: "xAI: Rate limit exceeded. Try again in a moment." };
      }
      return { success: false, error: `xAI: ${errorDetail}` };
    }

    const result = await response.json();
    const imageData = result.data?.[0]?.b64_json;

    if (!imageData) {
      return { success: false, error: "xAI: No image data in response" };
    }

    console.log(`[API:${requestId}] SUCCESS - xAI image edit complete`);
    return {
      success: true,
      outputs: [{ type: "image", data: `data:image/png;base64,${imageData}` }],
    };
  } else {
    // Text-to-image: POST /images/generations
    console.log(`[API:${requestId}] xAI text-to-image mode`);

    const payload: Record<string, unknown> = {
      model: input.model.id,
      prompt: input.prompt,
      response_format: "b64_json",
      n: 1,
    };

    // Apply user parameters
    if (input.parameters) {
      for (const [key, value] of Object.entries(input.parameters)) {
        if (value !== null && value !== undefined && value !== '' && key !== 'model') {
          payload[key] = value;
        }
      }
    }

    const response = await fetch(`${XAI_API_BASE}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorDetail = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorDetail = errorJson.error?.message || errorJson.error || errorJson.message || errorText;
      } catch { /* keep raw text */ }

      console.error(`[API:${requestId}] xAI image generation failed: ${response.status} - ${errorDetail}`);

      if (response.status === 429) {
        return { success: false, error: "xAI: Rate limit exceeded. Try again in a moment." };
      }
      return { success: false, error: `xAI: ${errorDetail}` };
    }

    const result = await response.json();
    const imageData = result.data?.[0]?.b64_json;

    if (!imageData) {
      return { success: false, error: "xAI: No image data in response" };
    }

    console.log(`[API:${requestId}] SUCCESS - xAI text-to-image complete`);
    return {
      success: true,
      outputs: [{ type: "image", data: `data:image/png;base64,${imageData}` }],
    };
  }
}

/**
 * Generate video using xAI API (async submit + poll)
 */
export async function generateWithXai(
  requestId: string,
  apiKey: string,
  input: GenerationInput
): Promise<GenerationOutput> {
  console.log(`[API:${requestId}] xAI video generation - Model: ${input.model.id}, Images: ${input.images?.length || 0}, Prompt: ${input.prompt.length} chars`);

  // Build payload
  const payload: Record<string, unknown> = {
    model: input.model.id,
    prompt: input.prompt,
  };

  // Apply user parameters (duration, aspect_ratio, resolution)
  if (input.parameters) {
    for (const [key, value] of Object.entries(input.parameters)) {
      if (value !== null && value !== undefined && value !== '' && key !== 'model') {
        payload[key] = value;
      }
    }
  }

  // Handle image input for I2V
  let imageForVideo: string | null = null;
  if (input.dynamicInputs) {
    for (const [key, value] of Object.entries(input.dynamicInputs)) {
      if ((key === "image_url" || key === "image") && value) {
        imageForVideo = Array.isArray(value) ? value[0] : value;
        break;
      }
    }
  }
  if (!imageForVideo && input.images && input.images.length > 0) {
    imageForVideo = input.images[0];
  }
  if (imageForVideo) {
    payload.image = { url: imageForVideo };
    // Remove aspect_ratio for I2V to preserve native image aspect
    delete payload.aspect_ratio;
  }

  console.log(`[API:${requestId}] xAI video payload keys: ${Object.keys(payload).join(", ")}`);

  // Submit video generation
  const submitResponse = await fetch(`${XAI_API_BASE}/videos/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!submitResponse.ok) {
    const errorText = await submitResponse.text();
    let errorDetail = errorText;
    try {
      const errorJson = JSON.parse(errorText);
      errorDetail = errorJson.error?.message || errorJson.error || errorJson.message || errorText;
    } catch { /* keep raw text */ }

    console.error(`[API:${requestId}] xAI video submit failed: ${submitResponse.status} - ${errorDetail}`);

    if (submitResponse.status === 429) {
      const retryAfter = submitResponse.headers.get("retry-after");
      const retryMsg = retryAfter ? ` Retry after ${retryAfter}s.` : "";
      return { success: false, error: `xAI: Rate limit exceeded.${retryMsg} ${errorDetail}` };
    }
    return { success: false, error: `xAI: ${errorDetail}` };
  }

  const submitResult = await submitResponse.json();
  const xaiRequestId = submitResult.request_id;

  if (!xaiRequestId) {
    console.error(`[API:${requestId}] No request_id in xAI submit response`);
    return { success: false, error: "xAI: No request_id returned from API" };
  }

  console.log(`[API:${requestId}] xAI video submitted: ${xaiRequestId}`);

  // Poll for completion
  const maxWaitTime = 10 * 60 * 1000; // 10 minutes
  const pollInterval = 2000; // 2 seconds
  const startTime = Date.now();
  let lastStatus = "";

  while (true) {
    if (Date.now() - startTime > maxWaitTime) {
      console.error(`[API:${requestId}] xAI video timed out after 10 minutes`);
      return { success: false, error: "xAI: Generation timed out after 10 minutes" };
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    try {
      const pollResponse = await fetch(`${XAI_API_BASE}/videos/${xaiRequestId}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      const elapsedSec = Math.round((Date.now() - startTime) / 1000);

      // 404 means task not yet registered — continue polling
      if (pollResponse.status === 404) {
        if (lastStatus !== "pending") {
          console.log(`[API:${requestId}] xAI poll (${elapsedSec}s): 404 - task not yet registered`);
          lastStatus = "pending";
        }
        continue;
      }

      if (!pollResponse.ok) {
        const errorText = await pollResponse.text();
        let errorDetail = errorText;
        try {
          const errorJson = JSON.parse(errorText);
          errorDetail = errorJson.error?.message || errorJson.error || errorJson.message || errorText;
        } catch { /* keep raw text */ }
        console.error(`[API:${requestId}] xAI poll failed: ${pollResponse.status} - ${errorDetail}`);
        return { success: false, error: `xAI: ${errorDetail}` };
      }

      const pollData = await pollResponse.json();
      const currentStatus = pollData.state || pollData.status || "";

      if (currentStatus !== lastStatus) {
        console.log(`[API:${requestId}] xAI status (${elapsedSec}s): ${lastStatus || "none"} → ${currentStatus}`);
        lastStatus = currentStatus;
      }

      // Check for video URL in multiple possible fields
      const videoUrl = pollData.url
        || pollData.video?.url
        || pollData.output?.url
        || pollData.result_url
        || pollData.download_url
        || pollData.data?.url
        || (pollData.data && Array.isArray(pollData.data) && pollData.data[0]?.url);

      if (videoUrl) {
        // Validate URL
        const urlCheck = validateMediaUrl(videoUrl);
        if (!urlCheck.valid) {
          return { success: false, error: `xAI: Invalid output URL: ${urlCheck.error}` };
        }

        console.log(`[API:${requestId}] xAI video ready, fetching: ${videoUrl.substring(0, 80)}...`);

        const videoResponse = await fetch(videoUrl);
        if (!videoResponse.ok) {
          return { success: false, error: `xAI: Failed to fetch video: ${videoResponse.status}` };
        }

        // Check file size
        const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB
        const contentLength = parseInt(videoResponse.headers.get("content-length") || "0", 10);
        if (!isNaN(contentLength) && contentLength > MAX_VIDEO_SIZE) {
          return { success: false, error: `xAI: Video too large: ${(contentLength / (1024 * 1024)).toFixed(0)}MB > 500MB limit` };
        }

        const videoBuffer = await videoResponse.arrayBuffer();
        if (videoBuffer.byteLength > MAX_VIDEO_SIZE) {
          return { success: false, error: `xAI: Video too large: ${(videoBuffer.byteLength / (1024 * 1024)).toFixed(0)}MB > 500MB limit` };
        }

        const sizeMB = videoBuffer.byteLength / (1024 * 1024);
        console.log(`[API:${requestId}] xAI video size: ${sizeMB.toFixed(2)}MB`);

        // Large videos (>20MB) — return URL only
        if (sizeMB > 20) {
          console.log(`[API:${requestId}] SUCCESS - Returning URL for large xAI video`);
          return {
            success: true,
            outputs: [{ type: "video", data: "", url: videoUrl }],
          };
        }

        const videoBase64 = Buffer.from(videoBuffer).toString("base64");
        console.log(`[API:${requestId}] SUCCESS - xAI video complete`);
        return {
          success: true,
          outputs: [{ type: "video", data: `data:video/mp4;base64,${videoBase64}`, url: videoUrl }],
        };
      }

      // Check for failure
      const failStatus = (currentStatus || "").toLowerCase();
      if (failStatus === "failed" || failStatus === "error" || failStatus === "cancelled" || pollData.error || pollData.moderation_status === "rejected") {
        const failureReason = pollData.error?.message || pollData.error || pollData.moderation_reason || pollData.failure_reason || "Generation failed";
        console.error(`[API:${requestId}] xAI video failed: ${failureReason}`);
        return { success: false, error: `xAI: ${failureReason}` };
      }

      // Continue polling for pending/processing status
    } catch (pollError) {
      const message = pollError instanceof Error ? pollError.message : String(pollError);
      console.error(`[API:${requestId}] xAI poll error: ${message}`);
      return { success: false, error: `xAI: ${message}` };
    }
  }
}
