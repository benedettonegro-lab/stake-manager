/** Parti data/ora locali per form giocata (input date + time). */
export function defaultPlacedDateTime(): { date: string; time: string } {
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const time = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ].join(":");
  return { date, time };
}

/** Converte date + time locali in ISO per `placed_at`. */
export function placedAtFromParts(dateStr: string, timeStr: string): string | null {
  if (!dateStr.trim()) return null;
  const [y, m, d] = dateStr.split("-").map((x) => Number.parseInt(x, 10));
  const [hh = 0, mm = 0] = (timeStr || "00:00").split(":").map((x) => Number.parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}
