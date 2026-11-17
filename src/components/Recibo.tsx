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

export interface DadosRecibo {
  /** "Resumo da conta" (comanda aberta) ou "Comprovante de venda" (venda fechada). */
  tipo: "conta" | "venda";
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
  /** Quando a conta abriu, ou quando a venda foi feita. */
  desde?: string;
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

function Recibo({ dados, impressoEm }: { dados: DadosRecibo; impressoEm: Date }) {
  const venda = dados.tipo === "venda";
  return (
    <div className="recibo">
      <p className="recibo-centro recibo-forte recibo-grande">{EMPRESA.nome}</p>
      <p className="recibo-centro">CNPJ: {EMPRESA.cnpj}</p>
      <p className="recibo-centro recibo-forte">{venda ? `Comprovante de venda nº ${dados.numero}` : "Resumo da conta"}</p>

      <hr />
      <p className="recibo-centro recibo-forte">
        {dados.lugar}
        {dados.desde && ` · ${venda ? "" : "aberta às "}${venda ? dataHora(new Date(dados.desde)) : formatoHora.format(new Date(dados.desde))}`}
      </p>
      <p className="recibo-centro recibo-forte">Cliente: {dados.cliente || "Consumidor não identificado"}</p>

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
    const el = document.getElementById("impressao");
    if (!el) return;
    // A página de impressão tem o tamanho exato do cupom: a bobina não sai com papel em branco no fim.
    const alturaMm = Math.ceil((el.scrollHeight * 25.4) / 96) + 4;
    const estilo = document.createElement("style");
    estilo.textContent = `@page { size: 80mm ${alturaMm}mm; margin: 0; }`;
    document.head.appendChild(estilo);
    const terminar = () => setPedido(null);
    window.addEventListener("afterprint", terminar, { once: true });
    // Um quadro de folga para o navegador desenhar o cupom antes de abrir a impressão.
    const quadro = requestAnimationFrame(() => window.print());
    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener("afterprint", terminar);
      estilo.remove();
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
