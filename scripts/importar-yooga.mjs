// Importa para o banco os dois relatórios exportados do Yooga (arquivos ".xls" que são tabelas HTML).
// Uso: CHAVE_IMPORTACAO=... node scripts/importar-yooga.mjs "<Produtos - Normal.xls>" "<Vendas por Data.xls>"
// Pode rodar de novo sem duplicar: produtos têm id fixo pelo nome e vendas usam o código do Yooga.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const URL_BANCO = "https://lrrhwpsoiezxdexlrzdi.supabase.co";
const CHAVE_PUBLICA = "sb_publishable_nx_4oTyLkrz3ZHBKFVy80Q_4tpbKQwd";
const CHAVE = process.env.CHAVE_IMPORTACAO;
const [arqProdutos, arqVendas] = process.argv.slice(2);
if (!CHAVE || !arqProdutos || !arqVendas) throw new Error("Faltou CHAVE_IMPORTACAO ou os dois arquivos");

const limpa = (s) =>
  s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
const ler = (arquivo) =>
  [...readFileSync(arquivo, "utf8").matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) =>
    [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => limpa(c[1])),
  );
/** "1.234,56" vira 123456 centavos. */
const centavos = (s) => Math.round(Number(String(s).replace(/\./g, "").replace(",", ".")) * 100) || 0;
const idFixo = (texto) => {
  const h = createHash("sha1").update(texto).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

async function enviar(tipo, linhas, tamanho) {
  let total = 0;
  for (let i = 0; i < linhas.length; i += tamanho) {
    const resposta = await fetch(`${URL_BANCO}/rest/v1/rpc/importar_lote`, {
      method: "POST",
      headers: { apikey: CHAVE_PUBLICA, "Content-Type": "application/json" },
      body: JSON.stringify({ p_chave: CHAVE, p_tipo: tipo, p_linhas: linhas.slice(i, i + tamanho) }),
    });
    if (!resposta.ok) throw new Error(`${tipo}: ${resposta.status} ${await resposta.text()}`);
    total += await resposta.json();
  }
  console.log(`${tipo}: ${linhas.length} no arquivo, ${total} gravados agora`);
}

/* Produtos */

// Nomes de categoria como estão no Yooga, arrumados (acento, maiúsculas, "wisk").
const CATEGORIAS = {
  "Sinuca": "Sinuca",
  "cervejas": "Cervejas",
  "gelos": "Gelos",
  "refri, agua, sucos": "Refri, água e sucos",
  "TABACARIA": "Tabacaria",
  "Bebidas": "Bebidas",
  "Sem Categoria": "Sem categoria",
  "doces": "Doces",
  "askov beats": "Askov e Beats",
  "Porções": "Porções",
  "Drinks": "Drinks",
  "Doses": "Doses",
  "LANCHES": "Lanches",
  "CIGARROS": "Cigarros",
  "combos": "Combos",
  "PACK": "Packs",
  "Carvâo": "Carvão",
  "combos gin e vodk com BALY": "Combos gin e vodka com Baly",
  "combos wisk com red bull": "Combos whisky com Red Bull",
  "Rifa": "Rifa",
  "COMBOS WISK COM BALY": "Combos whisky com Baly",
  "Vinhos": "Vinhos",
  "Garrafas wisk gin licor": "Garrafas: whisky, gin e licor",
  "Combos de Gin e Vodk com Red bull": "Combos gin e vodka com Red Bull",
  "AÇAI MELHORADO": "Açaí melhorado",
  "Espetinhos": "Espetinhos",
};

const tabela = ler(arqProdutos);
const inicio = tabela.findIndex((l) => l.length > 4);
const linhasProdutos = tabela.slice(inicio + 1).filter((l) => l.length === tabela[inicio].length && l[1]);

const categorias = [];
const idCategoria = new Map();
for (const l of linhasProdutos) {
  if (idCategoria.has(l[2])) continue;
  const nome = CATEGORIAS[l[2]] ?? l[2];
  idCategoria.set(l[2], idFixo(`categoria:${nome}`));
  categorias.push({ id: idFixo(`categoria:${nome}`), nome, ordem: categorias.length + 1 });
}

// Mesmo nome e mesmo preço = cadastro repetido: fica um só (de preferência o que tem categoria).
// Mesmo nome com preço diferente fica como está e sai na lista para conferir.
const porChave = new Map();
for (const l of linhasProdutos) {
  const chave = `${l[1].toLowerCase()}|${centavos(l[5])}`;
  const atual = porChave.get(chave);
  if (!atual || (atual[2] === "Sem Categoria" && l[2] !== "Sem Categoria")) porChave.set(chave, l);
}
const vistos = new Map();
const produtos = [...porChave.values()].map((l) => {
  const nome = l[1];
  const repeticao = vistos.get(nome.toLowerCase()) ?? 0;
  vistos.set(nome.toLowerCase(), repeticao + 1);
  const custo = centavos(l[4]);
  return {
    id: idFixo(`produto:${nome.toLowerCase()}|${centavos(l[5])}`),
    nome,
    categoria: idCategoria.get(l[2]),
    preco: centavos(l[5]),
    // Custo zerado no Yooga quer dizer "não cadastrado".
    custo: custo > 0 ? custo : null,
  };
});
console.log(`produtos: ${linhasProdutos.length} linhas, ${produtos.length} depois de tirar repetidos`);
const repetidos = [...vistos].filter(([, n]) => n > 1).map(([nome]) => nome);
if (repetidos.length) console.log("mesmo nome com preços diferentes (conferir):", repetidos.join(", "));

/* Vendas */

const FORMAS = {
  "Débito": ["debito", "Débito"],
  "Crédito": ["credito", "Crédito"],
  "Pix": ["pix", "Pix"],
  "Dinheiro": ["dinheiro", "Dinheiro"],
  "COMPOSTO": ["composto", "Composto"],
};
const vendas = ler(arqVendas)
  .filter((l) => l.length === 10 && /^\d+$/.test(l[0]))
  .map((l) => {
    const [dia, mes, ano] = l[9].slice(0, 10).split("/");
    const [forma, formaNome] = FORMAS[l[7]] ?? ["outros", "Outros"];
    return {
      codigo: Number(l[0]),
      subtotal: centavos(l[2]),
      acrescimo: centavos(l[3]),
      desconto: centavos(l[5]),
      total: centavos(l[6]),
      forma,
      formaNome,
      // O relatório está no horário de Brasília.
      quando: `${ano}-${mes}-${dia}T${l[9].slice(11)}-03:00`,
    };
  });
console.log(`vendas: ${vendas.length}, total R$ ${(vendas.reduce((s, v) => s + v.total, 0) / 100).toFixed(2)}`);

await enviar("categorias", categorias, 500);
await enviar("produtos", produtos, 500);
await enviar("vendas", vendas, 2000);
