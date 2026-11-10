"use client";

import { Minus, Plus, Trash } from "@phosphor-icons/react";
import { reais } from "@/lib/dinheiro";
import { subtotal, totalComanda } from "@/lib/calculos";
import { mudarQtd } from "@/lib/loja";
import type { Comanda } from "@/lib/tipos";
import { Botao, NumeroAnimado } from "@/components/ui";

export function PainelComanda({
  comanda,
  aoDesconto,
  aoAcrescimo,
  aoEsvaziar,
  aoCobrar,
}: {
  comanda: Comanda;
  aoDesconto: () => void;
  aoAcrescimo: () => void;
  aoEsvaziar: () => void;
  aoCobrar: () => void;
}) {
  const vazio = comanda.itens.length === 0;
  const total = totalComanda(comanda);

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {vazio ? (
          <p className="px-1 py-10 text-center text-[15px] text-muted">Toque nos produtos para adicionar</p>
        ) : (
          <ul className="divide-y divide-line">
            {comanda.itens.map((i) => (
              <li key={i.produtoId} className="aparece flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-ink">{i.nome}</p>
                  <p className="num text-[13px] text-muted">{reais(i.preco)} cada</p>
                </div>
                <div className="vidro-leve flex items-center rounded-full">
                  <button
                    type="button"
                    onClick={() => mudarQtd(comanda.id, i.produtoId, i.qtd - 1)}
                    className="aperta flex h-9 w-9 items-center justify-center rounded-full text-body hover:text-ink"
                    aria-label={i.qtd === 1 ? `Tirar ${i.nome}` : `Tirar um ${i.nome}`}
                  >
                    {i.qtd === 1 ? <Trash size={14} /> : <Minus size={14} weight="bold" />}
                  </button>
                  <span key={i.qtd} className="num estala w-6 text-center text-sm font-medium text-ink">
                    {i.qtd}
                  </span>
                  <button
                    type="button"
                    onClick={() => mudarQtd(comanda.id, i.produtoId, i.qtd + 1)}
                    disabled={i.qtd >= 999}
                    className="aperta flex h-9 w-9 items-center justify-center rounded-full text-body hover:text-ink"
                    aria-label={`Mais um ${i.nome}`}
                  >
                    <Plus size={14} weight="bold" />
                  </button>
                </div>
                <p className="num w-[72px] text-right text-[15px] text-ink">{reais(i.preco * i.qtd)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-line pt-4">
        <dl className="num space-y-1 text-[15px]">
          <div className="flex justify-between text-body">
            <dt>Subtotal</dt>
            <dd>{reais(subtotal(comanda.itens))}</dd>
          </div>
          {comanda.desconto > 0 && (
            <div className="aparece flex justify-between text-red-ink">
              <dt>Desconto</dt>
              <dd>− {reais(comanda.desconto)}</dd>
            </div>
          )}
          {comanda.acrescimo > 0 && (
            <div className="aparece flex justify-between text-body">
              <dt>Acréscimo</dt>
              <dd>+ {reais(comanda.acrescimo)}</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between pt-1">
            <dt className="text-[17px] font-medium text-ink">Total</dt>
            <dd className="text-[28px] leading-none font-semibold tracking-tight text-ink">
              <NumeroAnimado valor={total} formato={reais} />
            </dd>
          </div>
        </dl>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Botao className="h-11 px-2 text-sm" onClick={aoDesconto} disabled={vazio}>
            Desconto
          </Botao>
          <Botao className="h-11 px-2 text-sm" onClick={aoAcrescimo} disabled={vazio}>
            Acréscimo
          </Botao>
          <Botao className="h-11 px-2 text-sm" onClick={aoEsvaziar} disabled={vazio}>
            Esvaziar
          </Botao>
        </div>
        <Botao variante="principal" className="mt-2 h-[52px] w-full text-[17px]" onClick={aoCobrar} disabled={vazio}>
          Cobrar {reais(total)}
        </Botao>
      </div>
    </div>
  );
}
