"use client";

import type { ReactNode } from "react";

export type FullScreenSheetProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  onBack: () => void;
  dismissDisabled?: boolean;
  footer?: ReactNode;
  stackClassName?: string;
};

/** Sheet mobile 100dvh (stile BetAnalytix), senza overlay centrale. */
export function FullScreenSheet({
  open,
  title,
  children,
  onBack,
  dismissDisabled = false,
  footer,
  stackClassName = "z-[95]",
}: FullScreenSheetProps) {
  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 flex h-[100dvh] max-h-[100dvh] w-[100vw] max-w-[100vw] flex-col overflow-hidden bg-[#0A1020] ${stackClassName} sm-fullscreen-sheet-in`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fullscreen-sheet-title"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] bg-[#0A1020]/98 px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          type="button"
          disabled={dismissDisabled}
          onClick={onBack}
          aria-label="Indietro"
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-[#E6EAF2] transition active:scale-95 disabled:opacity-40"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 6l-6 6 6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <h1
          id="fullscreen-sheet-title"
          className="min-w-0 flex-1 truncate text-[17px] font-bold leading-tight text-white"
        >
          {title}
        </h1>
      </header>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-3">
        {children}
      </div>

      {footer ? (
        <div className="shrink-0 border-t border-white/[0.06] bg-[#0A1020]/98 px-3 py-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
