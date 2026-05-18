"use client";

import { SkeletonList } from "@/components/ui/skeleton";
import type { ReactNode } from "react";

type PageLoadGateProps = {
  ready: boolean;
  loadError: string | null;
  onRetry: () => void;
  skeletonCount?: number;
  /** Se true, errore come banner sopra il contenuto (cache parziale). */
  hasContent?: boolean;
  children: ReactNode;
};

/** Skeleton → contenuto | errore con retry. Non resta mai bloccato sullo skeleton. */
export function PageLoadGate({
  ready,
  loadError,
  onRetry,
  skeletonCount = 5,
  hasContent = false,
  children,
}: PageLoadGateProps) {
  if (!ready) {
    return <SkeletonList count={skeletonCount} />;
  }

  if (loadError && !hasContent) {
    return (
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
    );
  }

  return (
    <>
      {loadError && hasContent ? (
        <div
          className="mb-4 flex flex-col gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <p className="text-xs text-amber-100/90">{loadError}</p>
          <button
            type="button"
            className="sm-touch shrink-0 rounded-lg border border-amber-500/40 px-3 py-2 text-xs font-semibold text-amber-100"
            onClick={onRetry}
          >
            Riprova
          </button>
        </div>
      ) : null}
      {children}
    </>
  );
}
