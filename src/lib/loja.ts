"use client";

import { useSyncExternalStore } from "react";
import { banco } from "./banco";
import { subtotal } from "./calculos";
import { lerIdLugar } from "./lugares";
import type {
  Caixa,
  ConfigDelivery,
  Categoria,
  Comanda,
  Estado,
  FormaPagamento,
  ItemPedido,
  Membro,
  MovimentoCaixa,
  MovimentoEstoque,
  Pagamento,
  Papel,
  Pedido,
  Produto,
  ResumoCaixa,
  SituacaoPedido,
  TipoLugar,
  Venda,
} from "./tipos";

/*
 * Os dados moram no banco (Supabase). Este arquivo guarda uma cópia na memória para as
 * telas lerem na hora, grava cada mudança no banco e escuta as mudanças feitas em outros
 * aparelhos. As telas usam useLoja() e as funções exportadas, e não sabem onde os dados moram.
 */

const CHAVE_ABA = "adega-pezao:aba";
const FALHA = "Não consegui salvar. Confira a internet e tente de novo.";

const vazio: Estado = {
  situacao: "carregando",
  pessoa: null,
  erro: null,
  recuperando: false,
  categorias: [],
  produtos: [],
  formas: [],
  mesas: 0,
  balcoes: 0,
  abaCaixa: "balcao",
  comandas: [],
  vendas: [],
  vendasProntas: false,
  caixa: null,
  equipe: [],
  delivery: { aberto: false, pedidoMinimo: 0, retirada: true, horario: [], lojaEndereco: "", lojaLat: null, lojaLng: null, raioKm: 5, taxaEntrega: 0 },
  pedidos: [],
};

const ouvintes = new Set<() => void>();
let atual: Estado = vazio;
let iniciado = false;
/** Custo por produto. Só o dono recebe; para o atendente fica vazio. */
let custos = new Map<string, number>();

function por(parcial: Partial<Estado>) {
  atual = { ...atual, ...parcial };
  ouvintes.forEach((avisar) => avisar());
}

function mudar(fn: (e: Estado) => Estado) {
  const novo = fn(atual);
  if (novo === atual) return;
  atual = novo;
  ouvintes.forEach((avisar) => avisar());
}

function inscrever(avisar: () => void) {
  ouvintes.add(avisar);
  if (!iniciado) {
    iniciado = true;
    iniciar();
  }
  return () => {
    ouvintes.delete(avisar);
  };
}

export function useLoja(): Estado {
  return useSyncExternalStore(
    inscrever,
    () => atual,
    () => vazio,
  );
}

export function fecharErro() {
  por({ erro: null });
}

function novoId() {
  return crypto.randomUUID();
}

/* Do banco para o app */

type Linha = Record<string, unknown>;

const paraProduto = (l: Linha): Produto => ({
  id: l.id as string,
  nome: l.nome as string,
  categoriaId: (l.categoria_id as string | null) ?? "",
  preco: l.preco as number,
  custo: custos.get(l.id as string) ?? null,
  ativo: l.ativo as boolean,
  estoque: (l.estoque as number | null) ?? null,
  estoqueMinimo: (l.estoque_minimo as number | null) ?? null,
  delivery: Boolean(l.delivery),
});

const paraConfigDelivery = (l: Linha): ConfigDelivery => ({
  aberto: Boolean(l.delivery_aberto),
  pedidoMinimo: (l.pedido_minimo as number) ?? 0,
  retirada: l.retirada !== false,
  horario: (l.horario as ConfigDelivery["horario"]) ?? [],
  lojaEndereco: (l.loja_endereco as string) ?? "",
  lojaLat: (l.loja_lat as number | null) ?? null,
  lojaLng: (l.loja_lng as number | null) ?? null,
  raioKm: Number(l.raio_km ?? 5),
  taxaEntrega: (l.taxa_entrega as number) ?? 0,
});


const paraPedido = (l: Linha): Pedido => ({
  id: l.id as string,
  numero: Number(l.numero),
  criadoEm: l.criado_em as string,
  atualizadoEm: l.atualizado_em as string,
  cliente: l.cliente as string,
  telefone: l.telefone as string,
  retirada: Boolean(l.retirada),
  endereco: (l.endereco as string) ?? "",
  complemento: (l.complemento as string) ?? "",
  bairro: (l.bairro_nome as string) ?? "",
  cep: (l.cep as string) ?? "",
  lat: (l.lat as number | null) ?? null,
  lng: (l.lng as number | null) ?? null,
  distanciaM: (l.distancia_m as number | null) ?? null,
  itens: (l.itens as Pedido["itens"]) ?? [],
  subtotal: l.subtotal as number,
  taxa: l.taxa as number,
  total: l.total as number,
  pagamento: l.pagamento as Pedido["pagamento"],
  trocoPara: (l.troco_para as number | null) ?? null,
  observacao: (l.observacao as string) ?? "",
  situacao: l.situacao as SituacaoPedido,
  motivo: (l.motivo as string) ?? "",
  pessoaId: (l.pessoa_id as string | null) ?? null,
});

/** Pedidos em andamento, mais os das últimas 24 horas. Do mais novo para o mais antigo. */
async function buscarPedidos(): Promise<Pedido[]> {
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data, error } = await banco
    .from("pedidos")
    .select("*")
    .or(`criado_em.gte.${desde},situacao.in.(novo,aceito,saiu)`)
    .order("criado_em", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data as Linha[]).map(paraPedido);
}

const paraForma = (l: Linha): FormaPagamento => ({ id: l.id as string, nome: l.nome as string, taxa: Number(l.taxa) });

