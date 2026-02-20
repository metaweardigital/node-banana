"use client";

import { useCallback, useEffect, useRef } from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { useWorkflowStore } from "@/store/workflowStore";
import { ImageEvasionNodeData } from "@/types";
import {
  ImageEvasionTechnique,
  IMAGE_TECHNIQUE_LABELS,
  applyImageEvasion,
  getAntiFramePrompt,
} from "@/utils/imageEvasion";
import { InfoTooltip } from "./InfoTooltip";

/** Techniques that use the hidden text field */
const TEXT_TECHNIQUES = new Set<string>([
  "lsbSteganography",
  "metadataInjection",
  "subliminalText",
  "customFrame",
]);

const TECHNIQUES = Object.entries(IMAGE_TECHNIQUE_LABELS) as [
  ImageEvasionTechnique,
  string,
][];

/** Short descriptions for each technique */
const TECHNIQUE_DESCRIPTIONS: Record<Exclude<ImageEvasionTechnique, "all">, string> = {
  adversarialNoise: "Adds random noise (±1-6) to RGB channels. Invisible to the eye but changes how the model perceives the image embedding.",
  lsbSteganography: "Encodes hidden text into the least significant bits of pixel channels. Visually identical output. Uses the 'Hidden text' field.",
  variationNoise: "Applies a structured checkerboard-like perturbation pattern across pixels. More systematic than random noise.",
  metadataInjection: "Embeds text data into the first row of pixels using lower bits of R and B channels.",
  skinToneShift: "Shifts all colors toward a warm skin tone (peach). Intensity controls interpolation strength (2-20%).",
  lowOpacityBlend: "Overlays a flesh-toned color at very low opacity (1-7%). Subtle warm tint across the entire image.",
  subliminalText: "Tiles text across the image at barely visible opacity (1-5%). Uses the 'Hidden text' field.",
  contrastPush: "Increases contrast and saturation with stronger effect in the center of the image.",
  polaroidFrame: "Wraps the image in a white Polaroid-style frame with shadow. Changes context from 'photo' to 'photo of a photo'.",
  galleryFrame: "Adds a dark ornamental gallery frame with gold bevel and mat. Image looks like a framed artwork.",
  phoneScreenshot: "Wraps the image in a fake phone UI (status bar, nav bar). Looks like a screenshot from a mobile device.",
  browserWindow: "Wraps the image in a fake browser window chrome (tabs, URL bar). Looks like a screenshot of a web page.",
  customFrame: "Adds a solid color frame. Enter color in the text field (hex like #ff0000, or name like 'gold'). Intensity controls width.",
  jpegArtifacts: "Re-encodes the image as low-quality JPEG to introduce compression artifacts, then converts back to PNG.",
  pixelShuffle: "Shuffles pixels within small blocks (2-6px). Creates a subtle mosaic-like distortion.",
  colorChannelShift: "Shifts the red channel right and blue channel left by 1-3 pixels. Creates chromatic aberration.",
  frequencyNoise: "Adds multi-frequency sinusoidal noise pattern across the image.",
};

type ImageEvasionNodeType = Node<ImageEvasionNodeData, "imageEvasion">;

