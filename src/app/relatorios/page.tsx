"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CaretRight, MagnifyingGlass, Warning } from "@phosphor-icons/react";
import { nivelMargem, pct, reais } from "@/lib/dinheiro";
import {
  NOMES_PERIODO,
  intervalo,
  intervaloEntre,
  porDia,
  porDiaSemana,
  porHora,
  resumir,
  taxasDaVenda,
  vendasNoIntervalo,
  type Periodo,
  type Resumo,
} from "@/lib/calculos";
import { cancelarVenda, restaurarVenda, useLoja } from "@/lib/loja";
import type { Venda } from "@/lib/tipos";
import { Botao, Cabecalho, Cartao, Etiqueta, Janela, NumeroAnimado, Segmentado, useAgora } from "@/components/ui";
import { Barras, ListaBarras } from "@/components/Graficos";

type Aba = "lucro" | "vendas" | "pagamentos" | "historico";
const ABAS: { id: Aba; nome: string }[] = [
  { id: "lucro", nome: "Lucro" },
  { id: "vendas", nome: "Vendas" },
  { id: "pagamentos", nome: "Pagamentos" },
  { id: "historico", nome: "Histórico" },
];
const PERIODOS: Periodo[] = ["hoje", "ontem", "7dias", "30dias", "mes", "mes-passado"];