const paraComanda = (l: Linha): Comanda => ({
  id: l.id as string,
  tipo: l.tipo as TipoLugar,
  numero: l.numero as number,
  cliente: l.cliente as string,
  // O custo não viaja na comanda: ele é copiado pelo banco na hora de fechar a venda.
  itens: (l.itens as ItemPedido[]).map((i) => ({ ...i, custo: custos.get(i.produtoId) ?? null })),
  desconto: l.desconto as number,
  acrescimo: l.acrescimo as number,
  abertaEm: l.aberta_em as string,
});

const paraVenda = (l: Linha): Venda => ({
  id: l.origem === "yooga" ? `y${l.codigo_yooga}` : (l.id as string),
  numero: Number(l.numero),
  comandaNome: l.comanda_nome as string,
  itens: ((l.itens as ItemPedido[] | null) ?? []).map((i) => ({ ...i, custo: i.custo ?? null })),
  subtotal: l.subtotal as number,
  desconto: l.desconto as number,
  acrescimo: l.acrescimo as number,
  total: l.total as number,
  pagamentos: (l.pagamentos as Pagamento[]).map((p) => ({ ...p, taxa: Number(p.taxa) })),
  troco: l.troco as number,
  criadaEm: l.criada_em as string,
  ...(l.cancelada_em ? { canceladaEm: l.cancelada_em as string } : {}),
  ...(l.origem === "yooga" ? { origem: "yooga" as const } : {}),
  pessoaId: (l.pessoa_id as string | null) ?? null,
  canceladaPor: (l.cancelada_por as string | null) ?? null,
  caixaId: (l.caixa_id as string | null) ?? null,
});

const paraMovimento = (l: Linha): MovimentoCaixa => ({
  id: l.id as string,
  tipo: l.tipo as MovimentoCaixa["tipo"],
  valor: l.valor as number,
  motivo: (l.motivo as string) ?? "",
  pessoaId: (l.pessoa_id as string | null) ?? null,
  criadoEm: l.criado_em as string,
});

const paraCaixa = (l: Linha | null): Caixa | null =>
  l
    ? {
        id: l.id as string,
        abertoEm: l.aberto_em as string,
        abertoPor: (l.aberto_por as string | null) ?? null,
        valorInicial: l.valor_inicial as number,
        movimentos: ((l.movimentos as Linha[]) ?? []).map(paraMovimento),
      }
    : null;

const paraResumo = (l: Linha): ResumoCaixa => ({
  id: l.id as string,
  abertoEm: l.aberto_em as string,
  abertoPor: (l.aberto_por as string | null) ?? null,
  valorInicial: l.valor_inicial as number,
  fechadoEm: (l.fechado_em as string | null) ?? null,
  fechadoPor: (l.fechado_por as string | null) ?? null,
  esperado: (l.esperado as number | null) ?? null,
  contado: (l.contado as number | null) ?? null,
  observacao: (l.observacao as string) ?? "",
  movimentos: ((l.movimentos as Linha[]) ?? []).map(paraMovimento),
  pedidos: Number(l.pedidos ?? 0),
  canceladas: Number(l.canceladas ?? 0),
  total: (l.total as number | null) ?? null,
  porForma: (l.por_forma as ResumoCaixa["porForma"]) ?? [],
});

/** Ao fechar a venda o banco esvazia a comanda em vez de apagar: comanda sem itens é lugar livre. */
const abertas = (linhas: Linha[]) => linhas.filter((l) => (l.itens as unknown[]).length > 0).map(paraComanda);

const NOME_FORMA_YOOGA: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  debito: "Débito",
  credito: "Crédito",
  composto: "Composto",
  outros: "Outros",
};

/** Busca uma tabela inteira, de mil em mil linhas (limite do banco por pedido). */
async function tudo(tabela: string, filtro?: { coluna: string; diferente: string }, ordem = "id"): Promise<Linha[]> {
  const linhas: Linha[] = [];
  for (let de = 0; ; de += 1000) {
    let pedido = banco.from(tabela).select("*");
    if (filtro) pedido = pedido.neq(filtro.coluna, filtro.diferente);
    const { data, error } = await pedido.order(ordem).range(de, de + 999);
    if (error) throw error;
    linhas.push(...(data as Linha[]));
    if (!data || data.length < 1000) return linhas;
  }
}

/* Sessão */

let usuarioCarregado: string | null = null;

function iniciar() {
  try {
    const aba = localStorage.getItem(CHAVE_ABA);
    if (aba === "mesa" || aba === "balcao") atual = { ...atual, abaCaixa: aba };
  } catch {
    // Sem armazenamento local: o caixa abre na aba padrão.
  }
  banco.auth.onAuthStateChange((evento, sessao) => {
    // As chamadas ao banco saem daqui de dentro para não travar o cliente de autenticação.
    setTimeout(() => {
      if (evento === "PASSWORD_RECOVERY") por({ recuperando: true });
      if (!sessao) {
        desligar();
        return;
      }
      if (sessao.user.id !== usuarioCarregado) void carregar(sessao.user.id);
    }, 0);
  });
}

function desligar() {
  usuarioCarregado = null;
  custos = new Map();
  void banco.removeAllChannels();
  atual = { ...vazio, situacao: "fora", abaCaixa: atual.abaCaixa };
  ouvintes.forEach((avisar) => avisar());
}

