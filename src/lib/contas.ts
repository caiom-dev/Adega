import type { Conta } from "./tipos";

/*
 * Regras das contas a pagar. Datas sempre em "AAAA-MM-DD" no dia local do aparelho:
 * vencimento é um dia do calendário, não um horário.
 */

export type SituacaoConta = "paga" | "vencida" | "hoje" | "a-pagar";

/** Hoje no fuso do aparelho, em "AAAA-MM-DD". */
export function hojeISO(agora = new Date()): string {
  const d = new Date(agora.getTime() - agora.getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 10);
}

const emDias = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;

/** Dias do hoje até o vencimento: 0 vence hoje, negativo já venceu. */
export function diasAte(vencimento: string, hoje: string): number {
  return emDias(vencimento) - emDias(hoje);
}

export function situacaoConta(c: Conta, hoje: string): SituacaoConta {
  if (c.pagoEm) return "paga";
  const d = diasAte(c.vencimento, hoje);
  return d < 0 ? "vencida" : d === 0 ? "hoje" : "a-pagar";
}

/** "vence hoje", "vence amanhã", "vence em 5 dias", "venceu ontem", "venceu há 3 dias". */
export function textoVencimento(vencimento: string, hoje: string): string {
  const d = diasAte(vencimento, hoje);
  if (d === 0) return "vence hoje";
  if (d === 1) return "vence amanhã";
  if (d > 1) return `vence em ${d} dias`;
  return d === -1 ? "venceu ontem" : `venceu há ${-d} dias`;
}

const formatoDia = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const formatoDiaAno = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

/** "15/11", ou "15/11/2027" fora do ano corrente. */
export function dataCurta(iso: string, hoje: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return iso.slice(0, 4) === hoje.slice(0, 4) ? formatoDia.format(d) : formatoDiaAno.format(d);
}

export interface ResumoContas {
  /** Em aberto que já venceram. */
  vencidas: { qtd: number; total: number };
  /** Em aberto vencendo de hoje até 6 dias à frente. */
  semana: { qtd: number; total: number };
  /** Em aberto vencendo até o fim do mês corrente (inclui as da semana; não inclui as vencidas). */
  mes: { qtd: number; total: number };
  /** Vencidas + vencendo hoje: o número que aparece no menu. */
  urgentes: number;
}

export function resumirContas(contas: Conta[], hoje: string): ResumoContas {
  const r: ResumoContas = { vencidas: { qtd: 0, total: 0 }, semana: { qtd: 0, total: 0 }, mes: { qtd: 0, total: 0 }, urgentes: 0 };
  const fimMes = hoje.slice(0, 7);
  for (const c of contas) {
    if (c.pagoEm) continue;
    const d = diasAte(c.vencimento, hoje);
    if (d <= 0) r.urgentes++;
    if (d < 0) {
      r.vencidas.qtd++;
      r.vencidas.total += c.valor;
      continue;
    }
    if (d <= 6) {
      r.semana.qtd++;
      r.semana.total += c.valor;
    }
    if (c.vencimento.slice(0, 7) === fimMes) {
      r.mes.qtd++;
      r.mes.total += c.valor;
    }
  }
  return r;
}

/** Em aberto primeiro (do vencimento mais antigo ao mais novo); pagas por último, a mais recente primeiro. */
export function ordenarContas(contas: Conta[]): Conta[] {
  return [...contas].sort((a, b) => {
    if (!a.pagoEm !== !b.pagoEm) return a.pagoEm ? 1 : -1;
    if (a.pagoEm && b.pagoEm) return b.pagoEm.localeCompare(a.pagoEm) || b.vencimento.localeCompare(a.vencimento);
    return a.vencimento.localeCompare(b.vencimento) || a.descricao.localeCompare(b.descricao, "pt-BR");
  });
}
