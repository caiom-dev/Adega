"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CaretLeft, CaretUp, PencilSimple, UserCircle } from "@phosphor-icons/react";
import { reais } from "@/lib/dinheiro";
import { qtdItens, subtotal, totalComanda } from "@/lib/calculos";
import { lerIdLugar, nomeLugar, tempoDesde } from "@/lib/lugares";
import { adicionarItem, ajustarComanda, definirCliente, esvaziarComanda, finalizarVenda, useLoja } from "@/lib/loja";
import type { Comanda, Venda } from "@/lib/tipos";
import { Botao, CampoDinheiro, CampoTexto, Janela, NumeroAnimado, useAgora } from "@/components/ui";
import { GradeProdutos } from "./GradeProdutos";
import { PainelComanda } from "./PainelComanda";
import { JanelaPagamento } from "./JanelaPagamento";

type Ajuste = "desconto" | "acrescimo";

/** Venda de uma mesa ou balcão: produtos de um lado, comanda do outro. */
export function TelaVenda({ id, aoVender }: { id: string; aoVender: (v: Venda) => void }) {
  const loja = useLoja();
  const agora = useAgora();
  const router = useRouter();
  const lugar = lerIdLugar(id);

  const [pedidoAberto, setPedidoAberto] = useState(false); // só no celular
  const [cobrando, setCobrando] = useState(false);
  const [ajuste, setAjuste] = useState<Ajuste | null>(null);
  const [ultimoAjuste, setUltimoAjuste] = useState<Ajuste>("desconto"); // mantém o título durante a saída
  const [valorAjuste, setValorAjuste] = useState<number | null>(null);
  const [editandoCliente, setEditandoCliente] = useState(false);
  const [cliente, setCliente] = useState("");
  const [confirmarEsvaziar, setConfirmarEsvaziar] = useState(false);

  if (!lugar) {
    return (
      <div className="px-4 py-24 text-center">
        <p className="text-[15px] text-body">Mesa ou balcão não encontrado</p>
        <Link href="/caixa" className="mt-4 inline-block text-[15px] text-accent">
          Voltar para o caixa
        </Link>
      </div>
    );
  }

  const titulo = nomeLugar(lugar.tipo, lugar.numero);
  const comanda: Comanda = loja.comandas.find((c) => c.id === id) ?? {
    id,
    ...lugar,
    cliente: "",
    itens: [],
    desconto: 0,
    acrescimo: 0,
    abertaEm: "",
  };
  const ocupado = comanda.itens.length > 0;
  const total = totalComanda(comanda);
  const itens = qtdItens(comanda.itens);
  const sub = subtotal(comanda.itens);
  // Volta pelo histórico (igual ao gesto de voltar do celular). Se a venda foi aberta direto, vai para o caixa.
  const voltar = () => (window.history.length > 1 ? router.back() : router.replace("/caixa"));

  const descontoDemais = ajuste === "desconto" && (valorAjuste ?? 0) > sub;

  function abrirAjuste(tipo: Ajuste) {
    setValorAjuste(comanda[tipo] || null);
    setUltimoAjuste(tipo);
    setAjuste(tipo);
  }

  const painel = (
    <PainelComanda
      comanda={comanda}
      aoDesconto={() => abrirAjuste("desconto")}
      aoAcrescimo={() => abrirAjuste("acrescimo")}
      aoEsvaziar={() => setConfirmarEsvaziar(true)}
      aoCobrar={() => setCobrando(true)}
    />
  );

  const cabecalhoComanda = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-2xl font-semibold tracking-tight text-ink">{titulo}</p>
        <p className="mt-1 flex items-center gap-2 text-[13px] text-body">
          <span className={`h-2 w-2 rounded-full ${ocupado ? "bg-accent" : "bg-white/15"}`} />
          {ocupado ? `Em atendimento · ${tempoDesde(comanda.abertaEm, agora)}` : "Livre"}
        </p>
      </div>
      {ocupado && (
        <button
          type="button"
          data-luz=""
          onClick={() => {
            setCliente(comanda.cliente);
            setEditandoCliente(true);
          }}
          className="vidro-leve aperta flex h-9 shrink-0 items-center gap-2 rounded-full px-3 text-[13px] text-ink"
        >
          {comanda.cliente ? (
            <>
              <span className="max-w-28 truncate">{comanda.cliente}</span>
              <PencilSimple size={12} className="text-body" />
            </>
          ) : (
            <>
              <UserCircle size={16} className="text-body" />
              Cliente
            </>
          )}
        </button>
      )}
    </div>
  );

  return (
    <div className="md:pr-[412px]">
      {/* Produtos, com a barra de vidro presa no topo */}
      <section>
        <div className="pt-seguro sticky top-0 z-20">
          <div className="flex h-16 items-center gap-3 px-4 md:px-8">
            <button
              type="button"
              data-luz=""
              onClick={voltar}
              className="vidro vidro-flutua aperta flex h-11 items-center gap-1 rounded-full pr-4 pl-2 text-[15px] font-medium text-ink"
            >
              <CaretLeft size={20} weight="bold" className="text-accent" />
              Caixa
            </button>
            <p className="vidro vidro-flutua ml-auto flex h-11 items-center rounded-full px-4 text-[15px] font-medium text-ink md:hidden">
              {titulo}
            </p>
          </div>
        </div>
        <div className="px-4 pt-1 pb-24 md:px-8 md:pb-10">
          <GradeProdutos
            produtos={loja.produtos}
            categorias={loja.categorias}
            vendas={loja.vendas}
            comanda={comanda}
            aoEscolher={(p) => adicionarItem(id, p)}
          />
        </div>
      </section>

      {/* Comanda: painel de vidro fixo à direita no computador */}
      <aside className="vidro fixed inset-y-3 right-3 z-20 hidden w-[388px] flex-col gap-4 rounded-[28px] p-5 md:flex">
        {cabecalhoComanda}
        <div className="min-h-0 flex-1">{painel}</div>
      </aside>

      {/* Comanda no celular: barra âmbar acima da navegação, abre a conta */}
      <div className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 px-3 md:hidden">
        <button
          type="button"
          onClick={() => setPedidoAberto(true)}
          className={`aperta mx-auto flex h-14 w-full max-w-md items-center justify-between rounded-full px-5 ${
            itens > 0 ? "vidro-ambar" : "vidro vidro-flutua text-body"
          }`}
        >
          <span className="flex items-center gap-2 text-[15px] font-medium">
            <CaretUp size={16} weight="bold" />
            {itens === 0 ? "Comanda vazia" : `Ver comanda · ${itens} ${itens === 1 ? "item" : "itens"}`}
          </span>
          <NumeroAnimado valor={total} formato={reais} className="num text-[17px] font-semibold" />
        </button>
      </div>

      <Janela aberta={pedidoAberto && !cobrando} aoFechar={() => setPedidoAberto(false)} titulo={titulo}>
        <div className="flex h-[62dvh] flex-col gap-4">
          {ocupado && (
            <div className="flex items-center justify-between gap-3 text-[13px] text-body">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-accent" />
                Em atendimento · {tempoDesde(comanda.abertaEm, agora)}
              </span>
              <button
                type="button"
                onClick={() => {
                  setCliente(comanda.cliente);
                  setEditandoCliente(true);
                }}
                className="vidro-leve aperta flex h-8 items-center gap-2 rounded-full px-3 text-ink"
              >
                <UserCircle size={16} className="text-body" />
                <span className="max-w-28 truncate">{comanda.cliente || "Cliente"}</span>
              </button>
            </div>
          )}
          <div className="min-h-0 flex-1">{painel}</div>
        </div>
      </Janela>

      {cobrando && (
        <JanelaPagamento
          comanda={comanda}
          formas={loja.formas}
          aoFechar={() => setCobrando(false)}
          aoFinalizar={(pagamentos) => {
            const venda = finalizarVenda(id, pagamentos);
            setCobrando(false);
            setPedidoAberto(false);
            if (venda) {
              aoVender(venda);
              voltar();
            }
          }}
        />
      )}

      <Janela
        aberta={ajuste !== null}
        aoFechar={() => setAjuste(null)}
        titulo={ultimoAjuste === "desconto" ? "Desconto" : "Acréscimo"}
        rodape={
          <Botao
            variante="principal"
            className="h-12 w-full"
            disabled={descontoDemais}
            onClick={() => {
              if (ajuste) ajustarComanda(id, ajuste, valorAjuste ?? 0);
              setAjuste(null);
            }}
          >
            Aplicar
          </Botao>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (descontoDemais) return;
            if (ajuste) ajustarComanda(id, ajuste, valorAjuste ?? 0);
            setAjuste(null);
          }}
        >
          <CampoDinheiro
            rotulo={ultimoAjuste === "desconto" ? "Valor do desconto" : "Valor do acréscimo"}
            valor={valorAjuste}
            aoMudar={setValorAjuste}
            autoFocus
            erro={descontoDemais ? `Máximo ${reais(sub)}` : null}
            dica={
              ultimoAjuste === "desconto"
                ? `A conta está em ${reais(sub)}. Deixe vazio para tirar o desconto`
                : "Ex.: taxa de entrega ou couvert. Deixe vazio para tirar"
            }
          />
        </form>
      </Janela>

      <Janela
        aberta={editandoCliente}
        aoFechar={() => setEditandoCliente(false)}
        titulo="Nome do cliente"
        rodape={
          <Botao
            variante="principal"
            className="h-12 w-full"
            onClick={() => {
              definirCliente(id, cliente);
              setEditandoCliente(false);
            }}
          >
            Salvar
          </Botao>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            definirCliente(id, cliente);
            setEditandoCliente(false);
          }}
        >
          <CampoTexto
            rotulo={`Quem está na ${titulo.toLowerCase()}`}
            placeholder="Seu Zé"
            maxLength={40}
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
            autoFocus
            dica="Opcional. Aparece no cartão da mesa e na venda"
          />
        </form>
      </Janela>

      <Janela
        aberta={confirmarEsvaziar}
        aoFechar={() => setConfirmarEsvaziar(false)}
        titulo={`Esvaziar ${titulo.toLowerCase()}`}
        rodape={
          <div className="flex gap-2">
            <Botao className="h-12 flex-1" onClick={() => setConfirmarEsvaziar(false)}>
              Cancelar
            </Botao>
            <Botao
              variante="perigo"
              className="h-12 flex-1"
              onClick={() => {
                esvaziarComanda(id);
                setConfirmarEsvaziar(false);
                setPedidoAberto(false);
              }}
            >
              Esvaziar
            </Botao>
          </div>
        }
      >
        <p className="text-[15px] text-body">
          {itens === 1 ? "O item" : `Os ${itens} itens`} ({reais(total)}) {itens === 1 ? "sai" : "saem"} da comanda e a{" "}
          {titulo.toLowerCase()} volta a ficar livre. Nenhuma venda é registrada.
        </p>
      </Janela>
    </div>
  );
}
