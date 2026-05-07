import type { ReactNode } from "react";

type BankrollCardProps = {
  title: string;
  note?: string | null;
  balanceLabel: string;
  /** Valore numerico grezzo per colore */
  balanceAmount: number;
  balanceFormatted: string;
  meta?: string;
  action?: ReactNode;
};

export function BankrollCard({
  title,
  note,
  balanceLabel,
  balanceAmount,
  balanceFormatted,
  meta,
  action,
}: BankrollCardProps) {
  const balClass =
    balanceAmount > 0
      ? "text-[#34d399]"
      : balanceAmount < 0
        ? "text-[#fb7185]"
        : "text-[#94a3b8]";

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#0E1525] p-4 shadow-md shadow-black/15 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[22px] font-bold text-[#E6EAF2] sm:text-xl sm:font-semibold">{title}</p>
          {note ? (
            <p className="mt-1.5 line-clamp-2 text-[15px] text-[#94a3b8] sm:mt-1 sm:text-sm">{note}</p>
          ) : null}
          <p className="mt-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#94a3b8] sm:mt-2 sm:text-xs">{balanceLabel}</p>
          <p className={`mt-1 whitespace-nowrap text-[30px] font-extrabold tabular-nums sm:text-2xl sm:font-semibold ${balClass}`}>
            {balanceFormatted} €
          </p>
          {meta ? (
            <p className="mt-2 text-[15px] text-[#64748b] sm:mt-2 sm:text-sm">{meta}</p>
          ) : null}
        </div>
        {action ? (
          <div className="flex shrink-0 items-center sm:pt-0.5">{action}</div>
        ) : null}
      </div>
    </div>
  );
}
