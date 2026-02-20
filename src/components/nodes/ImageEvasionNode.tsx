"use client";

import { useCallback } from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { useWorkflowStore } from "@/store/workflowStore";
import { ImageEvasionNodeData } from "@/types";
import {
  ImageEvasionTechnique,
  IMAGE_TECHNIQUE_LABELS,
} from "@/utils/imageEvasion";

/** Techniques that use the hidden text field */
const TEXT_TECHNIQUES = new Set<string>([
  "lsbSteganography",
  "metadataInjection",
  "subliminalText",
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
            <div className="relative group">
              <span className="flex items-center justify-center w-4 h-4 text-[9px] text-neutral-500 hover:text-neutral-300 border border-neutral-700 rounded-full cursor-help transition-colors">
                ?
              </span>
              <div className="absolute bottom-full right-0 mb-1 w-52 p-2 text-[9px] leading-relaxed text-neutral-300 bg-neutral-800 border border-neutral-600 rounded shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
                {TECHNIQUE_DESCRIPTIONS[nodeData.technique as Exclude<ImageEvasionTechnique, "all">]}
              </div>
            </div>
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