async function carregar(usuario: string) {
  usuarioCarregado = usuario;
  try {
    const { data: eu, error } = await banco.from("pessoas").select("id,nome,papel,ativo").eq("auth_id", usuario).maybeSingle();
    if (error) throw error;
    if (!eu || !eu.ativo) {
      await banco.auth.signOut();
      return;
    }
    const papel = eu.papel as Papel;
    if (papel === "dono") await carregarCustos();
    const [categorias, produtos, formas, config, comandas, caixa, equipe, pedidos] = await Promise.all([
      tudo("categorias"),
      tudo("produtos"),
      tudo("formas"),
      banco.from("configuracao").select("*").eq("id", 1).single(),
      tudo("comandas"),
      banco.rpc("caixa_atual"),
      buscarEquipe(papel),
      buscarPedidos(),
    ]);
    if (config.error) throw config.error;
    if (caixa.error) throw caixa.error;
    if (usuarioCarregado !== usuario) return;
    por({
      situacao: "dentro",
      pessoa: { id: eu.id, nome: eu.nome, papel },
      categorias: ordenarCategorias(categorias),
      produtos: produtos.map(paraProduto),
      formas: ordenarFormas(formas),
      mesas: config.data.mesas,
      balcoes: config.data.balcoes,
      comandas: abertas(comandas),
      vendas: [],
      vendasProntas: papel !== "dono",
      caixa: paraCaixa(caixa.data as Linha | null),
      equipe,
      delivery: paraConfigDelivery(config.data),
      pedidos,
    });
    void escutar();
    if (papel === "dono") void carregarVendas(usuario);
  } catch {
    usuarioCarregado = null;
    por({ situacao: atual.situacao === "dentro" ? "dentro" : "fora", erro: "Não consegui carregar os dados. Confira a internet." });
  }
}

const ordenarCategorias = (linhas: Linha[]): Categoria[] =>
  [...linhas]
    .sort((a, b) => (a.ordem as number) - (b.ordem as number) || String(a.nome).localeCompare(String(b.nome), "pt-BR"))
    .map((l) => ({ id: l.id as string, nome: l.nome as string }));

const ordenarFormas = (linhas: Linha[]) =>
  [...linhas].sort((a, b) => (a.ordem as number) - (b.ordem as number)).map(paraForma);

/** O dono vê todo mundo, inclusive quem foi removido (para os nomes no histórico). O atendente, quem está ativo. */
async function buscarEquipe(papel: Papel): Promise<Membro[]> {
  if (papel === "dono") {
    const { data, error } = await banco.from("pessoas").select("id,nome,papel,ativo").order("nome");
    if (error) throw error;
    return data.map((p) => ({ id: p.id, nome: p.nome, papel: p.papel as Papel, ativo: p.ativo }));
  }
  const { data, error } = await banco.rpc("pessoas_login");
  if (error) throw error;
  return (data as Membro[]).map((p) => ({ ...p, ativo: true }));
}

async function carregarCustos() {
  const linhas = await tudo("custos", undefined, "produto_id");
  custos = new Map(linhas.map((l) => [l.produto_id as string, l.custo as number]));
}

async function carregarVendas(usuario: string) {
  try {
    const [doApp, yooga] = await Promise.all([
      tudo("vendas", { coluna: "origem", diferente: "yooga" }),
      banco.rpc("vendas_yooga"),
    ]);
    if (yooga.error) throw yooga.error;
    if (usuarioCarregado !== usuario) return;
    type Compacta = [number, number, number, number, number, string, boolean];
    const historico = (yooga.data as Compacta[]).map(([codigo, segundos, total, desconto, acrescimo, forma, cancelada]): Venda => {
      const criadaEm = new Date(segundos * 1000).toISOString();
      return {
        id: `y${codigo}`,
        numero: codigo,
        comandaNome: "Yooga",
        itens: [],
        subtotal: total + desconto - acrescimo,
        desconto,
        acrescimo,
        total,
        pagamentos: [{ formaId: forma, formaNome: NOME_FORMA_YOOGA[forma] ?? forma, taxa: 0, valor: total }],
        troco: 0,
        criadaEm,
        origem: "yooga",
        ...(cancelada ? { canceladaEm: criadaEm } : {}),
      };
    });
    const novas = doApp.map(paraVenda).sort((a, b) => a.criadaEm.localeCompare(b.criadaEm));
    // Vendas que chegaram ao vivo enquanto a lista carregava não podem sumir.
    const ids = new Set(novas.map((v) => v.id));
    const aoVivo = atual.vendas.filter((v) => v.origem !== "yooga" && !ids.has(v.id));
    por({ vendas: [...historico, ...novas, ...aoVivo], vendasProntas: true });
  } catch {
    por({ vendasProntas: true, erro: "Não consegui carregar as vendas. Confira a internet." });
  }
}

/* Mudanças feitas em outros aparelhos */

const recarregando = new Map<string, ReturnType<typeof setTimeout>>();

