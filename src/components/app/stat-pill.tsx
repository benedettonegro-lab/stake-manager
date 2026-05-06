import type { ReactNode } from "react";

type StatPillTone = "default" | "positive" | "negative" | "accent" | "warn";

const toneText: Record<StatPillTone, string> = {
  default: "text-white",
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
      className={`flex min-w-0 flex-col rounded-xl border border-[#1f2937] bg-[#0d1321] px-2.5 py-2 ${className}`.trim()}
    >
      <span className="text-[9px] font-semibold uppercase tracking-wide text-[#64748b]">
        {label}
      </span>
      <span
        className={`mt-0.5 truncate text-sm font-bold tabular-nums leading-tight ${toneText[tone]}`}
      >
        {value}
      </span>
    </div>
  );
}
