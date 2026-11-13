"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CaretRight, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { margem, nivelMargem, pct, reais } from "@/lib/dinheiro";
import { useLoja } from "@/lib/loja";
import { estoqueBaixo } from "@/lib/calculos";
import type { Produto } from "@/lib/tipos";
import { Botao, Cabecalho, Cartao, Etiqueta, Segmentado } from "@/components/ui";
import { TelaEstoque, type FiltroEstoque } from "@/components/estoque/TelaEstoque";
import { JanelaProduto } from "@/components/JanelaProduto";

type Ordem = "nome" | "margem" | "preco";

type Filtro = "todos" | "sem-custo";
type Aba = "produtos" | "estoque";
const FILTROS_ESTOQUE: FiltroEstoque[] = ["controlados", "acabando", "zerados", "sem-controle"];

/** "12", ou vermelho quando acabou e âmbar quando está no mínimo. "–" para quem não controla. */
function Estoque({ p }: { p: Produto }) {
  if (p.estoque === null) return <span className="text-muted">–</span>;
  const cor = p.estoque <= 0 ? "text-red-ink" : estoqueBaixo(p) ? "text-yellow-ink" : "text-ink";
  return <span className={cor}>{p.estoque}</span>;
}

function EtiquetaMargem({ p }: { p: Produto }) {
  const m = margem(p.preco, p.custo);
  return <Etiqueta nivel={nivelMargem(m)}>{m === null ? "sem custo" : pct(m)}</Etiqueta>;
}

const ESCOLHA =
  "h-11 rounded-[14px] bg-sunk px-3 text-base text-ink ring-1 ring-line outline-none focus:ring-2 focus:ring-accent md:text-sm";

export default function ProdutosPage() {
  // useSearchParams precisa de Suspense em volta.
  return (
    <Suspense>
      <Produtos />
    </Suspense>
  );
}

