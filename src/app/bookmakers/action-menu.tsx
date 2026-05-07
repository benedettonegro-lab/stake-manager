"use client";

import { useEffect, useRef, useState } from "react";

type ActionMenuProps = {
  onEdit: () => void;
  onDelete: () => void;
  /** Disabilita menu (es. durante submit) */
  disabled?: boolean;
};

export function ActionMenu({ onEdit, onDelete, disabled }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative shrink-0"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Menu azioni"
        onClick={() => !disabled && setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.06] bg-[#141C2A] text-[#8B93A7] transition hover:border-white/[0.12] hover:text-white active:scale-95 disabled:opacity-40"
      >
        <span className="text-lg leading-none" aria-hidden>
          ⋯
        </span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 min-w-[10.5rem] overflow-hidden rounded-xl border border-white/[0.06] bg-[#131C31] py-1 shadow-md shadow-black/25"
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2.5 text-left text-lg sm:text-base sm:text-sm font-medium text-[#e2e8f0] transition hover:bg-[#1e293b]"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            Modifica
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2.5 text-left text-lg sm:text-base sm:text-sm font-medium text-[#fb7185] transition hover:bg-[#fb7185]/10"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            Elimina
          </button>
        </div>
      ) : null}
    </div>
  );
}
