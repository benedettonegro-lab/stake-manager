/** True se l’errore sembra rete / offline (non invalidazione sessione). */
export function isLikelyOfflineOrNetworkError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const msg = String((error as { message?: unknown }).message ?? "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed") ||
    msg.includes("econnreset") ||
    msg.includes("socket hang up") ||
    msg.includes("timeout")
  );
}
