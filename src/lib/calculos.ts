import type { Caixa, Centavos, Comanda, ItemPedido, Produto, Venda } from "./tipos";

export function subtotal(itens: ItemPedido[]): Centavos {
  return itens.reduce((s, i) => s + i.preco * i.qtd, 0);
}

export function totalComanda(c: Comanda): Centavos {
  return Math.max(0, subtotal(c.itens) - c.desconto + c.acrescimo);
}

export function qtdItens(itens: ItemPedido[]): number {
  return itens.reduce((s, i) => s + i.qtd, 0);
}

export function taxasDaVenda(v: Venda): Centavos {
  return Math.round(v.pagamentos.reduce((s, p) => s + (p.valor * p.taxa) / 100, 0));
}

export interface LinhaProduto {
  produtoId: string;
  nome: string;
  qtd: number;
  vendas: Centavos;
  custo: Centavos;
  lucro: Centavos;
  semCusto: boolean;
}

export interface LinhaForma {
  formaId: string;
  nome: string;
  valor: Centavos;
  taxas: Centavos;
}

export interface Resumo {
  pedidos: number;
  vendas: Centavos;
  /** Parte de "vendas" que tem itens e por isso entra na conta do lucro (fora o histórico do Yooga). */
  vendasComItens: Centavos;
  /** Quantas vendas do período vieram do Yooga, sem itens. */
  pedidosSemItens: number;
  /** Custo, taxas, lucro e margem contam só as vendas com itens. */
  custo: Centavos;
  taxas: Centavos;
  lucro: Centavos;
  /** Margem sobre as vendas com itens, em %. null quando não houve nenhuma. */
  margem: number | null;
  ticketMedio: Centavos;
  /** Unidades vendidas de produtos sem custo cadastrado (o lucro delas está superestimado). */
  unidadesSemCusto: number;
  porProduto: LinhaProduto[];
  porForma: LinhaForma[];
}

/**
 * Lucro = vendas − custo dos produtos − taxas da maquininha.
 * Desconto e acréscimo da comanda são repartidos entre os itens na proporção do valor de cada um.
 */
export function resumir(vendas: Venda[]): Resumo {
  const produtos = new Map<string, LinhaProduto>();
  const formas = new Map<string, LinhaForma>();
  let total = 0;
  let custo = 0;
  let taxas = 0;
  let unidadesSemCusto = 0;
  let vendasComItens = 0;
  let pedidosSemItens = 0;

  for (const v of vendas) {
    total += v.total;
    for (const p of v.pagamentos) {
      const linha = formas.get(p.formaId) ?? { formaId: p.formaId, nome: p.formaNome, valor: 0, taxas: 0 };
      linha.valor += p.valor;
      linha.taxas += Math.round((p.valor * p.taxa) / 100);
      formas.set(p.formaId, linha);
    }
    // Venda importada do Yooga não tem itens: entra no faturamento, fica fora do lucro.
    if (v.origem === "yooga") {
      pedidosSemItens += 1;
      continue;
    }
    vendasComItens += v.total;
    taxas += taxasDaVenda(v);
    const fator = v.subtotal > 0 ? v.total / v.subtotal : 1;

    for (const i of v.itens) {
      const receita = Math.round(i.preco * i.qtd * fator);
      const custoItem = i.custo === null ? 0 : i.custo * i.qtd;
      if (i.custo === null) unidadesSemCusto += i.qtd;
      custo += custoItem;
      const linha = produtos.get(i.produtoId) ?? {
        produtoId: i.produtoId,
        nome: i.nome,
        qtd: 0,
        vendas: 0,
        custo: 0,
        lucro: 0,
        semCusto: false,
      };
      linha.qtd += i.qtd;
      linha.vendas += receita;
      linha.custo += custoItem;
      linha.lucro = linha.vendas - linha.custo;
      linha.semCusto ||= i.custo === null;
      produtos.set(i.produtoId, linha);
    }
  }

  const lucro = vendasComItens - custo - taxas;
  return {
    pedidos: vendas.length,
    vendas: total,
    vendasComItens,
    pedidosSemItens,
    custo,
    taxas,
    lucro,
    margem: vendasComItens > 0 ? (lucro / vendasComItens) * 100 : null,
    ticketMedio: vendas.length > 0 ? Math.round(total / vendas.length) : 0,
    unidadesSemCusto,
    porProduto: [...produtos.values()].sort((a, b) => b.lucro - a.lucro),
    porForma: [...formas.values()].sort((a, b) => b.valor - a.valor),
  };
}

