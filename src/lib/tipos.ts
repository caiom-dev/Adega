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
  /** null quando o custo ainda não foi cadastrado. O atendente sempre recebe null. */
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
  /**
   * "yooga": venda importada do sistema antigo. Não tem itens, então conta para
   * faturamento, horário e forma de pagamento, mas fica fora do lucro.
   */
  origem?: "yooga";
}

export type Papel = "dono" | "atendente";

export interface Pessoa {
  id: string;
  nome: string;
  papel: Papel;
}

export interface Estado {
  /** "carregando" até saber se há sessão; "fora" pede o PIN; "dentro" mostra o app. */
  situacao: "carregando" | "fora" | "dentro";
  /** Quem está usando o app agora. */
  pessoa: Pessoa | null;
  /** Aviso de falha ao salvar (sem internet, por exemplo). null quando está tudo certo. */
  erro: string | null;
  /** O dono abriu o link de recuperação do e-mail e precisa escolher um PIN novo. */
  recuperando: boolean;
  categorias: Categoria[];
  produtos: Produto[];
  formas: FormaPagamento[];
  /** Quantas mesas e balcões aparecem no caixa. */
  mesas: number;
  balcoes: number;
  /** Última aba aberta no caixa neste aparelho. */
  abaCaixa: TipoLugar;
  comandas: Comanda[];
  /** Só o dono recebe vendas. Para o atendente a lista fica vazia. */
  vendas: Venda[];
  /** false enquanto as vendas (inclusive o histórico do Yooga) ainda estão chegando. */
  vendasProntas: boolean;
}
