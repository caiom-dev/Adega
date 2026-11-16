"use client";

import { useRef, useState } from "react";
import {
  Camera,
  CheckCircle,
  FileArrowUp,
  Paperclip,
  Warning,
  X,
} from "@phosphor-icons/react";
import { formatarLinha, lerBoleto, type LeituraBoleto } from "@/lib/boleto";
import { hojeISO } from "@/lib/contas";
import { reais } from "@/lib/dinheiro";
import {
  apagarAnexo,
  ehPdf,
  enviarAnexo,
  lerArquivo,
} from "@/lib/leitorBoleto";
import { salvarConta } from "@/lib/loja";
import type { Conta } from "@/lib/tipos";
import {
  Botao,
  CampoDinheiro,
  CampoTexto,
  Chave,
  Janela,
} from "@/components/ui";

const ACEITA =
  "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";
const LIMITE = 10 * 1024 * 1024;

type Origem = "arquivo" | "colado" | null;

/** Boleto de um carnê. Depois de uma falha no meio, guarda o número original da parcela. */
type Parcela = LeituraBoleto & { parcela?: number; de?: number };

/** 2026-11-10 → 10/11/2026 */
function dataBr(iso: string) {
  const [a, m, d] = iso.split("-");
  return d ? `${d}/${m}/${a}` : iso;
}

/**
 * Lançar uma conta nova ou mudar uma existente.
 * Com anexo: lê a linha digitável do PDF (ou o código de barras da foto) e preenche valor e vencimento.
 * Sempre mostra os campos para o dono conferir antes de salvar.
 */
