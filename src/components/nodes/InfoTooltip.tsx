"use client";

import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

interface InfoTooltipProps {
  text: string;
}

export function InfoTooltip({ text }: InfoTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLSpanElement>(null);

  const show = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({ x: rect.right + 6, y: rect.top - 4 });
    setVisible(true);
  }, []);

  const hide = useCallback(() => setVisible(false), []);

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={hide}
        className="nodrag nopan flex items-center justify-center w-4 h-4 text-[9px] text-neutral-500 hover:text-neutral-300 border border-neutral-700 rounded-full cursor-help transition-colors shrink-0"
      >
        ?
      </span>
      {visible &&
        createPortal(
          <div
            style={{ left: pos.x, top: pos.y }}
            className="fixed w-56 p-2 text-[10px] leading-relaxed text-neutral-300 bg-neutral-800 border border-neutral-600 rounded shadow-lg z-[9999] pointer-events-none"
          >
            {text}
          </div>,
          document.body
        )}
    </>
  );
}