const reaisCurto = (v: number) =>
  v >= 100_000 ? `R$ ${(v / 100_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : `R$ ${Math.round(v / 100)}`;
const paraCampo = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const formatoDataHora = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function RelatoriosPage() {
  return (
    <Suspense>
      <Relatorios />
    </Suspense>
  );
}

function Relatorios() {
  const loja = useLoja();
  const agora = useAgora();
  const params = useSearchParams();
  const inicial = ABAS.find((a) => a.id === params.get("r"))?.id ?? "lucro";
  const [aba, setAba] = useState<Aba>(inicial);
  const [periodo, setPeriodo] = useState<Periodo | "outro">("mes");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  const faixa = useMemo(() => {
    if (!agora) return null;
    if (periodo === "outro") return intervaloEntre(de, ate);
    return intervalo(periodo, agora);
  }, [agora, periodo, de, ate]);

  const vendas = useMemo(() => (faixa ? vendasNoIntervalo(loja.vendas, faixa) : []), [loja.vendas, faixa]);
  const r = useMemo(() => resumir(vendas), [vendas]);
  const nomePeriodo = periodo === "outro" ? "no período" : NOMES_PERIODO[periodo].toLowerCase();
  const dataInvalida = periodo === "outro" && !!de && !!ate && !faixa;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 md:px-8">
      <Cabecalho titulo="Relatórios" />

      <Segmentado rotulo="Relatório" opcoes={ABAS} valor={aba} aoMudar={setAba} className="max-w-xl" />

      <div className="sem-barra -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        {PERIODOS.map((p) => (
          <button
            key={p}
            type="button"
            data-luz=""
            aria-pressed={periodo === p}
            onClick={() => setPeriodo(p)}
            className={`aperta h-9 shrink-0 rounded-full px-4 text-sm font-medium ${periodo === p ? "vidro-ambar" : "vidro-leve text-body"}`}
          >
            {NOMES_PERIODO[p]}
          </button>
        ))}
        <button
          type="button"
          data-luz=""
          aria-pressed={periodo === "outro"}
          onClick={() => {
            if (agora && !de) {
              setDe(paraCampo(new Date(agora.getFullYear(), agora.getMonth(), 1)));
              setAte(paraCampo(agora));
            }
            setPeriodo("outro");
          }}
          className={`aperta h-9 shrink-0 rounded-full px-4 text-sm font-medium ${periodo === "outro" ? "vidro-ambar" : "vidro-leve text-body"}`}
        >
          Escolher datas
        </button>
      </div>

      {periodo === "outro" && (
        <div className="aparece mt-3 flex flex-wrap items-center gap-2 text-[15px] text-body">
          <input
            type="date"
            value={de}
            max={ate || undefined}
            onChange={(e) => setDe(e.target.value)}
            aria-label="Data inicial"
            className="h-11 rounded-[14px] bg-sunk px-3 text-ink ring-1 ring-line outline-none focus:ring-2 focus:ring-accent"
          />
          até
          <input
            type="date"
            value={ate}
            min={de || undefined}
            onChange={(e) => setAte(e.target.value)}
            aria-label="Data final"
            className="h-11 rounded-[14px] bg-sunk px-3 text-ink ring-1 ring-line outline-none focus:ring-2 focus:ring-accent"
          />
          {dataInvalida && <span className="text-red-ink">A data final vem antes da inicial</span>}
        </div>
      )}

      {/* A chave refaz a entrada quando troca de aba */}
      {agora && (
        <div key={aba} className="mt-6">
          {aba === "lucro" && <AbaLucro r={r} nomePeriodo={nomePeriodo} temTaxa={loja.formas.some((f) => f.taxa > 0)} />}
          {aba === "vendas" && <AbaVendas vendas={vendas} r={r} faixa={faixa} />}
          {aba === "pagamentos" && <AbaPagamentos r={r} />}
          {aba === "historico" && <AbaHistorico todas={loja.vendas} faixa={faixa} />}
        </div>
      )}
    </div>
  );
}

function Vazio({ children = "Nenhuma venda neste período" }: { children?: React.ReactNode }) {
  return <p className="entra rounded-[20px] px-4 py-12 text-center text-[15px] text-muted ring-1 ring-line">{children}</p>;
}

function Numero({ rotulo, valor, detalhe, i }: { rotulo: string; valor: string; detalhe?: string; i: number }) {
  return (
    <Cartao className="entra p-4 md:p-5" style={{ "--i": i } as React.CSSProperties}>
      <p className="text-[13px] text-body">{rotulo}</p>
      <p className="num mt-2 text-2xl leading-none font-semibold tracking-tight text-ink">{valor}</p>
      {detalhe && <p className="num mt-2 text-[13px] text-muted">{detalhe}</p>}
    </Cartao>
  );
}

/* ───────── Lucro ───────── */

function AbaLucro({ r, nomePeriodo, temTaxa }: { r: Resumo; nomePeriodo: string; temTaxa: boolean }) {
  return (
    <>
      <Cartao className="entra p-5 md:p-8">
        <p className="text-[15px] text-body">Lucro {nomePeriodo}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <NumeroAnimado
            valor={r.lucro}
            formato={reais}
            className={`num text-5xl leading-none font-semibold tracking-tight md:text-6xl ${r.lucro < 0 ? "text-red-ink" : "text-ink"}`}
          />
          {r.margem !== null && <Etiqueta nivel={nivelMargem(r.margem)}>margem de {pct(r.margem)}</Etiqueta>}
        </div>
        <p className="num mt-4 text-[15px] text-body">
          {reais(r.vendas)} em vendas − {reais(r.custo)} de custo − {reais(r.taxas)} de taxas
        </p>
      </Cartao>

      {r.unidadesSemCusto > 0 && (
        <div className="entra mt-3 flex gap-3 rounded-[16px] bg-yellow-soft px-4 py-3 text-[15px] text-yellow-ink" style={{ "--i": 1 } as React.CSSProperties}>
          <Warning size={20} weight="fill" className="mt-0.5 shrink-0" />
          <p>
            {r.unidadesSemCusto} {r.unidadesSemCusto === 1 ? "unidade vendida" : "unidades vendidas"} sem custo cadastrado. A
            conta considerou custo zero para elas, então o lucro real é menor.{" "}
            <Link href="/produtos?filtro=sem-custo" className="font-medium underline underline-offset-2">
              Cadastrar custos
            </Link>
          </p>
        </div>
      )}

      {!temTaxa && r.pedidos > 0 && (
        <p className="mt-3 text-[15px] text-body">
          As taxas da maquininha estão zeradas.{" "}
          <Link href="/ajustes" className="text-accent">
            Cadastrar taxas
          </Link>
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Numero i={1} rotulo="Vendas" valor={reais(r.vendas)} />
        <Numero i={2} rotulo="Pedidos" valor={String(r.pedidos)} detalhe={`Ticket médio de ${reais(r.ticketMedio)}`} />
        <Numero i={3} rotulo="Custo dos produtos" valor={reais(r.custo)} />
        <Numero i={4} rotulo="Taxas da maquininha" valor={reais(r.taxas)} />
      </div>

      {r.pedidos === 0 ? (
        <div className="mt-6">
          <Vazio />
        </div>
      ) : (
        <section className="mt-8">
          <h2 className="text-xl font-semibold tracking-tight text-ink">De onde vem o lucro</h2>
          <Cartao className="entra mt-4 overflow-hidden" style={{ "--i": 5 } as React.CSSProperties}>
            <ListaBarras
              formato={reais}
              linhas={r.porProduto.map((l) => ({
                id: l.produtoId,
                nome: l.nome,
                valor: l.lucro,
                detalhe: `${l.qtd} ${l.qtd === 1 ? "unidade" : "unidades"} · ${reais(l.vendas)} em vendas`,
                aviso: l.semCusto ? "sem custo" : undefined,
              }))}
            />
          </Cartao>
        </section>
      )}
    </>
  );
}

/* ───────── Vendas por dia e por horário ───────── */

function AbaVendas({ vendas, r, faixa }: { vendas: Venda[]; r: Resumo; faixa: [Date, Date] | null }) {
  const dias = useMemo(() => (faixa ? porDia(vendas, faixa) : []), [vendas, faixa]);
  const horas = useMemo(() => porHora(vendas), [vendas]);
  const semana = useMemo(() => porDiaSemana(vendas), [vendas]);

  if (r.pedidos === 0) return <Vazio />;

  const umDia = dias.length <= 1;
  const melhorDia = dias.reduce((m, d, i) => (d.vendas > dias[m].vendas ? i : m), 0);
  const pico = horas.reduce((m, h, i) => (h.vendas > horas[m].vendas ? i : m), 0);
  // Corta as horas vazias das pontas: a adega não vende às 5 da manhã.
  const primeira = Math.max(0, horas.findIndex((h) => h.pedidos > 0) - 1);
  const ultima = Math.min(23, horas.findLastIndex((h) => h.pedidos > 0) + 1);
  const horasVisiveis = horas.slice(primeira, ultima + 1);
  const paraBarra = (b: { rotulo: string; nome: string; vendas: number; pedidos: number }) => ({
    rotulo: b.rotulo,
    nome: b.nome,
    valor: b.vendas,
    detalhe: `${b.pedidos} ${b.pedidos === 1 ? "pedido" : "pedidos"}`,
  });

  const graficoHoras = (altura: number) => (
    <Barras
      titulo="Vendas por horário"
      dados={horasVisiveis.map(paraBarra)}
      destaque={pico - primeira}
      formato={reais}
      formatoEixo={reaisCurto}
      altura={altura}
    />
  );

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Numero i={0} rotulo="Vendas" valor={reais(r.vendas)} />
        <Numero i={1} rotulo="Pedidos" valor={String(r.pedidos)} />
        <Numero i={2} rotulo="Ticket médio" valor={reais(r.ticketMedio)} />
        <Numero i={3} rotulo="Horário de pico" valor={horas[pico].rotulo} detalhe={`${reais(horas[pico].vendas)} em vendas`} />
      </div>

      <Cartao className="entra mt-3 p-5 md:p-6" style={{ "--i": 4 } as React.CSSProperties}>
        <h2 className="text-[17px] font-medium text-ink">{umDia ? "Vendas por horário" : "Vendas por dia"}</h2>
        <p className="mt-1 mb-8 text-[13px] text-body">
          {umDia
            ? `Pico às ${horas[pico].rotulo}, em âmbar`
            : `Melhor dia: ${dias[melhorDia].nome}, com ${reais(dias[melhorDia].vendas)}, em âmbar`}
        </p>
        {umDia ? (
          graficoHoras(260)
        ) : (
          <Barras
            titulo="Vendas por dia"
            dados={dias.map(paraBarra)}
            destaque={melhorDia}
            formato={reais}
            formatoEixo={reaisCurto}
            altura={260}
          />
        )}
      </Cartao>

      {!umDia && (
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Cartao className="entra p-5 md:p-6" style={{ "--i": 5 } as React.CSSProperties}>
            <h2 className="text-[17px] font-medium text-ink">Vendas por horário</h2>
            <p className="mt-1 mb-8 text-[13px] text-body">Soma de todos os dias do período. Pico às {horas[pico].rotulo}</p>
            {graficoHoras(160)}
          </Cartao>
          <Cartao className="entra overflow-hidden" style={{ "--i": 6 } as React.CSSProperties}>
            <h2 className="px-5 pt-5 pb-2 text-[17px] font-medium text-ink">Dia da semana</h2>
            <ListaBarras
              formato={reais}
              linhas={semana
                .map((d) => ({ id: d.nome, nome: d.nome, valor: d.vendas, detalhe: `${d.pedidos} ${d.pedidos === 1 ? "pedido" : "pedidos"}` }))
                .filter((d) => d.valor > 0)
                .sort((a, b) => b.valor - a.valor)}
            />
          </Cartao>
        </div>
      )}

      {/* Os mesmos números do gráfico, em tabela */}
      {!umDia && (
        <details className="group mt-3">
          <summary className="vidro-leve aperta inline-flex h-9 cursor-pointer list-none items-center gap-2 rounded-full px-4 text-sm font-medium text-body">
            Ver em tabela
            <CaretRight size={12} weight="bold" className="transition-transform duration-200 group-open:rotate-90" />
          </summary>
          <Cartao className="aparece mt-3 overflow-hidden">
            <table className="num w-full text-[15px]">
              <thead className="border-b border-line text-left text-[13px] text-muted">
                <tr>
                  <th className="px-5 py-3 font-normal">Dia</th>
                  <th className="px-4 py-3 text-right font-normal">Pedidos</th>
                  <th className="px-5 py-3 text-right font-normal">Vendas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {dias
                  .filter((d) => d.pedidos > 0)
                  .map((d) => (
                    <tr key={d.nome}>
                      <td className="px-5 py-3 text-ink">{d.nome}</td>
                      <td className="px-4 py-3 text-right text-body">{d.pedidos}</td>
                      <td className="px-5 py-3 text-right text-ink">{reais(d.vendas)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Cartao>
        </details>
      )}
    </>
  );
}

/* ───────── Forma de pagamento ───────── */

function AbaPagamentos({ r }: { r: Resumo }) {
  if (r.pedidos === 0) return <Vazio />;
  const total = r.porForma.reduce((s, f) => s + f.valor, 0) || 1;
  // Uma cor por posição, do âmbar aos neutros: a maior fatia é a que leva o destaque.
  const TONS = ["bg-accent", "bg-white/55", "bg-white/35", "bg-white/20"];

  return (
    <>
      <Cartao className="entra p-5 md:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[17px] font-medium text-ink">Recebido por forma de pagamento</h2>
          <p className="num text-[15px] text-body">{reais(r.vendas)}</p>
        </div>
        {/* Uma barra só, repartida: mostra a fatia de cada forma no total */}
        <div className="mt-5 flex h-4 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Participação de cada forma de pagamento">
          {r.porForma.map((f, i) => (
            <span key={f.formaId} className={`estica ${TONS[Math.min(i, TONS.length - 1)]}`} style={{ width: `${(f.valor / total) * 100}%`, "--i": i } as React.CSSProperties} />
          ))}
        </div>
        <ul className="num mt-5 divide-y divide-line">
          {r.porForma.map((f, i) => (
            <li key={f.formaId} className="flex items-center gap-3 py-3 text-[15px]">
              <span className={`h-3 w-3 shrink-0 rounded-[4px] ${TONS[Math.min(i, TONS.length - 1)]}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-ink">{f.nome}</span>
                <span className="block text-[13px] text-muted">
                  {f.taxas > 0 ? `taxa de ${reais(f.taxas)} · sobra ${reais(f.valor - f.taxas)}` : "sem taxa"}
                </span>
              </span>
              <span className="text-right">
                <span className="block font-medium text-ink">{reais(f.valor)}</span>
                <span className="block text-[13px] text-muted">{pct((f.valor / total) * 100)}</span>
              </span>
            </li>
          ))}
        </ul>
      </Cartao>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Numero i={1} rotulo="Taxas da maquininha" valor={reais(r.taxas)} />
        <Numero i={2} rotulo="Sobra depois das taxas" valor={reais(r.vendas - r.taxas)} />
      </div>
      {r.taxas === 0 && (
        <p className="mt-3 text-[15px] text-body">
          As taxas da maquininha estão zeradas.{" "}
          <Link href="/ajustes" className="text-accent">
            Cadastrar taxas
          </Link>
        </p>
      )}
    </>
  );
}

