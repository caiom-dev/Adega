"use client";

import { useEffect, useState } from "react";
import { margem, nivelMargem, pct, reais } from "@/lib/dinheiro";
import {
  arquivarProduto,
  movimentosEstoque,
  nomeDeProdutoEmUso,
  nomePessoa,
  pararEstoque,
  registrarEstoque,
  salvarProduto,
  useLoja,
} from "@/lib/loja";
import type { Categoria, MovimentoEstoque, Produto } from "@/lib/tipos";
import { Botao, CampoDinheiro, CampoEscolha, CampoTexto, Janela } from "@/components/ui";

const soNumero = (texto: string) => texto.replace(/\D/g, "").slice(0, 5);
const paraNumero = (texto: string) => (texto === "" ? null : Number(texto));
const formatoDataHora = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const NOME_MOVIMENTO: Record<MovimentoEstoque["tipo"], string> = {
  venda: "Venda",
  cancelamento: "Venda cancelada",
  entrada: "Entrada",
  contagem: "Contagem",
  perda: "Perda",
};
const MOTIVOS_PERDA = ["Quebrou", "Venceu", "Consumo da casa", "Outro"];

export function JanelaProduto({
  produto,
  categorias,
  aoFechar,
}: {
  /** undefined = produto novo */
  produto?: Produto;
  categorias: Categoria[];
  aoFechar: () => void;
}) {
  const [nome, setNome] = useState(produto?.nome ?? "");
  const [categoriaId, setCategoriaId] = useState(produto?.categoriaId ?? categorias[0]?.id ?? "");
  const [preco, setPreco] = useState<number | null>(produto?.preco ?? null);
  const [custo, setCusto] = useState<number | null>(produto?.custo ?? null);
  const [confirmarRemocao, setConfirmarRemocao] = useState(false);
  const [tentou, setTentou] = useState(false);
  const [minimo, setMinimo] = useState(produto?.estoqueMinimo === null || produto?.estoqueMinimo === undefined ? "" : String(produto.estoqueMinimo));
  // Só para produto novo: quantas unidades tem agora (vazio = não controla estoque).
  const [estoqueInicial, setEstoqueInicial] = useState("");

  const m = preco ? margem(preco, custo) : null;
  const nivel = nivelMargem(m);
  const lucroUnidade = preco !== null && custo !== null ? preco - custo : null;

  const nomeLimpo = nome.trim();
  const repetido = nomeLimpo !== "" && nomeDeProdutoEmUso(nomeLimpo, produto?.id);
  // O erro de nome repetido aparece na hora; os de campo vazio, só depois de tentar salvar.
  const erroNome = repetido ? "Já existe um produto com esse nome" : tentou && !nomeLimpo ? "Informe o nome" : null;
  const erroPreco = tentou && (!preco || preco <= 0) ? "Informe o preço" : null;
  const valido = nomeLimpo !== "" && !repetido && !!preco && preco > 0 && categoriaId !== "";

  // O estoque mínimo só vale para produto com estoque controlado. Lê da loja, e não da cópia
  // que abriu a janela: o controle pode ter sido ligado agora mesmo, nesta janela.
  const loja = useLoja();
  const estoqueAgora = produto ? (loja.produtos.find((p) => p.id === produto.id)?.estoque ?? null) : null;
  const controla = produto ? estoqueAgora !== null : estoqueInicial !== "";

  function salvar(fechar: () => void) {
    setTentou(true);
    if (!valido || !preco) return;
    const inicial = paraNumero(estoqueInicial);
    void salvarProduto({
      id: produto?.id,
      nome: nomeLimpo,
      categoriaId,
      preco,
      custo,
      estoqueMinimo: controla ? paraNumero(minimo) : null,
    }).then((id) => {
      // O estoque inicial espera o produto existir no banco.
      if (id && !produto && inicial !== null) void registrarEstoque(id, "contagem", inicial, "Estoque inicial");
    });
    fechar();
  }

  return (
    <Janela
      aberta
      aoFechar={aoFechar}
      titulo={produto ? "Editar produto" : "Novo produto"}
      rodape={(fechar) => (
        <div className="flex gap-2">
          {produto &&
            (confirmarRemocao ? (
              <Botao
                variante="perigo"
                className="aparece h-12"
                onClick={() => {
                  arquivarProduto(produto.id);
                  fechar();
                }}
              >
                Confirmar remoção
              </Botao>
            ) : (
              <Botao variante="fantasma" className="h-12 text-red-ink hover:text-red-ink" onClick={() => setConfirmarRemocao(true)}>
                Remover
              </Botao>
            ))}
          <Botao variante="principal" className="h-12 flex-1" onClick={() => salvar(fechar)}>
            Salvar
          </Botao>
        </div>
      )}
    >
      <form
        id="form-produto"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          salvar(aoFechar);
        }}
      >
        <CampoTexto
          rotulo="Nome"
          placeholder="Heineken lata 350ml"
          maxLength={60}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          autoFocus={!produto}
          erro={erroNome}
        />

        <CampoEscolha rotulo="Categoria" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </CampoEscolha>

        <div className="grid grid-cols-2 gap-3">
          <CampoDinheiro rotulo="Preço de venda" valor={preco} aoMudar={setPreco} erro={erroPreco} />
          <CampoDinheiro rotulo="Custo" valor={custo} aoMudar={setCusto} />
        </div>

        {/* Conta feita na hora, enquanto digita */}
        <div
          className={`num rounded-[16px] px-4 py-3 text-[15px] ${
            lucroUnidade !== null && lucroUnidade < 0
              ? "bg-red-soft text-red-ink"
              : nivel === "baixa"
                ? "bg-red-soft text-red-ink"
                : nivel === "boa"
                  ? "bg-green-soft text-green-ink"
                  : nivel === "sem-custo"
                    ? "bg-yellow-soft text-yellow-ink"
                    : "bg-sunk text-body"
          }`}
        >
          {lucroUnidade === null || m === null ? (
            <p>Preencha o custo (quanto você paga) para ver o lucro de cada unidade</p>
          ) : (
            <>
              <p className="text-[17px] font-semibold">
                {lucroUnidade >= 0 ? "Lucro" : "Prejuízo"} de {reais(Math.abs(lucroUnidade))} por unidade
              </p>
              <p className="mt-0.5 opacity-80">
                {lucroUnidade < 0
                  ? "O custo está maior que o preço de venda"
                  : `Margem de ${pct(m)} sobre o preço${custo ? ` · ${pct(((preco! - custo) / custo) * 100)} acima do custo` : ""}`}
              </p>
            </>
          )}
        </div>
        {produto ? (
          <SecaoEstoque produto={produto} minimo={minimo} aoMudarMinimo={setMinimo} />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <CampoTexto
              rotulo="Estoque atual"
              inputMode="numeric"
              placeholder="Não controlar"
              value={estoqueInicial}
              onChange={(e) => setEstoqueInicial(soNumero(e.target.value))}
            />
            <CampoTexto
              rotulo="Avisar com"
              inputMode="numeric"
              placeholder="0"
              disabled={!controla}
              value={minimo}
              onChange={(e) => setMinimo(soNumero(e.target.value))}
            />
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Janela>
  );
}

