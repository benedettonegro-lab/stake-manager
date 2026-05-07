import type { ReactNode } from "react";

type StatPillTone = "default" | "positive" | "negative" | "accent" | "warn";

const toneText: Record<StatPillTone, string> = {
  default: "text-[#E6EAF2]",
  positive: "text-[#34d399]",
  negative: "text-[#fb7185]",
  accent: "text-[#c4b5fd]",
  warn: "text-[#fbbf24]",
};

type StatPillProps = {
  label: string;
  value: ReactNode;
  tone?: StatPillTone;
  className?: string;
};

export function StatPill({ label, value, tone = "default", className = "" }: StatPillProps) {
  return (
    <div
      className={`flex min-h-[80px] min-w-0 flex-col justify-center gap-0.5 rounded-xl border border-white/[0.08] bg-[#121B2F] px-3 py-3 sm:min-h-0 sm:gap-0 sm:px-2.5 sm:py-2 ${className}`.trim()}
    >
      <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#64748b] sm:text-xs sm:tracking-wide">
        {label}
      </span>
      <span
        className={`mt-0.5 min-w-0 whitespace-nowrap text-[22px] font-bold tabular-nums leading-tight sm:mt-0 sm:text-xl ${toneText[tone]}`}
      >
        {value}
      </span>
    </div>
  );
}
