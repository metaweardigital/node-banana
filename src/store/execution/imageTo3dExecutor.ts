/**
 * ImageTo3D Executor
 *
 * Sends an image to the SHARP API and receives a server-cached .ply ID
 * and an optional rendered preview image.
 */

import type { ImageTo3dNodeData } from "@/types";
import type { NodeExecutionContext } from "./types";

export async function executeImageTo3d(
  ctx: NodeExecutionContext
): Promise<void> {
  const {
    node,
    getConnectedInputs,
    updateNodeData,
    getFreshNode,
    signal,
  } = ctx;

  const { images: connectedImages } = getConnectedInputs(node.id);

  const freshNode = getFreshNode(node.id);
  const nodeData = (freshNode?.data || node.data) as ImageTo3dNodeData;

  const images = connectedImages.length > 0 ? connectedImages : nodeData.inputImages;

  if (images.length === 0) {
    updateNodeData(node.id, {
      status: "error",
      error: "No image connected. Connect an image source to this node.",
    });
    throw new Error("Missing image input");
  }

  updateNodeData(node.id, {
    inputImages: images,
    inputImageRefs: undefined,
    status: "loading",
    error: null,
  });

  try {
    const response = await fetch("/api/sharp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: images[0] }),
      ...(signal ? { signal } : {}),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
      } catch {
        if (errorText) errorMessage += ` - ${errorText.substring(0, 200)}`;
      }

      updateNodeData(node.id, { status: "error", error: errorMessage });
      throw new Error(errorMessage);
    }

    const result = await response.json();

    if (result.success) {
      updateNodeData(node.id, {
        outputImage: result.renderedView || null,
        plyId: result.plyId || null,
        angle: 0,
        status: "complete",
        error: null,
      });
    } else {
      updateNodeData(node.id, {
        status: "error",
        error: result.error || "SHARP processing failed",
      });
      throw new Error(result.error || "SHARP processing failed");
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      updateNodeData(node.id, { status: "idle", error: null });
      throw error;
    }

    let errorMessage = "SHARP processing failed";
    if (error instanceof TypeError && error.message.includes("NetworkError")) {
      errorMessage = "Network error. Check your connection and try again.";
    } else if (error instanceof TypeError) {
      errorMessage = `Network error: ${error.message}`;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    updateNodeData(node.id, { status: "error", error: errorMessage });
    throw new Error(errorMessage);
  }
}
