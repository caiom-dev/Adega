import type { Comanda, TipoLugar } from "./tipos";

export const NOME_TIPO: Record<TipoLugar, string> = { mesa: "Mesa", balcao: "Balcão" };
export const NOME_TIPO_PLURAL: Record<TipoLugar, string> = { mesa: "Mesas", balcao: "Balcões" };

export function idLugar(tipo: TipoLugar, numero: number) {
  return `${tipo}-${numero}`;
}

/** "mesa-3" vira { tipo: "mesa", numero: 3 }. Retorna null para id inválido. */
export function lerIdLugar(id: string): { tipo: TipoLugar; numero: number } | null {
  const m = /^(mesa|balcao)-(\d{1,3})$/.exec(id);
  if (!m) return null;
  const numero = Number(m[2]);
  return numero >= 1 ? { tipo: m[1] as TipoLugar, numero } : null;
}

export function nomeLugar(tipo: TipoLugar, numero: number) {
  return `${NOME_TIPO[tipo]} ${numero}`;
}

/** Nome para mostrar na venda e nos relatórios: "Mesa 3" ou "Mesa 3 · Seu Zé". */
export function nomeComanda(c: Pick<Comanda, "tipo" | "numero" | "cliente">) {
  const base = nomeLugar(c.tipo, c.numero);
  return c.cliente ? `${base} · ${c.cliente}` : base;
}

/** "agora", "há 12 min", "há 1 h 05". */
export function tempoDesde(iso: string, agora: Date | null) {
  if (!iso || !agora) return "";
  const min = Math.max(0, Math.floor((agora.getTime() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return `há ${h} h ${String(min % 60).padStart(2, "0")}`;
}
