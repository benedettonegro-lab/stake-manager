"use client";

import type { ReactNode } from "react";

type PageLoadGateProps = {
  ready?: boolean;
  loadError: string | null;
  onRetry: () => void;
  skeletonCount?: number;
  hasContent?: boolean;
  isRefreshing?: boolean;
  children: ReactNode;
};

/**
 * Mai skeleton full-page: contenuto sempre visibile, refresh inline opzionale.
 */
export function PageLoadGate({
  loadError,
  onRetry,
  hasContent = false,
  isRefreshing = false,
  children,
}: PageLoadGateProps) {
  if (loadError && !hasContent) {
    return (
      <div className="flex flex-col gap-3">
        <div
          className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-[#fb7185]/35 bg-[#fb7185]/10 px-4 py-8 text-center"
          role="alert"
        >
          <p className="text-sm font-semibold text-[#E6EAF2]">Impossibile caricare i dati</p>
          <p className="max-w-sm text-xs leading-relaxed text-[#8B93A7]">{loadError}</p>
          <button
            type="button"
            className="sm-touch sm-btn-primary min-h-11 px-6"
            onClick={onRetry}
          >
            Riprova
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {isRefreshing ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-[30] h-0.5 overflow-hidden bg-white/[0.06]"
          aria-hidden
        >
          <div className="h-full w-1/3 animate-[sm-shimmer_0.9s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-[#A970FF]/70 to-transparent" />
        </div>
      ) : null}
      {loadError && hasContent ? (
        <div
          className="mb-2 flex flex-col gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <p className="text-xs text-amber-100/90">{loadError}</p>
          <button
            type="button"
            className="sm-touch shrink-0 rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs font-semibold text-amber-100"
            onClick={onRetry}
          >
            Riprova
          </button>
        </div>
      ) : null}
      {children}
    </div>
  );
}
