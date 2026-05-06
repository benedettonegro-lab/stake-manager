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
          ? "border border-[#475569] bg-[#1e293b] text-[#e2e8f0] hover:bg-[#334155]"
          : "sm-btn-primary";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !loading) onCancel();
      }}
    >
      <div
        className="w-full max-w-[430px] rounded-2xl border border-[#273449] bg-[#0d1321] p-4 shadow-2xl shadow-black/50 sm:p-5"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
      >
        <h2
          id="confirm-dialog-title"
          className="text-base font-semibold text-white"
        >
          {title}
        </h2>
        <p
          id="confirm-dialog-desc"
          className="mt-2 text-sm leading-relaxed text-[#94a3b8]"
        >
          {message}
        </p>
        {error ? (
          <p
            className="mt-3 rounded-xl border border-[#fb7185]/40 bg-[#fb7185]/10 px-3 py-2 text-sm text-[#fb7185]"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex flex-col-reverse gap-3 sm:mt-6 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={loading}
            onClick={() => onCancel()}
            className="min-h-12 rounded-xl border border-[#334155] bg-[#111827] px-4 text-base font-semibold text-[#e2e8f0] transition hover:bg-[#1e293b] disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void onConfirm()}
            className={`min-h-12 rounded-xl px-4 text-base font-semibold transition disabled:opacity-50 ${confirmClass}`}
          >
            {loading ? "Attendi…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