/* ───────── Histórico de vendas ───────── */

function AbaHistorico({ todas, faixa }: { todas: Venda[]; faixa: [Date, Date] | null }) {
  const [busca, setBusca] = useState("");
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const lista = useMemo(() => {
    if (!faixa) return [];
    const [a, b] = [faixa[0].getTime(), faixa[1].getTime()];
    const termo = busca.trim().toLowerCase().replace(/^#/, "");
    return todas
      .filter((v) => {
        const t = new Date(v.criadaEm).getTime();
        return t >= a && t < b;
      })
      .filter(
        (v) =>
          !termo ||
          String(v.numero) === termo ||
          v.comandaNome.toLowerCase().includes(termo) ||
          v.itens.some((i) => i.nome.toLowerCase().includes(termo)),
      )
      .reverse();
  }, [todas, faixa, busca]);

  const venda = todas.find((v) => v.id === abertaId) ?? null;
  const canceladas = lista.filter((v) => v.canceladaEm).length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex h-11 min-w-48 flex-1 items-center gap-2 rounded-[14px] bg-sunk px-3 ring-1 ring-line transition-shadow duration-150 focus-within:ring-2 focus-within:ring-accent sm:max-w-xs">
          <MagnifyingGlass size={18} className="text-muted" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Número, mesa ou produto"
            aria-label="Buscar venda"
            className="h-full w-full bg-transparent text-base text-ink outline-none placeholder:text-muted md:text-sm"
          />
        </label>
        <p className="num text-[15px] text-body">
          {lista.length} {lista.length === 1 ? "venda" : "vendas"}
          {canceladas > 0 && ` · ${canceladas} ${canceladas === 1 ? "cancelada" : "canceladas"}`}
        </p>
      </div>

      {lista.length === 0 ? (
        <div className="mt-4">
          <Vazio>{busca ? "Nenhuma venda encontrada" : undefined}</Vazio>
        </div>
      ) : (
        <Cartao className="entra mt-4 overflow-hidden">
          <ul className="divide-y divide-line">
            {lista.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmando(false);
                    setAbertaId(v.id);
                  }}
                  className="flex w-full items-center gap-4 px-5 py-3 text-left transition-colors duration-150 hover:bg-sunk active:bg-sunk"
                >
                  <span className="num w-10 shrink-0 font-mono text-[13px] text-muted">#{v.numero}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[15px] ${v.canceladaEm ? "text-muted line-through" : "text-ink"}`}>
                      {v.comandaNome}
                    </span>
                    <span className="num block truncate text-[13px] text-muted">
                      {formatoDataHora.format(new Date(v.criadaEm))} · {v.pagamentos.map((p) => p.formaNome).join(" + ")}
                    </span>
                  </span>
                  {v.canceladaEm && <Etiqueta nivel="baixa">cancelada</Etiqueta>}
                  <span className={`num text-[15px] font-medium ${v.canceladaEm ? "text-muted line-through" : "text-ink"}`}>
                    {reais(v.total)}
                  </span>
                  <CaretRight size={14} className="text-muted" />
                </button>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      <Janela
        aberta={!!venda}
        aoFechar={() => setAbertaId(null)}
        titulo={venda ? `Venda nº ${venda.numero}` : "Venda"}
        rodape={
          venda &&
          (venda.canceladaEm ? (
            <Botao className="h-12 w-full" onClick={() => restaurarVenda(venda.id)}>
              Desfazer cancelamento
            </Botao>
          ) : confirmando ? (
            <div className="aparece flex gap-2">
              <Botao className="h-12 flex-1" onClick={() => setConfirmando(false)}>
                Manter
              </Botao>
              <Botao
                variante="perigo"
                className="h-12 flex-1"
                onClick={() => {
                  cancelarVenda(venda.id);
                  setConfirmando(false);
                }}
              >
                Cancelar venda
              </Botao>
            </div>
          ) : (
            <Botao variante="perigo" className="h-12 w-full" onClick={() => setConfirmando(true)}>
              Cancelar venda
            </Botao>
          ))
        }
      >
        {venda && (
          <div className="num text-[15px]">
            <p className="text-body">
              {venda.comandaNome} · {formatoDataHora.format(new Date(venda.criadaEm))}
            </p>
            {venda.canceladaEm && (
              <p className="mt-3 rounded-[14px] bg-red-soft px-4 py-3 text-red-ink">
                Cancelada em {formatoDataHora.format(new Date(venda.canceladaEm))}. Não entra nos relatórios
              </p>
            )}
            {confirmando && (
              <p className="aparece mt-3 rounded-[14px] bg-yellow-soft px-4 py-3 text-yellow-ink">
                A venda continua no histórico, riscada, e sai das contas de vendas e lucro
              </p>
            )}
            <ul className="mt-4 divide-y divide-line rounded-[16px] bg-sunk px-4 ring-1 ring-line">
              {venda.itens.map((i) => (
                <li key={i.produtoId} className="flex justify-between gap-3 py-3">
                  <span className="min-w-0 text-ink">
                    {i.qtd}× {i.nome}
                  </span>
                  <span className="shrink-0 text-body">{reais(i.preco * i.qtd)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-1 text-body">
              {venda.desconto > 0 && (
                <div className="flex justify-between">
                  <dt>Desconto</dt>
                  <dd>− {reais(venda.desconto)}</dd>
                </div>
              )}
              {venda.acrescimo > 0 && (
                <div className="flex justify-between">
                  <dt>Acréscimo</dt>
                  <dd>+ {reais(venda.acrescimo)}</dd>
                </div>
              )}
              <div className="flex items-baseline justify-between text-ink">
                <dt className="text-[17px] font-medium">Total</dt>
                <dd className="text-2xl font-semibold tracking-tight">{reais(venda.total)}</dd>
              </div>
              {venda.pagamentos.map((p, i) => (
                <div key={i} className="flex justify-between">
                  <dt>{p.formaNome}</dt>
                  <dd>{reais(p.valor)}</dd>
                </div>
              ))}
              {venda.troco > 0 && (
                <div className="flex justify-between">
                  <dt>Troco</dt>
                  <dd>{reais(venda.troco)}</dd>
                </div>
              )}
              {taxasDaVenda(venda) > 0 && (
                <div className="flex justify-between text-muted">
                  <dt>Taxa da maquininha</dt>
                  <dd>{reais(taxasDaVenda(venda))}</dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </Janela>
    </>
  );
}
