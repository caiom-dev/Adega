/*
 * Leitura da linha digitável (ou do código de barras) de boletos brasileiros.
 *
 * Dois tipos:
 * - Boleto bancário: 47 dígitos na linha, 44 no código de barras. Traz banco, vencimento e valor.
 * - Conta de consumo e tributo (luz, água, telefone, IPTU): 48 dígitos, começa com 8.
 *   Traz o valor, mas o vencimento não tem lugar fixo no código: o dono informa a data.
 *
 * Os dígitos verificadores são conferidos. Se não baterem, foi erro de digitação ou de leitura.
 */

export type TipoBoleto = "bancario" | "consumo";

export interface LeituraBoleto {
  tipo: TipoBoleto;
  /** Os 44 dígitos do código de barras. */
  barras: string;
  /** A linha digitável, só os dígitos (47 ou 48). */
  linha: string;
  /** Centavos. null quando o boleto não traz o valor (o dono digita). */
  valor: number | null;
  /** "AAAA-MM-DD". null quando o código não traz a data. */
  vencimento: string | null;
  /** Sugestão de descrição: o banco ou o tipo da conta. */
  sugestao: string;
}

export type ResultadoBoleto = { ok: true; leitura: LeituraBoleto } | { ok: false; erro: "tamanho" | "digito" };

const so = (t: string) => t.replace(/\D/g, "");

/* ───────── Dígitos verificadores ───────── */

/** Módulo 10: pesos 2 e 1 da direita para a esquerda, somando os algarismos de cada produto. */
export function modulo10(numero: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = numero.length - 1; i >= 0; i--) {
    let p = Number(numero[i]) * peso;
    if (p > 9) p = Math.floor(p / 10) + (p % 10);
    soma += p;
    peso = peso === 2 ? 1 : 2;
  }
  const resto = soma % 10;
  return resto === 0 ? 0 : 10 - resto;
}

