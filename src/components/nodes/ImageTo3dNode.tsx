"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { useCommentNavigation } from "@/hooks/useCommentNavigation";
import { useWorkflowStore } from "@/store/workflowStore";
import { ImageTo3dNodeData } from "@/types";
import { useToast } from "@/components/Toast";

type ImageTo3dNodeType = Node<ImageTo3dNodeData, "imageTo3d">;

export function ImageTo3dNode({ id, data, selected }: NodeProps<ImageTo3dNodeType>) {
  const nodeData = data;
  const commentNavigation = useCommentNavigation(id);
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const regenerateNode = useWorkflowStore((state) => state.regenerateNode);
  const isRunning = useWorkflowStore((state) => state.isRunning);

  const [isReRendering, setIsReRendering] = useState(false);
  const [localAngle, setLocalAngle] = useState(nodeData.angle ?? 0);
  const reRenderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local angle when node data changes externally
  useEffect(() => {
    setLocalAngle(nodeData.angle ?? 0);
  }, [nodeData.angle]);

  const handleRegenerate = useCallback(() => {
    regenerateNode(id);
  }, [id, regenerateNode]);

  // Show toast on error
  const prevStatusRef = useRef(nodeData.status);
  useEffect(() => {
    if (nodeData.status === "error" && prevStatusRef.current !== "error" && nodeData.error) {
      useToast.getState().show("SHARP 3D failed", "error", true, nodeData.error);
    }
    prevStatusRef.current = nodeData.status;
  }, [nodeData.status, nodeData.error]);

  const handleClear = useCallback(() => {
    updateNodeData(id, {
      outputImage: null,
      plyId: null,
      angle: 0,
      status: "idle",
      error: null,
    });
    setLocalAngle(0);
  }, [id, updateNodeData]);

  const handleDownloadPly = useCallback(() => {
    if (!nodeData.plyId) return;
    const a = document.createElement("a");
    a.href = `/api/sharp/ply/${nodeData.plyId}`;
    a.download = "sharp-output.ply";
    a.click();
  }, [nodeData.plyId]);

  // Re-render at a new angle via server (debounced, uses cached plyId)
  const handleAngleChange = useCallback(
    (newAngle: number) => {
      setLocalAngle(newAngle);

      if (!nodeData.plyId) return;

      if (reRenderTimeoutRef.current) {
        clearTimeout(reRenderTimeoutRef.current);
      }

      reRenderTimeoutRef.current = setTimeout(async () => {
        setIsReRendering(true);
        try {
          const response = await fetch("/api/sharp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              plyId: nodeData.plyId,
              angle: newAngle,
            }),
          });

          const result = await response.json();
          if (result.success && result.renderedView) {
            updateNodeData(id, {
              outputImage: result.renderedView,
              angle: newAngle,
            });
          }
        } catch (err) {
          console.error("Re-render failed:", err);
        } finally {
          setIsReRendering(false);
        }
      }, 500);
    },
    [id, nodeData.plyId, updateNodeData]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (reRenderTimeoutRef.current) {
        clearTimeout(reRenderTimeoutRef.current);
      }
    };
  }, []);

  return (
    <BaseNode
      id={id}
      title="SHARP 3D"
      customTitle={nodeData.customTitle}
      comment={nodeData.comment}
      onCustomTitleChange={(title) => updateNodeData(id, { customTitle: title || undefined })}
      onCommentChange={(comment) => updateNodeData(id, { comment: comment || undefined })}
      onRun={handleRegenerate}
      selected={selected}
      isExecuting={isRunning}
      hasError={nodeData.status === "error"}
      commentNavigation={commentNavigation ?? undefined}
      titlePrefix={
        <span className="text-neutral-500 shrink-0 text-[10px] font-bold" title="Apple SHARP">
          3D
        </span>
      }
    >
      {/* Input handle: image */}
      <Handle
        type="target"
        position={Position.Left}
        id="image"
        style={{ top: "50%" }}
        data-handletype="image"
        isConnectable={true}
      />
      <div
        className="absolute text-[10px] font-medium whitespace-nowrap pointer-events-none text-right"
        style={{
          right: `calc(100% + 8px)`,
          top: "calc(50% - 18px)",
          color: "var(--handle-color-image)",
        }}
      >
        Image
      </div>

      {/* Output handle: image (rendered novel view) */}
      <Handle
        type="source"
        position={Position.Right}
        id="image"
        style={{ top: "50%" }}
        data-handletype="image"
      />
      <div
        className="absolute text-[10px] font-medium whitespace-nowrap pointer-events-none"
        style={{
          left: `calc(100% + 8px)`,
          top: "calc(50% - 18px)",
          color: "var(--handle-color-image)",
        }}
      >
        View
      </div>

      <div className="flex-1 flex flex-col min-h-0 gap-2">
        {/* Preview area */}
        {nodeData.outputImage ? (
          <div className="relative w-full flex-1 min-h-[80px] flex items-center justify-center bg-neutral-800 rounded border border-neutral-700 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={nodeData.outputImage}
              alt="SHARP novel view"
              className="w-full h-full object-contain"
            />
            {/* Re-render spinner */}
            {(isReRendering || nodeData.status === "loading") && (
              <div className="absolute inset-0 bg-neutral-900/70 rounded flex items-center justify-center">
                <svg className="w-6 h-6 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            )}
            {/* Error overlay */}
            {nodeData.status === "error" && (
              <div
                className="absolute inset-0 bg-red-900/40 rounded flex flex-col items-center justify-center gap-1 cursor-pointer"
                onClick={() => updateNodeData(id, { status: "idle", error: null })}
              >
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-white text-xs font-medium">Failed</span>
                <span className="text-white/70 text-[10px]">Click to dismiss</span>
              </div>
            )}
            {/* Action buttons */}
            <div className="absolute top-1 right-1 flex gap-1">
              {nodeData.plyId && (
                <button
                  onClick={handleDownloadPly}
                  className="w-5 h-5 bg-neutral-900/80 hover:bg-blue-600/80 rounded flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
                  title="Download .ply file"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
              )}
              <button
                onClick={handleClear}
                className="w-5 h-5 bg-neutral-900/80 hover:bg-red-600/80 rounded flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
                title="Clear output"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full flex-1 min-h-[112px] border border-dashed border-neutral-600 rounded flex flex-col items-center justify-center">
            {nodeData.status === "loading" ? (
              <svg className="w-4 h-4 animate-spin text-neutral-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : nodeData.status === "error" ? (
              <span className="text-[10px] text-red-400 text-center px-2">
                {nodeData.error || "Failed"}
              </span>
            ) : (
              <span className="text-neutral-500 text-[10px]">
                Connect image & run
              </span>
            )}
          </div>
        )}

        {/* Angle slider — only when we have a cached .ply */}
        {nodeData.plyId && (
          <div className="nodrag nopan flex items-center gap-2 px-1">
            <span className="text-[10px] text-neutral-500 shrink-0 w-8">
              {Math.round(localAngle)}°
            </span>
            <input
              type="range"
              min={-180}
              max={180}
              step={5}
              value={localAngle}
              onChange={(e) => handleAngleChange(Number(e.target.value))}
              className="flex-1 h-1 accent-blue-500 cursor-pointer"
              title={`Rotation: ${Math.round(localAngle)}°`}
            />
            {localAngle !== 0 && (
              <button
                onClick={() => handleAngleChange(0)}
                className="text-[9px] text-neutral-500 hover:text-white transition-colors"
                title="Reset to front view"
              >
                Reset
              </button>
            )}
          </div>
        )}
      </div>
    </BaseNode>
  );
}
