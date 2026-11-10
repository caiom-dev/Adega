"use client";

import { useSyncExternalStore } from "react";
import { estadoInicial } from "./inicial";
import { subtotal, totalComanda } from "./calculos";
import { lerIdLugar, nomeComanda } from "./lugares";
import type { Categoria, Comanda, Estado, FormaPagamento, Pagamento, Produto, TipoLugar, Venda } from "./tipos";

/*
 * Por enquanto os dados ficam no próprio aparelho (localStorage).
 * A troca por banco de dados (Supabase) vai acontecer só aqui dentro:
 * as telas usam useLoja() e as funções exportadas, e não sabem onde os dados moram.
 */

const CHAVE = "adega-pezao:v1";
const ouvintes = new Set<() => void>();
const doServidor = estadoInicial();
let atual: Estado | null = null;

/** Dados salvos por versões antigas do app: mantém produtos e vendas, descarta comandas abertas. */
function migrar(salvo: Partial<Estado> & { versao?: number }): Estado {
  if (salvo.versao === 2) return salvo as Estado;
  const base = estadoInicial();
  return {
    ...base,
    categorias: salvo.categorias ?? base.categorias,
    produtos: salvo.produtos ?? base.produtos,
    formas: salvo.formas ?? base.formas,
    vendas: salvo.vendas ?? [],
    proximoNumero: salvo.proximoNumero ?? 1,
  };
}

function ler(): Estado {
  if (atual) return atual;
  try {
    const salvo = localStorage.getItem(CHAVE);
    atual = salvo ? migrar(JSON.parse(salvo)) : estadoInicial();
  } catch {
    atual = estadoInicial();
  }
  return atual;
}

function gravar(novo: Estado) {
  atual = novo;
  try {
    localStorage.setItem(CHAVE, JSON.stringify(novo));
  } catch {
    // Armazenamento cheio ou bloqueado: o estado continua valendo até fechar o app.
  }
  ouvintes.forEach((avisar) => avisar());
}

function inscrever(avisar: () => void) {
  ouvintes.add(avisar);
  // Mantém duas abas abertas (ex.: caixa e relatório) mostrando os mesmos dados.
  const outraAba = (e: StorageEvent) => {
    if (e.key !== CHAVE) return;
    atual = null;
    avisar();
  };
  window.addEventListener("storage", outraAba);
  return () => {
    ouvintes.delete(avisar);
    window.removeEventListener("storage", outraAba);
  };
}

export function useLoja(): Estado {
  return useSyncExternalStore(inscrever, ler, () => doServidor);
}

function mudar(fn: (e: Estado) => Estado) {
  gravar(fn(ler()));
}

function novoId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/* Produtos e categorias */

export function salvarProduto(dados: Omit<Produto, "id" | "ativo"> & { id?: string }) {
  mudar((e) => {
    if (dados.id) {
      return { ...e, produtos: e.produtos.map((p) => (p.id === dados.id ? { ...p, ...dados, id: p.id } : p)) };
    }
    return { ...e, produtos: [...e.produtos, { ...dados, id: novoId(), ativo: true }] };
  });
}

/** Não apaga de verdade: vendas antigas continuam apontando para o produto. */
export function arquivarProduto(id: string) {
  mudar((e) => ({ ...e, produtos: e.produtos.map((p) => (p.id === id ? { ...p, ativo: false } : p)) }));
}

export function salvarCategoria(nome: string, id?: string) {
  mudar((e) => {
    if (id) return { ...e, categorias: e.categorias.map((c) => (c.id === id ? { ...c, nome } : c)) };
    const nova: Categoria = { id: novoId(), nome };
    return { ...e, categorias: [...e.categorias, nova] };
  });
}

export function removerCategoria(id: string) {
  mudar((e) => {
    if (e.produtos.some((p) => p.ativo && p.categoriaId === id)) return e;
    return { ...e, categorias: e.categorias.filter((c) => c.id !== id) };
  });
}

export function salvarTaxa(formaId: string, taxa: number) {
  mudar((e) => ({
    ...e,
    formas: e.formas.map((f): FormaPagamento => (f.id === formaId ? { ...f, taxa } : f)),
  }));
}

/* Mesas e balcões */

export function definirQuantidade(tipo: TipoLugar, quantidade: number) {
  const n = Math.min(Math.max(Math.round(quantidade) || 0, 0), 99);
  mudar((e) => (tipo === "mesa" ? { ...e, mesas: n } : { ...e, balcoes: n }));
}

export function definirAba(aba: TipoLugar) {
  mudar((e) => (e.abaCaixa === aba ? e : { ...e, abaCaixa: aba }));
}

/** Aplica uma mudança na comanda do lugar. Cria a comanda se o lugar estava livre. */
function naComanda(e: Estado, id: string, fn: (c: Comanda) => Comanda): Estado {
  const existente = e.comandas.find((c) => c.id === id);
  if (existente) return { ...e, comandas: e.comandas.map((c) => (c.id === id ? fn(c) : c)) };
  const lugar = lerIdLugar(id);
  if (!lugar) return e;
  const nova: Comanda = {
    id,
    ...lugar,
    cliente: "",
    itens: [],
    desconto: 0,
    acrescimo: 0,
    abertaEm: new Date().toISOString(),
  };
  return { ...e, comandas: [...e.comandas, fn(nova)] };
}

/** Comanda sem itens volta a ser lugar livre. */
function limparVazias(e: Estado): Estado {
  return { ...e, comandas: e.comandas.filter((c) => c.itens.length > 0) };
}

