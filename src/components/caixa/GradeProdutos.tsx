"use client";

import { useMemo, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { reais } from "@/lib/dinheiro";
import type { Categoria, Comanda, Produto, Venda } from "@/lib/tipos";

const TODOS = "todos";

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Quantas unidades de cada produto saíram nas últimas vendas, para pôr os mais vendidos primeiro. */
function popularidade(vendas: Venda[]) {
  const conta = new Map<string, number>();
  for (const v of vendas.filter((x) => !x.canceladaEm).slice(-500)) {
    for (const i of v.itens) conta.set(i.produtoId, (conta.get(i.produtoId) ?? 0) + i.qtd);
  }
  return conta;
}

export function GradeProdutos({
  produtos,
  categorias,
  vendas,
  comanda,
  aoEscolher,
}: {
  produtos: Produto[];
  categorias: Categoria[];
  vendas: Venda[];
  comanda: Comanda | undefined;
  aoEscolher: (p: Produto) => void;
}) {
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState(TODOS);

  const ranking = useMemo(() => popularidade(vendas), [vendas]);
  const usadas = useMemo(
    () => categorias.filter((c) => produtos.some((p) => p.ativo && p.categoriaId === c.id)),
    [categorias, produtos],
  );

  const lista = useMemo(() => {
    const termo = semAcento(busca).trim();
    return produtos
      .filter((p) => p.ativo)
      .filter((p) => categoria === TODOS || p.categoriaId === categoria)
      .filter((p) => !termo || semAcento(p.nome).includes(termo))
      .sort((a, b) => (ranking.get(b.id) ?? 0) - (ranking.get(a.id) ?? 0) || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [produtos, categoria, busca, ranking]);

  const qtdNaComanda = (id: string) => comanda?.itens.find((i) => i.produtoId === id)?.qtd ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <label className="flex h-11 items-center gap-2 rounded-[14px] bg-sunk px-3 ring-1 ring-line transition-shadow duration-150 focus-within:ring-2 focus-within:ring-accent">
        <MagnifyingGlass size={18} className="text-muted" />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar produto"
          aria-label="Buscar produto"
          className="h-full w-full bg-transparent text-base text-ink outline-none placeholder:text-muted md:text-sm"
        />
      </label>

      <div className="sem-barra -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        {[{ id: TODOS, nome: "Todos" }, ...usadas].map((c) => (
          <button
            key={c.id}
            type="button"
            data-luz=""
            aria-pressed={categoria === c.id}
            onClick={() => setCategoria(c.id)}
            className={`aperta h-9 shrink-0 rounded-full px-4 text-sm font-medium ${
              categoria === c.id ? "vidro-ambar" : "vidro-leve text-body"
            }`}
          >
            {c.nome}
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <p className="rounded-[20px] px-4 py-10 text-center text-[15px] text-muted ring-1 ring-line">
          Nenhum produto encontrado
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {lista.map((p) => {
            const qtd = qtdNaComanda(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => aoEscolher(p)}
                  className={`aperta relative flex h-full min-h-24 w-full flex-col justify-between rounded-[18px] p-3 text-left ring-1 ${
                    qtd > 0 ? "bg-sunk ring-accent/45" : "bg-surface ring-line hover:bg-sunk"
                  }`}
                >
                  <span className="line-clamp-2 pr-7 text-[15px] leading-snug font-medium text-ink">{p.nome}</span>
                  <span className="num mt-3 text-sm text-body">{reais(p.preco)}</span>
                  {qtd > 0 && (
                    // A chave muda a cada unidade, então o contador "estala" de novo
                    <span
                      key={qtd}
                      className="num estala absolute top-2.5 right-2.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-ink"
                    >
                      {qtd}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
