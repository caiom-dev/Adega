import { test } from "node:test";
import assert from "node:assert/strict";
import { acharBoleto, acharBoletos, dataDoFator, formatarLinha, lerBoleto } from "../src/lib/boleto.ts";
import { lerBarrasItf } from "../src/lib/barrasItf.ts";

const BB = "00190500954014481606906809350314337370000000100";
const LUZ = "836200000005667800481000180975657313001589636081";

test("boleto bancário: vencimento, valor e banco", () => {
  const r = lerBoleto(BB, new Date(2008, 0, 1));
  assert.ok(r.ok);
  assert.equal(r.leitura.tipo, "bancario");
  assert.equal(r.leitura.vencimento, "2007-12-31");
  assert.equal(r.leitura.valor, 100);
  assert.equal(r.leitura.sugestao, "Boleto Banco do Brasil");
});

test("código de barras (44) dá o mesmo que a linha digitável", () => {
  const r = lerBoleto("00193373700000001000500940144816060680935031", new Date(2008, 0, 1));
  assert.ok(r.ok);
  assert.equal(r.leitura.linha, BB);
});

test("conta de consumo: valor sem vencimento e tipo sugerido", () => {
  const r = lerBoleto(LUZ);
  assert.ok(r.ok);
  assert.equal(r.leitura.tipo, "consumo");
  assert.equal(r.leitura.valor, 6678);
  assert.equal(r.leitura.vencimento, null);
  assert.equal(r.leitura.sugestao, "Luz");
  const b = lerBoleto(r.leitura.barras);
  assert.ok(b.ok);
  assert.equal(b.leitura.linha, LUZ);
});

test("um dígito errado é recusado", () => {
  assert.deepEqual(lerBoleto(BB.slice(0, 20) + "7" + BB.slice(21)), { ok: false, erro: "digito" });
  assert.deepEqual(lerBoleto("123"), { ok: false, erro: "tamanho" });
});

test("fator de vencimento depois da virada de 2025", () => {
  assert.equal(dataDoFator(1000, new Date(2026, 10, 15)), "2025-02-22");
  assert.equal(dataDoFator(1631, new Date(2026, 10, 15)), "2026-11-15");
  assert.equal(dataDoFator(9999, new Date(2025, 0, 1)), "2025-02-21");
  assert.equal(dataDoFator(0), null);
});

test("acha a linha no meio do texto do PDF", () => {
  const texto = `Beneficiário: Distribuidora X  CNPJ 12.345.678/0001-90
    Linha: 00190.50095 40144.816069 06809.350314 3 37370000000100  Vencimento 31/12/2007`;
  const l = acharBoleto(texto, new Date(2008, 0, 1));
  assert.equal(l?.linha, BB);
  assert.equal(acharBoleto("Nada aqui 12345678901234567890"), null);
});

test("formata a linha como o banco mostra", () => {
  assert.equal(formatarLinha(BB), "00190.50095 40144.816069 06809.350314 3 37370000000100");
  assert.equal(formatarLinha(LUZ), "83620000000-5 66780048100-0 18097565731-3 00158963608-1");
});

/** Desenha um código de barras ITF (como no boleto) numa imagem RGBA, com margem branca. */
function desenharItf(barras: string, fina = 3, larga = 8, altura = 20) {
  const P = ["00110", "10001", "01001", "11000", "00101", "10100", "01100", "00011", "10010", "01010"];
  const faixas: number[] = [fina, fina, fina, fina];
  for (let i = 0; i < barras.length; i += 2) {
    const a = P[Number(barras[i])];
    const b = P[Number(barras[i + 1])];
    for (let k = 0; k < 5; k++) faixas.push(a[k] === "1" ? larga : fina, b[k] === "1" ? larga : fina);
  }
  faixas.push(larga, fina, fina);
  const margem = 40;
  const largura = faixas.reduce((s, f) => s + f, 0) + margem * 2;
  const rgba = new Uint8ClampedArray(largura * altura * 4).fill(255);
  let x = margem;
  faixas.forEach((f, i) => {
    if (i % 2 === 0) for (let y = 0; y < altura; y++) for (let k = x; k < x + f; k++) rgba.fill(0, (y * largura + k) * 4, (y * largura + k) * 4 + 3);
    x += f;
  });
  return { rgba, largura, altura };
}

test("lê o código de barras desenhado, também de cabeça para baixo", () => {
  const r = lerBoleto(BB);
  assert.ok(r.ok);
  const { rgba, largura, altura } = desenharItf(r.leitura.barras);
  const valido = (s: string) => lerBoleto(s).ok;
  assert.deepEqual(lerBarrasItf(rgba, largura, altura, valido), [r.leitura.barras]);
  // Imagem espelhada (foto de ponta-cabeça): a linha é lida ao contrário.
  const espelho = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < altura; y++)
    for (let x = 0; x < largura; x++) for (let c = 0; c < 4; c++) espelho[(y * largura + x) * 4 + c] = rgba[(y * largura + (largura - 1 - x)) * 4 + c];
  assert.deepEqual(lerBarrasItf(espelho, largura, altura, valido), [r.leitura.barras]);
  // Um dígito trocado não passa no verificador.
  const errado = r.leitura.barras.slice(0, 20) + ((Number(r.leitura.barras[20]) + 1) % 10) + r.leitura.barras.slice(21);
  const e = desenharItf(errado);
  assert.deepEqual(lerBarrasItf(e.rgba, e.largura, e.altura, valido), []);
});

test("carnê: acha todos os boletos do texto, na ordem", () => {
  const a = "23791.72204 96309.000006 49000.363009 7 16260000119001";
  const b = "23791.72204 96309.000006 50000.363007 4 16560000119001";
  const lidos = acharBoletos(`Vencimento 10/11/2026 ${a} Recibo ... Vencimento 10/12/2026 ${b} ${a}`);
  assert.deepEqual(
    lidos.map((l) => [l.vencimento, l.valor]),
    [
      ["2026-11-10", 119001],
      ["2026-12-10", 119001],
    ],
  );
});
