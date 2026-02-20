/**
 * BytePlus Provider for Generate API Route
 *
 * Handles video generation using BytePlus ModelArk API (Seedance models).
 * Async submit + poll pattern via /v3/contents/generations/tasks.
 */

import { GenerationInput, GenerationOutput } from "@/lib/providers/types";
import { validateMediaUrl } from "@/utils/urlValidation";

const BYTEPLUS_API_BASE = "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks";

/** Extract a clean error message from an API error response */
function parseByteplusError(responseText: string, statusCode: number): string {
  if (responseText.trimStart().startsWith("<!") || responseText.trimStart().startsWith("<html")) {
    return `Server error (HTTP ${statusCode}). The BytePlus API may be temporarily unavailable.`;
  }
  try {
    const errorJson = JSON.parse(responseText);
    return errorJson.error?.message || errorJson.error?.code || errorJson.message || responseText;
  } catch {
    return responseText;
  }
}

/**
 * Build the prompt string with inline parameters (--duration, --resolution, --camerafixed)
 */
function buildPromptWithParams(prompt: string, parameters?: Record<string, unknown>): string {
  if (!parameters) return prompt;

  let result = prompt;
  const paramSuffixes: string[] = [];

  for (const [key, value] of Object.entries(parameters)) {
    if (value === null || value === undefined || value === "") continue;
    // These are appended as --key value to the prompt text
    if (["duration", "resolution", "camerafixed", "sound", "draft", "seed", "aspect_ratio"].includes(key)) {
      // Map aspect_ratio to "ratio" for the API
      const apiKey = key === "aspect_ratio" ? "ratio" : key;
      paramSuffixes.push(`--${apiKey} ${value}`);
    }
  }

  if (paramSuffixes.length > 0) {
    result = `${result}  ${paramSuffixes.join(" ")}`;
  }

  return result;
}

/**
 * Generate video using BytePlus ModelArk API (async submit + poll)
 */
