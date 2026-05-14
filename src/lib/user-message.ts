/** Messaggi comprensibili per l’utente finale (niente dettagli tecnici Supabase/PostgREST). */

export function formatClientError(err: unknown, fallback = "Operazione non riuscita. Riprova."): string {
  if (err instanceof Error) {
    return formatErrorMessage(err.message, fallback);
  }
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) {
      return formatErrorMessage(m, fallback);
    }
  }
  if (typeof err === "string" && err.trim()) {
    return formatErrorMessage(err, fallback);
  }
  return fallback;
}

export function formatErrorMessage(message: string, fallback = "Operazione non riuscita. Riprova."): string {
  const m = (message ?? "").trim();
  if (!m) return fallback;

  const lower = m.toLowerCase();

  if (
    lower.includes("jwt") ||
    lower.includes("session") ||
    lower.includes("refresh token") ||
    lower.includes("invalid refresh") ||
    lower.includes("auth session")
  ) {
    return "Sessione scaduta. Effettua di nuovo l’accesso.";
  }

  if (lower.includes("saldo conto insufficiente") || lower.includes("saldo staker insufficiente")) {
    return m;
  }

  if (lower.includes("network") || lower.includes("fetch") || lower.includes("failed to fetch")) {
    return "Connessione instabile. Controlla la rete e riprova.";
  }

  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "Richiesta troppo lenta. Riprova tra poco.";
  }

  if (lower.includes("duplicate") || lower.includes("unique")) {
    return "Questo elemento risulta già presente.";
  }

  if (lower.includes("violates row-level security") || lower.includes("rls")) {
    return "Non hai i permessi per questa operazione.";
  }

  return fallback;
}
