import { useCallback, useEffect, useState, useRef } from "react";
import { getActiveInstanceId } from "../bridge";

interface Options {
  /** localStorage key suffix. The current instance id is prepended automatically. */
  storageKey: string;
  /** Minimum allowed column width in pixels. */
  minWidth?: number;
}

/**
 * Drag-to-resize column widths, persisted to localStorage under
 * `pref_${instanceId}_${storageKey}`. Widths are hydrated once on mount;
 * the hook is mount-scoped to a single instance. If the active instance
 * changes while this hook is mounted, widths and persistence will drift.
 * This is safe in Y-App because App.tsx remounts the tab's router on
 * instance switch, so the hook always mounts fresh per instance.
 */
export function useColumnResize({ storageKey, minWidth = 50 }: Options) {
  const instanceId = getActiveInstanceId();
  const fullKey = `pref_${instanceId}_${storageKey}`;

  const [widths, setWidths] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(window.localStorage.getItem(fullKey) ?? "{}");
    } catch {
      return {};
    }
  });

  const draggingRef = useRef<{ colId: string; startX: number; startWidth: number } | null>(null);

  const startResize = useCallback(
    (colId: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const current =
        widths[colId] ??
        (e.currentTarget.parentElement?.getBoundingClientRect().width ?? 120);
      draggingRef.current = { colId, startX: e.clientX, startWidth: current };
    },
    [widths],
  );

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = draggingRef.current;
      if (!d) return;
      const next = Math.max(minWidth, d.startWidth + (e.clientX - d.startX));
      setWidths((prev) => ({ ...prev, [d.colId]: next }));
    };
    const up = () => {
      if (!draggingRef.current) return;
      draggingRef.current = null;
      // Persist on release (not every mousemove) to avoid localStorage churn.
      setWidths((prev) => {
        try {
          window.localStorage.setItem(fullKey, JSON.stringify(prev));
        } catch {
          /* localStorage unavailable (private mode / quota) — in-memory only */
        }
        return prev;
      });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [fullKey, minWidth]);

  return { widths, startResize };
}
