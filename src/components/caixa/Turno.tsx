"use client";

import { useEffect, useState } from "react";
import { ArrowCircleDown, ArrowCircleUp, CaretRight, ClockCounterClockwise, LockSimple, LockSimpleOpen } from "@phosphor-icons/react";
import { reais } from "@/lib/dinheiro";
import { esperadoNaGaveta } from "@/lib/calculos";
import {
  abrirCaixa,
  fecharCaixa,
  listarCaixas,
  movimentarCaixa,
  nomePessoa,
  resumoCaixa,
  useLoja,
  type CaixaFechado,
} from "@/lib/loja";
import type { Membro, MovimentoCaixa, ResumoCaixa } from "@/lib/tipos";
import { Botao, CampoDinheiro, CampoTexto, Cartao, Janela, NumeroAnimado } from "@/components/ui";

const formatoHora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const formatoDataHora = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const formatoDia = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });

const NOME_MOVIMENTO: Record<MovimentoCaixa["tipo"], string> = { sangria: "Sangria", suprimento: "Suprimento" };

/** "Abriu às 18:02" ou "Abriu ontem às 18:02" quando o turno virou a noite. */
function quandoAbriu(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  return mesmoDia ? `Aberto às ${formatoHora.format(d)}` : `Aberto em ${formatoDataHora.format(d)}`;
}

/** Diferença entre o contado e o esperado, com a cor do que significa. */
function Diferenca({ esperado, contado }: { esperado: number; contado: number }) {
  const d = contado - esperado;
  if (d === 0) return <span className="text-green-ink">Bateu certinho</span>;
  return <span className={d > 0 ? "text-yellow-ink" : "text-red-ink"}>{d > 0 ? `Sobrando ${reais(d)}` : `Faltando ${reais(-d)}`}</span>;
}

/* ───────── Faixa do turno, no topo do caixa ───────── */

export function Turno() {
  const loja = useLoja();
  const caixa = loja.caixa;
  const dono = loja.pessoa?.papel === "dono";
  const [abrindo, setAbrindo] = useState(false);
  const [movimento, setMovimento] = useState<MovimentoCaixa["tipo"] | null>(null);
  const [fechando, setFechando] = useState(false);
  const [resumo, setResumo] = useState<ResumoCaixa | null>(null);
  const [anteriores, setAnteriores] = useState(false);

  if (!caixa) {
    return (
      <>
        <Cartao className="entra flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <span className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yellow-soft text-yellow-ink">
              <LockSimple size={20} weight="fill" />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-medium text-ink">Caixa fechado</span>
              <span className="block text-[13px] text-body">Abra o caixa para começar a vender</span>
            </span>
          </span>
          <div className="flex gap-2">
            {dono && (
              <Botao className="h-11 flex-1 sm:flex-none" onClick={() => setAnteriores(true)}>
                <ClockCounterClockwise size={16} />
                Anteriores
              </Botao>
            )}
            <Botao variante="principal" className="h-11 flex-1 sm:flex-none" onClick={() => setAbrindo(true)}>
              Abrir caixa
            </Botao>
          </div>
        </Cartao>
        <JanelaAbrirCaixa aberta={abrindo} aoFechar={() => setAbrindo(false)} />
        {resumo && <JanelaResumo resumo={resumo} equipe={loja.equipe} aoFechar={() => setResumo(null)} titulo="Caixa fechado" />}
        {anteriores && <JanelaAnteriores equipe={loja.equipe} aoFechar={() => setAnteriores(false)} />}
      </>
    );
  }

  const naGaveta = esperadoNaGaveta(caixa, loja.vendas);

  return (
    <>
      <Cartao className="entra flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-soft text-green-ink">
            <LockSimpleOpen size={20} weight="fill" />
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-medium text-ink">
              {quandoAbriu(caixa.abertoEm)} por {nomePessoa(loja.equipe, caixa.abertoPor)}
            </span>
            <span className="num block text-[13px] text-body">
              {/* Só o dono vê o que deveria ter na gaveta: o atendente conta às cegas ao fechar */}
              {dono && loja.vendasProntas ? (
                <>
                  Na gaveta: <NumeroAnimado valor={naGaveta} formato={reais} />
                </>
              ) : (
                `Troco inicial de ${reais(caixa.valorInicial)}`
              )}
              {caixa.movimentos.length > 0 &&
                ` · ${caixa.movimentos.length} ${caixa.movimentos.length === 1 ? "movimento" : "movimentos"}`}
            </span>
          </span>
        </span>
        <div className="grid grid-cols-2 gap-2 lg:flex">
          {dono && (
            <Botao className="h-11 px-3 text-sm" onClick={() => setAnteriores(true)}>
              <ClockCounterClockwise size={16} />
              Anteriores
            </Botao>
          )}
          <Botao className="h-11 px-3 text-sm" onClick={() => setMovimento("sangria")}>
            <ArrowCircleUp size={16} />
            Sangria
          </Botao>
          <Botao className="h-11 px-3 text-sm" onClick={() => setMovimento("suprimento")}>
            <ArrowCircleDown size={16} />
            Suprimento
          </Botao>
          {/* Sem o botão "Anteriores" (atendente), o fechar ocupa a linha toda no celular */}
          <Botao variante="perigo" className={`h-11 px-3 text-sm ${dono ? "" : "col-span-2"}`} onClick={() => setFechando(true)}>
            Fechar caixa
          </Botao>
        </div>
      </Cartao>

      {movimento && <JanelaMovimento tipo={movimento} aoFechar={() => setMovimento(null)} />}
      {resumo && <JanelaResumo resumo={resumo} equipe={loja.equipe} aoFechar={() => setResumo(null)} titulo="Caixa fechado" />}
      {anteriores && <JanelaAnteriores equipe={loja.equipe} aoFechar={() => setAnteriores(false)} />}
      {fechando && (
        <JanelaFecharCaixa
          comandasAbertas={loja.comandas.length}
          aoFechar={() => setFechando(false)}
          aoFecharCaixa={(r) => {
            setFechando(false);
            setResumo(r);
          }}
        />
      )}
    </>
  );
}

