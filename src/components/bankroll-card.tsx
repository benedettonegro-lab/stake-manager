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
    <div className="rounded-2xl border border-[#273449] bg-[#111827] p-4 shadow-lg shadow-black/25">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white">{title}</p>
          {note ? (
            <p className="mt-1 line-clamp-2 text-sm text-[#94a3b8]">{note}</p>
          ) : null}
          <p className="mt-2 text-xs text-[#94a3b8]">{balanceLabel}</p>
          <p className={`text-lg font-semibold tabular-nums ${balClass}`}>
            {balanceFormatted} €
          </p>
          {meta ? (
            <p className="mt-2 text-xs text-[#64748b]">{meta}</p>
          ) : null}
        </div>
        {action ? (
          <div className="flex shrink-0 items-center sm:pt-0.5">{action}</div>
        ) : null}
      </div>
    </div>
  );
}
