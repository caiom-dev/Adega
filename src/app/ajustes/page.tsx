"use client";

import { useRef, useState } from "react";
import { DownloadSimple, Minus, Plus, Trash, UploadSimple } from "@phosphor-icons/react";
import {
  apagarVendas,
  definirQuantidade,
  exportarDados,
  importarDados,
  removerCategoria,
  salvarCategoria,
  salvarTaxa,
  useLoja,
} from "@/lib/loja";
import { Aviso, Botao, Cabecalho, Cartao, Janela } from "@/components/ui";

function Secao({ titulo, descricao, children, i }: { titulo: string; descricao: string; children: React.ReactNode; i: number }) {
  return (
    <section className="entra mt-8 first:mt-0" style={{ "--i": i } as React.CSSProperties}>
      <h2 className="text-xl font-semibold tracking-tight text-ink">{titulo}</h2>
      <p className="mt-1 mb-4 text-[15px] text-body">{descricao}</p>
      {children}
    </section>
  );
}

function CampoTaxa({ valor, aoSalvar, rotulo }: { valor: number; aoSalvar: (v: number) => void; rotulo: string }) {
  const [texto, setTexto] = useState(String(valor).replace(".", ","));
  return (
    <div className="flex h-10 items-center rounded-[12px] bg-sunk px-3 ring-1 ring-line transition-shadow duration-150 focus-within:ring-2 focus-within:ring-accent">
      <input
        inputMode="decimal"
        aria-label={`Taxa de ${rotulo}`}
        value={texto}
        onChange={(e) => setTexto(e.target.value.replace(/[^\d,]/g, "").slice(0, 5))}
        onBlur={() => {
          // Aceita de 0 a 30%: acima disso é quase sempre erro de digitação.
          const n = Number(texto.replace(",", ".")) || 0;
          const limitado = Math.min(Math.max(Math.round(n * 100) / 100, 0), 30);
          setTexto(String(limitado).replace(".", ","));
          aoSalvar(limitado);
        }}
        className="num h-full w-14 bg-transparent text-right text-base text-ink outline-none md:text-[15px]"
      />
      <span className="pl-1 text-[15px] text-muted">%</span>
    </div>
  );
}

