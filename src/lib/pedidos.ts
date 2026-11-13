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

export interface Ponto {
  lat: number;
  lng: number;
}

/** Distância em linha reta, em metros (mesma conta que o banco faz para conferir o raio). */
export function distanciaM(a: Ponto, b: Ponto): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(h)));
}

/** "850 m" ou "3,2 km". */
export function textoDistancia(metros: number): string {
  if (metros < 1000) return `${Math.max(10, Math.round(metros / 10) * 10)} m`;
  return `${(metros / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
}

/** "13058343" vira "13058-343". Aceita o texto parcial enquanto digita. */
export function formatarCep(texto: string): string {
  const d = texto.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** Abre o endereço no mapa do celular (Google Maps ou o app padrão). */
export function linkMapa(endereco: string, ponto?: Ponto | null): string {
  const q = ponto ? `${ponto.lat},${ponto.lng}` : endereco;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
