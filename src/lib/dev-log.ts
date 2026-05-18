/** Log di bootstrap pagina — solo in development. */
export function devPageLog(
  page: string,
  event: string,
  detail?: unknown,
): void {
  if (process.env.NODE_ENV !== "development") return;
  if (detail !== undefined) {
    console.log(`[${page}] ${event}`, detail);
  } else {
    console.log(`[${page}] ${event}`);
  }
}
