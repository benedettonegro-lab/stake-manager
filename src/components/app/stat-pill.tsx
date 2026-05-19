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
  /** `summary` = Home dashboard (mobile-readable); default = resto app */
  variant?: "default" | "summary";
  className?: string;
};

export function StatPill({
  label,
  value,
  tone = "default",
  variant = "default",
  className = "",
}: StatPillProps) {
  const isSummary = variant === "summary";

  return (
    <div
      className={`flex min-w-0 flex-col justify-center rounded-lg border border-white/[0.06] bg-[#131C31] ${
        isSummary
          ? "min-h-[68px] gap-0.5 px-2.5 py-2 sm:min-h-0 sm:gap-0 sm:rounded-xl sm:px-2.5 sm:py-2"
          : "min-h-[40px] gap-0 px-1 py-0.5 sm:min-h-0 sm:gap-0 sm:rounded-xl sm:px-2.5 sm:py-2"
      } ${className}`.trim()}
    >
      <span
        className={
          isSummary
            ? "text-[12px] font-semibold leading-snug text-[#8B93A7] max-sm:text-[13px] sm:text-xs sm:uppercase sm:tracking-wide"
            : "text-[9px] font-semibold uppercase tracking-[0.1em] text-[#8B93A7] sm:text-xs sm:tracking-wide"
        }
      >
        {label}
      </span>
      <span
        className={`mt-0 min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap tabular-nums leading-tight ${
          isSummary
            ? "text-[22px] font-bold max-sm:text-[24px] sm:text-xl"
            : "text-[13px] font-bold sm:text-xl"
        } ${toneText[tone]}`}
      >
        {value}
      </span>
    </div>
  );
}
