"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { numeroReais, reais } from "@/lib/dinheiro";
import { EMPRESA } from "@/lib/empresa";
import type { ItemPedido, Pagamento } from "@/lib/tipos";

/*
 * Cupom para a impressora térmica (bobina de 80 mm, como a Epson TM-T20X).
 * Na hora de imprimir, o cupom é montado num elemento direto do <body> (#impressao) e o
 * CSS de impressão (globals.css) esconde todo o resto da página.
 */

/** O que só o pedido de delivery tem: para quem vai, como paga e quando saiu. */
export interface EntregaRecibo {
  telefone: string;
  /** true = o cliente busca na loja. */
  retirada: boolean;
  endereco: string;
  complemento: string;
  /** "Bairro · CEP 00000-000", pronto para imprimir. */
  regiao: string;
  /** Como o cliente vai pagar na entrega ("Dinheiro", "Pix"...). */
  pagamento: string;
  /** Só em dinheiro: com quanto o cliente vai pagar, e o troco que o entregador leva. */
  trocoPara: number | null;
  trocoLevar: number;
  observacao: string;
  /** Quando o pedido saiu para entrega, se já saiu. */
  saiuEm: string | null;
}

export interface DadosRecibo {
  /** "Resumo da conta" (comanda aberta), "Comprovante de venda" (venda fechada) ou pedido de delivery. */
  tipo: "conta" | "venda" | "delivery";
  /** "Mesa 3", "Balcão 1"... */
  lugar: string;
  cliente: string;
  itens: Pick<ItemPedido, "produtoId" | "nome" | "preco" | "qtd">[];
  subtotal: number;
  desconto: number;
  acrescimo: number;
  total: number;
  /** Só na venda fechada. */
  numero?: number;
  pagamentos?: Pick<Pagamento, "formaNome" | "valor">[];
  troco?: number;
  /** Quando a conta abriu, a venda foi feita ou o pedido chegou. */
  desde?: string;
  /** Taxa de entrega do delivery (fora do subtotal, dentro do total). */
  taxaEntrega?: number;
  entrega?: EntregaRecibo;
}

const formatoDataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const formatoHora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** "17/11/2026 - 16:14:14", como no cupom antigo. */
const dataHora = (d: Date) => formatoDataHora.format(d).replace(", ", " - ");

const TITULO = { conta: "Resumo da conta", venda: "Comprovante de venda", delivery: "Pedido delivery" };

