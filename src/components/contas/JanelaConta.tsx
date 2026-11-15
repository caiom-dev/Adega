"use client";

import { useRef, useState } from "react";
import { Camera, CheckCircle, FileArrowUp, Paperclip, Warning, X } from "@phosphor-icons/react";
import { formatarLinha, lerBoleto, type LeituraBoleto } from "@/lib/boleto";
import { hojeISO } from "@/lib/contas";
import { reais } from "@/lib/dinheiro";
import { apagarAnexo, ehPdf, enviarAnexo, lerArquivo, leFoto } from "@/lib/leitorBoleto";
import { salvarConta } from "@/lib/loja";
import type { Conta } from "@/lib/tipos";
import { Botao, CampoDinheiro, CampoTexto, Janela } from "@/components/ui";

const ACEITA = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";
const LIMITE = 10 * 1024 * 1024;

type Origem = "arquivo" | "colado" | null;

/**
 * Lançar uma conta nova ou mudar uma existente.
 * Com anexo: lê a linha digitável do PDF (ou o código de barras da foto) e preenche valor e vencimento.
 * Sempre mostra os campos para o dono conferir antes de salvar.
 */
export function JanelaConta({ conta, aoFechar }: { conta?: Conta; aoFechar: () => void }) {
  const [etapa, setEtapa] = useState<"anexo" | "campos">(conta ? "campos" : "anexo");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [lendo, setLendo] = useState(false);
  const [lida, setLida] = useState<{ leitura: LeituraBoleto | null; origem: Origem }>({ leitura: null, origem: null });
  const [linha, setLinha] = useState(conta?.linha ? formatarLinha(conta.linha) : "");
  const [descricao, setDescricao] = useState(conta?.descricao ?? "");
  const [valor, setValor] = useState<number | null>(conta?.valor ?? null);
  const [vencimento, setVencimento] = useState(conta?.vencimento ?? "");
  const [manterAnexo, setManterAnexo] = useState(!!conta?.anexo);
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
    setDescricao((d) => (d.trim() && d !== lida.leitura?.sugestao ? d : l.sugestao));
  }

  async function aoEscolher(f: File | undefined) {
    if (!f) return;
    if (f.size > LIMITE) {
      setErro("Arquivo maior que 10 MB. Mande uma foto menor ou o PDF original.");
      return;
    }
    setErro(null);
    setArquivo(f);
    setLendo(true);
    const l = await lerArquivo(f);
    setLendo(false);
    if (l) aplicar(l, "arquivo");
    else setLida({ leitura: null, origem: "arquivo" });
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
  const pronto = descricao.trim() !== "" && !!valor && valor > 0 && /^\d{4}-\d{2}-\d{2}$/.test(vencimento) && !erroLinha;

  async function salvar() {
    if (!pronto || salvando || !valor) return;
    setSalvando(true);
    setErro(null);
    const id = conta?.id ?? crypto.randomUUID();
    let anexo = manterAnexo ? (conta?.anexo ?? null) : null;
    if (arquivo) {
      const caminho = await enviarAnexo(id, arquivo);
      if (!caminho) {
        setSalvando(false);
        setErro("Não consegui enviar o anexo. Confira a internet e tente de novo.");
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
          <Botao variante="principal" className="h-[52px] w-full text-[17px]" disabled={!pronto || salvando} onClick={() => void salvar()}>
            {salvando ? "Salvando" : valor && pronto ? `Salvar conta de ${reais(valor)}` : "Salvar conta"}
          </Botao>
        ) : undefined
      }
    >
      <input ref={escolher} type="file" accept={ACEITA} hidden onChange={(e) => void aoEscolher(e.target.files?.[0])} />
      <input ref={foto} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void aoEscolher(e.target.files?.[0])} />

      {etapa === "anexo" ? (
        <div className="aparece space-y-3">
          <button
            type="button"
            disabled={lendo}
            onClick={() => escolher.current?.click()}
            className="aperta flex w-full flex-col items-center justify-center gap-2 rounded-[20px] bg-sunk px-4 py-8 text-center ring-1 ring-line ring-dashed hover:ring-accent"
          >
            <FileArrowUp size={32} className="text-accent" />
            <span className="text-[17px] font-medium text-ink">{lendo ? "Lendo o boleto" : "Anexar o PDF do boleto"}</span>
            <span className="text-[13px] text-body">O app lê o valor e o vencimento sozinho</span>
          </button>
          <Botao className="h-12 w-full" disabled={lendo} onClick={() => foto.current?.click()}>
            <Camera size={20} />
            Tirar foto do boleto
          </Botao>
          <Botao variante="fantasma" className="h-11 w-full" disabled={lendo} onClick={() => setEtapa("campos")}>
            Sem anexo, só digitar
          </Botao>
          {erro && <p className="aparece text-[13px] text-red-ink">{erro}</p>}
        </div>
      ) : (
        <div className="aparece space-y-4">
          <SituacaoLeitura arquivo={arquivo} origem={lida.origem} leitura={lida.leitura} consumo={!!consumo} fotoLe={leFoto()} />

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
                }}
                className="aperta flex h-8 w-8 items-center justify-center rounded-full text-muted hover:text-ink"
                aria-label="Tirar o anexo"
              >
                <X size={14} weight="bold" />
              </button>
            </div>
          )}

          <label className="block">
            <span className="mb-2 flex items-baseline justify-between gap-2 text-[13px]">
              <span className="text-body">Linha digitável</span>
              {erroLinha && <span className="aparece text-red-ink">{erroLinha}</span>}
            </span>
            <textarea
              rows={2}
              inputMode="numeric"
              value={linha}
              onChange={(e) => aoColar(e.target.value)}
              placeholder="Cole ou digite os números do boleto"
              className="num w-full resize-none rounded-[14px] bg-sunk px-4 py-3 text-base text-ink ring-1 ring-line outline-none placeholder:text-muted focus:ring-2 focus:ring-accent"
            />
            <span className="mt-2 block text-[13px] text-muted">Opcional. Com ela o app confere valor e vencimento.</span>
          </label>

          <CampoTexto
            rotulo="Descrição"
            value={descricao}
            maxLength={80}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex.: Distribuidora, aluguel, luz"
          />
          <div className="grid grid-cols-2 gap-3">
            <CampoDinheiro rotulo="Valor" valor={valor} aoMudar={setValor} />
            <CampoTexto
              rotulo="Vencimento"
              type="date"
              value={vencimento}
              min="2020-01-01"
              onChange={(e) => setVencimento(e.target.value)}
              dica={vencimento && vencimento < hojeISO() ? "Já venceu" : undefined}
            />
          </div>
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
  fotoLe,
}: {
  arquivo: File | null;
  origem: Origem;
  leitura: LeituraBoleto | null;
  consumo: boolean;
  fotoLe: boolean;
}) {
  if (leitura) {
    return (
      <div className="aparece flex gap-3 rounded-[14px] bg-green-soft px-4 py-3 text-[15px] text-green-ink">
        <CheckCircle size={20} weight="fill" className="mt-0.5 shrink-0" />
        <p>
          {origem === "arquivo" ? "Li o boleto do anexo." : "Linha conferida."}{" "}
          {consumo || !leitura.vencimento
            ? "Conta de consumo não traz o vencimento no código: digite a data."
            : "Confira os campos antes de salvar."}
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
            : fotoLe
              ? "Não consegui ler o código de barras da foto. Cole a linha ou preencha os campos."
              : "Neste aparelho a foto não é lida sozinha. Cole a linha digitável ou preencha os campos."}
        </p>
      </div>
    );
  }
  return null;
}
