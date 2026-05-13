type StatTone = "default" | "positive" | "negative";

type StatCardProps = {
  label: string;
  value: string;
  sublabel?: string;
  tone?: StatTone;
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
}: StatCardProps) {
  return (
    <div className="flex min-h-[68px] flex-col justify-center rounded-2xl border border-white/[0.06] bg-[#11182B] px-2.5 py-2 shadow-sm shadow-black/10 sm:min-h-0 sm:rounded-2xl sm:p-4 sm:shadow-md sm:shadow-black/12">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8B93A7] sm:text-xs sm:font-medium sm:tracking-wide">
        {label}
      </p>
      <p
        className={`mt-1 min-w-0 overflow-x-auto whitespace-nowrap text-xl font-bold tabular-nums leading-none sm:mt-2 sm:text-2xl sm:font-semibold ${toneClass[tone]}`}
      >
        {value}
      </p>
      {sublabel ? (
        <p className="mt-1 text-xs leading-snug text-[#8B93A7] sm:mt-1 sm:text-sm sm:leading-normal">{sublabel}</p>
      ) : null}
    </div>
  );
}
