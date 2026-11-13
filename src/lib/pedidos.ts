import type { Centavos, DiaHorario, PagamentoPedido, SituacaoPedido } from "./tipos";

/* Textos e contas do delivery, sem acesso ao banco. */

export const NOME_PAGAMENTO: Record<PagamentoPedido, string> = { dinheiro: "Dinheiro", cartao: "Cartão", pix: "Pix" };

export const NOME_SITUACAO: Record<SituacaoPedido, string> = {
  novo: "Recebido",
  aceito: "Em preparo",
  saiu: "Saiu para entrega",
  entregue: "Entregue",
  recusado: "Recusado",
};

export const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** "11987654321" vira "(11) 98765-4321". Aceita o texto parcial enquanto digita. */
export function formatarTelefone(texto: string): string {
  const d = texto.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  const corte = resto.length > 8 ? 5 : 4;
  return resto.length > corte ? `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}` : `(${ddd}) ${resto}`;
}

/** Link do WhatsApp para o telefone do cliente (Brasil). */
export const linkWhatsApp = (telefone: string) => `https://wa.me/55${telefone.replace(/\D/g, "")}`;

/** "18:00 às 02:00" ou "Fechado". */
export function textoDia(d: DiaHorario): string {
  return d ? `${d.abre} às ${d.fecha}` : "Fechado";
}

/** Troco que o entregador leva: o que o cliente vai dar menos o total. */
export function trocoALevar(total: Centavos, trocoPara: Centavos | null): Centavos {
  return trocoPara === null ? 0 : Math.max(0, trocoPara - total);
}
