"use client";

import type { ReactNode } from "react";

export type BottomSheetProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  dismissDisabled?: boolean;
  /** Contenuto sotto il titolo nell’header (es. KPI compatti). */
  headerExtra?: ReactNode;
  /** Classi aggiuntive sul pannello (es. max-width diversa). */
  panelClassName?: string;
  /** z-index del wrapper (sheet annidate sopra altre sheet). */
  stackClassName?: string;
  /** Area fissa sotto lo scroll (es. CTA floating). */
  footer?: ReactNode;
};

/**
 * Modale a pannello (overlay + contenuto centrato) con animazione entrata.
 */
export function BottomSheet({
  open,
  title,
  children,
  onClose,
  dismissDisabled = false,
  headerExtra,
  panelClassName = "",
  stackClassName = "z-[90]",
  footer,
}: BottomSheetProps) {
  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center ${stackClassName}`}
    >
      <button
        type="button"
        aria-label="Chiudi"
        disabled={dismissDisabled}
        className="sm-sheet-backdrop absolute inset-0 bg-[#050812]/65 backdrop-blur-sm transition enabled:hover:bg-[#050812]/78 disabled:cursor-not-allowed"
        onClick={() => {
          if (!dismissDisabled) onClose();
        }}
      />
      <div
        className={`sm-sheet-panel relative z-10 mx-auto flex max-h-[min(88dvh,640px)] w-[calc(100%-24px)] max-w-[430px] flex-col rounded-xl border border-white/[0.06] bg-[#11182B]/95 shadow-lg shadow-black/22 backdrop-blur-md sm:w-[calc(100%-32px)] sm:rounded-2xl sm:shadow-xl sm:shadow-black/28 ${panelClassName}`}
      >
        <header className="flex shrink-0 items-start justify-between gap-2 border-b border-[#1E2838]/90 px-3 py-3 sm:px-4 sm:py-2.5">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[26px] font-bold leading-tight tracking-tight text-white sm:text-base sm:font-semibold">
              {title}
            </h2>
            {headerExtra ? <div className="mt-1.5 sm:mt-2">{headerExtra}</div> : null}
          </div>
          <button
            type="button"
            disabled={dismissDisabled}
            onClick={() => onClose()}
            className="flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-full text-[#8B93A7] transition duration-150 ease-out hover:bg-white/[0.05] hover:text-[#E6EAF2] active:scale-[0.96] disabled:opacity-40"
            aria-label="Chiudi"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 sm:py-2.5">
            {children}
          </div>
          {footer ? (
            <div className="shrink-0 border-t border-[#1E2838]/80 bg-[#0D1326]/90 px-4 py-2.5 backdrop-blur-md">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
