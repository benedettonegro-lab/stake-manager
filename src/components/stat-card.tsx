type StatTone = "default" | "positive" | "negative";

type StatCardProps = {
  label: string;
  value: string;
  sublabel?: string;
  tone?: StatTone;
  /** `summary` = Home dashboard; default = altre pagine */
  variant?: "default" | "summary";
};

const toneClass: Record<StatTone, string> = {
  default: "text-[#E6EAF2]",
  positive: "text-[#34d399]",
  negative: "text-[#fb7185]",
};

export function StatCard({
  label,
  value,
  sublabel,
  tone = "default",
  variant = "default",
}: StatCardProps) {
  const isSummary = variant === "summary";

  return (
    <div
      className={`flex flex-col justify-center rounded-2xl border border-white/[0.06] bg-[#11182B] shadow-sm shadow-black/10 ${
        isSummary
          ? "min-h-[72px] px-3 py-2.5 sm:min-h-0 sm:rounded-2xl sm:p-4 sm:shadow-md sm:shadow-black/12"
          : "min-h-[68px] px-2.5 py-2 sm:min-h-0 sm:rounded-2xl sm:p-4 sm:shadow-md sm:shadow-black/12"
      }`}
    >
      <p
        className={
          isSummary
            ? "text-[12px] font-semibold leading-snug text-[#8B93A7] max-sm:text-[13px] sm:text-xs sm:font-medium sm:tracking-wide"
            : "text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8B93A7] sm:text-xs sm:font-medium sm:tracking-wide"
        }
      >
        {label}
      </p>
      <p
        className={`mt-1 min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-bold tabular-nums leading-none ${
          isSummary
            ? "text-[clamp(1.75rem,8.5vw,2.375rem)] max-sm:text-[36px] sm:mt-2 sm:text-2xl sm:font-semibold"
            : "text-xl sm:mt-2 sm:text-2xl sm:font-semibold"
        } ${toneClass[tone]}`}
      >
        {value}
      </p>
      {sublabel ? (
        <p className="mt-1 text-xs leading-snug text-[#8B93A7] sm:mt-1 sm:text-sm sm:leading-normal">
          {sublabel}
        </p>
      ) : null}
    </div>
  );
}
