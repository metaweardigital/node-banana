"use client";

import { useCallback, useMemo } from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { useWorkflowStore } from "@/store/workflowStore";
import { PromptEvasionNodeData } from "@/types";
import {
  EvasionTechnique,
  TECHNIQUE_LABELS,
  applyEvasion,
} from "@/utils/promptEvasion";

const TECHNIQUES = Object.entries(TECHNIQUE_LABELS) as [EvasionTechnique, string][];

type PromptEvasionNodeType = Node<PromptEvasionNodeData, "promptEvasion">;

export function PromptEvasionNode({ id, data, selected }: NodeProps<PromptEvasionNodeType>) {
  const nodeData = data;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const inputText = e.target.value;
      const technique = nodeData.technique as EvasionTechnique;
      const outputText = inputText ? applyEvasion(inputText, technique) : null;
      updateNodeData(id, { inputText, outputText });
    },
    [id, nodeData.technique, updateNodeData]
  );

  const handleTechniqueChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const technique = e.target.value as EvasionTechnique;
      const outputText = nodeData.inputText
        ? applyEvasion(nodeData.inputText, technique)
        : null;
      updateNodeData(id, { technique, outputText });
    },
    [id, nodeData.inputText, updateNodeData]
  );

  // Live preview of the output
  const preview = useMemo(() => {
    if (!nodeData.outputText) return null;
    // For "all" mode, truncate to avoid huge display
    if (nodeData.technique === "all") {
      const lines = nodeData.outputText.split("\n");
      return lines.length > 20
        ? lines.slice(0, 20).join("\n") + "\n..."
        : nodeData.outputText;
    }
    return nodeData.outputText;
  }, [nodeData.outputText, nodeData.technique]);

  return (
    <BaseNode
      id={id}
      title="Prompt Evasion"
      customTitle={nodeData.customTitle}
      comment={nodeData.comment}
      onCustomTitleChange={(title) => updateNodeData(id, { customTitle: title || undefined })}
      onCommentChange={(comment) => updateNodeData(id, { comment: comment || undefined })}
      selected={selected}
    >
      {/* Text input from connected node */}
      <Handle
        type="target"
        position={Position.Left}
        id="text"
        data-handletype="text"
      />
      {/* Text output */}
      <Handle
        type="source"
        position={Position.Right}
        id="text"
        data-handletype="text"
      />

      <div className="flex-1 flex flex-col min-h-0 gap-2">
        {/* Input text area */}
        <textarea
          value={nodeData.inputText}
          onChange={handleTextChange}
          placeholder="Enter normal prompt text..."
          className="nodrag nopan nowheel w-full h-16 text-[10px] p-1.5 border border-neutral-700 rounded bg-neutral-900/50 text-neutral-300 resize-none focus:outline-none focus:ring-1 focus:ring-neutral-600"
        />

        {/* Technique selector */}
        <select
          value={nodeData.technique}
          onChange={handleTechniqueChange}
          className="w-full text-[10px] py-1 px-1.5 border border-neutral-700 rounded bg-neutral-900/50 focus:outline-none focus:ring-1 focus:ring-neutral-600 text-neutral-300 shrink-0"
        >
          {TECHNIQUES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        {/* Output preview */}
        <div className="nodrag nopan nowheel flex-1 min-h-[60px] border border-dashed border-neutral-600 rounded p-1.5 overflow-auto">
          {preview ? (
            <p className="text-[10px] text-neutral-300 whitespace-pre-wrap break-all font-mono">
              {preview}
            </p>
          ) : (
            <div className="h-full flex items-center justify-center">
              <span className="text-neutral-500 text-[10px]">
                Transformed output
              </span>
            </div>
          )}
        </div>
      </div>
    </BaseNode>
  );
}
