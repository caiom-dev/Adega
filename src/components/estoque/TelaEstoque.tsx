"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowCircleDown, CaretRight, ClipboardText, MagnifyingGlass, Warning } from "@phosphor-icons/react";
import { reais } from "@/lib/dinheiro";
import { situacaoEstoque, type SituacaoEstoque } from "@/lib/calculos";
import { nomePessoa, perdasDesde, useLoja, type Perda } from "@/lib/loja";
import type { Produto } from "@/lib/tipos";
import { Botao, Cartao } from "@/components/ui";
import { JanelaContagem, JanelaEntrada, JanelaPerda } from "./Janelas";

export type FiltroEstoque = "controlados" | "acabando" | "zerados" | "sem-controle";

const FILTROS: { id: FiltroEstoque; nome: string }[] = [
  { id: "controlados", nome: "Todos" },
  { id: "acabando", nome: "Acabando" },
  { id: "zerados", nome: "Zerados" },
  { id: "sem-controle", nome: "Sem controle" },
];

const COR: Record<SituacaoEstoque, string> = {
  ok: "text-ink",
  acabando: "text-yellow-ink",
  zerado: "text-red-ink",
  "sem-controle": "text-muted",
};

const ESCOLHA =
  "h-11 rounded-[14px] bg-sunk px-3 text-base text-ink ring-1 ring-line outline-none focus:ring-2 focus:ring-accent md:text-sm";
const formatoDataHora = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function bate(f: FiltroEstoque, s: SituacaoEstoque) {
  if (f === "controlados") return s !== "sem-controle";
  if (f === "acabando") return s === "acabando";
  if (f === "zerados") return s === "zerado";
  return s === "sem-controle";
}

