"use client";

import { useEffect } from "react";

/**
 * Suppresses unhandled AbortError rejections from Turbopack's dev overlay.
 * AbortErrors are intentional (user stops workflow) and always handled —
 * but Turbopack detects them before the async catch block runs.
 */
export function AbortErrorSuppressor() {
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (reason?.name === "AbortError") {
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", handler, { capture: true });
    return () => window.removeEventListener("unhandledrejection", handler, { capture: true });
  }, []);

  return null;
}