/** Junta várias mudanças seguidas da mesma tabela numa busca só. */
function recarregar(
  tabela: "categorias" | "produtos" | "formas" | "configuracao" | "custos" | "comandas" | "caixa" | "equipe" | "pedidos",
) {
  clearTimeout(recarregando.get(tabela));
  recarregando.set(
    tabela,
    setTimeout(async () => {
      try {
        if (tabela === "categorias") por({ categorias: ordenarCategorias(await tudo("categorias")) });
        if (tabela === "pedidos") por({ pedidos: await buscarPedidos() });
        if (tabela === "caixa") {
          const { data, error } = await banco.rpc("caixa_atual");
          if (!error) por({ caixa: paraCaixa(data as Linha | null) });
        }
        if (tabela === "equipe" && atual.pessoa) por({ equipe: await buscarEquipe(atual.pessoa.papel) });
        if (tabela === "formas") por({ formas: ordenarFormas(await tudo("formas")) });
        if (tabela === "comandas") {
          const linhas = abertas(await tudo("comandas"));
          // Comandas com gravação em andamento neste aparelho ficam como estão.
          mudar((e) => ({
            ...e,
            comandas: [
              ...linhas.filter((c) => !ocupada(c.id)),
              ...e.comandas.filter((c) => ocupada(c.id)),
            ],
          }));
        }
        if (tabela === "configuracao") {
          const { data } = await banco.from("configuracao").select("*").eq("id", 1).single();
          if (data) por({ mesas: data.mesas, balcoes: data.balcoes, delivery: paraConfigDelivery(data) });
        }
        if (tabela === "produtos" || tabela === "custos") {
          if (atual.pessoa?.papel === "dono") await carregarCustos();
          por({ produtos: (await tudo("produtos")).map(paraProduto) });
        }
      } catch {
        // Sem internet: a próxima mudança ou a volta da conexão tenta de novo.
      }
    }, 250),
  );
}

async function escutar() {
  // Precisa esperar: removeAllChannels termina desconectando o socket, e derrubaria o canal novo
  // se ele fosse aberto antes disso (era o que acontecia, e nada atualizava ao vivo).
  await banco.removeAllChannels();
  banco
    .channel("loja")
    .on("postgres_changes", { event: "*", schema: "public" }, (m) => {
      const novo = m.new as Linha;
      const velho = m.old as Linha;
      switch (m.table) {
        case "comandas": {
          const id = (novo?.id ?? velho?.id) as string;
          if (ocupada(id)) return;
          mudar((e) => {
            const resto = e.comandas.filter((c) => c.id !== id);
            const fechada = m.eventType === "DELETE" || (novo.itens as unknown[]).length === 0;
            return { ...e, comandas: fechada ? resto : [...resto, paraComanda(novo)] };
          });
          return;
        }
        case "vendas": {
          if (m.eventType === "DELETE") {
            mudar((e) => ({ ...e, vendas: e.vendas.filter((v) => v.id !== velho.id) }));
            return;
          }
          const venda = paraVenda(novo);
          mudar((e) => {
            const existe = e.vendas.some((v) => v.id === venda.id);
            return { ...e, vendas: existe ? e.vendas.map((v) => (v.id === venda.id ? venda : v)) : [...e.vendas, venda] };
          });
          return;
        }
        case "pessoas":
          // Se a pessoa logada foi removida ou mudou de papel, recarrega tudo.
          if (usuarioCarregado && (novo?.auth_id ?? velho?.auth_id) === usuarioCarregado) void carregar(usuarioCarregado);
          else recarregar("equipe");
          return;
        case "pedidos": {
          if (m.eventType === "DELETE") {
            recarregar("pedidos");
            return;
          }
          const pedido = paraPedido(novo);
          mudar((e) => {
            const existe = e.pedidos.some((p) => p.id === pedido.id);
            const pedidos = existe ? e.pedidos.map((p) => (p.id === pedido.id ? pedido : p)) : [pedido, ...e.pedidos];
            return { ...e, pedidos };
          });
          if (m.eventType === "INSERT") ouvintesPedido.forEach((avisar) => avisar(pedido));
          return;
        }
        case "caixas":
        case "movimentos_caixa":
          recarregar("caixa");
          return;
        case "produtos":
          // Cada venda mexe no estoque: troca só o produto que mudou, sem buscar a lista inteira.
          if (m.eventType === "DELETE") {
            recarregar("produtos");
            return;
          }
          mudar((e) => {
            const produto = paraProduto(novo);
            const existe = e.produtos.some((p) => p.id === produto.id);
            return { ...e, produtos: existe ? e.produtos.map((p) => (p.id === produto.id ? produto : p)) : [...e.produtos, produto] };
          });
          return;
        case "categorias":
        case "formas":
        case "configuracao":
        case "custos":
          recarregar(m.table);
      }
    })
    .subscribe((estado) => {
      // Voltou a conexão depois de uma queda: busca o que mudou enquanto estava fora.
      if (estado === "SUBSCRIBED" && escutouAntes) (["comandas", "produtos", "categorias", "formas", "configuracao", "caixa", "equipe", "pedidos"] as const).forEach(recarregar);
      if (estado === "SUBSCRIBED") escutouAntes = true;
    });
}
let escutouAntes = false;

/** Roda uma gravação. Se falhar, mostra o aviso e busca de novo o que está no banco. */
async function gravar(pedido: PromiseLike<{ error: unknown }>, tabela: Parameters<typeof recarregar>[0]) {
  let falhou = false;
  try {
    falhou = Boolean((await pedido).error);
  } catch {
    falhou = true;
  }
  if (falhou) {
    por({ erro: FALHA });
    recarregar(tabela);
  }
  return !falhou;
}

/* Produtos e categorias */

/**
 * Grava o produto. A tela já mostra a mudança na hora; a promessa devolve o id quando o banco
 * confirmou, ou null se falhou.
 */