/* ───────── Abrir ───────── */

export function JanelaAbrirCaixa({
  aberta,
  aoFechar,
  aoAbrir,
}: {
  aberta: boolean;
  aoFechar: () => void;
  /** Chamado depois de abrir com sucesso (a venda usa para seguir direto para a cobrança). */
  aoAbrir?: () => void;
}) {
  const [valor, setValor] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function abrir(fechar: () => void) {
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    const falha = await abrirCaixa(valor ?? 0);
    setOcupado(false);
    if (falha) {
      setErro(falha);
      return;
    }
    setValor(null);
    fechar();
    aoAbrir?.();
  }

  return (
    <Janela
      aberta={aberta}
      aoFechar={aoFechar}
      titulo="Abrir caixa"
      rodape={(fechar) => (
        <Botao variante="principal" className="h-12 w-full" disabled={ocupado} onClick={() => abrir(fechar)}>
          {ocupado ? "Abrindo" : "Abrir caixa"}
        </Botao>
      )}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void abrir(aoFechar);
        }}
      >
        <CampoDinheiro
          rotulo="Dinheiro na gaveta agora"
          valor={valor}
          aoMudar={setValor}
          autoFocus
          dica="O troco que fica na gaveta para começar. Deixe vazio se não tem"
        />
        {erro && (
          <p role="alert" className="mt-3 text-[15px] text-red-ink">
            {erro}
          </p>
        )}
      </form>
    </Janela>
  );
}

/* ───────── Sangria e suprimento ───────── */

