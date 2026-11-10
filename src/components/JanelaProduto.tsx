"use client";

import { useState } from "react";
import { margem, nivelMargem, pct, reais } from "@/lib/dinheiro";
import { arquivarProduto, nomeDeProdutoEmUso, salvarProduto } from "@/lib/loja";
import type { Categoria, Produto } from "@/lib/tipos";
import { Botao, CampoDinheiro, CampoEscolha, CampoTexto, Janela } from "@/components/ui";

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

  const m = preco ? margem(preco, custo) : null;
  const nivel = nivelMargem(m);
  const lucroUnidade = preco !== null && custo !== null ? preco - custo : null;

  const nomeLimpo = nome.trim();
  const repetido = nomeLimpo !== "" && nomeDeProdutoEmUso(nomeLimpo, produto?.id);
  // O erro de nome repetido aparece na hora; os de campo vazio, só depois de tentar salvar.
  const erroNome = repetido ? "Já existe um produto com esse nome" : tentou && !nomeLimpo ? "Informe o nome" : null;
  const erroPreco = tentou && (!preco || preco <= 0) ? "Informe o preço" : null;
  const valido = nomeLimpo !== "" && !repetido && !!preco && preco > 0 && categoriaId !== "";

  function salvar(fechar: () => void) {
    setTentou(true);
    if (!valido || !preco) return;
    salvarProduto({ id: produto?.id, nome: nomeLimpo, categoriaId, preco, custo });
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
        <button type="submit" hidden />
      </form>
    </Janela>
  );
}
