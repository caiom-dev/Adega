"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CaretLeft, CaretRight, MagnifyingGlass, Minus, Plus, ShoppingBag } from "@phosphor-icons/react";
import { reais } from "@/lib/dinheiro";
import { DIAS, buscarCardapio, enviarPedido, formatarTelefone, textoDia, type Cardapio } from "@/lib/delivery";
import type { PagamentoPedido } from "@/lib/tipos";
import { Botao, CampoDinheiro, CampoEscolha, CampoTexto, Cartao, NumeroAnimado, Segmentado } from "@/components/ui";

/* Tudo que fica no aparelho do cliente: só conveniência, nada depende disso. */
const CHAVE = {
  maior: "adega-pedir:maior",
  aparelho: "adega-pedir:aparelho",
  cliente: "adega-pedir:cliente",
  carrinho: "adega-pedir:carrinho",
  pedidos: "adega-pedir:pedidos",
};

function ler<T>(chave: string, padrao: T): T {
  try {
    const v = localStorage.getItem(chave);
    return v === null ? padrao : (JSON.parse(v) as T);
  } catch {
    return padrao;
  }
}
function guardar(chave: string, valor: unknown) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // Sem armazenamento local: só não lembra da próxima vez.
  }
}

/** Identifica o aparelho para o limite de pedidos. Não é segredo nem login. */
function aparelho(): string {
  let id = ler<string>(CHAVE.aparelho, "");
  if (!id) {
    id = crypto.randomUUID();
    guardar(CHAVE.aparelho, id);
  }
  return id;
}