function JanelaMovimento({ tipo, aoFechar }: { tipo: MovimentoCaixa["tipo"]; aoFechar: () => void }) {
  const [valor, setValor] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function salvar(fechar: () => void) {
    if (ocupado || !valor) return;
    setOcupado(true);
    setErro(null);
    const falha = await movimentarCaixa(tipo, valor, motivo);
    setOcupado(false);
    if (falha) setErro(falha);
    else fechar();
  }

  return (
    <Janela
      aberta
      aoFechar={aoFechar}
      titulo={NOME_MOVIMENTO[tipo]}
      rodape={(fechar) => (
        <Botao variante="principal" className="h-12 w-full" disabled={!valor || ocupado} onClick={() => salvar(fechar)}>
          {ocupado ? "Salvando" : tipo === "sangria" ? "Tirar da gaveta" : "Pôr na gaveta"}
        </Botao>
      )}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void salvar(aoFechar);
        }}
      >
        <CampoDinheiro
          rotulo={tipo === "sangria" ? "Quanto sai da gaveta" : "Quanto entra na gaveta"}
          valor={valor}
          aoMudar={setValor}
          autoFocus
        />
        <CampoTexto
          rotulo="Motivo"
          placeholder={tipo === "sangria" ? "Pagamento do gelo, depósito..." : "Mais troco"}
          maxLength={120}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          dica="Opcional"
        />
        {erro && (
          <p role="alert" className="text-[15px] text-red-ink">
            {erro}
          </p>
        )}
        <button type="submit" hidden />
      </form>
    </Janela>
  );
}

/* ───────── Fechar ───────── */

function JanelaFecharCaixa({
  comandasAbertas,
  aoFechar,
  aoFecharCaixa,
}: {
  comandasAbertas: number;
  aoFechar: () => void;
  aoFecharCaixa: (r: ResumoCaixa) => void;
}) {
  const [contado, setContado] = useState<number | null>(null);
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function fechar() {
    if (ocupado || contado === null) return;
    setOcupado(true);
    setErro(null);
    const r = await fecharCaixa(contado, observacao);
    setOcupado(false);
    if (typeof r === "string") setErro(r);
    else aoFecharCaixa(r);
  }

  return (
    <Janela
      aberta
      aoFechar={aoFechar}
      titulo="Fechar caixa"
      rodape={
        <Botao variante="principal" className="h-12 w-full" disabled={contado === null || ocupado} onClick={fechar}>
          {ocupado ? "Fechando" : "Fechar caixa"}
        </Botao>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void fechar();
        }}
      >
        {comandasAbertas > 0 && (
          <p className="rounded-[14px] bg-yellow-soft px-4 py-3 text-[15px] text-yellow-ink">
            {comandasAbertas === 1 ? "Uma mesa ou balcão continua" : `${comandasAbertas} mesas e balcões continuam`} em
            atendimento. Pode fechar mesmo assim: a conta fica aberta e entra no próximo caixa.
          </p>
        )}
        <CampoDinheiro
          rotulo="Dinheiro contado na gaveta"
          valor={contado}
          aoMudar={setContado}
          autoFocus
          dica="Conte as notas e moedas. A diferença aparece depois de fechar"
        />
        <CampoTexto
          rotulo="Observação"
          maxLength={200}
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          dica="Opcional"
        />
        {erro && (
          <p role="alert" className="text-[15px] text-red-ink">
            {erro}
          </p>
        )}
        <button type="submit" hidden />
      </form>
    </Janela>
  );
}

/* ───────── Resumo de um turno ───────── */