export function salvarProduto(dados: Omit<Produto, "id" | "ativo" | "estoque"> & { id?: string }): Promise<string | null> {
  const id = dados.id ?? novoId();
  const estoque = atual.produtos.find((p) => p.id === id)?.estoque ?? null;
  const produto: Produto = { ...dados, id, ativo: true, estoque };
  mudar((e) => ({
    ...e,
    produtos: dados.id ? e.produtos.map((p) => (p.id === id ? { ...p, ...produto } : p)) : [...e.produtos, produto],
  }));
  if (dados.custo === null) custos.delete(id);
  else custos.set(id, dados.custo);
  return (async () => {
    const ok = await gravar(
      banco.from("produtos").upsert({
        id,
        nome: dados.nome,
        categoria_id: dados.categoriaId || null,
        preco: dados.preco,
        estoque_minimo: dados.estoqueMinimo,
        delivery: dados.delivery,
        ativo: true,
      }),
      "produtos",
    );
    if (!ok) return null;
    const custoOk = await gravar(
      dados.custo === null
        ? banco.from("custos").delete().eq("produto_id", id)
        : banco.from("custos").upsert({ produto_id: id, custo: dados.custo }),
      "custos",
    );
    return custoOk ? id : null;
  })();
}

/** Não apaga de verdade: vendas antigas continuam apontando para o produto. */
export function arquivarProduto(id: string) {
  mudar((e) => ({ ...e, produtos: e.produtos.map((p) => (p.id === id ? { ...p, ativo: false } : p)) }));
  void gravar(banco.from("produtos").update({ ativo: false }).eq("id", id), "produtos");
}

export function salvarCategoria(nome: string, id?: string) {
  const alvo = id ?? novoId();
  mudar((e) => ({
    ...e,
    categorias: id ? e.categorias.map((c) => (c.id === id ? { ...c, nome } : c)) : [...e.categorias, { id: alvo, nome }],
  }));
  void gravar(
    id ? banco.from("categorias").update({ nome }).eq("id", id) : banco.from("categorias").insert({ id: alvo, nome, ordem: 999 }),
    "categorias",
  );
}

export function removerCategoria(id: string) {
  if (atual.produtos.some((p) => p.ativo && p.categoriaId === id)) return;
  mudar((e) => ({ ...e, categorias: e.categorias.filter((c) => c.id !== id) }));
  void gravar(banco.from("categorias").delete().eq("id", id), "categorias");
}

export function salvarTaxa(formaId: string, taxa: number) {
  mudar((e) => ({ ...e, formas: e.formas.map((f) => (f.id === formaId ? { ...f, taxa } : f)) }));
  void gravar(banco.from("formas").update({ taxa }).eq("id", formaId), "formas");
}

/* Mesas e balcões */

export function definirQuantidade(tipo: TipoLugar, quantidade: number) {
  const n = Math.min(Math.max(Math.round(quantidade) || 0, 0), 99);
  mudar((e) => (tipo === "mesa" ? { ...e, mesas: n } : { ...e, balcoes: n }));
  void gravar(banco.from("configuracao").update(tipo === "mesa" ? { mesas: n } : { balcoes: n }).eq("id", 1), "configuracao");
}

/** A aba aberta no caixa é de cada aparelho, não vai para o banco. */
export function definirAba(aba: TipoLugar) {
  if (atual.abaCaixa === aba) return;
  por({ abaCaixa: aba });
  try {
    localStorage.setItem(CHAVE_ABA, aba);
  } catch {
    // Sem armazenamento local: vale só até fechar o app.
  }
}

/* Comandas */

const enviando = new Map<string, Promise<void>>();
const sujas = new Set<string>();

function ocupada(id: string) {
  return enviando.has(id) || sujas.has(id);
}

/**
 * Manda a comanda para o banco. Toques rápidos seguidos viram poucas gravações:
 * enquanto uma está a caminho, as próximas esperam e vai só o estado mais recente.
 */
function enviarComanda(id: string) {
  sujas.add(id);
  if (enviando.has(id)) return;
  const tarefa = (async () => {
    while (sujas.has(id)) {
      sujas.delete(id);
      const c = atual.comandas.find((x) => x.id === id);
      const ok = await gravar(
        c
          ? banco.from("comandas").upsert({
              id: c.id,
              tipo: c.tipo,
              numero: c.numero,
              cliente: c.cliente,
              itens: c.itens.map(({ produtoId, nome, preco, qtd }) => ({ produtoId, nome, preco, qtd })),
              desconto: c.desconto,
              acrescimo: c.acrescimo,
              aberta_em: c.abertaEm,
            })
          : banco.from("comandas").delete().eq("id", id),
        "comandas",
      );
      if (!ok) {
        sujas.delete(id);
        break;
      }
    }
    enviando.delete(id);
  })();
  enviando.set(id, tarefa);
}

/** Aplica uma mudança na comanda do lugar. Cria a comanda se o lugar estava livre. */
function naComanda(e: Estado, id: string, fn: (c: Comanda) => Comanda): Estado {
  const existente = e.comandas.find((c) => c.id === id);
  if (existente) return { ...e, comandas: e.comandas.map((c) => (c.id === id ? fn(c) : c)) };
  const lugar = lerIdLugar(id);
  if (!lugar) return e;
  const nova: Comanda = {
    id,
    ...lugar,
    cliente: "",
    itens: [],
    desconto: 0,
    acrescimo: 0,
    abertaEm: new Date().toISOString(),
  };
  return { ...e, comandas: [...e.comandas, fn(nova)] };
}

/** Comanda sem itens volta a ser lugar livre. */
function limparVazias(e: Estado): Estado {
  return { ...e, comandas: e.comandas.filter((c) => c.itens.length > 0) };
}

function mudarComanda(id: string, fn: (e: Estado) => Estado) {
  const antes = atual;
  mudar(fn);
  if (atual !== antes) enviarComanda(id);
}