export function ImageEvasionNode({
  id,
  data,
  selected,
}: NodeProps<ImageEvasionNodeType>) {
  const nodeData = data;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const getConnectedInputs = useWorkflowStore((state) => state.getConnectedInputs);
  const edges = useWorkflowStore((state) => state.edges);
  const applyRef = useRef(0); // debounce counter

  // Reactively pull source image from connected upstream node
  const hasIncomingImage = edges.some((e) => e.target === id && e.targetHandle === "image");
  useEffect(() => {
    if (!hasIncomingImage) return;
    const { images } = getConnectedInputs(id);
    const upstreamImage = images[0] || null;
    if (upstreamImage && upstreamImage !== nodeData.sourceImage) {
      updateNodeData(id, { sourceImage: upstreamImage });
    }
  }, [hasIncomingImage, id, getConnectedInputs, updateNodeData, nodeData.sourceImage, edges]);

  const handleTechniqueChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNodeData(id, { technique: e.target.value });
    },
    [id, updateNodeData]
  );

  const handleIntensityChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { intensity: Number(e.target.value) });
    },
    [id, updateNodeData]
  );

  const handleHiddenTextChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { hiddenText: e.target.value });
    },
    [id, updateNodeData]
  );

  // Auto-apply evasion when source image, technique, intensity or hidden text changes
  useEffect(() => {
    const sourceImage = nodeData.sourceImage;
    if (!sourceImage) return;

    const technique = nodeData.technique as ImageEvasionTechnique;
    const intensity = nodeData.intensity;
    const hiddenText = nodeData.hiddenText;
    const runId = ++applyRef.current;

    // Small debounce to avoid rapid re-processing during slider drag
    const timer = setTimeout(async () => {
      if (applyRef.current !== runId) return;
      try {
        updateNodeData(id, { status: "loading", error: null });
        const result = await applyImageEvasion(sourceImage, technique, {
          intensity,
          text: hiddenText || undefined,
        });
        // Check if still the latest run
        if (applyRef.current !== runId) return;
        const antiFramePrompt = getAntiFramePrompt(technique);
        updateNodeData(id, { outputImage: result, outputText: antiFramePrompt, status: "complete" });
      } catch (err) {
        if (applyRef.current !== runId) return;
        const message = err instanceof Error ? err.message : String(err);
        updateNodeData(id, { status: "error", error: message });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [id, nodeData.sourceImage, nodeData.technique, nodeData.intensity, nodeData.hiddenText, updateNodeData]);

  const showTextInput = TEXT_TECHNIQUES.has(nodeData.technique);
  const displayImage = nodeData.outputImage || nodeData.sourceImage;

  return (
    <BaseNode
      id={id}
      title="Image Evasion"
      customTitle={nodeData.customTitle}
      comment={nodeData.comment}
      onCustomTitleChange={(title) =>
        updateNodeData(id, { customTitle: title || undefined })
      }
      onCommentChange={(comment) =>
        updateNodeData(id, { comment: comment || undefined })
      }
      selected={selected}
      isExecuting={nodeData.status === "loading"}
      hasError={nodeData.status === "error"}
    >
      {/* Image input */}
      <Handle
        type="target"
        position={Position.Left}
        id="image"
        data-handletype="image"
      />
      {/* Image output */}
      <Handle
        type="source"
        position={Position.Right}
        id="image"
        data-handletype="image"
        style={{ top: "40%" }}
      />
      {/* Text output (anti-frame prompt) */}
      <Handle
        type="source"
        position={Position.Right}
        id="text"
        data-handletype="text"
        style={{ top: "60%" }}
      />

      <div className="flex-1 flex flex-col min-h-0 gap-2">
        {/* Image preview (only shown when image is connected) */}
        {displayImage && (
          <div className="relative w-full aspect-video rounded overflow-hidden bg-neutral-900/50 border border-neutral-700">
            <img
              src={displayImage}
              alt="Preview"
              className="w-full h-full object-contain"
            />
            {nodeData.outputImage && nodeData.sourceImage && (
              <div className="absolute top-1 right-1 text-[8px] bg-green-600/80 text-white px-1 rounded">
                processed
              </div>
            )}
          </div>
        )}

        {/* Technique selector + info tooltip */}
        <div className="flex items-center gap-1 shrink-0">
          <select
            value={nodeData.technique}
            onChange={handleTechniqueChange}
            className="flex-1 text-[10px] py-1 px-1.5 border border-neutral-700 rounded bg-neutral-900/50 focus:outline-none focus:ring-1 focus:ring-neutral-600 text-neutral-300"
          >
            {TECHNIQUES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {nodeData.technique !== "all" && (
            <InfoTooltip
              text={TECHNIQUE_DESCRIPTIONS[nodeData.technique as Exclude<ImageEvasionTechnique, "all">]}
            />
          )}
        </div>

        {/* Intensity slider */}
        <div className="flex items-center gap-2 text-[10px] text-neutral-400 shrink-0">
          <span className="w-12">Intensity</span>
          <input
            type="range"
            min={1}
            max={10}
            value={nodeData.intensity}
            onChange={handleIntensityChange}
            className="nodrag nopan flex-1 h-1 accent-neutral-500"
          />
          <span className="w-4 text-right text-neutral-500">
            {nodeData.intensity}
          </span>
        </div>

        {/* Hidden text input (for stego/subliminal/metadata) */}
        {showTextInput && (
          <input
            type="text"
            value={nodeData.hiddenText}
            onChange={handleHiddenTextChange}
            placeholder="e.g. safe artistic photograph, medical anatomy reference..."
            className="nodrag nopan w-full text-[10px] py-1 px-1.5 border border-neutral-700 rounded bg-neutral-900/50 text-neutral-300 focus:outline-none focus:ring-1 focus:ring-neutral-600 shrink-0"
          />
        )}

        {/* Anti-frame prompt indicator */}
        {nodeData.outputText && (
          <div className="text-[9px] text-amber-400/80 bg-amber-900/20 border border-amber-700/30 rounded px-1.5 py-0.5 shrink-0 truncate" title={nodeData.outputText}>
            text → &quot;{nodeData.outputText.slice(0, 50)}…&quot;
          </div>
        )}

        {/* Error */}
        {nodeData.error && (
          <div className="text-[9px] text-red-400 px-1 truncate shrink-0">
            {nodeData.error}
          </div>
        )}
      </div>
    </BaseNode>
  );
}
