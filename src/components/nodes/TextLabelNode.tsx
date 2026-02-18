"use client";

import { useCallback, useRef, useState } from "react";
import { NodeProps, NodeResizer } from "@xyflow/react";
import { useWorkflowStore } from "@/store/workflowStore";
import type { TextLabelNodeData, TextLabelPreset } from "@/types";

const PRESET_STYLES: Record<TextLabelPreset, string> = {
  h1: "text-3xl font-bold text-white",
  h2: "text-xl font-semibold text-white",
  h3: "text-base font-medium text-neutral-200",
  body: "text-sm text-neutral-400",
};

const PRESET_LABELS: Record<TextLabelPreset, string> = {
  h1: "H1",
  h2: "H2",
  h3: "H3",
  body: "B",
};

const PRESETS: TextLabelPreset[] = ["h1", "h2", "h3", "body"];

export function TextLabelNode({ id, data, selected }: NodeProps) {
  const nodeData = data as TextLabelNodeData;
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const [editing, setEditing] = useState(false);
  const [hovered, setHovered] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleDoubleClick = useCallback(() => {
    setEditing(true);
    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }, 0);
  }, []);

  const handleBlur = useCallback(() => {
    setEditing(false);
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateNodeData(id, { text: e.target.value });
    },
    [id, updateNodeData]
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setEditing(false);
    }
    e.stopPropagation();
  }, []);

  const setPreset = useCallback(
    (preset: TextLabelPreset) => {
      updateNodeData(id, { preset });
    },
    [id, updateNodeData]
  );

  const showControls = selected || hovered;

  return (
    <div
      className="relative w-full h-full"
      style={{ minWidth: 80, minHeight: 24 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Hover/select outline */}
      {showControls && !editing && (
        <div className="absolute inset-0 rounded pointer-events-none" style={{ border: "1px dashed #525252" }} />
      )}
      <NodeResizer
        isVisible={showControls}
        minWidth={80}
        minHeight={24}
        lineStyle={{ border: "none" }}
        handleStyle={{ width: 10, height: 10, borderRadius: 3, background: "#fff", border: "2px solid #737373", zIndex: 10 }}
      />

      {/* Preset switcher */}
      {selected && (
        <div className="absolute -top-7 left-0 flex items-center gap-0.5 bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5" style={{ zIndex: 11 }}>
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`px-1.5 py-0.5 text-[10px] font-mono rounded transition-colors ${
                nodeData.preset === p
                  ? "bg-white text-neutral-900"
                  : "text-neutral-400 hover:text-neutral-100"
              }`}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}
        </div>
      )}

      {editing ? (
        <textarea
          ref={textareaRef}
          className={`nodrag nopan bg-transparent border-none outline-none resize-none w-full h-full ${PRESET_STYLES[nodeData.preset]} leading-tight`}
          value={nodeData.text}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <div
          className={`cursor-text whitespace-pre-wrap leading-tight w-full h-full ${PRESET_STYLES[nodeData.preset]}`}
          onDoubleClick={handleDoubleClick}
        >
          {nodeData.text || <span className="opacity-30 italic">Double-click to edit</span>}
        </div>
      )}
    </div>
  );
}
