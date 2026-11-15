import { test } from "node:test";
import assert from "node:assert/strict";
import { acharBoleto, dataDoFator, formatarLinha, lerBoleto } from "../src/lib/boleto.ts";

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
