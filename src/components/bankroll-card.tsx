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
        : "text-[#8B93A7]";

  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#11182B] px-3 py-3 shadow-sm shadow-black/12 sm:rounded-2xl sm:p-4 sm:shadow-md sm:shadow-black/15">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[20px] font-bold text-[#E6EAF2] sm:text-xl sm:font-semibold">{title}</p>
          {note ? (
            <p className="mt-1.5 line-clamp-2 text-[14px] text-[#8B93A7] sm:mt-1 sm:text-sm">{note}</p>
          ) : null}
          <p className="mt-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8B93A7] sm:mt-2 sm:text-xs">{balanceLabel}</p>
          <p className={`mt-1 whitespace-nowrap text-[28px] font-extrabold tabular-nums sm:text-2xl sm:font-semibold ${balClass}`}>
            {balanceFormatted} €
          </p>
          {meta ? (
            <p className="mt-2 text-[14px] text-[#8B93A7] sm:mt-2 sm:text-sm">{meta}</p>
          ) : null}
        </div>
        {action ? (
          <div className="flex shrink-0 items-center sm:pt-0.5">{action}</div>
        ) : null}
      </div>
    </div>
  );
}