/* ───────── Estoque de um produto que já existe ───────── */

function SecaoEstoque({
  produto,
  minimo,
  aoMudarMinimo,
}: {
  produto: Produto;
  minimo: string;
  aoMudarMinimo: (v: string) => void;
}) {
  const loja = useLoja();
  // O estoque muda ao vivo (vendas em outros aparelhos): lê sempre da loja, não da cópia que abriu a janela.
  const estoque = loja.produtos.find((p) => p.id === produto.id)?.estoque ?? null;
  const [acao, setAcao] = useState<"entrada" | "contagem" | "perda" | null>(null);
  const [motivoPerda, setMotivoPerda] = useState(MOTIVOS_PERDA[0]);
  const [qtd, setQtd] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [historico, setHistorico] = useState<MovimentoEstoque[] | null | undefined>(undefined);

  useEffect(() => {
    if (estoque === null) return;
    let vivo = true;
    movimentosEstoque(produto.id).then((m) => vivo && setHistorico(m));
    return () => {
      vivo = false;
    };
  }, [produto.id, estoque]);

  function comecar(tipo: "entrada" | "contagem" | "perda") {
    setAcao(tipo);
    setQtd("");
    setMotivo("");
    setErro(null);
  }

  async function confirmar() {
    const n = paraNumero(qtd);
    if (n === null || !acao || ocupado) return;
    setOcupado(true);
    setErro(null);
    const texto = acao === "perda" ? (motivo.trim() ? `${motivoPerda} · ${motivo.trim()}` : motivoPerda) : motivo;
    const falha = await registrarEstoque(produto.id, acao, n, texto);
    setOcupado(false);
    if (falha) setErro(falha);
    else setAcao(null);
  }

  const baixo = estoque !== null && estoque <= (paraNumero(minimo) ?? 0);

  return (
    <div className="rounded-[16px] bg-sunk p-4 ring-1 ring-line">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[15px] font-medium text-ink">Estoque</p>
        {estoque !== null && (
          <p className={`num text-[17px] font-semibold ${estoque <= 0 ? "text-red-ink" : baixo ? "text-yellow-ink" : "text-ink"}`}>
            {estoque} {Math.abs(estoque) === 1 ? "unidade" : "unidades"}
          </p>
        )}
      </div>

      {estoque === null && !acao && (
        <>
          <p className="mt-1 text-[13px] text-body">Este produto não tem estoque controlado.</p>
          <Botao className="mt-3 h-11 w-full" onClick={() => comecar("contagem")}>
            Controlar estoque
          </Botao>
        </>
      )}

      {estoque !== null && !acao && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Botao className="h-11 px-2" onClick={() => comecar("entrada")}>
              Entrada
            </Botao>
            <Botao className="h-11 px-2" onClick={() => comecar("contagem")}>
              Contagem
            </Botao>
            <Botao className="h-11 px-2" onClick={() => comecar("perda")}>
              Perda
            </Botao>
          </div>
          <div className="mt-3">
            <CampoTexto
              rotulo="Avisar quando chegar em"
              inputMode="numeric"
              placeholder="0"
              value={minimo}
              onChange={(e) => aoMudarMinimo(soNumero(e.target.value))}
              dica="O aviso de estoque acabando aparece no Início e na aba Estoque. Vale ao salvar"
            />
          </div>
        </>
      )}

      {acao && (
        <div className="aparece mt-3 space-y-3">
          <CampoTexto
            rotulo={
              acao === "entrada"
                ? "Quantas unidades chegaram"
                : acao === "perda"
                  ? "Quantas unidades perdeu"
                  : estoque === null
                    ? "Quantas unidades tem agora"
                    : "Quantas unidades contou"
            }
            inputMode="numeric"
            autoFocus
            value={qtd}
            onChange={(e) => setQtd(soNumero(e.target.value))}
            // Enter confirma o estoque, sem salvar o produto inteiro.
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              void confirmar();
            }}
            dica={acao === "contagem" && estoque !== null ? "O número contado substitui o estoque atual" : undefined}
          />
          {acao === "perda" && (
            <div className="flex flex-wrap gap-2">
              {MOTIVOS_PERDA.map((m) => (
                <button
                  key={m}
                  type="button"
                  data-luz=""
                  aria-pressed={motivoPerda === m}
                  onClick={() => setMotivoPerda(m)}
                  className={`aperta h-9 rounded-full px-4 text-sm font-medium ${motivoPerda === m ? "vidro-ambar" : "vidro-leve text-body"}`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
          <CampoTexto
            rotulo="Observação"
            placeholder={acao === "entrada" ? "Fornecedor, nota..." : "Opcional"}
            maxLength={120}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          {erro && <p className="text-[15px] text-red-ink">{erro}</p>}
          <div className="flex gap-2">
            <Botao variante="fantasma" className="h-11" onClick={() => setAcao(null)}>
              Voltar
            </Botao>
            <Botao
              variante="principal"
              className="h-11 flex-1"
              disabled={qtd === "" || (acao !== "contagem" && Number(qtd) === 0) || ocupado}
              onClick={confirmar}
            >
              {ocupado
                ? "Salvando"
                : acao === "entrada"
                  ? "Somar ao estoque"
                  : acao === "perda"
                    ? "Tirar do estoque"
                    : "Salvar contagem"}
            </Botao>
          </div>
        </div>
      )}

      {estoque !== null && historico && historico.length > 0 && (
        <ul className="num mt-4 divide-y divide-line border-t border-line text-[13px]">
          {historico.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-body">
                  {NOME_MOVIMENTO[m.tipo]}
                  {m.motivo && ` · ${m.motivo}`}
                </span>
                <span className="block truncate text-muted">
                  {formatoDataHora.format(new Date(m.criadoEm))} · {nomePessoa(loja.equipe, m.pessoaId)}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className={`block font-medium ${m.qtd > 0 ? "text-green-ink" : m.qtd < 0 ? "text-red-ink" : "text-body"}`}>
                  {m.qtd > 0 ? `+${m.qtd}` : m.qtd}
                </span>
                <span className="block text-muted">fica {m.saldo}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {estoque !== null && !acao && (
        <Botao variante="fantasma" className="mt-2 h-10 w-full text-[13px]" onClick={() => pararEstoque(produto.id)}>
          Parar de controlar o estoque
        </Botao>
      )}
    </div>
  );
}