export function adicionarItem(comandaId: string, produto: Produto, qtd = 1) {
  mudarComanda(comandaId, (e) =>
    naComanda(e, comandaId, (c) => {
      const existe = c.itens.find((i) => i.produtoId === produto.id);
      const itens = existe
        ? c.itens.map((i) => (i.produtoId === produto.id ? { ...i, qtd: Math.min(i.qtd + qtd, 999) } : i))
        : [...c.itens, { produtoId: produto.id, nome: produto.nome, preco: produto.preco, custo: produto.custo, qtd }];
      return { ...c, itens, abertaEm: c.itens.length === 0 ? new Date().toISOString() : c.abertaEm };
    }),
  );
}

export function mudarQtd(comandaId: string, produtoId: string, qtd: number) {
  mudarComanda(comandaId, (e) =>
    limparVazias(
      naComanda(e, comandaId, (c) => {
        const itens =
          qtd <= 0
            ? c.itens.filter((i) => i.produtoId !== produtoId)
            : c.itens.map((i) => (i.produtoId === produtoId ? { ...i, qtd: Math.min(qtd, 999) } : i));
        // Se tirar itens deixou o desconto maior que a conta, o desconto encolhe junto.
        return { ...c, itens, desconto: Math.min(c.desconto, subtotal(itens)) };
      }),
    ),
  );
}

export function ajustarComanda(comandaId: string, campo: "desconto" | "acrescimo", valor: number) {
  mudarComanda(comandaId, (e) => {
    if (!e.comandas.some((c) => c.id === comandaId)) return e;
    return naComanda(e, comandaId, (c) => {
      // Desconto nunca passa do valor dos itens: a venda não pode ficar negativa.
      const teto = campo === "desconto" ? subtotal(c.itens) : 99_999_99;
      return { ...c, [campo]: Math.min(Math.max(0, valor), teto) };
    });
  });
}

export function definirCliente(comandaId: string, cliente: string) {
  mudarComanda(comandaId, (e) => {
    if (!e.comandas.some((c) => c.id === comandaId)) return e;
    return naComanda(e, comandaId, (c) => ({ ...c, cliente: cliente.trim().slice(0, 40) }));
  });
}

/** Tira todos os itens: o lugar volta a ficar livre. */
export function esvaziarComanda(comandaId: string) {
  mudarComanda(comandaId, (e) => ({ ...e, comandas: e.comandas.filter((c) => c.id !== comandaId) }));
}

/* Vendas */

const fechando = new Map<string, Promise<Venda | null>>();

/**
 * Fecha a venda no banco, numa operação só. Devolve a venda, ou null se não deu
 * (o aviso aparece em loja.erro e a comanda continua aberta).
 * Dois toques seguidos caem na mesma operação e não duplicam.
 */
export function finalizarVenda(comandaId: string, pagamentos: Pagamento[]): Promise<Venda | null> {
  const emAndamento = fechando.get(comandaId);
  if (emAndamento) return emAndamento;
  const tarefa = (async (): Promise<Venda | null> => {
    try {
      // Espera a última mudança da comanda chegar ao banco antes de fechar.
      await enviando.get(comandaId);
      const { data, error } = await banco.rpc("fechar_venda", {
        p_comanda: comandaId,
        p_pagamentos: pagamentos.map((p) => ({ formaId: p.formaId, valor: p.valor })),
        p_chave: novoId(),
      });
      if (error) {
        if (error.message?.includes("caixa_fechado")) {
          por({ erro: "O caixa está fechado. Abra o caixa para fechar a venda." });
          recarregar("caixa");
          return null;
        }
        throw error;
      }
      const venda = paraVenda(data as Linha);
      mudar((e) => ({
        ...e,
        comandas: e.comandas.filter((c) => c.id !== comandaId),
        vendas: e.pessoa?.papel !== "dono" || e.vendas.some((v) => v.id === venda.id) ? e.vendas : [...e.vendas, venda],
      }));
      return venda;
    } catch {
      por({ erro: "A venda não foi fechada. Confira a internet e tente de novo." });
      recarregar("comandas");
      return null;
    } finally {
      fechando.delete(comandaId);
    }
  })();
  fechando.set(comandaId, tarefa);
  return tarefa;
}

function marcarCancelamento(vendaId: string, quando: string | null) {
  const antes = atual.vendas;
  mudar((e) => ({
    ...e,
    vendas: e.vendas.map((v) => {
      if (v.id !== vendaId) return v;
      const resto = { ...v };
      delete resto.canceladaEm;
      return quando ? { ...resto, canceladaEm: quando, canceladaPor: atual.pessoa?.id ?? null } : { ...resto, canceladaPor: null };
    }),
  }));
  // Vendas do histórico do Yooga são achadas pelo código de lá.
  const pedido = banco.from("vendas").update({ cancelada_em: quando });
  void (async () => {
    const { error } = await (vendaId.startsWith("y") ? pedido.eq("codigo_yooga", Number(vendaId.slice(1))) : pedido.eq("id", vendaId));
    if (error) por({ erro: FALHA, vendas: antes });
  })();
}

/** Cancela sem apagar: a venda fica no histórico, riscada, e sai das contas. */
export function cancelarVenda(vendaId: string) {
  marcarCancelamento(vendaId, new Date().toISOString());
}

export function restaurarVenda(vendaId: string) {
  marcarCancelamento(vendaId, null);
}

/** Cópia dos dados em arquivo, para guardar fora do sistema. */
export function exportarDados(): string {
  const { categorias, produtos, formas, mesas, balcoes, vendas } = atual;
  return JSON.stringify(
    { app: "adega-do-pezao", exportadoEm: new Date().toISOString(), dados: { categorias, produtos, formas, mesas, balcoes, vendas } },
    null,
    2,
  );
}

