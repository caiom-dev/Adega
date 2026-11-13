"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRinging, Copy, Phone, WhatsappLogo } from "@phosphor-icons/react";
import { reais } from "@/lib/dinheiro";
import { NOME_PAGAMENTO, formatarTelefone, linkWhatsApp, trocoALevar } from "@/lib/delivery";
import { tempoDesde } from "@/lib/lugares";
import { mudarPedido, nomePessoa, salvarDelivery, useLoja } from "@/lib/loja";
import type { Pedido, SituacaoPedido } from "@/lib/tipos";
import { Aviso, Botao, Cabecalho, CampoTexto, Cartao, Chave, Janela, useAgora } from "@/components/ui";
import { tocarAviso } from "./AlertaPedidos";

const formatoHora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

const GRUPOS: { situacao: SituacaoPedido; titulo: string; vazio: string }[] = [
  { situacao: "novo", titulo: "Novos", vazio: "Nenhum pedido esperando" },
  { situacao: "aceito", titulo: "Em preparo", vazio: "Nada em preparo" },
  { situacao: "saiu", titulo: "Saiu para entrega", vazio: "Nenhum entregador na rua" },
];

const MOTIVOS_RECUSA = ["Fora da área de entrega", "Produto acabou", "Loja fechando", "Cliente não atende", "Pedido falso"];

/** Forma da venda a partir do que o cliente escolheu. Cartão pergunta débito ou crédito na entrega. */
const formaSugerida = (p: Pedido) => (p.pagamento === "cartao" ? null : p.pagamento);

