# Adega do Pezão

Caixa, produtos e lucro da Adega do Pezão. App web instalável (PWA) feito para o celular,
que também funciona no computador.

## O que faz

- **Caixa**: mesas e balcões, comanda com nome do cliente, desconto, acréscimo e pagamento dividido com troco.
- **Turno de caixa**: abre com o troco da gaveta, sangria e suprimento, e fecha contando o dinheiro. O atendente
  conta às cegas; a diferença (sobrando ou faltando) aparece no fechamento e em "Caixas anteriores". Sem caixa aberto, não fecha venda.
- **Estoque** (opcional por produto, aba Estoque em Produtos): a venda baixa e o cancelamento devolve.
  Entrada por caixa ("2 caixas de 12") com atualização do custo, contagem da prateleira por categoria,
  perda (quebrou, venceu, consumo) com o prejuízo do mês, mínimo por produto com a lista "Acabando" no Início
  e histórico de cada mudança com quem fez.
- **Produtos**: preço, custo e margem calculada na hora. Foto do produto (escolher, arrastar ou colar com Ctrl+V;
  o app reduz para ~100 KB antes de enviar), que aparece na lista e no cardápio do delivery. Filtro "sem foto".
- **Delivery**: cardápio público em `/pedir` (sem login, confirma 18 anos), carrinho, entrega até um raio da adega
  (o cliente digita o CEP e o app confere a distância) com taxa única ou retirada, pagamento na entrega com troco e página para o cliente acompanhar o pedido. Na adega, a tela Delivery
  recebe os pedidos ao vivo com som e notificação, e cada um passa por aceito, saiu e entregue (vira venda e baixa o
  estoque) ou recusado com motivo. Em Ajustes: chave de aceitar pedidos, horário, pedido mínimo, área de entrega (endereço, raio e taxa) e produtos do cardápio.
- **Contas**: só o dono. Lança o boleto anexando o PDF (o app lê a linha digitável e preenche valor e vencimento)
  ou a foto (lê o código de barras no Chrome do Android); conta de consumo pede a data. Lista por vencimento com o
  total vencido, dos próximos 7 dias e do mês, copia a linha para pagar no banco e marca como paga com a data.
  Lembrete às 8h: 3 dias antes, 1 dia antes, no dia e todo dia enquanto vencida, por notificação no celular, aviso
  no Início e e-mail. A notificação liga em Ajustes, em cada aparelho.
- **Relatórios**: lucro, vendas por dia, horário e dia da semana, formas de pagamento, equipe (quem vendeu e quem cancelou) e histórico com cancelamento.
- **Ajustes**: pessoas e PINs, mesas e balcões, taxas da maquininha, categorias e cópia de segurança.
- **Acesso**: entrada por PIN de 4 números. O **dono** vê tudo; o **atendente** só vê o Caixa e nunca recebe o custo dos produtos.

## Como rodar

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # testes das contas (lucro, períodos, margem)
npm run lint
```

O app usa o projeto Supabase `adega` (São Paulo). O endereço e a chave pública já vêm no código
(`src/lib/banco.ts`) e podem ser trocados por `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_KEY`.

## Onde fica cada coisa

| Pasta | Conteúdo |
|---|---|
| `src/app` | As telas: Início, Caixa, Produtos, Relatórios e Ajustes |
| `src/components` | Peças de tela (`ui.tsx`, gráficos, entrada por PIN, caixa) |
| `src/lib/loja.ts` | Estado do app: cópia dos dados na memória, gravação no banco e atualização ao vivo |
| `src/lib/calculos.ts` | Contas de lucro, períodos e gráficos |
| `src/lib/acessos.ts` | PIN, pessoas e recuperação |
| `supabase/` | Funções do banco e migrações (veja `supabase/LEIAME.md`) |
| `scripts/importar-yooga.mjs` | Importação única dos dados do sistema antigo |
| `testes/` | Testes (`node --test`) |

## Regras importantes

- Dinheiro é sempre guardado em **centavos** (número inteiro).
- Preço e custo são copiados para a venda na hora em que ela fecha: mudar o produto depois não altera vendas antigas.
- Venda cancelada não é apagada: fica no histórico, riscada, e sai das contas.
- Vendas importadas do Yooga não têm itens: contam no faturamento, mas ficam fora do lucro.

## Impressora (cupom da conta)

Na comanda, o botão **Imprimir** tira o resumo da conta para mostrar ao cliente. No Histórico, uma venda
fechada também tem **Imprimir** (comprovante com forma de pagamento e troco). O cupom é para bobina de 80 mm
(Epson TM-T20X e parecidas) e sai pela impressão normal do navegador. CNPJ e nome ficam em `src/lib/empresa.ts`.

Configuração, uma vez só, no computador do caixa (Windows):

1. Instale o driver da Epson para o modelo da impressora (site da Epson, "TM-T20X", driver APD).
2. Em **Preferências de impressão** da Epson, deixe o papel em **Roll Paper 80 x 297 mm** e ligue a
   **redução de papel na margem inferior** (assim a bobina não avança papel em branco depois do cupom).
3. Na primeira impressão pelo Chrome, escolha a Epson, **Margens: Nenhuma** e **Escala: Padrão**. O Chrome lembra.
4. Opcional, para imprimir direto sem abrir a janela de impressão: deixe a Epson como impressora padrão
   do Windows e abra o Chrome do caixa com `--kiosk-printing` no atalho.

## Esqueci o PIN

- **Dono**: na tela do PIN, toque em "Esqueci meu PIN" e digite o e-mail do dono. O link que chega deixa escolher um PIN novo.
- **Atendente**: o dono troca o PIN em Ajustes > Pessoas.
