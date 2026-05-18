type EmptyStateProps = {
  title: string;
  description?: string;
  action?: React.ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.08] bg-[#11182B]/55 px-4 py-10 text-center sm:py-12">
      <div
        className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.06] bg-[#131C31]/80 text-xl opacity-80"
        aria-hidden
      >
        ◇
      </div>
      <p className="text-base font-semibold text-[#E6EAF2]">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-xs text-sm leading-snug text-[#8B93A7]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4 w-full max-w-xs">{action}</div> : null}
    </div>
  );
}
