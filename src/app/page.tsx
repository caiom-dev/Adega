"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, CaretRight, Warning } from "@phosphor-icons/react";
import { pct, reais } from "@/lib/dinheiro";
import { intervalo, porDia, resumir, totalComanda, vendasNoIntervalo, type Resumo } from "@/lib/calculos";
import { nomeComanda, tempoDesde } from "@/lib/lugares";
import { useLoja } from "@/lib/loja";
import type { Venda } from "@/lib/tipos";
import { Cartao, NumeroAnimado, useAgora } from "@/components/ui";
import { Barras } from "@/components/Graficos";

const formatoData = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });
const formatoHora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const reaisCurto = (v: number) => `R$ ${Math.round(v / 100)}`;

/** Período só com vendas do Yooga: não há lucro para mostrar. */
const soYooga = (r: Resumo) => r.vendasComItens === 0 && r.pedidosSemItens > 0;

function linhaMes(r: Resumo, pronto: boolean) {
  if (!pronto) return "Carregando as vendas";
  if (soYooga(r)) return `No mês: ${reais(r.vendas)} em vendas`;
  return `No mês: ${reais(r.vendas)} em vendas e ${reais(r.lucro)} de lucro${r.margem !== null ? ` (${pct(r.margem)})` : ""}`;
}

/** Diferença para ontem, em texto. Sem base de comparação, não mostra nada. */
function contraOntem(hoje: number, ontem: number, formato: (v: number) => string) {
  if (ontem === 0 && hoje === 0) return undefined;
  if (ontem === 0) return "ontem não teve venda";
  const d = hoje - ontem;
  if (d === 0) return "igual a ontem";
  return `${formato(Math.abs(d))} ${d > 0 ? "a mais" : "a menos"} que ontem`;
}

function Bloco({
  rotulo,
  valor,
  formato,
  detalhe,
  i,
}: {
  rotulo: string;
  /** null mostra "–" (dado ainda carregando ou sem base para calcular). */
  valor: number | null;
  formato: (v: number) => string;
  detalhe?: string;
  i: number;
}) {
  return (
    <Cartao className="entra p-4 md:p-5" style={{ "--i": i } as React.CSSProperties}>
      <p className="text-[13px] text-body">{rotulo}</p>
      {valor === null ? (
        <p className="num mt-2 block text-[28px] leading-none font-semibold tracking-tight text-muted">–</p>
      ) : (
        <NumeroAnimado valor={valor} formato={formato} className="num mt-2 block text-[28px] leading-none font-semibold tracking-tight text-ink" />
      )}
      <p className="num mt-2 min-h-5 text-[13px] text-muted">{detalhe}</p>
    </Cartao>
  );
}

