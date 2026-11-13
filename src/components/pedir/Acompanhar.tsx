"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Check } from "@phosphor-icons/react";
import { reais } from "@/lib/dinheiro";
import { NOME_PAGAMENTO, acompanharPedido, trocoALevar, type Acompanhamento } from "@/lib/delivery";
import type { SituacaoPedido } from "@/lib/tipos";
import { Cartao } from "@/components/ui";

const formatoHora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const FINAIS: SituacaoPedido[] = ["entregue", "recusado"];

/** Passos que o cliente vê. Na retirada, "saiu para entrega" vira "pronto para retirar". */
function passos(retirada: boolean): { situacao: SituacaoPedido; nome: string; texto: string }[] {
  return [
    { situacao: "novo", nome: "Recebido", texto: "A adega recebeu seu pedido e vai confirmar em instantes" },
    { situacao: "aceito", nome: "Confirmado", texto: retirada ? "Estamos separando. Pode vir buscar" : "Estamos separando seu pedido" },
    ...(retirada ? [] : [{ situacao: "saiu" as const, nome: "Saiu para entrega", texto: "O entregador está a caminho" }]),
    { situacao: "entregue", nome: retirada ? "Retirado" : "Entregue", texto: "Obrigado pela preferência!" },
  ];
}

export function Acompanhar({ token }: { token: string }) {
  // undefined = carregando, null = não existe, "rede" = sem internet
  const [pedido, setPedido] = useState<Acompanhamento | null | undefined | "rede">(undefined);

  useEffect(() => {
    let vivo = true;
    let t: ReturnType<typeof setTimeout>;
    async function olhar() {
      const r = await acompanharPedido(token);
      if (!vivo) return;
      setPedido((antes) => (r === undefined ? (antes && antes !== "rede" ? antes : "rede") : r));
      // Atualiza sozinho a cada 10 s até o pedido terminar.
      if (r === undefined || (r && !FINAIS.includes(r.situacao))) t = setTimeout(olhar, 10_000);
    }
    void olhar();
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [token]);

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-16">
      <header className="flex items-center gap-3">
        <Image src="/logo-p.webp" alt="Adega do Pezão" width={240} height={217} priority className="h-auto w-14" />
        <p className="text-xl font-semibold tracking-tight text-ink">Adega do Pezão</p>
      </header>

      {pedido === undefined && <div className="mt-8 h-64 animate-pulse rounded-[20px] bg-sunk" />}
      {pedido === "rede" && <p className="mt-10 text-center text-[15px] text-body">Sem internet. Tentando de novo...</p>}
      {pedido === null && (
        <div className="mt-10 text-center">
          <p className="text-[17px] font-medium text-ink">Pedido não encontrado</p>
          <Link href="/pedir" className="mt-4 inline-block text-[15px] text-accent">
            Ver o cardápio
          </Link>
        </div>
      )}
      {pedido && pedido !== "rede" && <Detalhe pedido={pedido} />}
    </div>
  );
}

function Detalhe({ pedido }: { pedido: Acompanhamento }) {
  const lista = passos(pedido.retirada);
  const atual = lista.findIndex((p) => p.situacao === pedido.situacao);
  const troco = pedido.pagamento === "dinheiro" ? trocoALevar(pedido.total, pedido.trocoPara) : 0;

  return (
    <>
      <h1 className="num mt-8 text-[28px] leading-tight font-semibold tracking-tight text-ink">Pedido nº {pedido.numero}</h1>
      <p className="num mt-1 text-[15px] text-body">Feito às {formatoHora.format(new Date(pedido.criadoEm))}</p>

      {pedido.situacao === "recusado" ? (
        <div className="entra mt-6 rounded-[20px] bg-red-soft px-5 py-4">
          <p className="text-[17px] font-semibold text-red-ink">A adega não pôde aceitar este pedido</p>
          {pedido.motivo && <p className="mt-1 text-[15px] text-red-ink">{pedido.motivo}</p>}
        </div>
      ) : (
        <Cartao className="entra mt-6 p-5">
          <ol className="space-y-5" aria-label="Situação do pedido">
            {lista.map((p, i) => {
              const feito = i < atual || (i === atual && p.situacao === "entregue");
              const agora = i === atual && !feito;
              return (
                <li key={p.situacao} className="flex gap-3" aria-current={agora ? "step" : undefined}>
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                      feito ? "bg-green-ink text-canvas" : agora ? "bg-accent text-accent-ink" : "bg-white/10"
                    }`}
                  >
                    {feito && <Check size={14} weight="bold" />}
                    {agora && <span className="h-2 w-2 rounded-full bg-accent-ink" />}
                  </span>
                  <span>
                    <span className={`block text-[15px] font-medium ${i <= atual ? "text-ink" : "text-muted"}`}>{p.nome}</span>
                    {i === atual && <span className="block text-[13px] text-body">{p.texto}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
          {!FINAIS.includes(pedido.situacao) && <p className="mt-5 text-[13px] text-muted">Esta página se atualiza sozinha.</p>}
        </Cartao>
      )}

      <Cartao className="mt-3 p-5">
        <ul className="num space-y-1 text-[15px]">
          {pedido.itens.map((i) => (
            <li key={i.produtoId} className="flex justify-between gap-3">
              <span className="min-w-0 text-ink">
                {i.qtd}× {i.nome}
              </span>
              <span className="shrink-0 text-body">{reais(i.preco * i.qtd)}</span>
            </li>
          ))}
        </ul>
        <dl className="num mt-4 space-y-1 border-t border-line pt-3 text-[15px] text-body">
          {!pedido.retirada && (
            <div className="flex justify-between">
              <dt>Entrega · {pedido.bairro}</dt>
              <dd>{pedido.taxa > 0 ? reais(pedido.taxa) : "grátis"}</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between text-ink">
            <dt className="text-[17px] font-medium">Total</dt>
            <dd className="text-xl font-semibold">{reais(pedido.total)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Pagamento</dt>
            <dd>
              {NOME_PAGAMENTO[pedido.pagamento]}
              {troco > 0 && ` · troco de ${reais(troco)}`}
            </dd>
          </div>
          {pedido.retirada && (
            <div className="flex justify-between">
              <dt>Retirada</dt>
              <dd>na loja</dd>
            </div>
          )}
        </dl>
      </Cartao>

      {FINAIS.includes(pedido.situacao) && (
        <Link
          href="/pedir"
          data-luz=""
          className="vidro-ambar aperta mt-6 flex h-12 w-full items-center justify-center rounded-[14px] text-[15px] font-semibold"
        >
          Fazer outro pedido
        </Link>
      )}
      {!FINAIS.includes(pedido.situacao) && (
        <Link href="/pedir" className="mt-6 block text-center text-[15px] text-accent">
          Voltar ao cardápio
        </Link>
      )}
    </>
  );
}
