import type { ReactNode } from "react";

type StatPillTone = "default" | "positive" | "negative" | "accent" | "warn";

const toneText: Record<StatPillTone, string> = {
  default: "text-[#E6EAF2]",
  positive: "text-[#34d399]",
  negative: "text-[#fb7185]",
  accent: "text-[#B89EFF]",
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
      className={`flex min-h-[46px] min-w-0 flex-col justify-center gap-0 rounded-lg border border-white/[0.06] bg-[#131C31] px-1.5 py-1 sm:min-h-0 sm:gap-0 sm:rounded-xl sm:px-2.5 sm:py-2 ${className}`.trim()}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8B93A7] sm:text-xs sm:tracking-wide">
        {label}
      </span>
      <span
        className={`mt-0 min-w-0 whitespace-nowrap text-[15px] font-bold tabular-nums leading-tight sm:mt-0 sm:text-xl ${toneText[tone]}`}
      >
        {value}
      </span>
    </div>
  );
}