export default function InicioPage() {
  const loja = useLoja();
  const agora = useAgora();
  const pronto = loja.vendasProntas;

  const dados = useMemo(() => {
    if (!agora) return null;
    const semana = intervalo("7dias", agora);
    return {
      hoje: resumir(vendasNoIntervalo(loja.vendas, intervalo("hoje", agora))),
      ontem: resumir(vendasNoIntervalo(loja.vendas, intervalo("ontem", agora))),
      mes: resumir(vendasNoIntervalo(loja.vendas, intervalo("mes", agora))),
      dias: porDia(vendasNoIntervalo(loja.vendas, semana), semana),
    };
  }, [loja.vendas, agora]);

  // As 6 vendas mais recentes que não foram canceladas, da mais nova para a mais antiga.
  const ultimas = useMemo(() => {
    const saida: Venda[] = [];
    for (let i = loja.vendas.length - 1; i >= 0 && saida.length < 6; i--) {
      if (!loja.vendas[i].canceladaEm) saida.push(loja.vendas[i]);
    }
    return saida;
  }, [loja.vendas]);
  const abertas = loja.comandas.filter((c) => c.itens.length > 0);
  const semCusto = loja.produtos.filter((p) => p.ativo && p.custo === null).length;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 md:px-8">
      <header className="pt-seguro">
        {/* No celular não há barra lateral, então a logo abre a tela inicial */}
        <Image src="/logo-p.webp" alt="Adega do Pezão" width={240} height={217} priority className="mx-auto mt-6 h-auto w-32 md:hidden" />
        <div className="flex items-end justify-between gap-4 pt-6 pb-6 md:pt-12">
          <div className="min-w-0">
            <h1 className="text-[32px] leading-[1.1] font-semibold tracking-tight text-ink md:text-4xl">Hoje</h1>
            <p className="mt-2 text-[15px] text-body first-letter:uppercase">{agora ? formatoData.format(agora) : " "}</p>
          </div>
          <Link
            href="/caixa"
            data-luz=""
            className="vidro-ambar aperta inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-5 text-[15px] font-semibold"
          >
            Abrir caixa
            <ArrowRight size={16} weight="bold" />
          </Link>
        </div>
      </header>

      {dados && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Bloco
              i={0}
              rotulo="Vendas"
              valor={pronto ? dados.hoje.vendas : null}
              formato={reais}
              detalhe={pronto ? contraOntem(dados.hoje.vendas, dados.ontem.vendas, reais) : undefined}
            />
            <Bloco
              i={1}
              rotulo="Lucro"
              valor={pronto && !soYooga(dados.hoje) ? dados.hoje.lucro : null}
              formato={reais}
              detalhe={pronto && !soYooga(dados.hoje) && dados.hoje.margem !== null ? `margem de ${pct(dados.hoje.margem)}` : undefined}
            />
            <Bloco
              i={2}
              rotulo="Pedidos"
              valor={pronto ? dados.hoje.pedidos : null}
              formato={String}
              detalhe={pronto ? contraOntem(dados.hoje.pedidos, dados.ontem.pedidos, String) : undefined}
            />
            <Bloco i={3} rotulo="Ticket médio" valor={pronto ? dados.hoje.ticketMedio : null} formato={reais} />
          </div>

          {semCusto > 0 && (
            <Link
              href="/produtos?filtro=sem-custo"
              className="aperta entra mt-3 flex items-center gap-3 rounded-[16px] bg-yellow-soft px-4 py-3 text-[15px] text-yellow-ink"
              style={{ "--i": 4 } as React.CSSProperties}
            >
              <Warning size={20} weight="fill" className="shrink-0" />
              <span className="flex-1">
                {semCusto} {semCusto === 1 ? "produto está" : "produtos estão"} sem custo, então o lucro aparece maior do que é
              </span>
              <CaretRight size={14} weight="bold" />
            </Link>
          )}

          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Cartao className="entra p-5 md:p-6" style={{ "--i": 5 } as React.CSSProperties}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[17px] font-medium text-ink">Vendas dos últimos 7 dias</h2>
                <Link href="/relatorios?r=vendas" className="shrink-0 text-[15px] text-accent">
                  Ver tudo
                </Link>
              </div>
              <p className="num mt-1 mb-8 text-[13px] text-body">{linhaMes(dados.mes, pronto)}</p>
              {pronto ? (
              <Barras
                titulo="Vendas dos últimos 7 dias"
                dados={dados.dias.map((d) => ({
                  rotulo: d.rotulo,
                  nome: d.nome,
                  valor: d.vendas,
                  detalhe: `${d.pedidos} ${d.pedidos === 1 ? "pedido" : "pedidos"}`,
                }))}
                destaque={dados.dias.length - 1}
                formato={reais}
                formatoEixo={reaisCurto}
                altura={220}
              />
              ) : (
                <div className="h-[220px] animate-pulse rounded-[16px] bg-sunk" />
              )}
            </Cartao>

            <Cartao className="entra overflow-hidden" style={{ "--i": 6 } as React.CSSProperties}>
              <h2 className="px-5 pt-5 pb-2 text-[17px] font-medium text-ink">Em atendimento</h2>
              {abertas.length === 0 ? (
                <p className="px-5 pb-5 text-[15px] text-muted">Todas as mesas e balcões estão livres</p>
              ) : (
                <ul className="divide-y divide-line">
                  {abertas.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/caixa?c=${c.id}`}
                        className="num flex items-center gap-3 px-5 py-3 text-[15px] transition-colors duration-150 hover:bg-sunk"
                      >
                        <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-ink">{nomeComanda(c)}</span>
                          <span className="block text-[13px] text-muted">{tempoDesde(c.abertaEm, agora)}</span>
                        </span>
                        <span className="font-medium text-ink">{reais(totalComanda(c))}</span>
                        <CaretRight size={14} className="text-muted" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>
          </div>
        </>
      )}

      <section className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold tracking-tight text-ink">Últimas vendas</h2>
          <Link href="/relatorios?r=historico" className="text-[15px] text-accent">
            Histórico
          </Link>
        </div>
        {!pronto ? (
          <div className="mt-4 h-40 animate-pulse rounded-[20px] bg-sunk" />
        ) : ultimas.length === 0 ? (
          <p className="mt-4 rounded-[20px] px-4 py-10 text-center text-[15px] text-muted ring-1 ring-line">
            As vendas feitas no caixa aparecem aqui
          </p>
        ) : (
          <Cartao className="mt-4 overflow-hidden">
            <ul className="divide-y divide-line">
              {ultimas.map((v) => (
                <li key={v.id} className="flex items-center gap-4 px-5 py-3">
                  <span className="num w-10 shrink-0 font-mono text-[13px] text-muted">#{v.numero}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] text-ink">{v.origem === "yooga" ? "Yooga" : v.comandaNome}</p>
                    <p className="num truncate text-[13px] text-muted">
                      {formatoHora.format(new Date(v.criadaEm))} · {v.pagamentos.map((p) => p.formaNome).join(" + ")}
                    </p>
                  </div>
                  <span className="num text-[15px] font-medium text-ink">{reais(v.total)}</span>
                </li>
              ))}
            </ul>
          </Cartao>
        )}
      </section>
    </div>
  );
}