/** Soma do módulo 11 com pesos de 2 a 9, da direita para a esquerda. */
function soma11(numero: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = numero.length - 1; i >= 0; i--) {
    soma += Number(numero[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  return soma;
}

/** Dígito geral do boleto bancário: 0, 10 e 11 viram 1. */
export function modulo11Bancario(numero: string): number {
  const dv = 11 - (soma11(numero) % 11);
  return dv === 0 || dv === 10 || dv === 11 ? 1 : dv;
}

/** Módulo 11 das contas de consumo: resto 0 ou 1 vira 0. */
export function modulo11Consumo(numero: string): number {
  const resto = soma11(numero) % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/* ───────── Vencimento ───────── */

const DIA = 86_400_000;
/** Fator 1000 caiu em 03/07/2000 na primeira volta e em 22/02/2025 na segunda (a Febraban recomeçou a contagem). */
const BASE_1 = Date.UTC(1997, 9, 7);
const BASE_2 = Date.UTC(2025, 1, 22) - 1000 * DIA;

const paraData = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Converte o fator de vencimento na data. Das duas voltas da contagem, fica a mais perto de hoje. */
export function dataDoFator(fator: number, hoje = new Date()): string | null {
  if (fator < 1000) return null;
  const agora = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const a = BASE_1 + fator * DIA;
  const b = BASE_2 + fator * DIA;
  return paraData(Math.abs(a - agora) <= Math.abs(b - agora) ? a : b);
}

/* ───────── Bancos e segmentos ───────── */

const BANCOS: Record<string, string> = {
  "001": "Banco do Brasil",
  "033": "Santander",
  "041": "Banrisul",
  "077": "Inter",
  "104": "Caixa",
  "208": "BTG Pactual",
  "212": "Banco Original",
  "237": "Bradesco",
  "260": "Nubank",
  "290": "PagBank",
  "323": "Mercado Pago",
  "336": "C6 Bank",
  "341": "Itaú",
  "380": "PicPay",
  "389": "Mercantil",
  "422": "Safra",
  "748": "Sicredi",
  "756": "Sicoob",
};

const SEGMENTOS: Record<string, string> = {
  "1": "Prefeitura",
  "2": "Água",
  "3": "Luz",
  "4": "Telefone e internet",
  "5": "Imposto",
  "6": "Carnê",
  "7": "Multa de trânsito",
};

/* ───────── Leitura ───────── */

function lerBarrasBancario(barras: string, linha: string, hoje: Date): ResultadoBoleto {
  const dv = Number(barras[4]);
  if (modulo11Bancario(barras.slice(0, 4) + barras.slice(5)) !== dv) return { ok: false, erro: "digito" };
  const fator = Number(barras.slice(5, 9));
  const valor = Number(barras.slice(9, 19));
  const banco = BANCOS[barras.slice(0, 3)];
  return {
    ok: true,
    leitura: {
      tipo: "bancario",
      barras,
      linha,
      valor: valor > 0 ? valor : null,
      vencimento: dataDoFator(fator, hoje),
      sugestao: banco ? `Boleto ${banco}` : "Boleto",
    },
  };
}

function lerBarrasConsumo(barras: string, linha: string): ResultadoBoleto {
  const id = barras[2];
  // 6 e 8: valor em reais. 7 e 9: valor de referência (índice), que não serve como valor a pagar.
  const calcular = id === "6" || id === "7" ? modulo10 : id === "8" || id === "9" ? modulo11Consumo : null;
  if (!calcular) return { ok: false, erro: "digito" };
  if (calcular(barras.slice(0, 3) + barras.slice(4)) !== Number(barras[3])) return { ok: false, erro: "digito" };
  const valor = id === "6" || id === "8" ? Number(barras.slice(4, 15)) : 0;
  return {
    ok: true,
    leitura: {
      tipo: "consumo",
      barras,
      linha,
      valor: valor > 0 ? valor : null,
      vencimento: null,
      sugestao: SEGMENTOS[barras[1]] ?? "Conta",
    },
  };
}

/** Linha de boleto bancário (47) para código de barras (44), conferindo o dígito de cada campo. */
function barrasDaLinhaBancaria(l: string): string | null {
  const campos = [l.slice(0, 10), l.slice(10, 21), l.slice(21, 32)];
  for (const c of campos) if (modulo10(c.slice(0, -1)) !== Number(c.at(-1))) return null;
  return l.slice(0, 4) + l[32] + l.slice(33, 47) + l.slice(4, 9) + l.slice(10, 20) + l.slice(21, 31);
}

/** Linha de conta de consumo (48) para código de barras (44): quatro blocos de 11 dígitos mais o dígito. */
function barrasDaLinhaConsumo(l: string): string | null {
  const calcular = l[2] === "6" || l[2] === "7" ? modulo10 : modulo11Consumo;
  let barras = "";
  for (let i = 0; i < 4; i++) {
    const bloco = l.slice(i * 12, i * 12 + 11);
    if (calcular(bloco) !== Number(l[i * 12 + 11])) return null;
    barras += bloco;
  }
  return barras;
}

/** Código de barras bancário (44) para a linha digitável (47). */
function linhaDasBarrasBancario(b: string): string {
  const c1 = b.slice(0, 4) + b.slice(19, 24);
  const c2 = b.slice(24, 34);
  const c3 = b.slice(34, 44);
  return c1 + modulo10(c1) + c2 + modulo10(c2) + c3 + modulo10(c3) + b[4] + b.slice(5, 19);
}

/** Código de barras de consumo (44) para a linha digitável (48). */
function linhaDasBarrasConsumo(b: string): string {
  const calcular = b[2] === "6" || b[2] === "7" ? modulo10 : modulo11Consumo;
  let linha = "";
  for (let i = 0; i < 4; i++) {
    const bloco = b.slice(i * 11, i * 11 + 11);
    linha += bloco + calcular(bloco);
  }
  return linha;
}

/** Lê o que o dono colou ou o que veio do PDF/foto: aceita linha digitável (47 ou 48) ou código de barras (44). */
export function lerBoleto(texto: string, hoje = new Date()): ResultadoBoleto {
  const d = so(texto);
  if (d.length === 44) {
    return d[0] === "8"
      ? lerBarrasConsumo(d, linhaDasBarrasConsumo(d))
      : lerBarrasBancario(d, linhaDasBarrasBancario(d), hoje);
  }
  if (d.length === 47) {
    const barras = barrasDaLinhaBancaria(d);
    return barras ? lerBarrasBancario(barras, d, hoje) : { ok: false, erro: "digito" };
  }
  if (d.length === 48 && d[0] === "8") {
    const barras = barrasDaLinhaConsumo(d);
    return barras ? lerBarrasConsumo(barras, d) : { ok: false, erro: "digito" };
  }
  return { ok: false, erro: "tamanho" };
}

/**
 * Procura uma linha digitável válida dentro de um texto qualquer (o texto de um PDF).
 * Junta trechos de números separados por ponto, espaço ou traço e testa cada janela possível;
 * os dígitos verificadores eliminam as sequências que só parecem boleto.
 */
export function acharBoleto(texto: string, hoje = new Date()): LeituraBoleto | null {
  const trechos = texto.match(/\d[\d.\s-]{42,90}\d/g) ?? [];
  for (const t of trechos) {
    const d = so(t);
    for (const tamanho of [47, 48, 44]) {
      for (let i = 0; i + tamanho <= d.length; i++) {
        const r = lerBoleto(d.slice(i, i + tamanho), hoje);
        if (r.ok) return r.leitura;
      }
    }
  }
  return null;
}

/** Linha digitável com a pontuação do banco, para copiar e colar no app do banco. */
export function formatarLinha(linha: string): string {
  const l = so(linha);
  if (l.length === 47) {
    return `${l.slice(0, 5)}.${l.slice(5, 10)} ${l.slice(10, 15)}.${l.slice(15, 21)} ${l.slice(21, 26)}.${l.slice(26, 32)} ${l[32]} ${l.slice(33)}`;
  }
  if (l.length === 48) return [0, 12, 24, 36].map((i) => `${l.slice(i, i + 11)}-${l[i + 11]}`).join(" ");
  return l;
}
