/** Legacy label: "Tipo · Nome" */
export function legacyLabelParts(label: string | null | undefined): {
  tipo: string | null;
  nome: string;
} {
  if (!label) return { tipo: null, nome: "" };
  return parsePaymentLabel(label);
}

function parsePaymentLabel(label: string): { tipo: string | null; nome: string } {
  const sep = " · ";
  const i = label.indexOf(sep);
  if (i === -1) return { tipo: null, nome: label };
  return { tipo: label.slice(0, i), nome: label.slice(i + sep.length) };
}

export type PaymentMethodLike = {
  method_name?: string | null;
  type?: string | null;
  label?: string | null;
};

/**
 * Titolo metodo per UI: `method_name (type)`.
 * Fallback su dati legacy (`label` "Tipo · Nome") se mancano colonne nuove.
 */
export function paymentMethodTitle(m: PaymentMethodLike): string {
  let name = (m.method_name ?? "").trim();
  let kind = (m.type ?? "").trim();
  const lbl = (m.label ?? "").trim();
  if (!name && lbl) {
    const p = parsePaymentLabel(lbl);
    name = (p.nome || "").trim() || lbl;
    if (!kind) kind = (p.tipo ?? "").trim();
  }
  if (name && kind) return `${name} (${kind})`;
  if (name) return name;
  if (kind) return `(${kind})`;
  return "—";
}
