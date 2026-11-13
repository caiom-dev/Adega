import { test } from "node:test";
import assert from "node:assert/strict";
import {
  intervalo,
  intervaloEntre,
  porDia,
  resumir,
  subtotal,
  totalComanda,
  vendasNoIntervalo,
} from "../src/lib/calculos.ts";
import { margem, nivelMargem } from "../src/lib/dinheiro.ts";
import type { Comanda, ItemPedido, Venda } from "../src/lib/tipos.ts";

const item = (produtoId: string, preco: number, qtd: number, custo: number | null): ItemPedido => ({
  produtoId,
  nome: produtoId,
  preco,
  qtd,
  custo,
});

function venda(parcial: Partial<Venda> & { itens: ItemPedido[] }): Venda {
  const sub = subtotal(parcial.itens);
  const desconto = parcial.desconto ?? 0;
  const acrescimo = parcial.acrescimo ?? 0;
  const total = parcial.total ?? sub - desconto + acrescimo;
  return {
    id: crypto.randomUUID(),
    numero: 1,
    comandaNome: "Mesa 1",
    subtotal: sub,
    desconto,
    acrescimo,
    total,
    pagamentos: [{ formaId: "dinheiro", formaNome: "Dinheiro", taxa: 0, valor: total }],
    troco: 0,
    criadaEm: "2026-11-10T20:00:00",
    ...parcial,
  };
}

test("total da comanda nunca fica negativo", () => {
  const c: Comanda = {
    id: "mesa-1",
    tipo: "mesa",
    numero: 1,
    cliente: "",
    itens: [item("a", 1000, 2, 500)],
    desconto: 5000,
    acrescimo: 0,
    abertaEm: "",
  };
  assert.equal(subtotal(c.itens), 2000);
  assert.equal(totalComanda(c), 0);
  assert.equal(totalComanda({ ...c, desconto: 300, acrescimo: 100 }), 1800);
});

test("lucro = vendas - custo - taxas da maquininha", () => {
  const v = venda({
    itens: [item("cerveja", 1000, 3, 600)],
    pagamentos: [{ formaId: "credito", formaNome: "Crédito", taxa: 5, valor: 3000 }],
  });
  const r = resumir([v]);
  assert.equal(r.vendas, 3000);
  assert.equal(r.custo, 1800);
  assert.equal(r.taxas, 150);
  assert.equal(r.lucro, 1050);
  assert.equal(r.margem, 35);
  assert.equal(r.porForma[0].taxas, 150);
});

test("desconto é repartido entre os itens na proporção do valor", () => {
  // Subtotal 2000, desconto 500: cada item recebe 75% do próprio valor.
  const v = venda({ itens: [item("a", 1500, 1, 0), item("b", 500, 1, 0)], desconto: 500 });
  const r = resumir([v]);
  const a = r.porProduto.find((p) => p.produtoId === "a")!;
  const b = r.porProduto.find((p) => p.produtoId === "b")!;
  assert.equal(a.vendas, 1125);
  assert.equal(b.vendas, 375);
  assert.equal(a.vendas + b.vendas, r.vendas);
});

test("venda do Yooga entra no faturamento e fica fora do lucro", () => {
  const app = venda({ itens: [item("a", 1000, 1, 400)] });
  const yooga = venda({ itens: [], total: 5000, origem: "yooga" });
  const r = resumir([app, yooga]);
  assert.equal(r.pedidos, 2);
  assert.equal(r.vendas, 6000);
  assert.equal(r.vendasComItens, 1000);
  assert.equal(r.pedidosSemItens, 1);
  assert.equal(r.lucro, 600);
  assert.equal(r.ticketMedio, 3000);
});

test("produto sem custo é contado à parte", () => {
  const r = resumir([venda({ itens: [item("gelo", 800, 2, null), item("a", 1000, 1, 500)] })]);
  assert.equal(r.unidadesSemCusto, 2);
  assert.equal(r.custo, 500);
  assert.ok(r.porProduto.find((p) => p.produtoId === "gelo")!.semCusto);
});

test("sem vendas, a margem é null e nada quebra", () => {
  const r = resumir([]);
  assert.equal(r.margem, null);
  assert.equal(r.ticketMedio, 0);
});

test("venda cancelada sai do período", () => {
  const faixa = intervalo("hoje", new Date("2026-11-10T23:00:00"));
  const ok = venda({ itens: [item("a", 1000, 1, 0)] });
  const cancelada = venda({ itens: [item("a", 1000, 1, 0)], canceladaEm: "2026-11-10T21:00:00" });
  const ontem = venda({ itens: [item("a", 1000, 1, 0)], criadaEm: "2026-11-09T23:59:00" });
  assert.deepEqual(vendasNoIntervalo([ok, cancelada, ontem], faixa), [ok]);
});

test("mês passado em janeiro volta para dezembro do ano anterior", () => {
  const [de, ate] = intervalo("mes-passado", new Date("2026-01-15T12:00:00"));
  assert.equal(de.toDateString(), new Date(2025, 11, 1).toDateString());
  assert.equal(ate.toDateString(), new Date(2026, 0, 1).toDateString());
});

test("intervalo escolhido à mão inclui o dia final e recusa datas invertidas", () => {
  const faixa = intervaloEntre("2026-11-01", "2026-11-03")!;
  assert.equal(faixa[1].toDateString(), new Date(2026, 10, 4).toDateString());
  assert.equal(intervaloEntre("2026-11-05", "2026-11-01"), null);
  assert.equal(intervaloEntre("", "2026-11-01"), null);
});

test("gráfico por dia mostra também os dias sem venda", () => {
  const faixa = intervaloEntre("2026-11-08", "2026-11-10")!;
  const dias = porDia([venda({ itens: [item("a", 1000, 1, 0)] })], faixa);
  assert.deepEqual(
    dias.map((d) => d.vendas),
    [0, 0, 1000],
  );
});

test("margem e nível de margem", () => {
  assert.equal(margem(1000, 600), 40);
  assert.equal(margem(1000, null), null);
  assert.equal(margem(0, 100), null);
  assert.equal(nivelMargem(null), "sem-custo");
  assert.equal(nivelMargem(10), "baixa");
  assert.equal(nivelMargem(25), "media");
  assert.equal(nivelMargem(35), "boa");
});