export function TelaEstoque({ filtroInicial, aoAbrirProduto }: { filtroInicial: FiltroEstoque; aoAbrirProduto: (p: Produto) => void }) {
  const loja = useLoja();
  const [filtro, setFiltro] = useState<FiltroEstoque>(filtroInicial);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("todas");
  const [janela, setJanela] = useState<"entrada" | "perda" | "contagem" | null>(null);
  // undefined = carregando, null = sem internet
  const [perdas, setPerdas] = useState<Perda[] | null | undefined>(undefined);

  const ativos = useMemo(() => loja.produtos.filter((p) => p.ativo), [loja.produtos]);
  const conta = useMemo(() => {
    const c: Record<SituacaoEstoque, number> = { ok: 0, acabando: 0, zerado: 0, "sem-controle": 0 };
    for (const p of ativos) c[situacaoEstoque(p)] += 1;
    return c;
  }, [ativos]);
  const nomeCategoria = useMemo(() => new Map(loja.categorias.map((c) => [c.id, c.nome])), [loja.categorias]);
  const porId = useMemo(() => new Map(loja.produtos.map((p) => [p.id, p])), [loja.produtos]);

  // Perdas do mês: recarrega quando o estoque muda (uma perda nova muda o estoque).
  const assinatura = useMemo(() => ativos.map((p) => p.estoque ?? "").join(","), [ativos]);
  useEffect(() => {
    let vivo = true;
    const hoje = new Date();
    perdasDesde(new Date(hoje.getFullYear(), hoje.getMonth(), 1)).then((l) => vivo && setPerdas(l));
    return () => {
      vivo = false;
    };
  }, [assinatura]);
  const valorPerdido = perdas ? perdas.reduce((s, p) => s + (p.custo ?? 0) * p.qtd, 0) : 0;

  const lista = useMemo(() => {
    const termo = busca.toLowerCase().trim();
    const peso: Record<SituacaoEstoque, number> = { zerado: 0, acabando: 1, ok: 2, "sem-controle": 3 };
    return ativos
      .filter((p) => bate(filtro, situacaoEstoque(p)))
      .filter((p) => categoria === "todas" || p.categoriaId === categoria)
      .filter((p) => !termo || p.nome.toLowerCase().includes(termo))
      // O que precisa de atenção vem primeiro.
      .sort((a, b) => peso[situacaoEstoque(a)] - peso[situacaoEstoque(b)] || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [ativos, filtro, categoria, busca]);

  const controlados = conta.ok + conta.acabando + conta.zerado;
  const quantos: Record<FiltroEstoque, number> = {
    controlados,
    acabando: conta.acabando,
    zerados: conta.zerado,
    "sem-controle": conta["sem-controle"],
  };

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <Botao variante="principal" className="h-12 px-2" onClick={() => setJanela("entrada")}>
          <ArrowCircleDown size={18} weight="bold" className="shrink-0" />
          Entrada
        </Botao>
        <Botao className="h-12 px-2" onClick={() => setJanela("contagem")}>
          <ClipboardText size={18} className="shrink-0" />
          Contagem
        </Botao>
        <Botao className="h-12 px-2" onClick={() => setJanela("perda")}>
          <Warning size={18} className="shrink-0" />
          Perda
        </Botao>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label className="flex h-11 shrink-0 items-center gap-2 rounded-[14px] bg-sunk px-3 ring-1 ring-line transition-shadow duration-150 focus-within:ring-2 focus-within:ring-accent sm:flex-1">
          <MagnifyingGlass size={18} className="text-muted" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar"
            aria-label="Buscar no estoque"
            className="h-full w-full bg-transparent text-base text-ink outline-none placeholder:text-muted md:text-sm"
          />
        </label>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria" className={ESCOLHA}>
          <option value="todas">Todas as categorias</option>
          {loja.categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="sem-barra -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            data-luz=""
            aria-pressed={filtro === f.id}
            onClick={() => setFiltro(f.id)}
            className={`aperta h-9 shrink-0 rounded-full px-4 text-sm font-medium ${filtro === f.id ? "vidro-ambar" : "vidro-leve text-body"}`}
          >
            {f.nome} <span className="num opacity-70">{quantos[f.id]}</span>
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <p className="mt-4 rounded-[20px] px-4 py-12 text-center text-[15px] text-muted ring-1 ring-line">
          {controlados === 0 && filtro === "controlados"
            ? "Nenhum produto controla estoque ainda. Comece pela Contagem: digite o que tem na prateleira"
            : "Nenhum produto aqui"}
        </p>
      ) : (
        <Cartao className="mt-4 overflow-hidden">
          <ul className="divide-y divide-line">
            {lista.map((p) => {
              const s = situacaoEstoque(p);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => aoAbrirProduto(p)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-sunk active:bg-sunk md:px-5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-ink">{p.nome}</span>
                      <span className="num block truncate text-[13px] text-muted">
                        {nomeCategoria.get(p.categoriaId) ?? "Sem categoria"}
                        {p.estoqueMinimo !== null && p.estoque !== null && ` · mínimo ${p.estoqueMinimo}`}
                      </span>
                    </span>
                    <span className={`num shrink-0 text-right ${COR[s]}`}>
                      {p.estoque === null ? (
                        <span className="text-[13px]">não controla</span>
                      ) : (
                        <>
                          <span className="block text-[17px] font-semibold">{p.estoque}</span>
                          {s !== "ok" && <span className="block text-xs">{s === "zerado" ? "acabou" : "acabando"}</span>}
                        </>
                      )}
                    </span>
                    <CaretRight size={14} className="shrink-0 text-muted" />
                  </button>
                </li>
              );
            })}
          </ul>
        </Cartao>
      )}

      <section className="mt-8">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight text-ink">Perdas do mês</h2>
          {perdas && perdas.length > 0 && <p className="num text-[17px] font-semibold text-red-ink">{reais(valorPerdido)}</p>}
        </div>
        {perdas === undefined && <div className="mt-4 h-16 animate-pulse rounded-[20px] bg-sunk" />}
        {perdas === null && <p className="mt-2 text-[15px] text-muted">Não consegui carregar as perdas. Confira a internet</p>}
        {perdas && perdas.length === 0 && (
          <p className="mt-2 text-[15px] text-muted">Nenhuma perda registrada este mês. Quebra, vencido e consumo da casa entram em Perda</p>
        )}
        {perdas && perdas.length > 0 && (
          <Cartao className="mt-4 overflow-hidden">
            <ul className="num divide-y divide-line">
              {perdas.slice(0, 30).map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-4 py-3 md:px-5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-ink">
                      {l.qtd}× {porId.get(l.produtoId)?.nome ?? "Produto removido"}
                    </span>
                    <span className="block truncate text-[13px] text-muted">
                      {l.motivo} · {formatoDataHora.format(new Date(l.criadoEm))} · {nomePessoa(loja.equipe, l.pessoaId)}
                    </span>
                  </span>
                  <span className="shrink-0 text-[15px] text-red-ink">{l.custo === null ? "sem custo" : reais(l.custo * l.qtd)}</span>
                </li>
              ))}
            </ul>
          </Cartao>
        )}
      </section>

      {janela === "entrada" && <JanelaEntrada aoFechar={() => setJanela(null)} />}
      {janela === "perda" && <JanelaPerda aoFechar={() => setJanela(null)} />}
      {janela === "contagem" && <JanelaContagem aoFechar={() => setJanela(null)} />}
    </div>
  );
}
