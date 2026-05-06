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
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Chiudi"
        disabled={dismissDisabled}
        className="absolute inset-0 bg-black/65 backdrop-blur-sm transition enabled:hover:bg-black/75 disabled:cursor-not-allowed"
        onClick={() => {
          if (!dismissDisabled) onClose();
        }}
      />
      <div className="relative z-10 mx-auto flex max-h-[min(90vh,720px)] w-full max-w-[430px] flex-col rounded-t-2xl border border-[#273449] bg-[#0d1321] shadow-2xl shadow-black/60 sm:rounded-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-[#1f2937] px-4 py-3 sm:px-5 sm:py-4">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button
            type="button"
            disabled={dismissDisabled}
            onClick={() => onClose()}
            className="flex min-h-12 min-w-12 items-center justify-center rounded-xl text-[#94a3b8] transition hover:bg-[#1f2937] hover:text-white disabled:opacity-40"
            aria-label="Chiudi finestra"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
      </div>
    </div>
  );
}
