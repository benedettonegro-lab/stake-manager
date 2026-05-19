/** Garantisce un array iterabile; evita crash su cache/API con shape errata. */
export function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Avviso solo in development per payload cache/API non validi. */
export function warnInvalidShape(context: string, detail: unknown): void {
  if (process.env.NODE_ENV !== "development") return;
  console.warn(`[${context}] invalid data shape`, detail);
}