/** Pedidos feitos neste aparelho, do mais novo para o mais antigo. */
export function pedidosDoAparelho(): { token: string; numero: number; em: string }[] {
  return ler(CHAVE.pedidos, []);
}

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function Tela({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto min-h-dvh max-w-xl px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-36">{children}</div>;
}

function Topo({ subtitulo }: { subtitulo?: React.ReactNode }) {
  return (
    <header className="flex items-center gap-3">
      <Image src="/logo-p.webp" alt="Adega do Pezão" width={240} height={217} priority className="h-auto w-16" />
      <div className="min-w-0">
        <h1 className="text-2xl leading-tight font-semibold tracking-tight text-ink">Adega do Pezão</h1>
        {subtitulo && <p className="text-[15px] text-body">{subtitulo}</p>}
      </div>
    </header>
  );
}

function Contador({ qtd, aoMudar, nome }: { qtd: number; aoMudar: (n: number) => void; nome: string }) {
  if (qtd === 0) {
    return (
      <Botao className="h-10 w-10 shrink-0 rounded-full px-0" onClick={() => aoMudar(1)} aria-label={`Adicionar ${nome}`}>
        <Plus size={16} weight="bold" />
      </Botao>
    );
  }
  return (
    <div className="vidro-leve flex shrink-0 items-center rounded-full">
      <button
        type="button"
        onClick={() => aoMudar(qtd - 1)}
        className="aperta flex h-10 w-10 items-center justify-center rounded-full text-body hover:text-ink"
        aria-label={`Tirar um ${nome}`}
      >
        <Minus size={14} weight="bold" />
      </button>
      <span key={qtd} className="num estala w-6 text-center text-[15px] font-medium text-ink">
        {qtd}
      </span>
      <button
        type="button"
        onClick={() => aoMudar(Math.min(qtd + 1, 99))}
        className="aperta flex h-10 w-10 items-center justify-center rounded-full text-body hover:text-ink"
        aria-label={`Mais um ${nome}`}
      >
        <Plus size={14} weight="bold" />
      </button>
    </div>
  );
}

/* ───────── Página ───────── */

export function Loja() {
  const router = useRouter();
  const [lido, setLido] = useState(false);
  const [maior, setMaior] = useState(false);
  const [recusouIdade, setRecusouIdade] = useState(false);
  // undefined = carregando, null = sem internet
  const [cardapio, setCardapio] = useState<Cardapio | null | undefined>(undefined);
  const [carrinho, setCarrinho] = useState<Record<string, number>>({});
  const [etapa, setEtapa] = useState<"cardapio" | "carrinho">("cardapio");
  const [anteriores, setAnteriores] = useState<ReturnType<typeof pedidosDoAparelho>>([]);

  const carregar = useCallback(() => {
    buscarCardapio().then(setCardapio);
  }, []);

  useEffect(() => {
    // O localStorage só existe no navegador: lê depois de montar.
    /* eslint-disable react-hooks/set-state-in-effect */
    setMaior(ler(CHAVE.maior, false));
    setCarrinho(ler(CHAVE.carrinho, {}));
    setAnteriores(pedidosDoAparelho());
    setLido(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    carregar();
    // Voltou para a aba depois de um tempo: preços, estoque e horário podem ter mudado.
    const aoVoltar = () => document.visibilityState === "visible" && carregar();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, [carregar]);

  // Tira do carrinho o que saiu do cardápio (acabou ou foi desmarcado).
  const carrinhoValido = useMemo(() => {
    if (!cardapio) return carrinho;
    const existe = new Set(cardapio.produtos.map((p) => p.id));
    return Object.fromEntries(Object.entries(carrinho).filter(([id, q]) => existe.has(id) && q > 0));
  }, [carrinho, cardapio]);

  function mudarQtd(id: string, qtd: number) {
    setCarrinho((c) => {
      const novo = { ...c };
      if (qtd <= 0) delete novo[id];
      else novo[id] = qtd;
      guardar(CHAVE.carrinho, novo);
      return novo;
    });
  }

  if (!lido) return <Tela>{null}</Tela>;

  if (!maior) {
    return (
      <Tela>
        <div className="entra flex min-h-[70dvh] flex-col justify-center">
          <Image src="/logo-p.webp" alt="Adega do Pezão" width={240} height={217} priority className="mx-auto h-auto w-40" />
          <h1 className="mt-8 text-center text-[28px] leading-tight font-semibold tracking-tight text-ink">Você tem 18 anos ou mais?</h1>
          <p className="mt-3 text-center text-[15px] text-body">A venda de bebida alcoólica é proibida para menores de 18 anos.</p>
          {recusouIdade ? (
            <p className="mt-8 rounded-[16px] bg-sunk px-4 py-4 text-center text-[15px] text-body ring-1 ring-line">
              Sem problema. Volte quando tiver 18 anos.
            </p>
          ) : (
            <div className="mt-8 grid gap-2">
              <Botao
                variante="principal"
                className="h-12"
                onClick={() => {
                  guardar(CHAVE.maior, true);
                  setMaior(true);
                }}
              >
                Sim, tenho 18 anos ou mais
              </Botao>
              <Botao variante="fantasma" className="h-12" onClick={() => setRecusouIdade(true)}>
                Não
              </Botao>
            </div>
          )}
        </div>
      </Tela>
    );
  }

  if (cardapio === undefined) {
    return (
      <Tela>
        <Topo />
        <div className="mt-8 space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-[16px] bg-sunk" />
          ))}
        </div>
      </Tela>
    );
  }

  if (cardapio === null) {
    return (
      <Tela>
        <Topo />
        <div className="mt-10 text-center">
          <p className="text-[17px] font-medium text-ink">Não conseguimos carregar o cardápio</p>
          <p className="mt-2 text-[15px] text-body">Confira sua internet e tente de novo.</p>
          <Botao
            variante="principal"
            className="mt-6 h-12 px-6"
            onClick={() => {
              setCardapio(undefined);
              carregar();
            }}
          >
            Tentar de novo
          </Botao>
        </div>
      </Tela>
    );
  }

  const ultimo = anteriores[0];
  const linkUltimo = ultimo && (
    <button
      type="button"
      onClick={() => router.push(`/pedir?p=${ultimo.token}`)}
      className="aperta mt-4 flex w-full items-center justify-between gap-3 rounded-[16px] bg-sunk px-4 py-3 text-left ring-1 ring-line"
    >
      <span className="text-[15px] text-ink">Acompanhar o pedido nº {ultimo.numero}</span>
      <CaretRight size={14} className="text-muted" />
    </button>
  );

  if (!cardapio.aberto) {
    const temHorario = cardapio.horario.length === 7;
    return (
      <Tela>
        <Topo subtitulo="Delivery fechado agora" />
        {linkUltimo}
        <Cartao className="mt-6 p-5">
          <p className="text-[17px] font-medium text-ink">Não estamos aceitando pedidos agora</p>
          {temHorario ? (
            <>
              <p className="mt-1 text-[15px] text-body">Nosso horário de delivery:</p>
              <dl className="num mt-4 space-y-1.5 text-[15px]">
                {DIAS.map((dia, i) => (
                  <div key={dia} className={`flex justify-between ${i === new Date().getDay() ? "font-medium text-ink" : "text-body"}`}>
                    <dt>{dia}</dt>
                    <dd>{textoDia(cardapio.horario[i])}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <p className="mt-1 text-[15px] text-body">Volte mais tarde.</p>
          )}
        </Cartao>
      </Tela>
    );
  }

  return etapa === "carrinho" ? (
    <Carrinho
      cardapio={cardapio}
      carrinho={carrinhoValido}
      aoMudarQtd={mudarQtd}
      aoVoltar={() => setEtapa("cardapio")}
      aoEnviar={(token, numero) => {
        const lista = [{ token, numero, em: new Date().toISOString() }, ...pedidosDoAparelho()].slice(0, 5);
        guardar(CHAVE.pedidos, lista);
        guardar(CHAVE.carrinho, {});
        router.replace(`/pedir?p=${token}`);
      }}
      aoAtualizar={carregar}
    />
  ) : (
    <ListaProdutos
      cardapio={cardapio}
      carrinho={carrinhoValido}
      aoMudarQtd={mudarQtd}
      aoVerCarrinho={() => {
        setEtapa("carrinho");
        window.scrollTo({ top: 0 });
      }}
      extra={linkUltimo}
    />
  );
}

/* ───────── Cardápio ───────── */

function ListaProdutos({
  cardapio,
  carrinho,
  aoMudarQtd,
  aoVerCarrinho,
  extra,
}: {
  cardapio: Cardapio;
  carrinho: Record<string, number>;
  aoMudarQtd: (id: string, qtd: number) => void;
  aoVerCarrinho: () => void;
  extra?: React.ReactNode;
}) {
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("todas");

  const lista = useMemo(() => {
    const termo = semAcento(busca).trim();
    return cardapio.produtos
      .filter((p) => categoria === "todas" || p.categoriaId === categoria)
      .filter((p) => !termo || semAcento(p.nome).includes(termo));
  }, [cardapio.produtos, categoria, busca]);

  const preco = useMemo(() => new Map(cardapio.produtos.map((p) => [p.id, p.preco])), [cardapio.produtos]);
  const itens = Object.values(carrinho).reduce((s, q) => s + q, 0);
  const subtotal = Object.entries(carrinho).reduce((s, [id, q]) => s + (preco.get(id) ?? 0) * q, 0);

  return (
    <Tela>
      <Topo
        subtitulo={
          <>
            <span className="text-green-ink">Aberto agora</span>
            {cardapio.pedidoMinimo > 0 && ` · pedido mínimo ${reais(cardapio.pedidoMinimo)}`}
          </>
        }
      />
      {extra}

      <label className="mt-6 flex h-12 items-center gap-2 rounded-[14px] bg-sunk px-4 ring-1 ring-line transition-shadow duration-150 focus-within:ring-2 focus-within:ring-accent">
        <MagnifyingGlass size={18} className="text-muted" />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar bebida"
          aria-label="Buscar produto"
          className="h-full w-full bg-transparent text-base text-ink outline-none placeholder:text-muted"
        />
      </label>

      <div className="sem-barra -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        {[{ id: "todas", nome: "Tudo" }, ...cardapio.categorias].map((c) => (
          <button
            key={c.id}
            type="button"
            data-luz=""
            aria-pressed={categoria === c.id}
            onClick={() => setCategoria(c.id)}
            className={`aperta h-9 shrink-0 rounded-full px-4 text-sm font-medium ${categoria === c.id ? "vidro-ambar" : "vidro-leve text-body"}`}
          >
            {c.nome}
          </button>
        ))}
      </div>

      {cardapio.produtos.length === 0 ? (
        <p className="mt-6 rounded-[20px] px-4 py-12 text-center text-[15px] text-muted ring-1 ring-line">O cardápio está vazio agora</p>
      ) : lista.length === 0 ? (
        <p className="mt-6 rounded-[20px] px-4 py-12 text-center text-[15px] text-muted ring-1 ring-line">Nada encontrado</p>
      ) : (
        <Cartao className="mt-4 overflow-hidden">
          <ul className="divide-y divide-line">
            {lista.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] leading-snug font-medium text-ink">{p.nome}</span>
                  <span className="num block text-[15px] text-body">{reais(p.preco)}</span>
                </span>
                <Contador qtd={carrinho[p.id] ?? 0} aoMudar={(q) => aoMudarQtd(p.id, q)} nome={p.nome} />
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      {itens > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={aoVerCarrinho}
            className="vidro-ambar aperta estala mx-auto flex h-14 w-full max-w-xl items-center justify-between rounded-full px-5"
          >
            <span className="flex items-center gap-2 text-[15px] font-semibold">
              <ShoppingBag size={18} weight="bold" />
              Ver carrinho · {itens} {itens === 1 ? "item" : "itens"}
            </span>
            <NumeroAnimado valor={subtotal} formato={reais} className="num text-[17px] font-semibold" />
          </button>
        </div>
      )}
    </Tela>
  );
}

/* ───────── Carrinho e dados de entrega ───────── */

interface DadosCliente {
  nome: string;
  telefone: string;
  bairroId: string;
  endereco: string;
  complemento: string;
}

const PAGAMENTOS: { id: PagamentoPedido; nome: string }[] = [
  { id: "pix", nome: "Pix" },
  { id: "cartao", nome: "Cartão" },
  { id: "dinheiro", nome: "Dinheiro" },
];

function Carrinho({
  cardapio,
  carrinho,
  aoMudarQtd,
  aoVoltar,
  aoEnviar,
  aoAtualizar,
}: {
  cardapio: Cardapio;
  carrinho: Record<string, number>;
  aoMudarQtd: (id: string, qtd: number) => void;
  aoVoltar: () => void;
  aoEnviar: (token: string, numero: number) => void;
  aoAtualizar: () => void;
}) {
  const [dados, setDados] = useState<DadosCliente>(() =>
    ler(CHAVE.cliente, { nome: "", telefone: "", bairroId: "", endereco: "", complemento: "" }),
  );
  const [retirada, setRetirada] = useState(false);
  const [pagamento, setPagamento] = useState<PagamentoPedido | null>(null);
  const [trocoPara, setTrocoPara] = useState<number | null>(null);
  const [observacao, setObservacao] = useState("");
  const [tentou, setTentou] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const porId = useMemo(() => new Map(cardapio.produtos.map((p) => [p.id, p])), [cardapio.produtos]);
  const linhas = Object.entries(carrinho)
    .map(([id, qtd]) => ({ produto: porId.get(id)!, qtd }))
    .filter((l) => l.produto);
  const subtotal = linhas.reduce((s, l) => s + l.produto.preco * l.qtd, 0);
  const bairro = cardapio.bairros.find((b) => b.id === dados.bairroId);
  const entrega = !retirada;
  const taxa = entrega && bairro ? bairro.taxa : 0;
  const total = subtotal + taxa;
  const faltaMinimo = Math.max(0, cardapio.pedidoMinimo - subtotal);

  const fone = dados.telefone.replace(/\D/g, "");
  const erros = {
    nome: dados.nome.trim().length < 2 ? "Escreva seu nome" : null,
    telefone: fone.length < 10 ? "Telefone com DDD" : null,
    bairro: entrega && !bairro ? "Escolha o bairro" : null,
    endereco: entrega && dados.endereco.trim().length < 5 ? "Rua e número" : null,
    pagamento: !pagamento ? "Escolha como vai pagar" : null,
    troco: pagamento === "dinheiro" && trocoPara !== null && trocoPara < total ? `Precisa ser ${reais(total)} ou mais` : null,
  };
  const valido = Object.values(erros).every((e) => !e) && faltaMinimo === 0 && linhas.length > 0;
  const mostrar = (e: string | null) => (tentou ? e : null);

  function mudar(campo: keyof DadosCliente, valor: string) {
    setDados((d) => {
      const novo = { ...d, [campo]: valor };
      guardar(CHAVE.cliente, novo);
      return novo;
    });
  }

  async function enviar() {
    setTentou(true);
    if (!valido || !pagamento || enviando) return;
    setEnviando(true);
    setErro(null);
    const r = await enviarPedido({
      cliente: dados.nome.trim(),
      telefone: fone,
      maior: true,
      retirada,
      bairroId: entrega ? dados.bairroId : undefined,
      endereco: entrega ? dados.endereco : undefined,
      complemento: entrega ? dados.complemento : undefined,
      itens: linhas.map((l) => ({ produtoId: l.produto.id, qtd: l.qtd })),
      pagamento,
      trocoPara: pagamento === "dinheiro" ? trocoPara : null,
      observacao,
      aparelho: aparelho(),
    });
    setEnviando(false);
    if (r.ok) {
      aoEnviar(r.token, r.numero);
      return;
    }
    setErro(r.erro);
    aoAtualizar();
  }

  return (
    <Tela>
      <button type="button" onClick={aoVoltar} className="aperta -ml-2 flex h-11 items-center gap-1 pr-3 text-[15px] font-medium text-ink">
        <CaretLeft size={20} weight="bold" className="text-accent" />
        Cardápio
      </button>
      <h1 className="mt-2 text-[28px] leading-tight font-semibold tracking-tight text-ink">Seu pedido</h1>

      {linhas.length === 0 ? (
        <p className="mt-6 rounded-[20px] px-4 py-12 text-center text-[15px] text-muted ring-1 ring-line">O carrinho está vazio</p>
      ) : (
        <Cartao className="mt-4 overflow-hidden">
          <ul className="divide-y divide-line">
            {linhas.map(({ produto, qtd }) => (
              <li key={produto.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-ink">{produto.nome}</span>
                  <span className="num block text-[13px] text-body">{reais(produto.preco * qtd)}</span>
                </span>
                <Contador qtd={qtd} aoMudar={(q) => aoMudarQtd(produto.id, q)} nome={produto.nome} />
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      <form
        className="mt-8 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
      >
        {cardapio.retirada && (
          <Segmentado
            rotulo="Entrega ou retirada"
            valor={retirada ? "retirada" : "entrega"}
            aoMudar={(v) => setRetirada(v === "retirada")}
            opcoes={[
              { id: "entrega", nome: "Entregar" },
              { id: "retirada", nome: "Retirar na loja" },
            ]}
          />
        )}

        {entrega && (
          <>
            {cardapio.bairros.length === 0 ? (
              <p className="rounded-[14px] bg-yellow-soft px-4 py-3 text-[15px] text-yellow-ink">
                A entrega ainda não está disponível.{cardapio.retirada ? " Você pode retirar na loja." : ""}
              </p>
            ) : (
              <>
                <CampoEscolha rotulo="Bairro" value={dados.bairroId} onChange={(e) => mudar("bairroId", e.target.value)}>
                  <option value="">Escolha o bairro</option>
                  {cardapio.bairros.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nome} · {b.taxa > 0 ? `entrega ${reais(b.taxa)}` : "entrega grátis"}
                    </option>
                  ))}
                </CampoEscolha>
                {mostrar(erros.bairro) && <p className="-mt-2 text-[13px] text-red-ink">{erros.bairro}</p>}
                <p className="-mt-2 text-[13px] text-muted">Seu bairro não está na lista? Ainda não entregamos aí.</p>
              </>
            )}
            <CampoTexto
              rotulo="Endereço"
              placeholder="Rua e número"
              autoComplete="street-address"
              maxLength={160}
              value={dados.endereco}
              onChange={(e) => mudar("endereco", e.target.value)}
              erro={mostrar(erros.endereco)}
            />
            <CampoTexto
              rotulo="Complemento"
              placeholder="Apartamento, bloco, ponto de referência"
              maxLength={80}
              value={dados.complemento}
              onChange={(e) => mudar("complemento", e.target.value)}
            />
          </>
        )}

        <CampoTexto
          rotulo="Seu nome"
          autoComplete="name"
          maxLength={60}
          value={dados.nome}
          onChange={(e) => mudar("nome", e.target.value)}
          erro={mostrar(erros.nome)}
        />
        <CampoTexto
          rotulo="Telefone (WhatsApp)"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(11) 98765-4321"
          value={formatarTelefone(dados.telefone)}
          onChange={(e) => mudar("telefone", e.target.value.replace(/\D/g, "").slice(0, 11))}
          erro={mostrar(erros.telefone)}
        />

        <div>
          <span className="mb-2 flex justify-between text-[13px]">
            <span className="text-body">Pagamento na {retirada ? "retirada" : "entrega"}</span>
            {mostrar(erros.pagamento) && <span className="text-red-ink">{erros.pagamento}</span>}
          </span>
          <div className="grid grid-cols-3 gap-2">
            {PAGAMENTOS.map((p) => (
              <button
                key={p.id}
                type="button"
                data-luz=""
                aria-pressed={pagamento === p.id}
                onClick={() => setPagamento(p.id)}
                className={`aperta h-12 rounded-[14px] text-[15px] font-medium ${pagamento === p.id ? "vidro-ambar" : "vidro-leve text-ink"}`}
              >
                {p.nome}
              </button>
            ))}
          </div>
        </div>
        {pagamento === "dinheiro" && (
          <CampoDinheiro
            rotulo="Troco para quanto?"
            valor={trocoPara}
            aoMudar={setTrocoPara}
            erro={mostrar(erros.troco)}
            dica="Deixe vazio se não precisa de troco"
          />
        )}

        <CampoTexto
          rotulo="Observação"
          placeholder="Bem gelada, sem copo..."
          maxLength={200}
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
        />

        <dl className="num space-y-1 border-t border-line pt-4 text-[15px]">
          <div className="flex justify-between text-body">
            <dt>Produtos</dt>
            <dd>{reais(subtotal)}</dd>
          </div>
          {entrega && (
            <div className="flex justify-between text-body">
              <dt>Entrega</dt>
              <dd>{bairro ? (taxa > 0 ? reais(taxa) : "grátis") : "escolha o bairro"}</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between pt-1 text-ink">
            <dt className="text-[17px] font-medium">Total</dt>
            <dd className="text-2xl font-semibold tracking-tight">{reais(total)}</dd>
          </div>
        </dl>

        {faltaMinimo > 0 && linhas.length > 0 && (
          <p className="num rounded-[14px] bg-yellow-soft px-4 py-3 text-[15px] text-yellow-ink">
            Faltam {reais(faltaMinimo)} em produtos para o pedido mínimo de {reais(cardapio.pedidoMinimo)}
          </p>
        )}
        {erro && (
          <p role="alert" className="rounded-[14px] bg-red-soft px-4 py-3 text-[15px] text-red-ink">
            {erro}
          </p>
        )}

        <div className="fixed inset-x-0 bottom-0 z-20 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <Botao
            type="submit"
            variante="principal"
            className="mx-auto h-14 w-full max-w-xl rounded-full text-[17px]"
            disabled={enviando || linhas.length === 0 || faltaMinimo > 0}
          >
            {enviando ? "Enviando" : `Enviar pedido · ${reais(total)}`}
          </Botao>
        </div>
      </form>
    </Tela>
  );
}
