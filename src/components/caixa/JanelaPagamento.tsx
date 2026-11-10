"use client";

import { useState } from "react";
import { X } from "@phosphor-icons/react";
import { reais } from "@/lib/dinheiro";
import { totalComanda } from "@/lib/calculos";
import { nomeComanda } from "@/lib/lugares";
import type { Comanda, FormaPagamento, Pagamento } from "@/lib/tipos";
import { Botao, CampoDinheiro, Janela, NumeroAnimado } from "@/components/ui";

const NOTAS = [1000, 2000, 5000, 10000, 20000];

/**
 * Cobrança. Caso comum em dois toques: escolher a forma (o valor já vem preenchido com o que falta)
 * e finalizar. Para dividir, muda o valor antes de tocar na forma e repete.
 */
export function JanelaPagamento({
  comanda,
  formas,
  aoFechar,
  aoFinalizar,
}: {
  comanda: Comanda;
  formas: FormaPagamento[];
  aoFechar: () => void;
  aoFinalizar: (pagamentos: Pagamento[]) => void;
}) {
  const total = totalComanda(comanda);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const pago = pagamentos.reduce((s, p) => s + p.valor, 0);
  const falta = Math.max(0, total - pago);
  const troco = Math.max(0, pago - total);
  const [valor, setValor] = useState<number | null>(total);
  const quitado = pago >= total;

  // Notas maiores que o que falta: um toque já preenche "recebi 50" e o troco sai sozinho.
  const sugestoes = NOTAS.filter((n) => n > falta).slice(0, 3);
  // Só dinheiro pode passar do que falta, porque vira troco.
  const passou = !!valor && valor > falta;

  function adicionar(f: FormaPagamento) {
    if (!valor) return;
    const v = f.id === "dinheiro" ? valor : Math.min(valor, falta);
    if (v <= 0) return;
    const novos = [...pagamentos, { formaId: f.id, formaNome: f.nome, taxa: f.taxa, valor: v }];
    setPagamentos(novos);
    setValor(Math.max(0, total - novos.reduce((s, p) => s + p.valor, 0)) || null);
  }

  function remover(indice: number) {
    const novos = pagamentos.filter((_, i) => i !== indice);
    setPagamentos(novos);
    setValor(Math.max(0, total - novos.reduce((s, p) => s + p.valor, 0)) || null);
  }

  return (
    <Janela
      aberta
      aoFechar={aoFechar}
      titulo={`Cobrar ${nomeComanda(comanda)}`}
      rodape={
        <Botao
          variante="principal"
          className="h-[52px] w-full text-[17px]"
          disabled={!quitado}
          onClick={() => aoFinalizar(pagamentos)}
        >
          {quitado ? (troco > 0 ? `Finalizar e dar ${reais(troco)} de troco` : "Finalizar venda") : `Falta ${reais(falta)}`}
        </Botao>
      }
    >
      <div className="num flex items-baseline justify-between">
        <span className="text-[15px] text-body">{quitado ? "Pago" : pagamentos.length ? "Falta pagar" : "Total"}</span>
        <NumeroAnimado
          valor={quitado ? total : pagamentos.length ? falta : total}
          formato={reais}
          className="text-4xl leading-none font-semibold tracking-tight text-ink"
        />
      </div>

      {pagamentos.length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-[16px] bg-sunk ring-1 ring-line">
          {pagamentos.map((p, i) => (
            <li key={i} className="num aparece flex items-center justify-between py-2 pr-2 pl-4 text-[15px]">
              <span className="text-body">{p.formaNome}</span>
              <span className="flex items-center gap-1 text-ink">
                {reais(p.valor)}
                <button
                  type="button"
                  onClick={() => remover(i)}
                  className="aperta flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-white/8 hover:text-ink"
                  aria-label={`Remover pagamento em ${p.formaNome}`}
                >
                  <X size={14} weight="bold" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {troco > 0 && (
        <p className="num estala mt-3 origin-left rounded-[14px] bg-green-soft px-4 py-3 text-[15px] font-medium text-green-ink">
          Troco de {reais(troco)}
        </p>
      )}

      {!quitado && (
        <div className="mt-5 space-y-3">
          <CampoDinheiro
            rotulo={pagamentos.length ? "Valor do próximo pagamento" : "Valor recebido"}
            valor={valor}
            aoMudar={setValor}
            dica={
              passou
                ? "Acima do que falta: só vale em dinheiro, e a diferença vira troco"
                : pagamentos.length
                  ? undefined
                  : "Para dividir a conta, mude o valor antes de escolher a forma"
            }
          />
          {sugestoes.length > 0 && (
            <div className="flex gap-2">
              <Botao className="h-9 flex-1 rounded-full px-2 text-sm" onClick={() => setValor(falta)}>
                Exato
              </Botao>
              {sugestoes.map((n) => (
                <Botao key={n} className="num h-9 flex-1 rounded-full px-2 text-sm" onClick={() => setValor(n)}>
                  {reais(n).replace(",00", "")}
                </Botao>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 pt-1">
            {formas.map((f) => (
              <Botao
                key={f.id}
                className="h-14 text-[17px]"
                disabled={!valor || (passou && f.id !== "dinheiro")}
                onClick={() => adicionar(f)}
              >
                {f.nome}
              </Botao>
            ))}
          </div>
        </div>
      )}
    </Janela>
  );
}
