import { banco } from "./banco";
import type { Centavos, DiaHorario, ItemDelivery, PagamentoPedido, SituacaoPedido } from "./tipos";

/*
 * Delivery: o que a página pública do cliente usa (sem login) e os textos
 * compartilhados com a tela de pedidos da adega.
 */

export * from "./pedidos";

/* ───────── Chamadas públicas ───────── */

export interface Cardapio {
  aberto: boolean;
  horario: DiaHorario[];
  pedidoMinimo: Centavos;
  retirada: boolean;
  /** null = a adega ainda não definiu de onde sai a entrega: só retirada. */
  entrega: { taxa: Centavos; raioKm: number; lat: number; lng: number; endereco: string } | null;
  categorias: { id: string; nome: string }[];
  produtos: { id: string; nome: string; preco: Centavos; categoriaId: string | null }[];
}

export interface DadosPedido {
  cliente: string;
  telefone: string;
  maior: boolean;
  retirada: boolean;
  cep?: string;
  bairro?: string;
  /** Localização do cliente (do CEP ou do GPS). Sem ela, a adega confere pelo endereço. */
  lat?: number;
  lng?: number;
  endereco?: string;
  complemento?: string;
  itens: { produtoId: string; qtd: number }[];
  pagamento: PagamentoPedido;
  trocoPara?: Centavos | null;
  observacao?: string;
  aparelho: string;
}

export interface Acompanhamento {
  numero: number;
  situacao: SituacaoPedido;
  motivo: string;
  criadoEm: string;
  atualizadoEm: string;
  retirada: boolean;
  itens: ItemDelivery[];
  subtotal: Centavos;
  taxa: Centavos;
  total: Centavos;
  pagamento: PagamentoPedido;
  trocoPara: Centavos | null;
  bairro: string;
}

const SEM_REDE = "Não conseguimos falar com a adega. Confira sua internet e tente de novo";

const ERROS_PEDIDO: Record<string, string> = {
  fechado: "A adega acabou de fechar e não está aceitando pedidos agora",
  idade: "Confirme que você tem 18 anos ou mais",
  nome_invalido: "Escreva seu nome",
  telefone_invalido: "Confira o telefone com DDD",
  pagamento_invalido: "Escolha a forma de pagamento",
  sem_retirada: "A retirada na loja não está disponível agora",
  sem_entrega: "A entrega não está disponível agora",
  cep_invalido: "Confira o CEP",
  fora_da_area: "Esse endereço fica fora da nossa área de entrega",
  endereco_invalido: "Escreva o endereço com número",
  limite: "Você já tem pedidos em andamento. Aguarde a entrega ou fale com a adega",
  itens_invalidos: "O carrinho está vazio",
  produto_indisponivel: "Algum produto do carrinho acabou. Atualize a página e confira o carrinho",
  minimo: "O pedido não chegou no valor mínimo",
  troco_invalido: "O troco precisa ser para um valor maior que o total",
};

export async function buscarCardapio(): Promise<Cardapio | null> {
  try {
    const { data, error } = await banco.rpc("cardapio_delivery");
    return error ? null : (data as Cardapio);
  } catch {
    return null;
  }
}

export async function enviarPedido(dados: DadosPedido): Promise<{ ok: true; token: string; numero: number } | { ok: false; erro: string }> {
  try {
    const { data, error } = await banco.rpc("fazer_pedido", { p_dados: dados });
    if (!error) return { ok: true, token: data.token, numero: data.numero };
    const codigo = Object.keys(ERROS_PEDIDO).find((c) => error.message?.includes(c));
    return { ok: false, erro: codigo ? ERROS_PEDIDO[codigo] : SEM_REDE };
  } catch {
    return { ok: false, erro: SEM_REDE };
  }
}

/** undefined = sem internet; null = pedido não existe. */
export async function acompanharPedido(token: string): Promise<Acompanhamento | null | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  try {
    const { data, error } = await banco.rpc("acompanhar_pedido", { p_token: token });
    return error ? undefined : ((data as Acompanhamento | null) ?? null);
  } catch {
    return undefined;
  }
}