/** Nome já usado por outro produto ativo (ignora maiúsculas e espaços nas pontas). */
export function nomeDeProdutoEmUso(nome: string, ignorarId?: string): boolean {
  const alvo = nome.trim().toLowerCase();
  return atual.produtos.some((p) => p.ativo && p.id !== ignorarId && p.nome.trim().toLowerCase() === alvo);
}

/* Caixa (turno) */

const MENSAGENS_CAIXA: Record<string, string> = {
  caixa_aberto: "O caixa já foi aberto, talvez em outro aparelho",
  caixa_fechado: "O caixa já está fechado",
  valor_invalido: "Confira o valor",
  so_dono: "Só o dono pode fazer isso",
  produto_nao_encontrado: "Produto não encontrado",
  sem_controle: "Este produto não controla estoque",
  situacao_invalida: "Esse pedido já mudou, talvez em outro aparelho",
  motivo_obrigatorio: "Escreva o motivo",
  pedido_nao_encontrado: "Pedido não encontrado",
  forma_invalida: "Forma de pagamento inválida",
};
const SEM_REDE = "Não consegui falar com o sistema. Confira a internet";

/** Chama uma função do banco. Devolve os dados, ou a mensagem de erro pronta para a tela. */
async function chamar<T>(funcao: string, parametros?: Record<string, unknown>): Promise<{ ok: true; dados: T } | { ok: false; erro: string }> {
  try {
    const { data, error } = await banco.rpc(funcao, parametros);
    if (!error) return { ok: true, dados: data as T };
    const codigo = Object.keys(MENSAGENS_CAIXA).find((c) => error.message?.includes(c));
    return { ok: false, erro: codigo ? MENSAGENS_CAIXA[codigo] : SEM_REDE };
  } catch {
    return { ok: false, erro: SEM_REDE };
  }
}

/** Abre o turno com o dinheiro que está na gaveta. Devolve a mensagem de erro, ou null se deu certo. */
export async function abrirCaixa(valorInicial: number): Promise<string | null> {
  const r = await chamar<string>("abrir_caixa", { p_valor: valorInicial });
  recarregar("caixa");
  return r.ok ? null : r.erro;
}

export async function movimentarCaixa(tipo: MovimentoCaixa["tipo"], valor: number, motivo: string): Promise<string | null> {
  const r = await chamar<string>("movimentar_caixa", { p_tipo: tipo, p_valor: valor, p_motivo: motivo });
  recarregar("caixa");
  return r.ok ? null : r.erro;
}

/** Fecha o turno com o dinheiro contado na gaveta. Devolve o resumo para mostrar a diferença. */
export async function fecharCaixa(contado: number, observacao: string): Promise<ResumoCaixa | string> {
  const r = await chamar<Linha>("fechar_caixa", { p_contado: contado, p_observacao: observacao });
  recarregar("caixa");
  return r.ok ? paraResumo(r.dados) : r.erro;
}

export async function resumoCaixa(id: string): Promise<ResumoCaixa | string> {
  const r = await chamar<Linha>("resumo_caixa", { p_caixa: id });
  return r.ok ? paraResumo(r.dados) : r.erro;
}

export interface CaixaFechado {
  id: string;
  abertoEm: string;
  fechadoEm: string;
  abertoPor: string | null;
  fechadoPor: string | null;
  esperado: number;
  contado: number;
}

/** Turnos já fechados, do mais novo para o mais antigo. null = sem internet. */
export async function listarCaixas(limite = 60): Promise<CaixaFechado[] | null> {
  try {
    const { data, error } = await banco
      .from("caixas")
      .select("id,aberto_em,fechado_em,aberto_por,fechado_por,esperado,contado")
      .not("fechado_em", "is", null)
      .order("aberto_em", { ascending: false })
      .limit(limite);
    if (error) return null;
    return data.map((l) => ({
      id: l.id,
      abertoEm: l.aberto_em,
      fechadoEm: l.fechado_em,
      abertoPor: l.aberto_por,
      fechadoPor: l.fechado_por,
      esperado: l.esperado ?? 0,
      contado: l.contado ?? 0,
    }));
  } catch {
    return null;
  }
}

/* Estoque (só o dono) */

/** Entrada soma ao estoque; contagem troca o estoque pelo número contado. Devolve o erro, ou null. */
export async function registrarEstoque(
  produtoId: string,
  tipo: "entrada" | "contagem" | "perda",
  qtd: number,
  motivo = "",
): Promise<string | null> {
  const r = await chamar<number>("registrar_estoque", { p_produto: produtoId, p_tipo: tipo, p_qtd: qtd, p_motivo: motivo });
  if (r.ok) mudar((e) => ({ ...e, produtos: e.produtos.map((p) => (p.id === produtoId ? { ...p, estoque: r.dados } : p)) }));
  return r.ok ? null : r.erro;
}

/** Contagem de prateleira de vários produtos de uma vez: entra tudo ou nada. */
export async function registrarContagem(itens: { produtoId: string; qtd: number }[], motivo = ""): Promise<string | null> {
  const r = await chamar<number>("registrar_contagem", { p_itens: itens, p_motivo: motivo });
  if (r.ok) {
    const novos = new Map(itens.map((i) => [i.produtoId, i.qtd]));
    mudar((e) => ({ ...e, produtos: e.produtos.map((p) => (novos.has(p.id) ? { ...p, estoque: novos.get(p.id)! } : p)) }));
  }
  return r.ok ? null : r.erro;
}

/** Troca só o custo do produto (usado na entrada de mercadoria). */
export function salvarCusto(produtoId: string, custo: number) {
  custos.set(produtoId, custo);
  mudar((e) => ({ ...e, produtos: e.produtos.map((p) => (p.id === produtoId ? { ...p, custo } : p)) }));
  return gravar(banco.from("custos").upsert({ produto_id: produtoId, custo }), "custos");
}