export function JanelaConta({
  conta,
  aoFechar,
}: {
  conta?: Conta;
  aoFechar: () => void;
}) {
  const [etapa, setEtapa] = useState<"anexo" | "campos">(
    conta ? "campos" : "anexo",
  );
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [lendo, setLendo] = useState(false);
  const [lida, setLida] = useState<{
    leitura: LeituraBoleto | null;
    origem: Origem;
  }>({ leitura: null, origem: null });
  const [linha, setLinha] = useState(
    conta?.linha ? formatarLinha(conta.linha) : "",
  );
  const [descricao, setDescricao] = useState(conta?.descricao ?? "");
  const [valor, setValor] = useState<number | null>(conta?.valor ?? null);
  const [vencimento, setVencimento] = useState(conta?.vencimento ?? "");
  const [manterAnexo, setManterAnexo] = useState(!!conta?.anexo);
  /** Carnê: todos os boletos que vieram no mesmo PDF. Com um boleto só, fica vazio. */
  const [carne, setCarne] = useState<Parcela[]>([]);
  const [lancarTodos, setLancarTodos] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const escolher = useRef<HTMLInputElement>(null);
  const foto = useRef<HTMLInputElement>(null);

  /** Preenche só o que estiver vazio ou que veio de uma leitura anterior: não apaga o que o dono digitou. */
  function aplicar(l: LeituraBoleto, origem: Origem) {
    setLida({ leitura: l, origem });
    setLinha(formatarLinha(l.linha));
    if (l.valor !== null) setValor(l.valor);
    if (l.vencimento) setVencimento(l.vencimento);
    setDescricao((d) =>
      d.trim() && d !== lida.leitura?.sugestao ? d : l.sugestao,
    );
  }

  async function aoEscolher(f: File | undefined) {
    if (!f) return;
    if (f.size > LIMITE) {
      setErro(
        "Arquivo maior que 10 MB. Mande uma foto menor ou o PDF original.",
      );
      return;
    }
    setErro(null);
    setArquivo(f);
    setLendo(true);
    const lidos = await lerArquivo(f);
    setLendo(false);
    if (lidos[0]) aplicar(lidos[0], "arquivo");
    else setLida({ leitura: null, origem: "arquivo" });
    // Só oferece lançar todos quando cada boleto traz valor e vencimento próprios.
    setCarne(
      lidos.length > 1 && lidos.every((l) => l.valor && l.vencimento)
        ? lidos
        : [],
    );
    setLancarTodos(true);
    setEtapa("campos");
  }

  function aoColar(texto: string) {
    setLinha(texto);
    const r = lerBoleto(texto);
    if (r.ok) aplicar(r.leitura, "colado");
  }

  const digitos = linha.replace(/\D/g, "");
  const leituraLinha = digitos ? lerBoleto(digitos) : null;
  const erroLinha =
    !digitos || leituraLinha?.ok
      ? null
      : leituraLinha?.erro === "tamanho"
        ? digitos.length < 44
          ? null
          : "A linha tem 47 ou 48 números"
        : "Algum número não confere. Revise a linha";
  const consumo = leituraLinha?.ok && leituraLinha.leitura.tipo === "consumo";
  const pronto =
    descricao.trim() !== "" &&
    !!valor &&
    valor > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(vencimento) &&
    !erroLinha;

  const emLote = carne.length > 1 && lancarTodos && !!arquivo;
  const totalCarne = carne.reduce((s, l) => s + (l.valor ?? 0), 0);

  /** Uma conta por boleto do carnê, cada uma com a sua cópia do PDF (apagar uma não leva o anexo das outras). */
  async function salvarCarne() {
    if (!arquivo || salvando || descricao.trim() === "") return;
    setSalvando(true);
    setErro(null);
    const total = carne.length;
    for (const [i, l] of carne.entries()) {
      const id = crypto.randomUUID();
      const caminho = await enviarAnexo(id, arquivo);
      const salvo =
        caminho &&
        (await salvarConta({
          novoId: id,
          descricao: `${descricao.trim()} ${l.parcela ?? i + 1}/${l.de ?? total}`,
          valor: l.valor ?? 0,
          vencimento: l.vencimento ?? "",
          linha: l.linha,
          anexo: caminho,
        }));
      if (!salvo) {
        if (caminho) void apagarAnexo(caminho);
        setSalvando(false);
        // As que já gravaram ficam; a lista passa a mostrar só o que falta, e tocar de novo lança o resto.
        setCarne(
          carne.slice(i).map((x, j) => ({
            ...x,
            parcela: x.parcela ?? i + j + 1,
            de: x.de ?? total,
          })),
        );
        setErro(
          `${i ? `Lancei ${i} de ${total}. ` : ""}Não consegui gravar a de ${dataBr(l.vencimento ?? "")}. Confira a internet e toque de novo para lançar o resto.`,
        );
        return;
      }
    }
    setSalvando(false);
    aoFechar();
  }

  async function salvar() {
    if (emLote) return salvarCarne();
    if (!pronto || salvando || !valor) return;
    setSalvando(true);
    setErro(null);
    const id = conta?.id ?? crypto.randomUUID();
    let anexo = manterAnexo ? (conta?.anexo ?? null) : null;
    if (arquivo) {
      const caminho = await enviarAnexo(id, arquivo);
      if (!caminho) {
        setSalvando(false);
        setErro(
          "Não consegui enviar o anexo. Confira a internet e tente de novo.",
        );
        return;
      }
      anexo = caminho;
    }
    const salvo = await salvarConta({
      id: conta?.id,
      novoId: conta ? undefined : id,
      descricao,
      valor,
      vencimento,
      linha: leituraLinha?.ok ? leituraLinha.leitura.linha : "",
      anexo,
    });
    setSalvando(false);
    if (!salvo) {
      // A conta não gravou: o anexo que acabou de subir não fica solto na área privada.
      if (arquivo && anexo) void apagarAnexo(anexo);
      return;
    }
    // O anexo antigo sai da área privada quando foi trocado ou tirado.
    if (conta?.anexo && conta.anexo !== anexo) void apagarAnexo(conta.anexo);
    aoFechar();
  }

  return (
    <Janela
      aberta
      aoFechar={aoFechar}
      titulo={conta ? "Mudar conta" : "Lançar conta"}
      rodape={
        etapa === "campos" ? (
          emLote ? (
            <Botao
              variante="principal"
              className="h-[52px] w-full text-[17px]"
              disabled={!descricao.trim() || salvando}
              onClick={() => void salvar()}
            >
              {salvando ? "Lançando" : `Lançar ${carne.length} contas`}
            </Botao>
          ) : (
            <Botao
              variante="principal"
              className="h-[52px] w-full text-[17px]"
              disabled={!pronto || salvando}
              onClick={() => void salvar()}
            >
              {salvando
                ? "Salvando"
                : valor && pronto
                  ? `Salvar conta de ${reais(valor)}`
                  : "Salvar conta"}
            </Botao>
          )
        ) : undefined
      }
    >
      <input
        ref={escolher}
        type="file"
        accept={ACEITA}
        hidden
        onChange={(e) => void aoEscolher(e.target.files?.[0])}
      />
      <input
        ref={foto}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => void aoEscolher(e.target.files?.[0])}
      />

      {etapa === "anexo" ? (
        <div className="aparece space-y-3">
          <button
            type="button"
            disabled={lendo}
            onClick={() => escolher.current?.click()}
            className="aperta flex w-full flex-col items-center justify-center gap-2 rounded-[20px] bg-sunk px-4 py-8 text-center ring-1 ring-line ring-dashed hover:ring-accent"
          >
            <FileArrowUp size={32} className="text-accent" />
            <span className="text-[17px] font-medium text-ink">
              {lendo ? "Lendo o boleto" : "Anexar o PDF do boleto"}
            </span>
            <span className="text-[13px] text-body">
              O app lê o valor e o vencimento sozinho
            </span>
          </button>
          <Botao
            className="h-12 w-full"
            disabled={lendo}
            onClick={() => foto.current?.click()}
          >
            <Camera size={20} />
            Tirar foto do boleto
          </Botao>
          <Botao
            variante="fantasma"
            className="h-11 w-full"
            disabled={lendo}
            onClick={() => setEtapa("campos")}
          >
            Sem anexo, só digitar
          </Botao>
          {erro && <p className="aparece text-[13px] text-red-ink">{erro}</p>}
        </div>
      ) : (
        <div className="aparece space-y-4">
          <SituacaoLeitura
            arquivo={arquivo}
            origem={lida.origem}
            leitura={lida.leitura}
            consumo={!!consumo}
            carne={emLote ? carne.length : 0}
          />

          {(arquivo || (conta?.anexo && manterAnexo)) && (
            <div className="flex items-center gap-3 rounded-[14px] bg-sunk px-4 py-3 ring-1 ring-line">
              <Paperclip size={18} className="shrink-0 text-body" />
              <span className="min-w-0 flex-1 truncate text-[15px] text-ink">
                {arquivo ? arquivo.name : "Anexo guardado"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setArquivo(null);
                  setManterAnexo(false);
                  setCarne([]);
                }}
                className="aperta flex h-8 w-8 items-center justify-center rounded-full text-muted hover:text-ink"
                aria-label="Tirar o anexo"
              >
                <X size={14} weight="bold" />
              </button>
            </div>
          )}

          {emLote && (
            <CampoTexto
              rotulo="Descrição"
              value={descricao}
              maxLength={70}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: Aluguel"
              dica={`Cada conta ganha o número da parcela, como ${descricao.trim() || "Aluguel"} 1/${carne[0]?.de ?? carne.length}`}
            />
          )}

          {carne.length > 1 && arquivo && (
            <div className="rounded-[14px] bg-sunk px-4 py-3 ring-1 ring-line">
              <Chave
                ligada={lancarTodos}
                aoMudar={setLancarTodos}
                rotulo={`Lançar os ${carne.length} boletos deste PDF`}
                dica={
                  lancarTodos
                    ? `Uma conta para cada vencimento, ${reais(totalCarne)} no total`
                    : "Lança só o primeiro"
                }
              />
              {lancarTodos && (
                <ul className="num mt-3 divide-y divide-line border-t border-line text-[15px]">
                  {carne.map((l, i) => (
                    <li
                      key={l.barras}
                      className="flex justify-between gap-3 py-2"
                    >
                      <span className="text-body">
                        {l.parcela ?? i + 1}/{l.de ?? carne.length} · vence{" "}
                        {dataBr(l.vencimento ?? "")}
                      </span>
                      <span className="text-ink">{reais(l.valor ?? 0)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {!emLote && (
            <>
              <label className="block">
                <span className="mb-2 flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="text-body">Linha digitável</span>
                  {erroLinha && (
                    <span className="aparece text-red-ink">{erroLinha}</span>
                  )}
                </span>
                <textarea
                  rows={2}
                  inputMode="numeric"
                  value={linha}
                  onChange={(e) => aoColar(e.target.value)}
                  placeholder="Cole ou digite os números do boleto"
                  className="num w-full resize-none rounded-[14px] bg-sunk px-4 py-3 text-base text-ink ring-1 ring-line outline-none placeholder:text-muted focus:ring-2 focus:ring-accent"
                />
                <span className="mt-2 block text-[13px] text-muted">
                  Opcional. Com ela o app confere valor e vencimento.
                </span>
              </label>

              <CampoTexto
                rotulo="Descrição"
                value={descricao}
                maxLength={80}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex.: Distribuidora, aluguel, luz"
              />
              <div className="grid grid-cols-2 gap-3">
                <CampoDinheiro
                  rotulo="Valor"
                  valor={valor}
                  aoMudar={setValor}
                />
                <CampoTexto
                  rotulo="Vencimento"
                  type="date"
                  value={vencimento}
                  min="2020-01-01"
                  onChange={(e) => setVencimento(e.target.value)}
                  dica={
                    vencimento && vencimento < hojeISO()
                      ? "Já venceu"
                      : undefined
                  }
                />
              </div>
            </>
          )}
          {erro && <p className="aparece text-[13px] text-red-ink">{erro}</p>}
        </div>
      )}
    </Janela>
  );
}

function SituacaoLeitura({
  arquivo,
  origem,
  leitura,
  consumo,
  carne,
}: {
  arquivo: File | null;
  origem: Origem;
  leitura: LeituraBoleto | null;
  consumo: boolean;
  /** Quantos boletos vão ser lançados de uma vez (0 quando é um só). */
  carne: number;
}) {
  if (leitura) {
    return (
      <div className="aparece flex gap-3 rounded-[14px] bg-green-soft px-4 py-3 text-[15px] text-green-ink">
        <CheckCircle size={20} weight="fill" className="mt-0.5 shrink-0" />
        <p>
          {carne
            ? `Li ${carne} boletos no PDF, com o valor e o vencimento de cada um. Dê um nome e confira a lista.`
            : `${origem === "arquivo" ? "Li o boleto do anexo." : "Linha conferida."} ${
                consumo || !leitura.vencimento
                  ? "Conta de consumo não traz o vencimento no código: digite a data."
                  : "Confira os campos antes de salvar."
              }`}
        </p>
      </div>
    );
  }
  if (origem === "arquivo" && arquivo) {
    return (
      <div className="aparece flex gap-3 rounded-[14px] bg-yellow-soft px-4 py-3 text-[15px] text-yellow-ink">
        <Warning size={20} weight="fill" className="mt-0.5 shrink-0" />
        <p>
          {ehPdf(arquivo)
            ? "Não achei a linha digitável no PDF. Cole a linha ou preencha os campos."
            : "Não consegui ler o código de barras da foto. Tire de novo mais perto, com o código reto e com luz, ou cole a linha."}
        </p>
      </div>
    );
  }
  return null;
}
