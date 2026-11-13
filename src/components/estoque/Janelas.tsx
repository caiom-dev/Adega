"use client";

import { useMemo, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { reais } from "@/lib/dinheiro";
import { custoPorUnidade, unidadesDaEntrada } from "@/lib/calculos";
import { registrarContagem, registrarEstoque, salvarCusto, useLoja } from "@/lib/loja";
import type { Produto } from "@/lib/tipos";
import { Botao, CampoDinheiro, CampoEscolha, CampoTexto, Janela } from "@/components/ui";

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
const soNumero = (texto: string, max = 5) => texto.replace(/\D/g, "").slice(0, max);
const unidades = (n: number) => `${n} ${Math.abs(n) === 1 ? "unidade" : "unidades"}`;

/** Texto do estoque atual de um produto: "7 em estoque" ou "não controla estoque". */
export const textoEstoque = (p: Produto) => (p.estoque === null ? "não controla estoque" : `${p.estoque} em estoque`);

/* ───────── Escolher produto pela busca ───────── */

function EscolherProduto({
  produto,
  aoEscolher,
  filtro,
  autoFocus,
}: {
  produto: Produto | null;
  aoEscolher: (p: Produto | null) => void;
  filtro?: (p: Produto) => boolean;
  autoFocus?: boolean;
}) {
  const loja = useLoja();
  const [busca, setBusca] = useState("");

  const lista = useMemo(() => {
    const termo = semAcento(busca).trim();
    if (!termo) return [];
    return loja.produtos
      .filter((p) => p.ativo && (!filtro || filtro(p)) && semAcento(p.nome).includes(termo))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      .slice(0, 8);
  }, [loja.produtos, busca, filtro]);

  if (produto) {
    // Lê da loja: o estoque pode ter mudado desde a escolha.
    const atual = loja.produtos.find((p) => p.id === produto.id) ?? produto;
    return (
      <div className="flex items-center gap-3 rounded-[14px] bg-sunk px-4 py-3 ring-1 ring-line">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium text-ink">{atual.nome}</span>
          <span className="num block text-[13px] text-body">{textoEstoque(atual)}</span>
        </span>
        <Botao variante="fantasma" className="h-9 shrink-0 px-3 text-[13px]" onClick={() => aoEscolher(null)}>
          Trocar
        </Botao>
      </div>
    );
  }

  return (
    <div>
      <span className="mb-2 block text-[13px] text-body">Produto</span>
      <label className="flex h-12 items-center gap-2 rounded-[14px] bg-sunk px-4 ring-1 ring-line transition-shadow duration-150 focus-within:ring-2 focus-within:ring-accent">
        <MagnifyingGlass size={18} className="text-muted" />
        <input
          type="search"
          value={busca}
          autoFocus={autoFocus}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar pelo nome"
          aria-label="Buscar produto"
          className="h-full w-full bg-transparent text-base text-ink outline-none placeholder:text-muted"
        />
      </label>
      {busca.trim() && (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-[14px] ring-1 ring-line">
          {lista.length === 0 && <li className="px-4 py-3 text-[15px] text-muted">Nenhum produto encontrado</li>}
          {lista.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  aoEscolher(p);
                  setBusca("");
                }}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-sunk active:bg-sunk"
              >
                <span className="min-w-0 truncate text-[15px] text-ink">{p.nome}</span>
                <span className="num shrink-0 text-[13px] text-muted">{textoEstoque(p)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Linha de confirmação depois de salvar, para quem lança vários seguidos. */
function Feito({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return <p className="num aparece rounded-[14px] bg-green-soft px-4 py-3 text-[15px] text-green-ink">{texto}</p>;
}

/* ───────── Entrada de mercadoria ───────── */

export function JanelaEntrada({ inicial, aoFechar }: { inicial?: Produto; aoFechar: () => void }) {
  const loja = useLoja();
  const [produto, setProduto] = useState<Produto | null>(inicial ?? null);
  const [qtd, setQtd] = useState("");
  const [porEmbalagem, setPorEmbalagem] = useState("");
  const [custo, setCusto] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const atual = produto ? (loja.produtos.find((p) => p.id === produto.id) ?? produto) : null;
  const embalagem = Math.max(1, Number(porEmbalagem) || 1);
  const total = unidadesDaEntrada(Number(qtd) || 0, embalagem);
  const custoUnidade = custo === null ? null : custoPorUnidade(custo, embalagem);

  async function salvar() {
    if (!atual || total <= 0 || ocupado) return;
    setOcupado(true);
    setErro(null);
    const descricao = embalagem > 1 ? `${qtd} × ${embalagem}${motivo.trim() ? ` · ${motivo.trim()}` : ""}` : motivo;
    const falha = await registrarEstoque(atual.id, "entrada", total, descricao);
    if (!falha && custoUnidade !== null && custoUnidade !== atual.custo) await salvarCusto(atual.id, custoUnidade);
    setOcupado(false);
    if (falha) {
      setErro(falha);
      return;
    }
    // Fica aberta e limpa para a próxima mercadoria da nota.
    setFeito(`${atual.nome}: +${total}, fica com ${(atual.estoque ?? 0) + total}`);
    setProduto(null);
    setQtd("");
    setPorEmbalagem("");
    setCusto(null);
    setMotivo("");
  }

  return (
    <Janela
      aberta
      aoFechar={aoFechar}
      titulo="Entrada de mercadoria"
      rodape={
        <Botao variante="principal" className="h-12 w-full" disabled={!atual || total <= 0 || ocupado} onClick={salvar}>
          {ocupado ? "Salvando" : total > 0 ? `Somar ${unidades(total)}` : "Somar ao estoque"}
        </Botao>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void salvar();
        }}
      >
        <Feito texto={feito} />
        <EscolherProduto produto={atual} aoEscolher={setProduto} autoFocus={!inicial} />
        {atual && (
          <>
            {atual.estoque === null && (
              <p className="rounded-[14px] bg-yellow-soft px-4 py-3 text-[15px] text-yellow-ink">
                Este produto ainda não controla estoque. Ele passa a controlar começando com essas unidades. Se já tem
                unidades na prateleira, use Contagem.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <CampoTexto
                rotulo={embalagem > 1 ? "Quantas caixas" : "Quantidade"}
                inputMode="numeric"
                autoFocus={!!inicial}
                value={qtd}
                onChange={(e) => setQtd(soNumero(e.target.value, 4))}
              />
              <CampoTexto
                rotulo="Unidades por caixa"
                inputMode="numeric"
                placeholder="1"
                value={porEmbalagem}
                onChange={(e) => setPorEmbalagem(soNumero(e.target.value, 3))}
              />
            </div>
            {total > 0 && (
              <p className="num text-[15px] text-body">
                {embalagem > 1 ? `${qtd} × ${embalagem} = ` : ""}
                <span className="font-medium text-ink">{unidades(total)}</span>. Fica com {(atual.estoque ?? 0) + total}.
              </p>
            )}
            <CampoDinheiro
              rotulo={embalagem > 1 ? "Custo da caixa" : "Custo da unidade"}
              valor={custo}
              aoMudar={setCusto}
              dica={
                custoUnidade !== null && embalagem > 1
                  ? `${reais(custoUnidade)} por unidade${atual.custo !== null ? `. Hoje está ${reais(atual.custo)}` : ""}`
                  : `Opcional. ${atual.custo !== null ? `Hoje está ${reais(atual.custo)} por unidade. ` : ""}Deixe vazio para não mudar`
              }
            />
            <CampoTexto
              rotulo="Observação"
              placeholder="Fornecedor, nota..."
              maxLength={80}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </>
        )}
        {erro && (
          <p role="alert" className="text-[15px] text-red-ink">
            {erro}
          </p>
        )}
        <button type="submit" hidden />
      </form>
    </Janela>
  );
}

/* ───────── Perda ───────── */

const MOTIVOS_PERDA = ["Quebrou", "Venceu", "Consumo da casa", "Outro"];

export function JanelaPerda({ inicial, aoFechar }: { inicial?: Produto; aoFechar: () => void }) {
  const loja = useLoja();
  const [produto, setProduto] = useState<Produto | null>(inicial ?? null);
  const [qtd, setQtd] = useState("");
  const [motivo, setMotivo] = useState(MOTIVOS_PERDA[0]);
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const atual = produto ? (loja.produtos.find((p) => p.id === produto.id) ?? produto) : null;
  const n = Number(qtd) || 0;

  async function salvar() {
    if (!atual || n <= 0 || ocupado) return;
    setOcupado(true);
    setErro(null);
    const texto = observacao.trim() ? `${motivo} · ${observacao.trim()}` : motivo;
    const falha = await registrarEstoque(atual.id, "perda", n, texto);
    setOcupado(false);
    if (falha) {
      setErro(falha);
      return;
    }
    setFeito(`${atual.nome}: −${n} (${motivo.toLowerCase()}), fica com ${(atual.estoque ?? 0) - n}`);
    setProduto(null);
    setQtd("");
    setObservacao("");
  }

  return (
    <Janela
      aberta
      aoFechar={aoFechar}
      titulo="Perda"
      rodape={
        <Botao variante="principal" className="h-12 w-full" disabled={!atual || n <= 0 || ocupado} onClick={salvar}>
          {ocupado ? "Salvando" : n > 0 ? `Tirar ${unidades(n)}` : "Tirar do estoque"}
        </Botao>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void salvar();
        }}
      >
        <Feito texto={feito} />
        <EscolherProduto
          produto={atual}
          aoEscolher={setProduto}
          filtro={(p) => p.estoque !== null}
          autoFocus={!inicial}
        />
        {!atual && <p className="text-[13px] text-muted">Só aparecem os produtos que controlam estoque.</p>}
        {atual && (
          <>
            <CampoTexto
              rotulo="Quantas unidades"
              inputMode="numeric"
              autoFocus={!!inicial}
              value={qtd}
              onChange={(e) => setQtd(soNumero(e.target.value, 4))}
            />
            <div>
              <span className="mb-2 block text-[13px] text-body">Motivo</span>
              <div className="flex flex-wrap gap-2">
                {MOTIVOS_PERDA.map((m) => (
                  <button
                    key={m}
                    type="button"
                    data-luz=""
                    aria-pressed={motivo === m}
                    onClick={() => setMotivo(m)}
                    className={`aperta h-9 rounded-full px-4 text-sm font-medium ${motivo === m ? "vidro-ambar" : "vidro-leve text-body"}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <CampoTexto
              rotulo="Observação"
              placeholder="Opcional"
              maxLength={80}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
            {n > 0 && atual.custo !== null && (
              <p className="num text-[15px] text-body">
                Prejuízo de <span className="font-medium text-red-ink">{reais(atual.custo * n)}</span> pelo custo.
              </p>
            )}
          </>
        )}
        {erro && (
          <p role="alert" className="text-[15px] text-red-ink">
            {erro}
          </p>
        )}
        <button type="submit" hidden />
      </form>
    </Janela>
  );
}

/* ───────── Contagem por categoria ───────── */

export function JanelaContagem({ aoFechar }: { aoFechar: () => void }) {
  const loja = useLoja();
  const categorias = useMemo(
    () => loja.categorias.filter((c) => loja.produtos.some((p) => p.ativo && p.categoriaId === c.id)),
    [loja.categorias, loja.produtos],
  );
  const [categoria, setCategoria] = useState(categorias[0]?.id ?? "");
  // Digitado por produto. Vazio = não contou (fica como está).
  const [contado, setContado] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Primeiro os que já controlam estoque, depois os outros.
  const produtos = useMemo(
    () =>
      loja.produtos
        .filter((p) => p.ativo && p.categoriaId === categoria)
        .sort((a, b) => Number(a.estoque === null) - Number(b.estoque === null) || a.nome.localeCompare(b.nome, "pt-BR")),
    [loja.produtos, categoria],
  );
  const preenchidos = produtos.filter((p) => (contado[p.id] ?? "") !== "");
  const diferencas = preenchidos.filter((p) => Number(contado[p.id]) !== p.estoque).length;

  async function salvar() {
    if (preenchidos.length === 0 || ocupado) return;
    setOcupado(true);
    setErro(null);
    const nome = categorias.find((c) => c.id === categoria)?.nome ?? "";
    const falha = await registrarContagem(
      preenchidos.map((p) => ({ produtoId: p.id, qtd: Number(contado[p.id]) })),
      `Contagem de ${nome}`,
    );
    setOcupado(false);
    if (falha) {
      setErro(falha);
      return;
    }
    setFeito(
      `${nome}: ${preenchidos.length} ${preenchidos.length === 1 ? "produto contado" : "produtos contados"}` +
        (diferencas > 0 ? `, ${diferencas} com diferença acertada` : ", tudo batia"),
    );
    setContado({});
  }

  return (
    <Janela
      aberta
      larga
      aoFechar={aoFechar}
      titulo="Contagem"
      rodape={
        <Botao variante="principal" className="h-12 w-full" disabled={preenchidos.length === 0 || ocupado} onClick={salvar}>
          {ocupado
            ? "Salvando"
            : preenchidos.length > 0
              ? `Salvar ${preenchidos.length} ${preenchidos.length === 1 ? "produto" : "produtos"}`
              : "Digite o que contou"}
        </Botao>
      }
    >
      <div className="space-y-4">
        <Feito texto={feito} />
        <CampoEscolha
          rotulo="Categoria"
          value={categoria}
          onChange={(e) => {
            setCategoria(e.target.value);
            setFeito(null);
          }}
        >
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </CampoEscolha>
        <p className="text-[13px] text-muted">
          Digite quantas unidades tem na prateleira. O número contado substitui o do sistema. Deixe vazio o que não
          contou. Produto que ainda não controla estoque passa a controlar.
        </p>
        <ul className="divide-y divide-line rounded-[16px] bg-sunk px-4 ring-1 ring-line">
          {produtos.map((p) => {
            const valor = contado[p.id] ?? "";
            const diff = valor !== "" && p.estoque !== null ? Number(valor) - p.estoque : null;
            return (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-ink">{p.nome}</span>
                  <span className="num block text-[13px] text-muted">
                    {p.estoque === null ? "não controla" : `sistema: ${p.estoque}`}
                    {diff !== null && diff !== 0 && (
                      <span className={diff > 0 ? "text-green-ink" : "text-red-ink"}>
                        {" "}
                        · {diff > 0 ? `+${diff}` : `−${-diff}`}
                      </span>
                    )}
                  </span>
                </span>
                <input
                  inputMode="numeric"
                  aria-label={`Contado de ${p.nome}`}
                  placeholder="–"
                  value={valor}
                  onChange={(e) => {
                    setFeito(null);
                    setContado((c) => ({ ...c, [p.id]: soNumero(e.target.value) }));
                  }}
                  className="num h-11 w-20 shrink-0 rounded-[12px] bg-surface px-3 text-right text-base text-ink ring-1 ring-line outline-none placeholder:text-muted focus:ring-2 focus:ring-accent"
                />
              </li>
            );
          })}
        </ul>
        {erro && (
          <p role="alert" className="text-[15px] text-red-ink">
            {erro}
          </p>
        )}
      </div>
    </Janela>
  );
}