export interface Perda {
  id: string;
  produtoId: string;
  /** Unidades perdidas (positivo). */
  qtd: number;
  /** Custo da unidade na hora da perda. null se o produto não tinha custo. */
  custo: number | null;
  motivo: string;
  pessoaId: string | null;
  criadoEm: string;
}

/** Perdas registradas desde a data, da mais nova para a mais antiga. null = sem internet. */
export async function perdasDesde(desde: Date): Promise<Perda[] | null> {
  try {
    const { data, error } = await banco
      .from("movimentos_estoque")
      .select("id,produto_id,qtd,custo,motivo,pessoa_id,criado_em")
      .eq("tipo", "perda")
      .gte("criado_em", desde.toISOString())
      .order("criado_em", { ascending: false })
      .limit(500);
    if (error) return null;
    return data.map((l) => ({
      id: l.id,
      produtoId: l.produto_id,
      qtd: -l.qtd,
      custo: l.custo,
      motivo: l.motivo,
      pessoaId: l.pessoa_id,
      criadoEm: l.criado_em,
    }));
  } catch {
    return null;
  }
}

/** O produto deixa de ter estoque controlado. */
export function pararEstoque(produtoId: string) {
  mudar((e) => ({
    ...e,
    produtos: e.produtos.map((p) => (p.id === produtoId ? { ...p, estoque: null, estoqueMinimo: null } : p)),
  }));
  void gravar(banco.from("produtos").update({ estoque: null, estoque_minimo: null }).eq("id", produtoId), "produtos");
}

/** Últimas mudanças no estoque de um produto. null = sem internet. */
export async function movimentosEstoque(produtoId: string, limite = 15): Promise<MovimentoEstoque[] | null> {
  try {
    const { data, error } = await banco
      .from("movimentos_estoque")
      .select("id,tipo,qtd,saldo,pessoa_id,motivo,criado_em,custo")
      .eq("produto_id", produtoId)
      .order("criado_em", { ascending: false })
      .limit(limite);
    if (error) return null;
    return data.map((l) => ({
      id: l.id,
      tipo: l.tipo,
      qtd: l.qtd,
      saldo: l.saldo,
      pessoaId: l.pessoa_id,
      motivo: l.motivo,
      criadoEm: l.criado_em,
      custo: l.custo ?? null,
    }));
  } catch {
    return null;
  }
}

/** Nome de quem fez algo. "Alguém" quando a pessoa não está na lista (por exemplo, removida, para o atendente). */
export function nomePessoa(equipe: Membro[], id: string | null | undefined): string {
  if (!id) return "Sem registro";
  return equipe.find((p) => p.id === id)?.nome ?? "Alguém";
}

/* Delivery */

const ouvintesPedido = new Set<(p: Pedido) => void>();

/** Avisa quando um pedido novo chega (para tocar o som e mostrar a notificação). */
export function ouvirNovosPedidos(fn: (p: Pedido) => void) {
  ouvintesPedido.add(fn);
  return () => {
    ouvintesPedido.delete(fn);
  };
}

/** Muda a situação do pedido. Ao entregar, informe a forma usada de fato (dinheiro, pix, debito, credito). */
export async function mudarPedido(id: string, situacao: SituacaoPedido, motivo = "", forma?: string): Promise<string | null> {
  const r = await chamar<Linha>("mudar_pedido", { p_pedido: id, p_situacao: situacao, p_motivo: motivo, p_forma: forma ?? null });
  if (!r.ok) {
    recarregar("pedidos");
    return r.erro;
  }
  const pedido = paraPedido(r.dados);
  mudar((e) => ({ ...e, pedidos: e.pedidos.map((p) => (p.id === id ? pedido : p)) }));
  return null;
}

/** Ajustes do delivery (só o dono). */
export function salvarDelivery(parcial: Partial<ConfigDelivery>) {
  mudar((e) => ({ ...e, delivery: { ...e.delivery, ...parcial } }));
  const linha: Record<string, unknown> = {};
  if (parcial.aberto !== undefined) linha.delivery_aberto = parcial.aberto;
  if (parcial.pedidoMinimo !== undefined) linha.pedido_minimo = parcial.pedidoMinimo;
  if (parcial.retirada !== undefined) linha.retirada = parcial.retirada;
  if (parcial.horario !== undefined) linha.horario = parcial.horario;
  if (parcial.lojaEndereco !== undefined) linha.loja_endereco = parcial.lojaEndereco;
  if (parcial.lojaLat !== undefined) linha.loja_lat = parcial.lojaLat;
  if (parcial.lojaLng !== undefined) linha.loja_lng = parcial.lojaLng;
  if (parcial.raioKm !== undefined) linha.raio_km = parcial.raioKm;
  if (parcial.taxaEntrega !== undefined) linha.taxa_entrega = parcial.taxaEntrega;
  return gravar(banco.from("configuracao").update(linha).eq("id", 1), "configuracao");
}

/** Liga ou desliga vários produtos no cardápio do delivery de uma vez. */
export function marcarDelivery(ids: string[], valor: boolean) {
  if (ids.length === 0) return Promise.resolve(true);
  const alvo = new Set(ids);
  mudar((e) => ({ ...e, produtos: e.produtos.map((p) => (alvo.has(p.id) ? { ...p, delivery: valor } : p)) }));
  return gravar(banco.from("produtos").update({ delivery: valor }).in("id", ids), "produtos");
}