export async function generateWithByteplus(
  requestId: string,
  apiKey: string,
  input: GenerationInput
): Promise<GenerationOutput> {
  console.log(`[API:${requestId}] BytePlus video generation - Model: ${input.model.id}, Images: ${input.images?.length || 0}, Prompt: ${input.prompt.length} chars`);

  // Build prompt with inline parameters
  const promptWithParams = buildPromptWithParams(input.prompt, input.parameters);

  // Build content array
  const content: Array<Record<string, unknown>> = [];

  // Add text prompt
  content.push({
    type: "text",
    text: promptWithParams,
  });

  // Handle image input for I2V — only use explicit dynamic input "input_image"
  // Do NOT fall back to generic images[] to avoid sending stale images from previous runs
  let imageSource: string | null = null;
  if (input.dynamicInputs) {
    for (const [key, value] of Object.entries(input.dynamicInputs)) {
      if ((key === "input_image" || key === "image_url") && value) {
        imageSource = Array.isArray(value) ? value[0] : value;
        break;
      }
    }
  }

  if (imageSource) {
    content.push({
      type: "image_url",
      image_url: { url: imageSource },
    });
  }

  const payload = {
    model: input.model.id,
    content,
  };

  console.log(`[API:${requestId}] BytePlus payload: model=${input.model.id}, content types=[${content.map(c => c.type).join(", ")}], prompt length=${promptWithParams.length}`);

  // Submit task
  const submitResponse = await fetch(BYTEPLUS_API_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!submitResponse.ok) {
    const errorText = await submitResponse.text();
    const errorDetail = parseByteplusError(errorText, submitResponse.status);

    console.error(`[API:${requestId}] BytePlus submit failed: ${submitResponse.status} - ${errorDetail}`);

    if (submitResponse.status === 429) {
      return { success: false, error: `BytePlus: Rate limit exceeded. ${errorDetail}` };
    }
    return { success: false, error: `BytePlus: ${errorDetail}` };
  }

  const submitResult = await submitResponse.json();
  const taskId = submitResult.id || submitResult.task_id || submitResult.data?.id;

  if (!taskId) {
    console.error(`[API:${requestId}] No task ID in BytePlus submit response: ${JSON.stringify(submitResult).substring(0, 200)}`);
    return { success: false, error: "BytePlus: No task ID returned from API" };
  }

  console.log(`[API:${requestId}] BytePlus task submitted: ${taskId}`);

  // Poll for completion
  const maxWaitTime = 10 * 60 * 1000; // 10 minutes
  const pollInterval = 3000; // 3 seconds
  const startTime = Date.now();
  let lastStatus = "";

  while (true) {
    if (Date.now() - startTime > maxWaitTime) {
      console.error(`[API:${requestId}] BytePlus task timed out after 10 minutes`);
      return { success: false, error: "BytePlus: Generation timed out after 10 minutes" };
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    try {
      const pollResponse = await fetch(`${BYTEPLUS_API_BASE}/${taskId}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });

      const elapsedSec = Math.round((Date.now() - startTime) / 1000);

      if (!pollResponse.ok) {
        // 404 may mean task not yet registered
        if (pollResponse.status === 404) {
          if (lastStatus !== "pending") {
            console.log(`[API:${requestId}] BytePlus poll (${elapsedSec}s): 404 - task not yet registered`);
            lastStatus = "pending";
          }
          continue;
        }

        const errorText = await pollResponse.text();
        const errorDetail = parseByteplusError(errorText, pollResponse.status);
        console.error(`[API:${requestId}] BytePlus poll failed: ${pollResponse.status} - ${errorDetail}`);
        return { success: false, error: `BytePlus: ${errorDetail}` };
      }

      const pollData = await pollResponse.json();
      const currentStatus = pollData.status || pollData.state || "";

      if (currentStatus !== lastStatus) {
        console.log(`[API:${requestId}] BytePlus status (${elapsedSec}s): ${lastStatus || "none"} → ${currentStatus}`);
        lastStatus = currentStatus;
      }

      // Check for completion — BytePlus returns { status: "succeeded", content: { video_url: "..." } }
      let videoUrl: string | null = null;

      if (pollData.content?.video_url) {
        videoUrl = pollData.content.video_url;
      } else if (pollData.video_url) {
        videoUrl = pollData.video_url;
      }

      if (videoUrl) {
        // Validate URL
        const urlCheck = validateMediaUrl(videoUrl);
        if (!urlCheck.valid) {
          return { success: false, error: `BytePlus: Invalid output URL: ${urlCheck.error}` };
        }

        console.log(`[API:${requestId}] BytePlus video ready, fetching: ${videoUrl.substring(0, 80)}...`);

        const videoResponse = await fetch(videoUrl);
        if (!videoResponse.ok) {
          return { success: false, error: `BytePlus: Failed to fetch video: ${videoResponse.status}` };
        }

        const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB
        const contentLength = parseInt(videoResponse.headers.get("content-length") || "0", 10);
        if (!isNaN(contentLength) && contentLength > MAX_VIDEO_SIZE) {
          return { success: false, error: `BytePlus: Video too large: ${(contentLength / (1024 * 1024)).toFixed(0)}MB > 500MB limit` };
        }

        const videoBuffer = await videoResponse.arrayBuffer();
        if (videoBuffer.byteLength > MAX_VIDEO_SIZE) {
          return { success: false, error: `BytePlus: Video too large: ${(videoBuffer.byteLength / (1024 * 1024)).toFixed(0)}MB > 500MB limit` };
        }

        const sizeMB = videoBuffer.byteLength / (1024 * 1024);
        console.log(`[API:${requestId}] BytePlus video size: ${sizeMB.toFixed(2)}MB`);

        // Large videos (>20MB) — return URL only
        if (sizeMB > 20) {
          console.log(`[API:${requestId}] SUCCESS - Returning URL for large BytePlus video`);
          return {
            success: true,
            outputs: [{ type: "video", data: "", url: videoUrl }],
          };
        }

        const videoBase64 = Buffer.from(videoBuffer).toString("base64");
        console.log(`[API:${requestId}] SUCCESS - BytePlus video complete`);
        return {
          success: true,
          outputs: [{ type: "video", data: `data:video/mp4;base64,${videoBase64}`, url: videoUrl }],
        };
      }

      // Check for failure
      const failStatus = (currentStatus || "").toLowerCase();
      if (failStatus === "failed" || failStatus === "error" || failStatus === "cancelled") {
        const failureReason = pollData.error?.message || pollData.error?.code || pollData.error || pollData.failure_reason || "Generation failed";
        console.error(`[API:${requestId}] BytePlus task failed: ${failureReason}`);
        return { success: false, error: `BytePlus: ${failureReason}` };
      }

      // Continue polling for pending/processing/running status
    } catch (pollError) {
      const message = pollError instanceof Error ? pollError.message : String(pollError);
      console.error(`[API:${requestId}] BytePlus poll error: ${message}`);
      return { success: false, error: `BytePlus: ${message}` };
    }
  }
}
