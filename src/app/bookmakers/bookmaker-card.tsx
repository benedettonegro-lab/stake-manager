"use client";

import { useCallback, useState } from "react";
import { ActionMenu } from "./action-menu";

export type BookmakerCardRow = {
  id: string;
  name: string;
  note: string | null;
};

type BookmakerCardProps = {
  bookmaker: BookmakerCardRow;
  onEdit: (b: BookmakerCardRow) => void;
  onDelete: (b: BookmakerCardRow) => void;
  /** Evidenziazione / animazione ingresso */
  highlight?: boolean;
  enterAnimation?: boolean;
};

function InitialMark(name: string): string {
  const t = name.trim();
  return t ? t.charAt(0).toUpperCase() : "?";
}

export function BookmakerCard({
  bookmaker: b,
  onEdit,
  onDelete,
  highlight,
  enterAnimation,
}: BookmakerCardProps) {
  const [tap, setTap] = useState(false);
  const onPointerDown = useCallback(() => setTap(true), []);
  const onPointerUp = useCallback(() => {
    window.setTimeout(() => setTap(false), 160);
  }, []);

  return (
    <article
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      className={`flex min-w-0 items-stretch gap-2.5 rounded-2xl border border-white/[0.08] bg-[#0E1525] px-3 py-2.5 shadow-sm transition duration-200 hover:border-white/[0.08] active:scale-[0.97] ${
        highlight ? "ring-2 ring-[#a855f7]/40 ring-offset-2 ring-offset-[#070B14]" : ""
      } ${tap ? "ring-1 ring-white/15" : ""} ${enterAnimation ? "bm-card-enter" : ""}`.trim()}
    >
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-gradient-to-br from-[#1e293b] to-[#0f172a] text-lg sm:text-base sm:text-sm font-bold text-[#c4b5fd]"
        aria-hidden
      >
        {InitialMark(b.name)}
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <h3 className="truncate text-lg sm:text-base sm:text-sm font-bold text-white">{b.name}</h3>
        {b.note?.trim() ? (
          <p className="mt-0.5 line-clamp-2 text-[14px] leading-snug text-[#64748b]">{b.note}</p>
        ) : null}
      </div>
      <ActionMenu onEdit={() => onEdit(b)} onDelete={() => onDelete(b)} />
    </article>
  );
}
