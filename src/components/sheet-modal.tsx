"use client";

import type { ReactNode } from "react";

type SheetModalProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  /** Blocca chiusura backdrop (es. durante submit) */
  dismissDisabled?: boolean;
};

export function SheetModal({
  open,
  title,
  children,
  onClose,
  dismissDisabled = false,
}: SheetModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center">
      <button
        type="button"
        aria-label="Chiudi"
        disabled={dismissDisabled}
        className="sm-sheet-backdrop absolute inset-0 bg-[#050812]/65 backdrop-blur-sm transition enabled:hover:bg-[#050812]/78 disabled:cursor-not-allowed"
        onClick={() => {
          if (!dismissDisabled) onClose();
        }}
      />
      <div className="sm-sheet-panel relative z-10 mx-auto flex max-h-[min(90dvh,720px)] w-[calc(100%-32px)] max-w-[430px] flex-col rounded-2xl border border-white/[0.06] bg-[#131C31] shadow-xl shadow-black/22">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#1E2838] px-5 py-5 sm:px-5 sm:py-4">
          <h2 className="text-[20px] font-bold leading-tight text-[#E6EAF2] sm:text-xl sm:font-semibold">
            {title}
          </h2>
          <button
            type="button"
            disabled={dismissDisabled}
            onClick={() => onClose()}
            className="flex min-h-14 min-w-14 shrink-0 items-center justify-center rounded-xl text-[#8B93A7] transition hover:bg-white/[0.05] hover:text-white disabled:opacity-40 sm:min-h-12 sm:min-w-12"
            aria-label="Chiudi finestra"
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-5 sm:py-4">{children}</div>
      </div>
    </div>
  );
}