function JanelaResumo({
  resumo,
  equipe,
  aoFechar,
  titulo,
}: {
  resumo: ResumoCaixa;
  equipe: Membro[];
  aoFechar: () => void;
  titulo: string;
}) {
  const fechado = resumo.fechadoEm !== null;
  return (
    <Janela aberta aoFechar={aoFechar} titulo={titulo} rodape={(fechar) => <Botao className="h-12 w-full" onClick={fechar}>Pronto</Botao>}>
      <div className="num space-y-4 text-[15px]">
        <p className="text-body">
          Aberto em {formatoDataHora.format(new Date(resumo.abertoEm))} por {nomePessoa(equipe, resumo.abertoPor)}
          {fechado && (
            <>
              <br />
              Fechado em {formatoDataHora.format(new Date(resumo.fechadoEm!))} por {nomePessoa(equipe, resumo.fechadoPor)}
            </>
          )}
        </p>

        {fechado && resumo.esperado !== null && resumo.contado !== null && (
          <div className="rounded-[16px] bg-sunk px-4 py-3 ring-1 ring-line">
            <p className="text-[17px] font-semibold">
              <Diferenca esperado={resumo.esperado} contado={resumo.contado} />
            </p>
            <dl className="mt-2 space-y-1 text-body">
              <div className="flex justify-between">
                <dt>Esperado na gaveta</dt>
                <dd className="text-ink">{reais(resumo.esperado)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Contado</dt>
                <dd className="text-ink">{reais(resumo.contado)}</dd>
              </div>
            </dl>
          </div>
        )}

        <dl className="space-y-1 text-body">
          <div className="flex justify-between">
            <dt>Troco inicial</dt>
            <dd>{reais(resumo.valorInicial)}</dd>
          </div>
          {resumo.movimentos.map((m) => (
            <div key={m.id} className="flex justify-between gap-3">
              <dt className="min-w-0 truncate">
                {NOME_MOVIMENTO[m.tipo]}
                {m.motivo && ` · ${m.motivo}`}
                <span className="text-muted"> · {nomePessoa(equipe, m.pessoaId)}</span>
              </dt>
              <dd className="shrink-0">
                {m.tipo === "sangria" ? "−" : "+"} {reais(m.valor)}
              </dd>
            </div>
          ))}
        </dl>

        {resumo.total !== null && (
          <div>
            <div className="flex items-baseline justify-between text-ink">
              <span className="text-[17px] font-medium">
                {resumo.pedidos} {resumo.pedidos === 1 ? "venda" : "vendas"}
              </span>
              <span className="text-2xl font-semibold tracking-tight">{reais(resumo.total)}</span>
            </div>
            <ul className="mt-2 space-y-1 text-body">
              {resumo.porForma.map((f) => (
                <li key={f.formaId} className="flex justify-between">
                  <span>{f.formaNome}</span>
                  <span>{reais(f.valor)}</span>
                </li>
              ))}
            </ul>
            {resumo.canceladas > 0 && (
              <p className="mt-2 text-muted">
                {resumo.canceladas} {resumo.canceladas === 1 ? "venda cancelada" : "vendas canceladas"}, fora da conta
              </p>
            )}
          </div>
        )}

        {resumo.observacao && <p className="rounded-[14px] bg-sunk px-4 py-3 text-body">{resumo.observacao}</p>}
      </div>
    </Janela>
  );
}

/* ───────── Caixas anteriores (dono) ───────── */

function JanelaAnteriores({ equipe, aoFechar }: { equipe: Membro[]; aoFechar: () => void }) {
  // undefined = carregando, null = falhou
  const [lista, setLista] = useState<CaixaFechado[] | null | undefined>(undefined);
  const [aberto, setAberto] = useState<ResumoCaixa | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    listarCaixas().then((l) => vivo && setLista(l));
    return () => {
      vivo = false;
    };
  }, []);

  async function abrir(id: string) {
    setErro(null);
    const r = await resumoCaixa(id);
    if (typeof r === "string") setErro(r);
    else setAberto(r);
  }

  return (
    <>
      <Janela aberta={!aberto} aoFechar={aoFechar} titulo="Caixas anteriores">
        {lista === undefined && <p className="py-6 text-center text-[15px] text-muted">Carregando...</p>}
        {lista === null && <p className="py-6 text-center text-[15px] text-red-ink">Não consegui carregar. Confira a internet</p>}
        {lista && lista.length === 0 && <p className="py-6 text-center text-[15px] text-muted">Nenhum caixa fechado ainda</p>}
        {erro && <p className="mb-3 text-[15px] text-red-ink">{erro}</p>}
        {lista && lista.length > 0 && (
          <ul className="num divide-y divide-line">
            {lista.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => abrir(c.id)}
                  className="flex w-full items-center gap-3 py-3 text-left transition-colors duration-150 hover:bg-white/5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] text-ink first-letter:uppercase">
                      {formatoDia.format(new Date(c.abertoEm))} · {formatoHora.format(new Date(c.abertoEm))} às{" "}
                      {formatoHora.format(new Date(c.fechadoEm))}
                    </span>
                    <span className="block truncate text-[13px] text-muted">Fechado por {nomePessoa(equipe, c.fechadoPor)}</span>
                  </span>
                  <span className="shrink-0 text-[13px] font-medium">
                    <Diferenca esperado={c.esperado} contado={c.contado} />
                  </span>
                  <CaretRight size={14} className="shrink-0 text-muted" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Janela>
      {aberto && <JanelaResumo resumo={aberto} equipe={equipe} aoFechar={() => setAberto(null)} titulo="Caixa" />}
    </>
  );
}
