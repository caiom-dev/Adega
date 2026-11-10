import type { Estado, Produto } from "./tipos";

/**
 * Dados iniciais. Produtos e preços vieram da tela de vendas do Yooga da adega
 * (05/11/2026). O único custo conhecido é o do copão de gin (R$ 6,20); os outros
 * ficam sem custo até alguém cadastrar, e o relatório de lucro avisa disso.
 */
const categorias = [
  { id: "cervejas", nome: "Cervejas" },
  { id: "drinks", nome: "Drinks e doses" },
  { id: "combos", nome: "Combos" },
  { id: "garrafas", nome: "Garrafas" },
  { id: "sem-alcool", nome: "Refri, água e energético" },
  { id: "gelo-carvao", nome: "Gelo e carvão" },
  { id: "tabacaria", nome: "Tabacaria" },
  { id: "comidas", nome: "Comidas" },
  { id: "outros", nome: "Sinuca e outros" },
];

const p = (id: string, nome: string, categoriaId: string, preco: number, custo: number | null = null): Produto => ({
  id,
  nome,
  categoriaId,
  preco,
  custo,
  ativo: true,
});

const produtos: Produto[] = [
  p("p01", "Brahma 300ml consumo loja", "cervejas", 350),
  p("p02", "Copão gin Dober", "drinks", 1000, 620),
  p("p03", "Original lata 350ml", "cervejas", 550),
  p("p04", "Brahma lata 350ml", "cervejas", 500),
  p("p05", "Skol 300ml consumo loja", "cervejas", 350),
  p("p06", "Heineken lata 350ml", "cervejas", 700),
  p("p07", "Skol lata 350ml", "cervejas", 500),
  p("p08", "Original 300ml", "cervejas", 400),
  p("p09", "Antarctica barriguda 300ml", "cervejas", 350),
  p("p10", "Heineken 330ml", "cervejas", 900),
  p("p11", "Amstel lata 350ml", "cervejas", 600),
  p("p12", "Budweiser lata 350ml", "cervejas", 600),
  p("p13", "Império lata 350ml", "cervejas", 500),
  p("p14", "Corona long neck 330ml", "cervejas", 900),
  p("p15", "Budweiser long neck 330ml", "cervejas", 700),
  p("p16", "Crystal lata 350ml", "cervejas", 400),
  p("p17", "Brahma Duplo Malte", "cervejas", 600),
  p("p18", "Stella Artois Pure Gold", "cervejas", 900),
];

export function estadoInicial(): Estado {
  return {
    versao: 2,
    categorias,
    produtos,
    formas: [
      { id: "dinheiro", nome: "Dinheiro", taxa: 0 },
      { id: "pix", nome: "Pix", taxa: 0 },
      { id: "debito", nome: "Débito", taxa: 0 },
      { id: "credito", nome: "Crédito", taxa: 0 },
    ],
    // Mesma quantidade que a adega usa hoje no Yooga.
    mesas: 24,
    balcoes: 10,
    abaCaixa: "balcao",
    comandas: [],
    vendas: [],
    proximoNumero: 1,
  };
}