function Produtos() {
  const loja = useLoja();
  // Links do Início: /produtos?filtro=sem-custo e /produtos?aba=estoque&filtro=acabando
  const params = useSearchParams();
  const [aba, setAba] = useState<Aba>(() => (params.get("aba") === "estoque" ? "estoque" : "produtos"));
  const filtroEstoque = FILTROS_ESTOQUE.find((f) => f === params.get("filtro")) ?? "controlados";
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("todas");
  const [filtro, setFiltro] = useState<Filtro>(() => {
    const f = params.get("filtro");
    return f === "sem-custo" ? f : "todos";
  });
  const [ordem, setOrdem] = useState<Ordem>("nome");
  const [editando, setEditando] = useState<Produto | "novo" | null>(null);

  const ativos = useMemo(() => loja.produtos.filter((p) => p.ativo), [loja.produtos]);
  const semCusto = ativos.filter((p) => p.custo === null).length;
  const nomeCategoria = useMemo(() => new Map(loja.categorias.map((c) => [c.id, c.nome])), [loja.categorias]);

  const lista = useMemo(() => {
    const termo = busca.toLowerCase().trim();
    return ativos
      .filter((p) => categoria === "todas" || p.categoriaId === categoria)
      .filter((p) => filtro !== "sem-custo" || p.custo === null)
      .filter((p) => !termo || p.nome.toLowerCase().includes(termo))
      .sort((a, b) => {
        if (ordem === "preco") return b.preco - a.preco;
        if (ordem === "margem") return (margem(a.preco, a.custo) ?? -1) - (margem(b.preco, b.custo) ?? -1);
        return a.nome.localeCompare(b.nome, "pt-BR");
      });
  }, [ativos, categoria, filtro, busca, ordem]);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 md:px-8">
      <Cabecalho
        titulo="Produtos"
        subtitulo={`${ativos.length} ${ativos.length === 1 ? "produto" : "produtos"}${semCusto ? ` · ${semCusto} sem custo` : ""}`}
        acao={
          <Botao variante="principal" className="h-11 shrink-0 rounded-full" onClick={() => setEditando("novo")}>
            <Plus size={16} weight="bold" />
            Novo
          </Botao>
        }
      />

      <Segmentado
        rotulo="Produtos ou estoque"
        className="mb-4 sm:w-80"
        valor={aba}
        aoMudar={setAba}
        opcoes={[
          { id: "produtos", nome: "Produtos" },
          { id: "estoque", nome: "Estoque" },
        ]}
      />

      {aba === "estoque" ? (
        <TelaEstoque filtroInicial={filtroEstoque} aoAbrirProduto={setEditando} />
      ) : (
        <>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex h-11 shrink-0 items-center gap-2 sm:flex-1 rounded-[14px] bg-sunk px-3 ring-1 ring-line transition-shadow duration-150 focus-within:ring-2 focus-within:ring-accent">
            <MagnifyingGlass size={18} className="text-muted" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar"
              aria-label="Buscar produto"
              className="h-full w-full bg-transparent text-base text-ink outline-none placeholder:text-muted md:text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria" className={ESCOLHA}>
              <option value="todas">Todas as categorias</option>
              {loja.categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} aria-label="Ordenar" className={ESCOLHA}>
              <option value="nome">Ordem alfabética</option>
              <option value="margem">Menor margem primeiro</option>
              <option value="preco">Mais caros primeiro</option>
            </select>
          </div>
        </div>

        {(semCusto > 0 || filtro !== "todos") && (
          <div className="mt-3 flex flex-wrap gap-2">
            {(semCusto > 0 || filtro === "sem-custo") && (
              <button
                type="button"
                data-luz=""
                aria-pressed={filtro === "sem-custo"}
                onClick={() => setFiltro((f) => (f === "sem-custo" ? "todos" : "sem-custo"))}
                className={`aperta h-9 rounded-full px-4 text-sm font-medium ${filtro === "sem-custo" ? "vidro-ambar" : "vidro-leve text-yellow-ink"}`}
              >
                {filtro === "sem-custo" ? "Mostrando só os sem custo" : `Ver os ${semCusto} sem custo`}
              </button>
            )}
          </div>
        )}

        {lista.length === 0 ? (
          <p className="mt-6 rounded-[20px] px-4 py-12 text-center text-[15px] text-muted ring-1 ring-line">
            Nenhum produto aqui
          </p>
        ) : (
          <>
            {/* Computador: tabela */}
            <Cartao className="mt-6 hidden overflow-hidden md:block">
              <table className="w-full text-[15px]">
                <thead className="border-b border-line text-left text-[13px] text-muted">
                  <tr>
                    <th className="px-5 py-3 font-normal">Produto</th>
                    <th className="px-4 py-3 font-normal">Categoria</th>
                    <th className="px-4 py-3 text-right font-normal">Custo</th>
                    <th className="px-4 py-3 text-right font-normal">Preço</th>
                    <th className="px-4 py-3 text-right font-normal">Lucro por unidade</th>
                    <th className="px-4 py-3 text-right font-normal">Estoque</th>
                    <th className="px-5 py-3 text-right font-normal">Margem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {lista.map((p) => (
                    <tr
                      key={p.id}
                      tabIndex={0}
                      onClick={() => setEditando(p)}
                      onKeyDown={(e) => e.key === "Enter" && setEditando(p)}
                      className="cursor-pointer transition-colors duration-150 hover:bg-sunk"
                    >
                      <td className="px-5 py-3 font-medium text-ink">{p.nome}</td>
                      <td className="px-4 py-3 text-body">{nomeCategoria.get(p.categoriaId) ?? "Sem categoria"}</td>
                      <td className="num px-4 py-3 text-right text-body">{p.custo === null ? "–" : reais(p.custo)}</td>
                      <td className="num px-4 py-3 text-right text-ink">{reais(p.preco)}</td>
                      <td className="num px-4 py-3 text-right text-ink">{p.custo === null ? "–" : reais(p.preco - p.custo)}</td>
                      <td className="num px-4 py-3 text-right">
                        <Estoque p={p} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <EtiquetaMargem p={p} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Cartao>

            {/* Celular: lista agrupada, como nos Ajustes do iOS */}
            <Cartao className="mt-4 overflow-hidden md:hidden">
              <ul className="divide-y divide-line">
                {lista.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setEditando(p)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 active:bg-sunk"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-medium text-ink">{p.nome}</p>
                        <p className="num text-[13px] text-body">
                          {reais(p.preco)}
                          {p.custo !== null && ` · custo ${reais(p.custo)}`}
                          {p.estoque !== null && (
                            <>
                              {" · "}
                              <Estoque p={p} /> em estoque
                            </>
                          )}
                        </p>
                      </div>
                      <EtiquetaMargem p={p} />
                      <CaretRight size={14} className="text-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            </Cartao>
          </>
        )}

        </>
      )}

      {editando && (
        <JanelaProduto
          key={editando === "novo" ? "novo" : editando.id}
          produto={editando === "novo" ? undefined : editando}
          categorias={loja.categorias}
          aoFechar={() => setEditando(null)}
        />
      )}
    </div>
  );
}
