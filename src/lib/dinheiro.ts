import type { Centavos } from "./tipos";

const formatoReais = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const formatoNumero = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatoPct = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0,
});

export function reais(valor: Centavos): string {
  return formatoReais.format(valor / 100);
}

/** "10,00" sem o "R$", para campos de digitação. */
export function numeroReais(valor: Centavos): string {
  return formatoNumero.format(valor / 100);
}

export function pct(valor: number): string {
  return `${formatoPct.format(valor)}%`;
}

/** Margem sobre o preço de venda. Retorna null se não dá para calcular. */
export function margem(preco: Centavos, custo: Centavos | null): number | null {
  if (custo === null || preco <= 0) return null;
  return ((preco - custo) / preco) * 100;
}

export type NivelMargem = "sem-custo" | "baixa" | "media" | "boa";

export function nivelMargem(m: number | null): NivelMargem {
  if (m === null) return "sem-custo";
  if (m < 20) return "baixa";
  if (m < 35) return "media";
  return "boa";
}
