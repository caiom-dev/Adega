/** Valores em dinheiro são sempre guardados em centavos (inteiro) para não errar arredondamento. */
export type Centavos = number;

export interface Categoria {
  id: string;
  nome: string;
}

export interface Produto {
  id: string;
  nome: string;
  categoriaId: string;
  preco: Centavos;
  /** null quando o custo ainda não foi cadastrado. */
  custo: Centavos | null;
  ativo: boolean;
}

export interface FormaPagamento {
  id: string;
  nome: string;
  /** Taxa da maquininha em porcentagem. Ex.: 3.5 para 3,5%. */
  taxa: number;
}

/** Preço e custo são copiados no momento da venda: mudar o produto depois não altera vendas antigas. */
export interface ItemPedido {
  produtoId: string;
  nome: string;
  preco: Centavos;
  custo: Centavos | null;
  qtd: number;
}

export type TipoLugar = "mesa" | "balcao";

/** Conta de uma mesa ou balcão. Só existe enquanto está em atendimento. id = "mesa-3", "balcao-1"... */
export interface Comanda {
  id: string;
  tipo: TipoLugar;
  numero: number;
  /** Nome opcional do cliente, ex.: "Seu Zé". */
  cliente: string;
  itens: ItemPedido[];
  desconto: Centavos;
  acrescimo: Centavos;
  abertaEm: string;
}

export interface Pagamento {
  formaId: string;
  formaNome: string;
  taxa: number;
  valor: Centavos;
}

export interface Venda {
  id: string;
  numero: number;
  comandaNome: string;
  itens: ItemPedido[];
  subtotal: Centavos;
  desconto: Centavos;
  acrescimo: Centavos;
  total: Centavos;
  pagamentos: Pagamento[];
  troco: Centavos;
  criadaEm: string;
  /** Preenchido quando a venda foi cancelada. Ela continua no histórico, mas sai das contas. */
  canceladaEm?: string;
}

export interface Estado {
  versao: 2;
  categorias: Categoria[];
  produtos: Produto[];
  formas: FormaPagamento[];
  /** Quantas mesas e balcões aparecem no caixa. */
  mesas: number;
  balcoes: number;
  /** Última aba aberta no caixa neste aparelho. */
  abaCaixa: TipoLugar;
  comandas: Comanda[];
  vendas: Venda[];
  proximoNumero: number;
}
