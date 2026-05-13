"use client";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "default" | "success" | "neutral";
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  error?: string | null;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = "Conferma",
  cancelText = "Annulla",
  variant = "default",
  loading = false,
  onConfirm,
  onCancel,
  error = null,
}: ConfirmDialogProps) {
  if (!open) return null;

  const confirmClass =
    variant === "danger"
      ? "border border-red-500/50 bg-red-500/15 text-red-200 hover:bg-red-500/25"
      : variant === "success"
        ? "border border-[#34d399]/45 bg-[#34d399]/12 text-[#a7f3d0] hover:bg-[#34d399]/22"
        : variant === "neutral"
          ? "border border-[#6B7385] bg-[#1e293b] text-[#e2e8f0] hover:bg-[#334155]"
          : "sm-btn-primary";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Chiudi"
        disabled={loading}
        className="sm-sheet-backdrop absolute inset-0 bg-[#050812]/65 backdrop-blur-sm transition enabled:hover:bg-[#050812]/78 disabled:cursor-not-allowed"
        onClick={() => {
          if (!loading) onCancel();
        }}
      />
      <div
        className="sm-sheet-panel relative z-10 w-[calc(100%-24px)] max-w-[430px] rounded-2xl border border-white/[0.06] bg-[#131C31] p-4 shadow-xl shadow-black/22 sm:w-[calc(100%-32px)] sm:p-5"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
      >
        <h2
          id="confirm-dialog-title"
          className="text-lg font-bold leading-snug text-[#E6EAF2] sm:text-xl sm:font-semibold sm:leading-normal"
        >
          {title}
        </h2>
        <p
          id="confirm-dialog-desc"
          className="mt-2 text-sm leading-snug text-[#8B93A7] sm:mt-2 sm:text-sm sm:leading-relaxed"
        >
          {message}
        </p>
        {error ? (
          <p
            className="mt-3 rounded-lg border border-[#fb7185]/40 bg-[#fb7185]/10 px-2.5 py-2 text-sm text-[#fb7185] sm:mt-3 sm:rounded-xl sm:px-3 sm:py-2 sm:text-sm"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex flex-col-reverse gap-2 sm:mt-6 sm:flex-row sm:justify-end sm:gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={() => onCancel()}
            className="min-h-10 rounded-lg border border-white/[0.06] bg-[#11182B] px-4 py-2 text-sm font-semibold text-[#e2e8f0] transition hover:bg-[#131C31] disabled:opacity-50 sm:min-h-12 sm:rounded-xl sm:px-4 sm:py-3 sm:text-base"
          >
            {cancelText}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void onConfirm()}
            className={`min-h-10 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50 sm:min-h-12 sm:rounded-xl sm:px-4 sm:py-3 sm:text-base ${confirmClass}`}
          >
            {loading ? "Attendi…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
