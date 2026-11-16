/*
 * Leitor do código de barras de boleto (Intercalado 2 de 5, 44 dígitos), sem depender do navegador.
 * O Chrome no Windows e o Safari não têm leitor de código de barras embutido, e muito boleto em PDF
 * traz a linha digitável como imagem: sem este leitor o app não acharia nada.
 *
 * Como funciona: percorre linhas horizontais da imagem, transforma cada uma em faixas claras e
 * escuras e procura a sequência início (4 finas) + 22 pares de dígitos + fim. Em cada dígito, as
 * duas faixas mais largas de cinco são as largas. Quem decide se a leitura vale são os dígitos
 * verificadores do boleto, conferidos por quem chama.
 */

/** Largura (0 = fina, 1 = larga) das 5 faixas de cada dígito. */
const PADROES = [
  "00110",
  "10001",
  "01001",
  "11000",
  "00101",
  "10100",
  "01100",
  "00011",
  "10010",
  "01010",
];
const DIGITO = new Map(PADROES.map((p, d) => [p, d]));

const PARES = 22;
/** 4 do início + 10 por par + 3 do fim. */
const FAIXAS = 4 + PARES * 10 + 3;

/** Marca as 2 maiores de 5 larguras como largas. */
function digito(larguras: number[]): number | undefined {
  const ordem = larguras.map((l, i) => [l, i]).sort((a, b) => b[0] - a[0]);
  // As largas precisam ser bem maiores que a fina mais larga, senão é ruído.
  if (ordem[1][0] < ordem[2][0] * 1.4) return undefined;
  const p = ["0", "0", "0", "0", "0"];
  p[ordem[0][1]] = "1";
  p[ordem[1][1]] = "1";
  return DIGITO.get(p.join(""));
}

/** Tenta ler 44 dígitos a partir da faixa `k` (que precisa ser escura). */
function lerApartir(f: number[], k: number): string | null {
  const fina = (f[k] + f[k + 1] + f[k + 2] + f[k + 3]) / 4;
  for (let j = k; j < k + 4; j++)
    if (f[j] > fina * 1.6 || f[j] < fina * 0.5) return null;
  let s = "";
  for (let par = 0; par < PARES; par++) {
    const b = k + 4 + par * 10;
    const barras = [f[b], f[b + 2], f[b + 4], f[b + 6], f[b + 8]];
    const espacos = [f[b + 1], f[b + 3], f[b + 5], f[b + 7], f[b + 9]];
    const d1 = digito(barras);
    const d2 = digito(espacos);
    if (d1 === undefined || d2 === undefined) return null;
    s += `${d1}${d2}`;
  }
  // Fim: barra larga, espaço fino, barra fina.
  const fim = k + 4 + PARES * 10;
  if (f[fim] < f[fim + 1] * 1.4 || f[fim] < f[fim + 2] * 1.4) return null;
  return s;
}

/** Larguras das faixas de uma linha, começando sempre por uma faixa escura. */
function faixas(cinza: Float32Array): number[] {
  let min = 255;
  let max = 0;
  for (const v of cinza) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (max - min < 60) return [];
  const corte = (min + max) / 2;
  const f: number[] = [];
  let escuro = cinza[0] < corte;
  let conta = 0;
  for (const v of cinza) {
    const e = v < corte;
    if (e === escuro) {
      conta++;
      continue;
    }
    // Ignora a margem clara antes da primeira faixa escura.
    if (escuro || f.length > 0) f.push(conta);
    escuro = e;
    conta = 1;
  }
  if (escuro || f.length > 0) f.push(conta);
  return f;
}

function lerLinha(
  cinza: Float32Array,
  valido: (barras: string) => boolean,
): string | null {
  for (const sentido of [cinza, cinza.slice().reverse()]) {
    const f = faixas(sentido);
    // f[0] é escura; as escuras ficam nos índices pares.
    for (let k = 0; k + FAIXAS <= f.length; k += 2) {
      const s = lerApartir(f, k);
      if (s && valido(s)) return s;
    }
  }
  return null;
}

/**
 * Procura códigos de barras de boleto numa imagem RGBA, de cima para baixo.
 * `valido` confere os dígitos; cada código aparece uma vez só, na ordem em que está na página.
 */
export function lerBarrasItf(
  rgba: Uint8ClampedArray,
  largura: number,
  altura: number,
  valido: (barras: string) => boolean,
  passo = 3,
): string[] {
  const achados: string[] = [];
  const cinza = new Float32Array(largura);
  for (let y = 0; y < altura; y += passo) {
    const base = y * largura * 4;
    for (let x = 0; x < largura; x++) {
      const i = base + x * 4;
      // Transparente conta como branco (PDF sem fundo).
      const a = rgba[i + 3] / 255;
      cinza[x] =
        (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) * a +
        255 * (1 - a);
    }
    const s = lerLinha(cinza, valido);
    if (s && !achados.includes(s)) achados.push(s);
  }
  return achados;
}