export function TelaDelivery() {
  const loja = useLoja();
  const agora = useAgora();
  const dono = loja.pessoa?.papel === "dono";
  const [recusando, setRecusando] = useState<Pedido | null>(null);
  const [entregando, setEntregando] = useState<Pedido | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  // Lida depois de montar: no servidor não existe Notification.
  const [permissao, setPermissao] = useState<string>("indisponivel");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (typeof Notification !== "undefined") setPermissao(Notification.permission);
  }, []);

  const porSituacao = useMemo(() => {
    const m = new Map<SituacaoPedido, Pedido[]>();
    for (const p of loja.pedidos) m.set(p.situacao, [...(m.get(p.situacao) ?? []), p]);
    // Em andamento: o mais antigo primeiro (quem pediu antes é atendido antes).
    for (const s of ["novo", "aceito", "saiu"] as const) m.get(s)?.reverse();
    return m;
  }, [loja.pedidos]);
  const concluidos = loja.pedidos.filter((p) => p.situacao === "entregue" || p.situacao === "recusado");
  const entreguesHoje = concluidos.filter((p) => p.situacao === "entregue");

  function avisar(texto: string, erro?: boolean) {
    setAviso({ texto, erro });
    setTimeout(() => setAviso(null), 4000);
  }

  async function mudar(p: Pedido, situacao: SituacaoPedido, motivo?: string, forma?: string) {
    setOcupado(p.id);
    const erro = await mudarPedido(p.id, situacao, motivo, forma);
    setOcupado(null);
    if (erro) avisar(erro, true);
    return !erro;
  }

  const link = typeof window === "undefined" ? "" : `${window.location.origin}/pedir`;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-10 md:px-8">
      <Cabecalho
        titulo="Delivery"
        subtitulo={
          entreguesHoje.length > 0
            ? `${entreguesHoje.length} ${entreguesHoje.length === 1 ? "entregue" : "entregues"} nas últimas 24 h · ${reais(entreguesHoje.reduce((s, p) => s + p.total, 0))}`
            : "Os pedidos do cardápio online chegam aqui"
        }
      />

      <Cartao className="entra flex flex-col gap-4 p-4 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          {dono ? (
            <Chave
              ligada={loja.delivery.aberto}
              aoMudar={(v) => salvarDelivery({ aberto: v })}
              rotulo={loja.delivery.aberto ? "Aceitando pedidos" : "Delivery fechado"}
              dica={loja.delivery.aberto ? "Fora do horário de Ajustes, a página fica fechada sozinha" : "Clientes veem a loja fechada"}
            />
          ) : (
            <p className="text-[15px] text-ink">{loja.delivery.aberto ? "Aceitando pedidos" : "Delivery fechado"}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Botao
            className="h-10 px-3 text-sm"
            onClick={() => {
              void navigator.clipboard?.writeText(link).then(
                () => avisar("Link do cardápio copiado"),
                () => avisar(link),
              );
            }}
          >
            <Copy size={16} className="shrink-0" />
            Copiar link do cardápio
          </Botao>
          {permissao === "default" && (
            <Botao
              variante="principal"
              className="h-10 px-3 text-sm"
              onClick={async () => {
                tocarAviso();
                setPermissao(await Notification.requestPermission());
              }}
            >
              <BellRinging size={16} className="shrink-0" />
              Ativar notificações
            </Botao>
          )}
        </div>
      </Cartao>
      {permissao === "denied" && (
        <p className="mt-2 text-[13px] text-muted">
          As notificações estão bloqueadas neste aparelho. O som e o contador no menu continuam avisando.
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {GRUPOS.map((g) => {
          const lista = porSituacao.get(g.situacao) ?? [];
          return (
            <section key={g.situacao}>
              <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-ink">
                {g.titulo}
                {lista.length > 0 && (
                  <span
                    className={`num rounded-full px-2 text-[13px] leading-6 font-semibold ${g.situacao === "novo" ? "bg-accent text-accent-ink" : "bg-white/10 text-body"}`}
                  >
                    {lista.length}
                  </span>
                )}
              </h2>
              {lista.length === 0 ? (
                <p className="mt-3 rounded-[20px] px-4 py-8 text-center text-[15px] text-muted ring-1 ring-line">{g.vazio}</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {lista.map((p) => (
                    <li key={p.id}>
                      <CartaoPedido
                        pedido={p}
                        agora={agora}
                        ocupado={ocupado === p.id}
                        aoAceitar={() => void mudar(p, "aceito")}
                        aoSair={() => void mudar(p, "saiu")}
                        aoEntregar={() => setEntregando(p)}
                        aoRecusar={() => setRecusando(p)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {concluidos.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold tracking-tight text-ink">Concluídos nas últimas 24 h</h2>
          <Cartao className="mt-3 overflow-hidden">
            <ul className="num divide-y divide-line">
              {concluidos.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3 md:px-5">
                  <span className="w-10 shrink-0 font-mono text-[13px] text-muted">#{p.numero}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[15px] ${p.situacao === "recusado" ? "text-muted line-through" : "text-ink"}`}>
                      {p.cliente}
                    </span>
                    <span className="block truncate text-[13px] text-muted">
                      {formatoHora.format(new Date(p.atualizadoEm))} · {p.situacao === "recusado" ? `recusado: ${p.motivo}` : "entregue"} ·{" "}
                      {nomePessoa(loja.equipe, p.pessoaId)}
                    </span>
                  </span>
                  <span className={`shrink-0 text-[15px] font-medium ${p.situacao === "recusado" ? "text-muted line-through" : "text-ink"}`}>
                    {reais(p.total)}
                  </span>
                </li>
              ))}
            </ul>
          </Cartao>
        </section>
      )}

      {recusando && (
        <JanelaRecusar
          pedido={recusando}
          aoFechar={() => setRecusando(null)}
          aoRecusar={(motivo) => mudar(recusando, "recusado", motivo)}
        />
      )}
      {entregando && (
        <JanelaEntregar
          pedido={entregando}
          aoFechar={() => setEntregando(null)}
          aoEntregar={(forma) => mudar(entregando, "entregue", "", forma)}
        />
      )}

      {aviso && (
        <Aviso>
          <p className={`font-medium ${aviso.erro ? "text-red-ink" : "text-ink"}`}>{aviso.texto}</p>
        </Aviso>
      )}
    </div>
  );
}

/* ───────── Cartão de um pedido ───────── */

function CartaoPedido({
  pedido: p,
  agora,
  ocupado,
  aoAceitar,
  aoSair,
  aoEntregar,
  aoRecusar,
}: {
  pedido: Pedido;
  agora: Date | null;
  ocupado: boolean;
  aoAceitar: () => void;
  aoSair: () => void;
  aoEntregar: () => void;
  aoRecusar: () => void;
}) {
  const troco = p.pagamento === "dinheiro" ? trocoALevar(p.total, p.trocoPara) : 0;
  return (
    <Cartao className={`entra overflow-hidden ${p.situacao === "novo" ? "ring-accent/60" : ""}`}>
      <div className="p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="num min-w-0 truncate text-[17px] font-semibold text-ink">
            #{p.numero} · {p.cliente}
          </p>
          <p className="num shrink-0 text-[13px] text-muted">{tempoDesde(p.criadoEm, agora)}</p>
        </div>

        <p className="mt-1 text-[15px] text-body">
          {p.retirada ? (
            <span className="font-medium text-yellow-ink">Retirar na loja</span>
          ) : (
            <>
              {p.endereco}
              {p.complemento && ` · ${p.complemento}`}
              <span className="block text-[13px] text-muted">{p.bairro}</span>
            </>
          )}
        </p>

        <div className="mt-2 flex gap-2">
          <a
            href={linkWhatsApp(p.telefone)}
            target="_blank"
            rel="noreferrer"
            className="vidro-leve aperta flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] text-ink"
          >
            <WhatsappLogo size={16} className="shrink-0 text-green-ink" />
            {formatarTelefone(p.telefone)}
          </a>
          <a
            href={`tel:${p.telefone}`}
            aria-label={`Ligar para ${p.cliente}`}
            className="vidro-leve aperta flex h-9 w-9 items-center justify-center rounded-full text-ink"
          >
            <Phone size={16} />
          </a>
        </div>

        <ul className="num mt-3 space-y-0.5 rounded-[14px] bg-sunk px-3 py-2 text-[15px]">
          {p.itens.map((i) => (
            <li key={i.produtoId} className="flex justify-between gap-3">
              <span className="min-w-0 text-ink">
                {i.qtd}× {i.nome}
              </span>
              <span className="shrink-0 text-body">{reais(i.preco * i.qtd)}</span>
            </li>
          ))}
        </ul>
        {p.observacao && <p className="mt-2 rounded-[12px] bg-yellow-soft px-3 py-2 text-[15px] text-yellow-ink">{p.observacao}</p>}

        <div className="num mt-3 flex items-baseline justify-between gap-3">
          <span className="text-[13px] text-body">
            {NOME_PAGAMENTO[p.pagamento]}
            {troco > 0 && ` · levar ${reais(troco)} de troco`}
            {p.pagamento === "dinheiro" && p.trocoPara === null && " · sem troco"}
            {p.taxa > 0 && ` · entrega ${reais(p.taxa)}`}
          </span>
          <span className="shrink-0 text-xl font-semibold tracking-tight text-ink">{reais(p.total)}</span>
        </div>
      </div>

      <div className="flex gap-2 border-t border-line p-3">
        <Botao variante="fantasma" className="h-11 px-3 text-red-ink hover:text-red-ink" disabled={ocupado} onClick={aoRecusar}>
          Recusar
        </Botao>
        {p.situacao === "novo" && (
          <Botao variante="principal" className="h-11 flex-1" disabled={ocupado} onClick={aoAceitar}>
            Aceitar
          </Botao>
        )}
        {p.situacao === "aceito" && !p.retirada && (
          <Botao variante="principal" className="h-11 flex-1" disabled={ocupado} onClick={aoSair}>
            Saiu para entrega
          </Botao>
        )}
        {((p.situacao === "aceito" && p.retirada) || p.situacao === "saiu") && (
          <Botao variante="principal" className="h-11 flex-1" disabled={ocupado} onClick={aoEntregar}>
            {p.retirada ? "Cliente retirou" : "Entregue"}
          </Botao>
        )}
      </div>
    </Cartao>
  );
}

/* ───────── Recusar ───────── */

function JanelaRecusar({ pedido, aoFechar, aoRecusar }: { pedido: Pedido; aoFechar: () => void; aoRecusar: (motivo: string) => Promise<boolean> }) {
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function recusar(fechar: () => void) {
    if (!motivo.trim() || ocupado) return;
    setOcupado(true);
    const ok = await aoRecusar(motivo.trim());
    setOcupado(false);
    if (ok) fechar();
  }

  return (
    <Janela
      aberta
      aoFechar={aoFechar}
      titulo={`Recusar pedido nº ${pedido.numero}`}
      rodape={(fechar) => (
        <Botao variante="perigo" className="h-12 w-full" disabled={!motivo.trim() || ocupado} onClick={() => recusar(fechar)}>
          {ocupado ? "Recusando" : "Recusar pedido"}
        </Botao>
      )}
    >
      <p className="text-[15px] text-body">O cliente vê o motivo na página do pedido.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {MOTIVOS_RECUSA.map((m) => (
          <button
            key={m}
            type="button"
            data-luz=""
            aria-pressed={motivo === m}
            onClick={() => setMotivo(m)}
            className={`aperta h-9 rounded-full px-4 text-sm font-medium ${motivo === m ? "vidro-ambar" : "vidro-leve text-body"}`}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="mt-4">
        <CampoTexto rotulo="Motivo" maxLength={120} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ou escreva aqui" />
      </div>
    </Janela>
  );
}

/* ───────── Entregar: como o cliente pagou ───────── */

function JanelaEntregar({ pedido, aoFechar, aoEntregar }: { pedido: Pedido; aoFechar: () => void; aoEntregar: (forma: string) => Promise<boolean> }) {
  const loja = useLoja();
  const [forma, setForma] = useState<string | null>(formaSugerida(pedido));
  const [ocupado, setOcupado] = useState(false);

  async function confirmar(fechar: () => void) {
    if (!forma || ocupado) return;
    setOcupado(true);
    const ok = await aoEntregar(forma);
    setOcupado(false);
    if (ok) fechar();
  }

  return (
    <Janela
      aberta
      aoFechar={aoFechar}
      titulo={pedido.retirada ? "Cliente retirou" : "Pedido entregue"}
      rodape={(fechar) => (
        <Botao variante="principal" className="h-12 w-full" disabled={!forma || ocupado} onClick={() => confirmar(fechar)}>
          {ocupado ? "Registrando" : `Registrar venda de ${reais(pedido.total)}`}
        </Botao>
      )}
    >
      <p className="text-[15px] text-body">
        {pedido.pagamento === "cartao" ? "Foi no débito ou no crédito?" : "Confirme como o cliente pagou."} O pedido vira venda e
        baixa o estoque.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {loja.formas.map((f) => (
          <button
            key={f.id}
            type="button"
            data-luz=""
            aria-pressed={forma === f.id}
            onClick={() => setForma(f.id)}
            className={`aperta h-14 rounded-[14px] text-[17px] font-medium ${forma === f.id ? "vidro-ambar" : "vidro-leve text-ink"}`}
          >
            {f.nome}
          </button>
        ))}
      </div>
      {!loja.caixa && (
        <p className="mt-4 rounded-[14px] bg-yellow-soft px-4 py-3 text-[15px] text-yellow-ink">
          O caixa está fechado. A venda entra nos relatórios, mas fica fora da conferência de um turno de caixa.
        </p>
      )}
    </Janela>
  );
}
