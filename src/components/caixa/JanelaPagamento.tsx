"use client";

import { useRef, useState } from "react";
import { CaretLeft, X } from "@phosphor-icons/react";
import { reais } from "@/lib/dinheiro";
import { totalComanda } from "@/lib/calculos";
import { nomeComanda } from "@/lib/lugares";
import type { Comanda, FormaPagamento, Pagamento } from "@/lib/tipos";
import { Botao, CampoDinheiro, Janela, NumeroAnimado } from "@/components/ui";

const NOTAS = [500, 1000, 2000, 5000, 10000, 20000];

/** Dinheiro: pergunta quanto o cliente deu, para o troco aparecer na hora. */
type Recebendo = { parte: number; recebido: number | null };

/**
 * Cobrança. Cartão e Pix em dois toques: escolher a forma (o valor já vem com o que falta) e finalizar.
 * Dinheiro pede quanto o cliente deu e mostra o troco. Para dividir, muda o valor antes de tocar na forma.
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
  aoFinalizar: (pagamentos: Pagamento[]) => Promise<void>;
}) {
  const total = totalComanda(comanda);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const pago = pagamentos.reduce((s, p) => s + p.valor, 0);
  const falta = Math.max(0, total - pago);
  const troco = Math.max(0, pago - total);
  const [valor, setValor] = useState<number | null>(total);
  const [recebendo, setRecebendo] = useState<Recebendo | null>(null);
  const quitado = pago >= total;
  const [finalizando, setFinalizando] = useState(false);
  // Ref e não só estado: dois toques seguidos chegam antes do React redesenhar o botão.
  const enviandoRef = useRef(false);

  async function finalizar() {
    if (enviandoRef.current) return;
    enviandoRef.current = true;
    setFinalizando(true);
    try {
      await aoFinalizar(pagamentos);
    } finally {
      enviandoRef.current = false;
      setFinalizando(false);
    }
  }

  function registrar(f: FormaPagamento, v: number) {
    const novos = [...pagamentos, { formaId: f.id, formaNome: f.nome, taxa: f.taxa, valor: v }];
    setPagamentos(novos);
    setValor(Math.max(0, total - novos.reduce((s, p) => s + p.valor, 0)) || null);
  }

  // Valor acima do que falta só pode ser dinheiro: é o que o cliente deu.
  const passou = !!valor && valor > falta;

  function escolher(f: FormaPagamento) {
    if (!valor) return;
    if (f.id === "dinheiro") {
      setRecebendo(passou ? { parte: falta, recebido: valor } : { parte: valor, recebido: null });
      return;
    }
    registrar(f, Math.min(valor, falta));
  }

  function remover(indice: number) {
    const novos = pagamentos.filter((_, i) => i !== indice);
    setPagamentos(novos);
    setValor(Math.max(0, total - novos.reduce((s, p) => s + p.valor, 0)) || null);
  }

  const dinheiro = formas.find((f) => f.id === "dinheiro");
  const r = recebendo;
  // O troco é sobre o que falta da conta: numa conta dividida, o que passar da parte abate o resto.
  const trocoPrevisto = r?.recebido ? r.recebido - falta : 0;

  function confirmarDinheiro() {
    if (!r?.recebido || !dinheiro) return;
    registrar(dinheiro, r.recebido);
    setRecebendo(null);
  }

  return (
    <Janela
      aberta
      aoFechar={aoFechar}
      titulo={`Cobrar ${nomeComanda(comanda)}`}
      rodape={
        r ? (
          <Botao variante="principal" className="h-[52px] w-full text-[17px]" disabled={!r.recebido} onClick={confirmarDinheiro}>
            {!r.recebido
              ? "Quanto o cliente deu?"
              : trocoPrevisto > 0
                ? `Recebi ${reais(r.recebido)} · troco ${reais(trocoPrevisto)}`
                : `Recebi ${reais(r.recebido)}`}
          </Botao>
        ) : (
          <Botao variante="principal" className="h-[52px] w-full text-[17px]" disabled={!quitado || finalizando} onClick={finalizar}>
            {finalizando
              ? "Finalizando"
              : quitado
                ? troco > 0
                  ? `Finalizar e dar ${reais(troco)} de troco`
                  : "Finalizar venda"
                : `Falta ${reais(falta)}`}
          </Botao>
        )
      }
    >
      {r ? (
        <div className="aparece">
          <button
            type="button"
            onClick={() => setRecebendo(null)}
            className="aperta -mt-1 -ml-2 flex h-10 items-center gap-1 pr-3 text-[15px] font-medium text-ink"
          >
            <CaretLeft size={18} weight="bold" className="text-accent" />
            Outra forma
          </button>
          <div className="num mt-2 flex items-baseline justify-between">
            <span className="text-[15px] text-body">A pagar em dinheiro</span>
            <span className="text-4xl leading-none font-semibold tracking-tight text-ink">{reais(r.parte)}</span>
          </div>

          <div className="mt-5 space-y-3">
            <CampoDinheiro
              rotulo="Quanto o cliente deu?"
              valor={r.recebido}
              aoMudar={(v) => setRecebendo({ ...r, recebido: v })}
              autoFocus
            />
            <div className="grid grid-cols-4 gap-2">
              <Botao className="h-11 rounded-full px-2 text-sm" onClick={() => setRecebendo({ ...r, recebido: r.parte })}>
                Exato
              </Botao>
              {NOTAS.filter((n) => n > r.parte)
                .slice(0, 3)
                .map((n) => (
                  <Botao key={n} className="num h-11 rounded-full px-2 text-sm" onClick={() => setRecebendo({ ...r, recebido: n })}>
                    {reais(n).replace(",00", "")}
                  </Botao>
                ))}
            </div>
          </div>

          <div aria-live="polite" className="mt-4">
            {r.recebido !== null && trocoPrevisto > 0 && (
              <div className="num estala flex items-baseline justify-between rounded-[16px] bg-green-soft px-4 py-4 text-green-ink">
                <span className="text-[17px] font-medium">Troco</span>
                <span className="text-3xl leading-none font-semibold tracking-tight">{reais(trocoPrevisto)}</span>
              </div>
            )}
            {r.recebido !== null && r.recebido > 0 && trocoPrevisto === 0 && (
              <p className="num rounded-[14px] bg-sunk px-4 py-3 text-[15px] text-body">Sem troco</p>
            )}
            {r.recebido !== null && r.recebido > 0 && trocoPrevisto < 0 && (
              <p className="num rounded-[14px] bg-sunk px-4 py-3 text-[15px] text-body">
                Depois, faltam {reais(-trocoPrevisto)} em outra forma
              </p>
            )}
          </div>
        </div>
      ) : (
        <>
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
                  <span className="text-body">
                    {p.formaNome}
                    {p.formaId === "dinheiro" && p.valor > 0 && " recebido"}
                  </span>
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
            <div className="num estala mt-3 flex items-baseline justify-between rounded-[16px] bg-green-soft px-4 py-4 text-green-ink">
              <span className="text-[17px] font-medium">Troco</span>
              <span className="text-3xl leading-none font-semibold tracking-tight">{reais(troco)}</span>
            </div>
          )}

          {!quitado && (
            <div className="mt-5 space-y-3">
              <CampoDinheiro
                rotulo={pagamentos.length ? "Valor do próximo pagamento" : "Valor a cobrar"}
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
              <div className="grid grid-cols-2 gap-2 pt-1">
                {formas.map((f) => (
                  <Botao
                    key={f.id}
                    className="h-14 text-[17px]"
                    disabled={!valor || (passou && f.id !== "dinheiro")}
                    onClick={() => escolher(f)}
                  >
                    {f.nome}
                  </Botao>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Janela>
  );
}