/* Períodos */

export type Periodo = "hoje" | "ontem" | "7dias" | "30dias" | "mes" | "mes-passado";

export const NOMES_PERIODO: Record<Periodo, string> = {
  hoje: "Hoje",
  ontem: "Ontem",
  "7dias": "7 dias",
  "30dias": "30 dias",
  mes: "Este mês",
  "mes-passado": "Mês passado",
};

function inicioDoDia(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function intervalo(periodo: Periodo, agora: Date): [Date, Date] {
  const hoje = inicioDoDia(agora);
  const amanha = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1);
  switch (periodo) {
    case "hoje":
      return [hoje, amanha];
    case "ontem":
      return [new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1), hoje];
    case "7dias":
      return [new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 6), amanha];
    case "30dias":
      return [new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 29), amanha];
    case "mes":
      return [new Date(hoje.getFullYear(), hoje.getMonth(), 1), amanha];
    case "mes-passado":
      return [
        new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1),
        new Date(hoje.getFullYear(), hoje.getMonth(), 1),
      ];
  }
}

export function vendasNoIntervalo(vendas: Venda[], [de, ate]: [Date, Date]): Venda[] {
  const a = de.getTime();
  const b = ate.getTime();
  return vendas.filter((v) => {
    if (v.canceladaEm) return false;
    const t = new Date(v.criadaEm).getTime();
    return t >= a && t < b;
  });
}

