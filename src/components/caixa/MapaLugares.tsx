"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { reais } from "@/lib/dinheiro";
import { qtdItens, totalComanda } from "@/lib/calculos";
import { NOME_TIPO, NOME_TIPO_PLURAL, idLugar, tempoDesde } from "@/lib/lugares";
import { definirAba, useLoja } from "@/lib/loja";
import type { Comanda, TipoLugar } from "@/lib/tipos";
import { Cabecalho, NumeroAnimado, Segmentado, useAgora } from "@/components/ui";

const ABAS: TipoLugar[] = ["mesa", "balcao"];

/** Tela inicial do caixa: todas as mesas e balcões, livres ou em atendimento. */
export function MapaLugares() {
  const loja = useLoja();
  const agora = useAgora();
  const aba = loja.abaCaixa;
  const [busca, setBusca] = useState("");

  const porId = useMemo(() => new Map(loja.comandas.map((c) => [c.id, c])), [loja.comandas]);

  const lugares = useMemo(() => {
    const qtd = aba === "mesa" ? loja.mesas : loja.balcoes;
    const numeros = new Set(Array.from({ length: qtd }, (_, i) => i + 1));
    // Uma comanda aberta continua aparecendo mesmo se a quantidade foi reduzida nos ajustes.
    loja.comandas.filter((c) => c.tipo === aba).forEach((c) => numeros.add(c.numero));
    const termo = busca.trim().toLowerCase();
    return [...numeros]
      .sort((a, b) => a - b)
      .map((n) => ({ numero: n, id: idLugar(aba, n), comanda: porId.get(idLugar(aba, n)) }))
      .filter(
        ({ numero, comanda }) => !termo || String(numero) === termo || comanda?.cliente.toLowerCase().includes(termo),
      );
  }, [aba, loja.mesas, loja.balcoes, loja.comandas, porId, busca]);

  const abertas = (tipo: TipoLugar) => loja.comandas.filter((c) => c.tipo === tipo).length;
  const emAberto = loja.comandas.reduce((s, c) => s + totalComanda(c), 0);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-10 md:px-8">
      <Cabecalho
        titulo="Caixa"
        subtitulo={
          loja.comandas.length === 0 ? (
            "Tudo livre. Toque em uma mesa ou balcão para vender"
          ) : (
            <>
              {loja.comandas.length} em atendimento · <NumeroAnimado valor={emAberto} formato={reais} /> em aberto
            </>
          )
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Segmentado
          rotulo="Mesas ou balcões"
          className="sm:w-80"
          valor={aba}
          aoMudar={definirAba}
          opcoes={ABAS.map((t) => ({
            id: t,
            nome: (
              <>
                {NOME_TIPO_PLURAL[t]}
                {abertas(t) > 0 && (
                  <span className="num rounded-full bg-accent px-1.5 text-[11px] leading-4 font-semibold text-accent-ink">
                    {abertas(t)}
                  </span>
                )}
              </>
            ),
          }))}
        />
        <label className="flex h-11 shrink-0 items-center gap-2 sm:flex-1 rounded-[14px] bg-sunk px-3 ring-1 ring-line transition-shadow duration-150 focus-within:ring-2 focus-within:ring-accent sm:max-w-xs">
          <MagnifyingGlass size={18} className="text-muted" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Número ou cliente"
            aria-label={`Buscar ${NOME_TIPO[aba].toLowerCase()}`}
            className="h-full w-full bg-transparent text-base text-ink outline-none placeholder:text-muted md:text-sm"
          />
        </label>
      </div>

      {lugares.length === 0 ? (
        <p className="mt-6 rounded-[20px] px-4 py-12 text-center text-[15px] text-muted ring-1 ring-line">
          {busca
            ? "Nada encontrado"
            : `Nenhum ${NOME_TIPO[aba].toLowerCase()} cadastrado. Mude a quantidade em Ajustes`}
        </p>
      ) : (
        // A chave refaz a entrada quando troca de aba
        <ul key={aba} className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {lugares.map(({ numero, id, comanda }, i) => (
            <li key={id} className="entra" style={{ "--i": i } as React.CSSProperties}>
              <CartaoLugar tipo={aba} numero={numero} id={id} comanda={comanda} agora={agora} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CartaoLugar({
  tipo,
  numero,
  id,
  comanda,
  agora,
}: {
  tipo: TipoLugar;
  numero: number;
  id: string;
  comanda: Comanda | undefined;
  agora: Date | null;
}) {
  const ocupado = !!comanda && comanda.itens.length > 0;
  return (
    <Link
      href={`/caixa?c=${id}`}
      aria-label={`${NOME_TIPO[tipo]} ${numero}, ${ocupado ? "em atendimento" : "livre"}`}
      className={`aperta flex h-full min-h-32 flex-col rounded-[20px] p-4 ring-1 ${
        ocupado ? "bg-sunk ring-accent/45" : "bg-surface ring-line hover:bg-sunk"
      }`}
    >
      <p className="flex items-center gap-2 text-[13px]">
        {/* O ponto âmbar é o sinal de "em atendimento" no app inteiro */}
        <span className={`h-2 w-2 rounded-full ${ocupado ? "bg-accent" : "bg-white/15"}`} />
        <span className={ocupado ? "text-yellow-ink" : "text-muted"}>{ocupado ? "Em atendimento" : "Livre"}</span>
      </p>

      <p className={`num mt-3 flex items-baseline gap-2 ${ocupado ? "text-ink" : "text-body"}`}>
        <span className="text-[15px]">{NOME_TIPO[tipo]}</span>
        <span className="text-[32px] leading-none font-semibold tracking-tight">{numero}</span>
      </p>

      {ocupado && comanda && (
        <div className="mt-auto pt-3">
          {comanda.cliente && <p className="truncate text-sm text-body">{comanda.cliente}</p>}
          <p className="num text-lg leading-tight font-semibold text-ink">{reais(totalComanda(comanda))}</p>
          <p className="num text-[13px] text-muted">
            {qtdItens(comanda.itens)} {qtdItens(comanda.itens) === 1 ? "item" : "itens"} ·{" "}
            {tempoDesde(comanda.abertaEm, agora)}
          </p>
        </div>
      )}
    </Link>
  );
}
