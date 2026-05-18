"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

type VirtualListProps<T> = {
  items: T[];
  estimateSize: number;
  overscan?: number;
  className?: string;
  style?: CSSProperties;
  onEndReached?: () => void;
  endReachedThreshold?: number;
  getKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
};

/** Lista virtualizzata leggera — scroll con momentum, layer GPU su transform. */
export function VirtualList<T>({
  items,
  estimateSize,
  overscan = 6,
  className = "",
  style,
  onEndReached,
  endReachedThreshold = 280,
  getKey,
  renderItem,
}: VirtualListProps<T>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [viewportH, setViewportH] = useState(480);
  const [scrollTop, setScrollTop] = useState(0);
  const endLock = useRef(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight || 480));
    ro.observe(el);
    setViewportH(el.clientHeight || 480);
    return () => ro.disconnect();
  }, []);

  const totalHeight = items.length * estimateSize;
  const start = Math.max(0, Math.floor(scrollTop / estimateSize) - overscan);
  const visibleCount =
    Math.ceil(viewportH / estimateSize) + overscan * 2 + 2;
  const end = Math.min(items.length, start + visibleCount);
  const offsetY = start * estimateSize;

  const slice = useMemo(() => items.slice(start, end), [items, start, end]);

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

  if (items.length === 0) return null;

  return (
    <div
      ref={rootRef}
      className={`sm-momentum-scroll ${className}`}
      style={style}
      onScroll={onScroll}
      role="list"
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        <div
          className="sm-gpu-layer"
          style={{
            transform: `translate3d(0,${offsetY}px,0)`,
            willChange: "transform",
          }}
        >
          {slice.map((item, i) => {
            const index = start + i;
            return (
              <div key={getKey(item, index)} role="listitem">
                {renderItem(item, index)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

