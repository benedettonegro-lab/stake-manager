"use client";

import {
  buildTimelineOffsets,
  findTimelineStartIndex,
  type BetTimelineRow,
  estimateTimelineRowHeight,
} from "@/lib/flatten-bet-timeline";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

type VariableVirtualListProps = {
  rows: BetTimelineRow[];
  className?: string;
  style?: CSSProperties;
  overscanPx?: number;
  onEndReached?: () => void;
  endReachedThreshold?: number;
  renderRow: (row: BetTimelineRow, index: number) => ReactNode;
};

/** Virtual scroll a altezza variabile (timeline giocate). */
export function VariableVirtualList({
  rows,
  className = "",
  style,
  overscanPx = 400,
  onEndReached,
  endReachedThreshold = 320,
  renderRow,
}: VariableVirtualListProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [viewportH, setViewportH] = useState(520);
  const [scrollTop, setScrollTop] = useState(0);
  const endLock = useRef(false);

  const { offsets, totalHeight } = useMemo(
    () => buildTimelineOffsets(rows),
    [rows],
  );

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight || 520));
    ro.observe(el);
    setViewportH(el.clientHeight || 520);
    return () => ro.disconnect();
  }, []);

  const start = findTimelineStartIndex(offsets, Math.max(0, scrollTop - overscanPx));
  const endScroll = scrollTop + viewportH + overscanPx;
  let end = start;
  while (end < rows.length && offsets[end + 1] < endScroll) {
    end += 1;
  }
  end = Math.min(rows.length, end + 1);

  const offsetY = offsets[start] ?? 0;
  const slice = rows.slice(start, end);

  const onScroll = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const top = el.scrollTop;
    setScrollTop(top);
    if (!onEndReached) return;
    const dist = el.scrollHeight - top - el.clientHeight;
    if (dist < endReachedThreshold && !endLock.current) {
      endLock.current = true;
      onEndReached();
      window.setTimeout(() => {
        endLock.current = false;
      }, 600);
    }
  }, [endReachedThreshold, onEndReached]);

  if (rows.length === 0) return null;

  return (
    <div
      ref={rootRef}
      className={`sm-momentum-scroll ${className}`}
      style={style}
      onScroll={onScroll}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        <div
          className="sm-gpu-layer"
          style={{
            transform: `translate3d(0,${offsetY}px,0)`,
            willChange: "transform",
          }}
        >
          {slice.map((row, i) => {
            const index = start + i;
            const h = estimateTimelineRowHeight(row);
            return (
              <div
                key={row.key}
                style={{ minHeight: h }}
                data-vrow={row.kind}
              >
                {renderRow(row, index)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
