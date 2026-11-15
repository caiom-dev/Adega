"use client";

import { useMemo, useState } from "react";
import { ArrowSquareOut, Check, Copy, Paperclip, PencilSimple, Plus, Receipt, Trash } from "@phosphor-icons/react";
import { formatarLinha } from "@/lib/boleto";
import { dataCurta, hojeISO, ordenarContas, resumirContas, situacaoConta, textoVencimento, type SituacaoConta } from "@/lib/contas";
import { reais } from "@/lib/dinheiro";
import { linkAnexo } from "@/lib/leitorBoleto";
import { apagarConta, marcarPaga, nomePessoa, useLoja } from "@/lib/loja";
import type { Conta } from "@/lib/tipos";
import { Aviso, Botao, Cabecalho, Cartao, CampoTexto, Janela, Segmentado, useAgora } from "@/components/ui";
import { JanelaConta } from "@/components/contas/JanelaConta";

type Aba = "abertas" | "pagas";

const COR: Record<SituacaoConta, string> = {
  vencida: "text-red-ink",
  hoje: "text-yellow-ink",
  "a-pagar": "text-body",
  paga: "text-green-ink",
};

export default function ContasPage() {
  const loja = useLoja();
  const agora = useAgora();
  const hoje = agora ? hojeISO(agora) : null;
  const [aba, setAba] = useState<Aba>("abertas");
  const [lancando, setLancando] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  const [editando, setEditando] = useState<Conta | null>(null);

  const ordenadas = useMemo(() => ordenarContas(loja.contas), [loja.contas]);
  const abertas = ordenadas.filter((c) => !c.pagoEm);
  const pagas = ordenadas.filter((c) => c.pagoEm);
  const lista = aba === "abertas" ? abertas : pagas;
  const resumo = hoje ? resumirContas(loja.contas, hoje) : null;
  const detalhe = loja.contas.find((c) => c.id === aberta) ?? null;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-10 md:px-8">
      <Cabecalho
        titulo="Contas"
        subtitulo={
          !resumo
            ? " "
            : abertas.length === 0
              ? "Nenhuma conta em aberto"
              : `${abertas.length} em aberto · ${reais(abertas.reduce((s, c) => s + c.valor, 0))}`
        }
        acao={
          <Botao variante="principal" className="h-11 shrink-0" onClick={() => setLancando(true)}>
            <Plus size={18} weight="bold" />
            Lançar
          </Botao>
        }
      />

      {resumo && (
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          <Total rotulo="Vencidas" qtd={resumo.vencidas.qtd} total={resumo.vencidas.total} alerta={resumo.vencidas.qtd > 0} i={0} />
          <Total rotulo="Próximos 7 dias" qtd={resumo.semana.qtd} total={resumo.semana.total} i={1} />
          <Total rotulo="Este mês" qtd={resumo.mes.qtd} total={resumo.mes.total} i={2} />
        </div>
      )}

      <Segmentado
        rotulo="Contas"
        className="mt-6"
        valor={aba}
        aoMudar={setAba}
        opcoes={[
          { id: "abertas", nome: `A pagar${abertas.length ? ` · ${abertas.length}` : ""}` },
          { id: "pagas", nome: "Pagas" },
        ]}
      />

      {hoje && lista.length > 0 && (
        <Cartao className="mt-4 divide-y divide-line overflow-hidden">
          {lista.map((c, i) => (
            <LinhaConta key={c.id} conta={c} hoje={hoje} i={i} aoAbrir={() => setAberta(c.id)} />
          ))}
        </Cartao>
      )}

      {hoje && lista.length === 0 && (
        <div className="aparece mt-10 flex flex-col items-center text-center">
          <Receipt size={40} className="text-muted" />
          <p className="mt-3 text-[17px] font-medium text-ink">{aba === "abertas" ? "Nada para pagar" : "Nenhuma conta paga ainda"}</p>
          {aba === "abertas" && (
            <p className="mt-1 max-w-xs text-[15px] text-body">
              Lance o boleto pelo PDF ou pela foto. O app avisa 3 dias antes, 1 dia antes e no dia.
            </p>
          )}
        </div>
      )}

      {lancando && <JanelaConta aoFechar={() => setLancando(false)} />}
      {editando && <JanelaConta conta={editando} aoFechar={() => setEditando(null)} />}
      {detalhe && hoje && (
        <Detalhe
          conta={detalhe}
          hoje={hoje}
          quemPagou={detalhe.pagoPor ? nomePessoa(loja.equipe, detalhe.pagoPor) : null}
          aoFechar={() => setAberta(null)}
          aoEditar={() => {
            setEditando(detalhe);
            setAberta(null);
          }}
        />
      )}
    </div>
  );
}

function Total({ rotulo, qtd, total, alerta, i }: { rotulo: string; qtd: number; total: number; alerta?: boolean; i: number }) {
  return (
    <Cartao className={`entra p-3 md:p-4 ${alerta ? "ring-red-ink/40" : ""}`} style={{ "--i": i } as React.CSSProperties}>
      <p className={`text-[12px] md:text-[13px] ${alerta ? "text-red-ink" : "text-body"}`}>{rotulo}</p>
      <p className={`num mt-1.5 text-[17px] leading-tight font-semibold tracking-tight md:text-[22px] ${alerta ? "text-red-ink" : "text-ink"}`}>
        {reais(total)}
      </p>
      <p className="num mt-1 text-[12px] text-muted md:text-[13px]">
        {qtd === 0 ? "nenhuma" : `${qtd} ${qtd === 1 ? "conta" : "contas"}`}
      </p>
    </Cartao>
  );
}