/** Intervalo escolhido à mão: do início do dia "de" ao fim do dia "ate" (formato AAAA-MM-DD). */
export function intervaloEntre(de: string, ate: string): [Date, Date] | null {
  const a = new Date(`${de}T00:00:00`);
  const b = new Date(`${ate}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return null;
  return [a, new Date(b.getFullYear(), b.getMonth(), b.getDate() + 1)];
}

export interface Balde {
  rotulo: string;
  /** Texto completo para a dica e a tabela, ex.: "sex, 6 de nov". */
  nome: string;
  vendas: Centavos;
  pedidos: number;
}

const formatoDiaCurto = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
const formatoDiaLongo = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "short" });
const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** Um balde por dia do intervalo, inclusive os dias sem venda. Limitado a 92 dias. */
export function porDia(vendas: Venda[], [de, ate]: [Date, Date]): Balde[] {
  const baldes: Balde[] = [];
  const indice = new Map<string, Balde>();
  for (let d = new Date(de), n = 0; d < ate && n < 92; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1), n++) {
    const b = { rotulo: formatoDiaCurto.format(d), nome: formatoDiaLongo.format(d), vendas: 0, pedidos: 0 };
    baldes.push(b);
    indice.set(d.toDateString(), b);
  }
  for (const v of vendas) {
    const b = indice.get(new Date(v.criadaEm).toDateString());
    if (b) {
      b.vendas += v.total;
      b.pedidos += 1;
    }
  }
  return baldes;
}

export function porHora(vendas: Venda[]): Balde[] {
  const baldes: Balde[] = Array.from({ length: 24 }, (_, h) => ({
    rotulo: `${h}h`,
    nome: `${String(h).padStart(2, "0")}:00 às ${String(h).padStart(2, "0")}:59`,
    vendas: 0,
    pedidos: 0,
  }));
  for (const v of vendas) {
    const b = baldes[new Date(v.criadaEm).getHours()];
    b.vendas += v.total;
    b.pedidos += 1;
  }
  return baldes;
}

export function porDiaSemana(vendas: Venda[]): Balde[] {
  const baldes: Balde[] = DIAS_SEMANA.map((nome) => ({ rotulo: nome.slice(0, 3), nome, vendas: 0, pedidos: 0 }));
  for (const v of vendas) {
    const b = baldes[new Date(v.criadaEm).getDay()];
    b.vendas += v.total;
    b.pedidos += 1;
  }
  return baldes;
}

/* Equipe */

export interface LinhaPessoa {
  /** null = venda sem registro de quem fez. */
  pessoaId: string | null;
  pedidos: number;
  vendas: Centavos;
  ticketMedio: Centavos;
  /** Vendas do período que esta pessoa cancelou. */
  cancelou: number;
}

/**
 * Vendas por pessoa no período. Recebe todas as vendas do período, inclusive as canceladas:
 * as válidas contam para quem vendeu, as canceladas contam para quem cancelou.
 * As do Yooga ficam de fora (lá não se sabe quem vendeu).
 */
export function porPessoa(vendas: Venda[]): LinhaPessoa[] {
  const linhas = new Map<string | null, LinhaPessoa>();
  const linha = (id: string | null) => {
    let l = linhas.get(id);
    if (!l) {
      l = { pessoaId: id, pedidos: 0, vendas: 0, ticketMedio: 0, cancelou: 0 };
      linhas.set(id, l);
    }
    return l;
  };
  for (const v of vendas) {
    if (v.origem === "yooga") continue;
    if (v.canceladaEm) {
      linha(v.canceladaPor ?? null).cancelou += 1;
      continue;
    }
    const l = linha(v.pessoaId ?? null);
    l.pedidos += 1;
    l.vendas += v.total;
  }
  for (const l of linhas.values()) l.ticketMedio = l.pedidos > 0 ? Math.round(l.vendas / l.pedidos) : 0;
  return [...linhas.values()].sort((a, b) => b.vendas - a.vendas || b.cancelou - a.cancelou);
}

/** Vendas criadas no intervalo, canceladas ou não. */
export function todasNoIntervalo(vendas: Venda[], [de, ate]: [Date, Date]): Venda[] {
  const a = de.getTime();
  const b = ate.getTime();
  return vendas.filter((v) => {
    const t = new Date(v.criadaEm).getTime();
    return t >= a && t < b;
  });
}

/* Caixa */

/** Dinheiro que deveria estar na gaveta: troco inicial + suprimentos − sangrias + vendas em dinheiro do turno. */
export function esperadoNaGaveta(caixa: Caixa, vendas: Venda[]): Centavos {
  let total = caixa.valorInicial;
  for (const m of caixa.movimentos) total += m.tipo === "suprimento" ? m.valor : -m.valor;
  for (const v of vendas) {
    if (v.caixaId !== caixa.id || v.canceladaEm) continue;
    for (const p of v.pagamentos) if (p.formaId === "dinheiro") total += p.valor;
  }
  return total;
}

/* Estoque */

/** Produto com estoque controlado que chegou no mínimo (ou acabou). */
export function estoqueBaixo(p: Produto): boolean {
  return p.ativo && p.estoque !== null && p.estoque <= (p.estoqueMinimo ?? 0);
}

export type SituacaoEstoque = "sem-controle" | "zerado" | "acabando" | "ok";

/** Zerado = acabou (ou negativo). Acabando = chegou no mínimo. */
export function situacaoEstoque(p: Produto): SituacaoEstoque {
  if (p.estoque === null) return "sem-controle";
  if (p.estoque <= 0) return "zerado";
  if (p.estoque <= (p.estoqueMinimo ?? 0)) return "acabando";
  return "ok";
}

/** "caixa com 12": quantidade de embalagens vezes unidades por embalagem. */
export function unidadesDaEntrada(qtd: number, porEmbalagem: number): number {
  return Math.max(0, Math.round(qtd)) * Math.max(1, Math.round(porEmbalagem));
}

/** Custo da unidade a partir do custo da embalagem, arredondado ao centavo. */
export function custoPorUnidade(custoEmbalagem: number, porEmbalagem: number): number {
  return Math.round(custoEmbalagem / Math.max(1, Math.round(porEmbalagem)));
}
