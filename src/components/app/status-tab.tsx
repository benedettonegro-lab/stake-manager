"use client";

import type { ReactNode } from "react";

export type BetStatusTabVariant = "open" | "won" | "lost" | "void" | "cashout";

const stripClass: Record<BetStatusTabVariant, string> = {
  open: "bg-gradient-to-b from-[#2563eb] to-[#1d4ed8]",
  won: "bg-[#059669]",
  lost: "bg-gradient-to-b from-[#dc2626] to-[#b91c1c]",
  void: "bg-[#6B7385]",
  cashout: "bg-[#6d28d9]",
};

type StatusTabProps = {
  variant: BetStatusTabVariant;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  children?: ReactNode;
};

/** Linguetta verticale stato (destra card giocata). */
export function StatusTab({
  variant,
  label,
  onClick,
  disabled,
  busy,
  children,
}: StatusTabProps) {
  const inner = (
    <span
      className="select-none py-2 text-center text-[9px] font-bold uppercase leading-tight tracking-[0.12em] text-white/95 [text-orientation:mixed] [writing-mode:vertical-rl]"
      aria-hidden={busy}
    >
      {busy ? "…" : label}
    </span>
  );

  return (
    <div className={`relative flex shrink-0 self-stretch ${stripClass[variant]}`}>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={onClick}
        className="flex min-h-[3rem] w-10 flex-col items-center justify-center px-0.5 transition hover:brightness-110 active:brightness-95 disabled:pointer-events-none disabled:opacity-55"
        aria-label={`Stato: ${label}`}
      >
        {busy ? (
          <span
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
            aria-hidden
          />
        ) : (
          inner
        )}
      </button>
      {children}
    </div>
  );
}