function LinhaConta({ conta: c, hoje, i, aoAbrir }: { conta: Conta; hoje: string; i: number; aoAbrir: () => void }) {
  const s = situacaoConta(c, hoje);
  return (
    <button
      type="button"
      onClick={aoAbrir}
      className="entra flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-white/[0.03]"
      style={{ "--i": Math.min(i, 8) } as React.CSSProperties}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-medium text-ink">{c.descricao}</span>
          {c.anexo && <Paperclip size={14} className="shrink-0 text-muted" aria-label="com anexo" />}
        </span>
        <span className={`num mt-0.5 block text-[13px] ${COR[s]}`}>
          {s === "paga" ? `paga em ${dataCurta(c.pagoEm!, hoje)}` : `${dataCurta(c.vencimento, hoje)} · ${textoVencimento(c.vencimento, hoje)}`}
        </span>
      </span>
      <span className={`num shrink-0 text-[17px] font-semibold tracking-tight ${s === "paga" ? "text-body" : "text-ink"}`}>{reais(c.valor)}</span>
    </button>
  );
}

function Detalhe({
  conta: c,
  hoje,
  quemPagou,
  aoFechar,
  aoEditar,
}: {
  conta: Conta;
  hoje: string;
  quemPagou: string | null;
  aoFechar: () => void;
  aoEditar: () => void;
}) {
  const s = situacaoConta(c, hoje);
  const [pagoEm, setPagoEm] = useState(hoje);
  const [aviso, setAviso] = useState<string | null>(null);
  const [apagando, setApagando] = useState(false);
  const [abrindo, setAbrindo] = useState(false);

  function avisar(texto: string) {
    setAviso(texto);
    setTimeout(() => setAviso(null), 2200);
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(c.linha);
      avisar("Linha digitável copiada. Cole no app do banco.");
    } catch {
      avisar("Não consegui copiar. Segure o dedo na linha para copiar.");
    }
  }

  async function verAnexo() {
    if (!c.anexo) return;
    // A aba abre antes da resposta: o Safari bloqueia janela aberta depois de esperar a internet.
    const janela = window.open("", "_blank");
    setAbrindo(true);
    const url = await linkAnexo(c.anexo);
    setAbrindo(false);
    if (url && janela) janela.location.href = url;
    else {
      janela?.close();
      avisar("Não consegui abrir o anexo. Confira a internet.");
    }
  }

  return (
    <Janela
      aberta
      aoFechar={aoFechar}
      titulo={c.descricao}
      rodape={(fechar) =>
        s === "paga" ? (
          <Botao
            className="h-[52px] w-full text-[17px]"
            onClick={() => {
              void marcarPaga(c.id, null);
              fechar();
            }}
          >
            Desfazer pagamento
          </Botao>
        ) : (
          <Botao
            variante="principal"
            className="h-[52px] w-full text-[17px]"
            disabled={!pagoEm}
            onClick={() => {
              void marcarPaga(c.id, pagoEm);
              fechar();
            }}
          >
            <Check size={20} weight="bold" />
            Marcar como paga
          </Botao>
        )
      }
    >
      <div className="num flex items-baseline justify-between gap-3">
        <span className={`text-[15px] ${COR[s]}`}>
          {s === "paga" ? `Paga em ${dataCurta(c.pagoEm!, hoje)}${quemPagou ? ` por ${quemPagou}` : ""}` : textoVencimento(c.vencimento, hoje)}
        </span>
        <span className="text-4xl leading-none font-semibold tracking-tight text-ink">{reais(c.valor)}</span>
      </div>
      <p className="num mt-2 text-[13px] text-muted">Vencimento {dataCurta(c.vencimento, hoje)}</p>

      {c.linha && (
        <button
          type="button"
          onClick={() => void copiar()}
          className="aperta mt-5 flex w-full items-center gap-3 rounded-[14px] bg-sunk px-4 py-3 text-left ring-1 ring-line hover:ring-accent"
        >
          <span className="num min-w-0 flex-1 text-[14px] leading-relaxed break-all text-ink select-all">{formatarLinha(c.linha)}</span>
          <Copy size={20} className="shrink-0 text-accent" aria-label="Copiar linha digitável" />
        </button>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        {c.anexo && (
          <Botao className="h-11" disabled={abrindo} onClick={() => void verAnexo()}>
            <ArrowSquareOut size={18} />
            {abrindo ? "Abrindo" : "Ver boleto"}
          </Botao>
        )}
        <Botao className="h-11" onClick={aoEditar}>
          <PencilSimple size={18} />
          Mudar
        </Botao>
        {!c.anexo && <span />}
      </div>

      {s !== "paga" && (
        <div className="mt-5">
          <CampoTexto rotulo="Pago em" type="date" value={pagoEm} max={hoje} onChange={(e) => setPagoEm(e.target.value)} />
        </div>
      )}

      <div className="mt-6 border-t border-line pt-4">
        {apagando ? (
          <div className="aparece flex items-center justify-between gap-3">
            <span className="text-[15px] text-body">Apagar esta conta?</span>
            <span className="flex gap-2">
              <Botao variante="fantasma" className="h-10" onClick={() => setApagando(false)}>
                Não
              </Botao>
              <Botao
                variante="perigo"
                className="h-10"
                onClick={() => {
                  void apagarConta(c.id);
                  aoFechar();
                }}
              >
                Apagar
              </Botao>
            </span>
          </div>
        ) : (
          <Botao variante="fantasma" className="-ml-2 h-10 text-red-ink" onClick={() => setApagando(true)}>
            <Trash size={18} />
            Apagar conta
          </Botao>
        )}
      </div>
      {aviso && <Aviso>{aviso}</Aviso>}
    </Janela>
  );
}
