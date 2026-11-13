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
  /** Unidades em estoque. null quando o produto não tem estoque controlado. Pode ficar negativo. */
  estoque: number | null;
  /** Abaixo ou igual a isso, o produto aparece como "estoque baixo". */
  estoqueMinimo: number | null;
  /** Aparece no cardápio do delivery. */
  delivery: boolean;
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
  /** Quem fechou a venda. */
  pessoaId?: string | null;
  /** Quem cancelou (só enquanto está cancelada). */
  canceladaPor?: string | null;
  /** Turno de caixa em que a venda entrou. */
  caixaId?: string | null;
}

export interface MovimentoCaixa {
  id: string;
  /** Sangria tira dinheiro da gaveta; suprimento põe. */
  tipo: "sangria" | "suprimento";
  valor: Centavos;
  motivo: string;
  pessoaId: string | null;
  criadoEm: string;
}

/** O turno de caixa aberto agora. */
export interface Caixa {
  id: string;
  abertoEm: string;
  abertoPor: string | null;
  /** Dinheiro que estava na gaveta ao abrir (o troco). */
  valorInicial: Centavos;
  movimentos: MovimentoCaixa[];
}

/** Resumo de um turno, aberto ou fechado. Valores null = escondidos (contagem às cegas do atendente). */
export interface ResumoCaixa {
  id: string;
  abertoEm: string;
  abertoPor: string | null;
  valorInicial: Centavos;
  fechadoEm: string | null;
  fechadoPor: string | null;
  esperado: Centavos | null;
  contado: Centavos | null;
  observacao: string;
  movimentos: MovimentoCaixa[];
  pedidos: number;
  canceladas: number;
  total: Centavos | null;
  porForma: { formaId: string; formaNome: string; valor: Centavos }[];
}

export interface MovimentoEstoque {
  id: string;
  tipo: "venda" | "cancelamento" | "entrada" | "contagem" | "perda";
  /** Quanto mudou: positivo entrou, negativo saiu. */
  qtd: number;
  /** Estoque depois da mudança. */
  saldo: number;
  pessoaId: string | null;
  motivo: string;
  criadoEm: string;
  /** Custo da unidade na hora da perda. Só nas perdas. */
  custo: number | null;
}

/* Delivery */

export interface Bairro {
  id: string;
  nome: string;
  /** Taxa de entrega. */
  taxa: Centavos;
  ativo: boolean;
}

/** Um dia do horário do delivery. null = fechado no dia. "fecha" menor que "abre" passa da meia-noite. */
export type DiaHorario = { abre: string; fecha: string } | null;

export interface ConfigDelivery {
  /** Chave geral: desligada, a loja não aceita pedido nenhum. */
  aberto: boolean;
  pedidoMinimo: Centavos;
  /** Aceita "retirar na loja". */
  retirada: boolean;
  /** 7 dias, de domingo a sábado. Lista vazia = sem horário (vale só a chave). */
  horario: DiaHorario[];
}

export type SituacaoPedido = "novo" | "aceito" | "saiu" | "entregue" | "recusado";
export type PagamentoPedido = "dinheiro" | "cartao" | "pix";

export interface ItemDelivery {
  produtoId: string;
  nome: string;
  preco: Centavos;
  qtd: number;
}

export interface Pedido {
  id: string;
  numero: number;
  criadoEm: string;
  atualizadoEm: string;
  cliente: string;
  /** Só números, com DDD. */
  telefone: string;
  retirada: boolean;
  endereco: string;
  complemento: string;
  bairro: string;
  itens: ItemDelivery[];
  subtotal: Centavos;
  taxa: Centavos;
  total: Centavos;
  pagamento: PagamentoPedido;
  trocoPara: Centavos | null;
  observacao: string;
  situacao: SituacaoPedido;
  motivo: string;
  pessoaId: string | null;
}

export type Papel = "dono" | "atendente";

export interface Pessoa {
  id: string;
  nome: string;
  papel: Papel;
}

/** Pessoa para mostrar o nome em vendas, caixas e estoque. Inclui quem já foi removido (para o dono). */
export interface Membro extends Pessoa {
  ativo: boolean;
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
  /** Turno de caixa aberto. null = caixa fechado. */
  caixa: Caixa | null;
  /** Nomes de quem usa o app, para mostrar quem fez o quê. */
  equipe: Membro[];
  delivery: ConfigDelivery;
  bairros: Bairro[];
  /** Pedidos em andamento e os concluídos nas últimas 24 horas. */
  pedidos: Pedido[];
}
