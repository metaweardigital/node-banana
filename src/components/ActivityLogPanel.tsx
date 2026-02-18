"use client";

import { useEffect, useRef } from "react";
import { useWorkflowStore } from "@/store/workflowStore";
import type { LogEntry } from "@/types";

const LEVEL_STYLES: Record<LogEntry["level"], string> = {
  info:    "text-neutral-400",
  warn:    "text-yellow-400",
  error:   "text-red-400",
  success: "text-green-400",
};

const LEVEL_PREFIX: Record<LogEntry["level"], string> = {
  info:    "·",
  warn:    "⚠",
  error:   "✗",
  success: "✓",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

export function ActivityLogPanel() {
  const activityLog = useWorkflowStore((s) => s.activityLog);
  const activityLogOpen = useWorkflowStore((s) => s.activityLogOpen);
  const clearActivityLog = useWorkflowStore((s) => s.clearActivityLog);
  const setActivityLogOpen = useWorkflowStore((s) => s.setActivityLogOpen);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activityLogOpen) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [activityLog, activityLogOpen]);

  if (!activityLogOpen) return null;

  return (
    <div className="fixed top-11 right-0 bottom-0 z-40 w-96 flex flex-col bg-neutral-950 border-l border-neutral-800 shadow-2xl font-mono text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800 flex-shrink-0">
        <span className="text-neutral-400 font-sans font-medium text-[11px] uppercase tracking-wider">Activity Log</span>
        <div className="flex items-center gap-1">
          <button
            onClick={clearActivityLog}
            className="px-2 py-0.5 text-neutral-500 hover:text-neutral-300 transition-colors text-[11px] font-sans"
          >
            Clear
          </button>
          <button
            onClick={() => setActivityLogOpen(false)}
            className="p-1 text-neutral-500 hover:text-neutral-300 transition-colors"
            title="Close"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Log lines */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {activityLog.length === 0 ? (
          <span className="text-neutral-600 italic text-[11px]">No activity yet. Run your workflow to see logs here.</span>
        ) : (
          activityLog.map((entry) => (
            <div key={entry.id} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5 leading-4">
                <span className="text-neutral-600 flex-shrink-0 tabular-nums text-[10px]">{formatTime(entry.timestamp)}</span>
                {entry.nodeLabel && (
                  <span className="text-neutral-500 flex-shrink-0 max-w-[80px] truncate text-[10px]">{entry.nodeLabel}</span>
                )}
              </div>
              <div className="flex items-baseline gap-1.5 pl-0.5">
                <span className={`${LEVEL_STYLES[entry.level]} flex-shrink-0`}>{LEVEL_PREFIX[entry.level]}</span>
                <span className={`${LEVEL_STYLES[entry.level]} break-words`}>{entry.message}</span>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