export default function AjustesPage() {
  const loja = useLoja();
  const [novaCategoria, setNovaCategoria] = useState("");
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null);
  const campoArquivo = useRef<HTMLInputElement>(null);

  const emUso = (id: string) => loja.produtos.some((p) => p.ativo && p.categoriaId === id);
  const nomeNovo = novaCategoria.trim();
  const categoriaRepetida = loja.categorias.some((c) => c.nome.trim().toLowerCase() === nomeNovo.toLowerCase());

  function avisar(texto: string, erro?: boolean) {
    setAviso({ texto, erro });
    setTimeout(() => setAviso(null), 4000);
  }

  function baixarCopia() {
    const url = URL.createObjectURL(new Blob([exportarDados()], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `adega-do-pezao-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    avisar("Cópia salva na pasta de downloads");
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-10 md:px-8">
      <Cabecalho titulo="Ajustes" />

      <Secao i={0} titulo="Mesas e balcões" descricao="Quantos aparecem no caixa">
        <Cartao>
          <ul className="divide-y divide-line">
            {(["mesa", "balcao"] as const).map((t) => {
              const valor = t === "mesa" ? loja.mesas : loja.balcoes;
              return (
                <li key={t} className="flex items-center justify-between py-2 pr-3 pl-5">
                  <span className="text-[15px] text-ink">{t === "mesa" ? "Mesas" : "Balcões"}</span>
                  <div className="vidro-leve flex items-center rounded-full">
                    <button
                      type="button"
                      disabled={valor <= 0}
                      onClick={() => definirQuantidade(t, valor - 1)}
                      className="aperta flex h-10 w-10 items-center justify-center rounded-full text-body hover:text-ink disabled:opacity-30"
                      aria-label={`Menos ${t === "mesa" ? "uma mesa" : "um balcão"}`}
                    >
                      <Minus size={14} weight="bold" />
                    </button>
                    <span key={valor} className="num estala w-8 text-center text-[15px] font-medium text-ink">
                      {valor}
                    </span>
                    <button
                      type="button"
                      disabled={valor >= 99}
                      onClick={() => definirQuantidade(t, valor + 1)}
                      className="aperta flex h-10 w-10 items-center justify-center rounded-full text-body hover:text-ink disabled:opacity-30"
                      aria-label={`Mais ${t === "mesa" ? "uma mesa" : "um balcão"}`}
                    >
                      <Plus size={14} weight="bold" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Cartao>
      </Secao>

      <Secao i={1} titulo="Taxas da maquininha" descricao="Quanto a maquininha desconta em cada forma de pagamento. Entra na conta do lucro">
        <Cartao>
          <ul className="divide-y divide-line">
            {loja.formas.map((f) => (
              <li key={f.id} className="flex items-center justify-between py-2 pr-3 pl-5">
                <span className="text-[15px] text-ink">{f.nome}</span>
                <CampoTaxa key={f.taxa} rotulo={f.nome} valor={f.taxa} aoSalvar={(v) => salvarTaxa(f.id, v)} />
              </li>
            ))}
          </ul>
        </Cartao>
      </Secao>

      <Secao i={2} titulo="Categorias" descricao="Só dá para remover uma categoria sem produtos">
        <Cartao>
          <ul className="divide-y divide-line">
            {loja.categorias.map((c) => (
              <li key={c.id} className="flex items-center gap-2 py-1 pr-2 pl-3">
                <input
                  key={c.nome}
                  defaultValue={c.nome}
                  maxLength={40}
                  aria-label="Nome da categoria"
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  onBlur={(e) => {
                    const nome = e.target.value.trim();
                    const repetida = loja.categorias.some((o) => o.id !== c.id && o.nome.trim().toLowerCase() === nome.toLowerCase());
                    if (nome && nome !== c.nome && !repetida) salvarCategoria(nome, c.id);
                    else e.target.value = c.nome;
                    if (repetida) avisar("Já existe uma categoria com esse nome", true);
                  }}
                  className="h-10 min-w-0 flex-1 rounded-[10px] bg-transparent px-2 text-base text-ink outline-none transition-colors duration-150 focus:bg-sunk md:text-[15px]"
                />
                <span className="num text-[13px] text-muted">{loja.produtos.filter((p) => p.ativo && p.categoriaId === c.id).length}</span>
                <button
                  type="button"
                  disabled={emUso(c.id)}
                  onClick={() => removerCategoria(c.id)}
                  className="aperta flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-red-soft hover:text-red-ink disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-muted"
                  aria-label={`Remover ${c.nome}`}
                >
                  <Trash size={16} />
                </button>
              </li>
            ))}
          </ul>
        </Cartao>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!nomeNovo || categoriaRepetida) return;
            salvarCategoria(nomeNovo);
            setNovaCategoria("");
          }}
        >
          <input
            value={novaCategoria}
            maxLength={40}
            onChange={(e) => setNovaCategoria(e.target.value)}
            placeholder="Nova categoria"
            aria-label="Nova categoria"
            aria-invalid={!!nomeNovo && categoriaRepetida}
            className="h-11 min-w-0 flex-1 rounded-[14px] bg-sunk px-4 text-base text-ink ring-1 ring-line outline-none transition-shadow duration-150 placeholder:text-muted focus:ring-2 focus:ring-accent md:text-[15px]"
          />
          <Botao type="submit" className="h-11" disabled={!nomeNovo || categoriaRepetida}>
            <Plus size={16} weight="bold" />
            Adicionar
          </Botao>
        </form>
        {nomeNovo && categoriaRepetida && <p className="aparece mt-2 text-[13px] text-red-ink">Já existe uma categoria com esse nome</p>}
      </Secao>

      <Secao
        i={3}
        titulo="Cópia de segurança"
        descricao="Os dados ficam só neste aparelho. Baixe uma cópia de vez em quando para não perder produtos e vendas"
      >
        <div className="flex flex-wrap gap-2">
          <Botao className="h-11" onClick={baixarCopia}>
            <DownloadSimple size={16} weight="bold" />
            Baixar cópia
          </Botao>
          <Botao className="h-11" onClick={() => campoArquivo.current?.click()}>
            <UploadSimple size={16} weight="bold" />
            Restaurar de um arquivo
          </Botao>
          <input
            ref={campoArquivo}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (f.size > 20_000_000) return avisar("O arquivo é grande demais", true);
              setArquivo(await f.text());
            }}
          />
        </div>
      </Secao>

      <Secao
        i={4}
        titulo="Vendas de teste"
        descricao={`Apaga as ${loja.vendas.length} vendas registradas neste aparelho. Produtos e categorias ficam`}
      >
        <Botao variante="perigo" className="h-11" disabled={loja.vendas.length === 0} onClick={() => setConfirmarApagar(true)}>
          Apagar vendas
        </Botao>
      </Secao>

      <Janela
        aberta={confirmarApagar}
        aoFechar={() => setConfirmarApagar(false)}
        titulo="Apagar todas as vendas"
        rodape={
          <div className="flex gap-2">
            <Botao className="h-12 flex-1" onClick={() => setConfirmarApagar(false)}>
              Cancelar
            </Botao>
            <Botao
              variante="perigo"
              className="h-12 flex-1"
              onClick={() => {
                apagarVendas();
                setConfirmarApagar(false);
                avisar("Vendas apagadas");
              }}
            >
              Apagar {loja.vendas.length}
            </Botao>
          </div>
        }
      >
        <p className="text-[15px] text-body">
          As {loja.vendas.length} vendas somem dos relatórios e a numeração volta para 1. Não dá para desfazer. Se quiser guardar,
          baixe uma cópia antes.
        </p>
      </Janela>

      <Janela
        aberta={arquivo !== null}
        aoFechar={() => setArquivo(null)}
        titulo="Restaurar cópia"
        rodape={
          <div className="flex gap-2">
            <Botao className="h-12 flex-1" onClick={() => setArquivo(null)}>
              Cancelar
            </Botao>
            <Botao
              variante="perigo"
              className="h-12 flex-1"
              onClick={() => {
                const erro = arquivo ? importarDados(arquivo) : "Arquivo vazio";
                setArquivo(null);
                avisar(erro ?? "Cópia restaurada", !!erro);
              }}
            >
              Substituir tudo
            </Botao>
          </div>
        }
      >
        <p className="text-[15px] text-body">
          Os produtos, categorias, taxas e vendas deste aparelho serão trocados pelos do arquivo. O que existe hoje aqui é
          apagado.
        </p>
      </Janela>

      {aviso && (
        <Aviso>
          <p className={`font-medium ${aviso.erro ? "text-red-ink" : "text-ink"}`}>{aviso.texto}</p>
        </Aviso>
      )}
    </div>
  );
}