function Recibo({ dados, impressoEm }: { dados: DadosRecibo; impressoEm: Date }) {
  const venda = dados.tipo === "venda";
  const e = dados.entrega;
  const titulo = e?.retirada ? "Pedido para retirar" : TITULO[dados.tipo];
  return (
    <div className="recibo">
      <p className="recibo-centro recibo-forte recibo-grande">{EMPRESA.nome}</p>
      <p className="recibo-centro">CNPJ: {EMPRESA.cnpj}</p>
      <p className={`recibo-centro recibo-forte ${e ? "recibo-grande" : ""}`}>
        {titulo}
        {dados.numero !== undefined && ` nº ${dados.numero}`}
      </p>

      <hr />
      {e ? (
        <>
          <p className="recibo-forte">Cliente: {dados.cliente}</p>
          <p>Tel: {e.telefone}</p>
          {e.retirada ? (
            <p className="recibo-forte">Retirada na loja</p>
          ) : (
            <>
              <p className="recibo-forte">
                Entrega: {e.endereco}
                {e.complemento && ` · ${e.complemento}`}
              </p>
              {e.regiao && <p>{e.regiao}</p>}
            </>
          )}
        </>
      ) : (
        <>
          <p className="recibo-centro recibo-forte">
            {dados.lugar}
            {dados.desde && ` · ${venda ? "" : "aberta às "}${venda ? dataHora(new Date(dados.desde)) : formatoHora.format(new Date(dados.desde))}`}
          </p>
          <p className="recibo-centro recibo-forte">Cliente: {dados.cliente || "Consumidor não identificado"}</p>
        </>
      )}

      <hr />
      <table>
        <thead>
          <tr>
            <th className="recibo-qtd">Qtd</th>
            <th>Itens</th>
            <th className="recibo-valor">Total</th>
          </tr>
        </thead>
        <tbody>
          {dados.itens.map((i) => (
            <tr key={i.produtoId}>
              <td className="recibo-qtd">{i.qtd}</td>
              <td>
                {i.nome}
                {i.qtd > 1 && <span className="recibo-unitario">{`${i.qtd} x ${numeroReais(i.preco)}`}</span>}
              </td>
              <td className="recibo-valor">{numeroReais(i.preco * i.qtd)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <hr />
      <dl>
        <div>
          <dt>Subtotal:</dt>
          <dd>{reais(dados.subtotal)}</dd>
        </div>
        {dados.desconto > 0 && (
          <div>
            <dt>Desconto:</dt>
            <dd>- {reais(dados.desconto)}</dd>
          </div>
        )}
        {dados.acrescimo > 0 && (
          <div>
            <dt>Acréscimo:</dt>
            <dd>+ {reais(dados.acrescimo)}</dd>
          </div>
        )}
        {!!dados.taxaEntrega && (
          <div>
            <dt>Taxa de entrega:</dt>
            <dd>+ {reais(dados.taxaEntrega)}</dd>
          </div>
        )}
        <div className="recibo-forte recibo-grande">
          <dt>{venda ? "Total:" : "Valor a pagar:"}</dt>
          <dd>{reais(dados.total)}</dd>
        </div>
        {dados.pagamentos?.map((p, i) => (
          <div key={i}>
            <dt>{p.formaNome}:</dt>
            <dd>{reais(p.valor)}</dd>
          </div>
        ))}
        {!!dados.troco && (
          <div>
            <dt>Troco:</dt>
            <dd>{reais(dados.troco)}</dd>
          </div>
        )}
      </dl>

      {e && (
        <>
          <hr />
          <p className="recibo-forte">
            Pagamento: {e.pagamento}
            {!e.retirada && " na entrega"}
          </p>
          {e.trocoPara !== null && (
            <dl>
              <div>
                <dt>Troco para:</dt>
                <dd>{reais(e.trocoPara)}</dd>
              </div>
              <div className="recibo-forte">
                <dt>Levar de troco:</dt>
                <dd>{reais(e.trocoLevar)}</dd>
              </div>
            </dl>
          )}
          {e.observacao && (
            <>
              <hr />
              <p className="recibo-forte">Obs: {e.observacao}</p>
            </>
          )}
          <hr />
          <p>Pedido às {formatoHora.format(new Date(dados.desde ?? impressoEm))}</p>
          {e.saiuEm && <p>Saiu para entrega às {formatoHora.format(new Date(e.saiuEm))}</p>}
        </>
      )}

      <hr />
      <p className="recibo-centro recibo-forte">* Documento sem valor fiscal *</p>
      <hr />
      <p className="recibo-centro">Data e hora: {dataHora(impressoEm)}</p>
      <p className="recibo-centro recibo-forte">Obrigado pela preferência. Volte sempre!</p>
    </div>
  );
}

/**
 * Impressão do cupom. Devolve a função que imprime e o elemento que precisa estar na tela
 * (pode ficar em qualquer lugar: ele vai para o <body> por portal).
 */
export function useImpressao() {
  const [pedido, setPedido] = useState<{ dados: DadosRecibo; em: Date } | null>(null);

  useEffect(() => {
    if (!pedido) return;
    /*
     * O tamanho do papel fica com a impressora. Pedir uma página do tamanho do cupom não adianta:
     * a Epson usa o papel do driver (80 x 297 mm) e o Chrome centraliza o cupom nele, com sobra
     * em cima e embaixo. Para não sobrar papel no fim, liga-se a redução de papel no driver.
     */
    const terminar = () => setPedido(null);
    window.addEventListener("afterprint", terminar, { once: true });
    // Um quadro de folga para o navegador desenhar o cupom antes de abrir a impressão.
    const quadro = requestAnimationFrame(() => window.print());
    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener("afterprint", terminar);
    };
  }, [pedido]);

  return {
    imprimir: (dados: DadosRecibo) => setPedido({ dados, em: new Date() }),
    elemento: pedido
      ? createPortal(
          <div id="impressao">
            <Recibo dados={pedido.dados} impressoEm={pedido.em} />
          </div>,
          document.body,
        )
      : null,
  };
}