export function adicionarItem(comandaId: string, produto: Produto, qtd = 1) {
  mudar((e) =>
    naComanda(e, comandaId, (c) => {
      const existe = c.itens.find((i) => i.produtoId === produto.id);
      const itens = existe
        ? c.itens.map((i) => (i.produtoId === produto.id ? { ...i, qtd: i.qtd + qtd } : i))
        : [
            ...c.itens,
            { produtoId: produto.id, nome: produto.nome, preco: produto.preco, custo: produto.custo, qtd },
          ];
      return { ...c, itens, abertaEm: c.itens.length === 0 ? new Date().toISOString() : c.abertaEm };
    }),
  );
}

export function mudarQtd(comandaId: string, produtoId: string, qtd: number) {
  mudar((e) =>
    limparVazias(
      naComanda(e, comandaId, (c) => {
        const itens =
          qtd <= 0
            ? c.itens.filter((i) => i.produtoId !== produtoId)
            : c.itens.map((i) => (i.produtoId === produtoId ? { ...i, qtd: Math.min(qtd, 999) } : i));
        // Se tirar itens deixou o desconto maior que a conta, o desconto encolhe junto.
        return { ...c, itens, desconto: Math.min(c.desconto, subtotal(itens)) };
      }),
    ),
  );
}

export function ajustarComanda(comandaId: string, campo: "desconto" | "acrescimo", valor: number) {
  mudar((e) => {
    if (!e.comandas.some((c) => c.id === comandaId)) return e;
    return naComanda(e, comandaId, (c) => {
      // Desconto nunca passa do valor dos itens: a venda não pode ficar negativa.
      const teto = campo === "desconto" ? subtotal(c.itens) : 99_999_99;
      return { ...c, [campo]: Math.min(Math.max(0, valor), teto) };
    });
  });
}

export function definirCliente(comandaId: string, cliente: string) {
  mudar((e) => {
    if (!e.comandas.some((c) => c.id === comandaId)) return e;
    return naComanda(e, comandaId, (c) => ({ ...c, cliente: cliente.trim().slice(0, 40) }));
  });
}

/** Tira todos os itens: o lugar volta a ficar livre. */
export function esvaziarComanda(comandaId: string) {
  mudar((e) => ({ ...e, comandas: e.comandas.filter((c) => c.id !== comandaId) }));
}

/* Vendas */

export function finalizarVenda(comandaId: string, pagamentos: Pagamento[]): Venda | null {
  let venda: Venda | null = null;
  mudar((e) => {
    const c = e.comandas.find((x) => x.id === comandaId);
    if (!c || c.itens.length === 0) return e;
    const total = totalComanda(c);
    const pago = pagamentos.reduce((s, p) => s + p.valor, 0);
    if (pago < total) return e;
    // O troco sai do dinheiro: o valor registrado de cada pagamento soma exatamente o total.
    const troco = pago - total;
    let sobra = troco;
    const ajustados = [...pagamentos].reverse().map((p) => {
      if (sobra > 0 && p.formaId === "dinheiro") {
        const tira = Math.min(sobra, p.valor);
        sobra -= tira;
        return { ...p, valor: p.valor - tira };
      }
      return p;
    });
    venda = {
      id: novoId(),
      numero: e.proximoNumero,
      comandaNome: nomeComanda(c),
      itens: c.itens,
      subtotal: subtotal(c.itens),
      desconto: c.desconto,
      acrescimo: c.acrescimo,
      total,
      pagamentos: ajustados.reverse().filter((p) => p.valor > 0),
      troco,
      criadaEm: new Date().toISOString(),
    };
    return {
      ...e,
      comandas: e.comandas.filter((x) => x.id !== c.id),
      vendas: [...e.vendas, venda],
      proximoNumero: e.proximoNumero + 1,
    };
  });
  return venda;
}

/** Cancela sem apagar: a venda fica no histórico, riscada, e sai das contas. */
export function cancelarVenda(vendaId: string) {
  mudar((e) => ({
    ...e,
    vendas: e.vendas.map((v) =>
      v.id === vendaId && !v.canceladaEm ? { ...v, canceladaEm: new Date().toISOString() } : v,
    ),
  }));
}

export function restaurarVenda(vendaId: string) {
  mudar((e) => ({
    ...e,
    vendas: e.vendas.map((v) => {
      if (v.id !== vendaId) return v;
      const resto = { ...v };
      delete resto.canceladaEm;
      return resto;
    }),
  }));
}

export function apagarVendas() {
  mudar((e) => ({ ...e, vendas: [], proximoNumero: 1 }));
}

/* Cópia de segurança: enquanto os dados moram só neste aparelho, é o jeito de não perder nada. */

export function exportarDados(): string {
  return JSON.stringify({ app: "adega-do-pezao", exportadoEm: new Date().toISOString(), dados: ler() }, null, 2);
}

/** Substitui tudo pelos dados do arquivo. Devolve a mensagem de erro, ou null se deu certo. */
export function importarDados(texto: string): string | null {
  try {
    const arquivo = JSON.parse(texto);
    const dados = arquivo?.dados;
    if (arquivo?.app !== "adega-do-pezao" || !dados) return "Este arquivo não é uma cópia da Adega do Pezão";
    if (!Array.isArray(dados.produtos) || !Array.isArray(dados.vendas) || !Array.isArray(dados.categorias)) {
      return "O arquivo está incompleto";
    }
    gravar(migrar(dados));
    return null;
  } catch {
    return "Não consegui ler o arquivo";
  }
}

/** Nome já usado por outro produto ativo (ignora maiúsculas e espaços nas pontas). */
export function nomeDeProdutoEmUso(nome: string, ignorarId?: string): boolean {
  const alvo = nome.trim().toLowerCase();
  return ler().produtos.some((p) => p.ativo && p.id !== ignorarId && p.nome.trim().toLowerCase() === alvo);
}
