# Banco (Supabase)

Projeto `adega`, região São Paulo. As migrações são aplicadas direto no projeto e o
histórico completo fica lá (Database > Migrations).

- `esquema.sql`: retrato completo do banco (tabelas, regras de acesso, funções e permissões).
  Atualize junto sempre que o banco mudar.

- `migrations/002_acessos_e_venda.sql`: cópia de referência das funções de login por PIN,
  cadastro de pessoas e fechamento de venda.
- `../scripts/importar-yooga.mjs`: importação única dos produtos e das vendas do Yooga.
  A função `importar_lote` que ele usa está com o acesso fechado; para importar de novo
  é preciso liberar o acesso dela e usar a chave guardada em `interno.importacao`.
- `migrations/003_seguranca.sql`: liga RLS em `interno.importacao`, tira o acesso de fora ao schema
  `interno` e fixa o `search_path` de `interno.pin_valido`. Aplicada em 13/11/2026.
- `migrations/004_caixa_estoque_equipe.sql`: turnos de caixa (abrir, sangria, suprimento, fechar com
  conferência às cegas), estoque por produto com histórico, e quem vendeu/cancelou. Aplicada em 13/11/2026.
- `migrations/005_exige_caixa_aberto.sql`: venda do app só entra com caixa aberto. Aplicada em 13/11/2026.

- `migrations/006_estoque_completo.sql`: perda de estoque (guarda o custo da época) e contagem de vários
  produtos de uma vez (`registrar_contagem`). Aplicada em 13/11/2026.

- `migrations/007_delivery.sql`: bairros com taxa, horário e chave do delivery, pedidos, e as funções
  públicas (sem login) `cardapio_delivery`, `fazer_pedido` e `acompanhar_pedido`. `mudar_pedido` leva o
  pedido de novo a entregue, e na entrega cria a venda (origem `delivery`) e baixa o estoque. Aplicada em 13/11/2026.

- `migrations/008_delivery_raio.sql`: troca os bairros por raio a partir da adega com taxa única (endereço,
  coordenadas, `raio_km` e `taxa_entrega` em `configuracao`). O pedido guarda CEP, coordenadas e distância;
  `fazer_pedido` recusa com `fora_da_area` o que passa do raio. A tabela `bairros` ficou sem uso. Aplicada em 13/11/2026.

- `migrations/009_contas.sql`: contas a pagar (`contas`, só o dono lê e grava) e a área privada `boletos`
  para os anexos (PDF e foto, até 10 MB). Aplicada em 15/11/2026.

- `migrations/010_inscricoes_push.sql`: aparelhos do dono inscritos para notificação com o app fechado
  (`inscrever_push`, `desinscrever_push`). Aplicada em 15/11/2026.

- `migrations/011_agenda_lembretes.sql`: agendamento diário às 8h de Brasília (pg_cron + pg_net) que chama a
  função `lembretes`. A chave da chamada é sorteada no próprio banco e fica no cofre (vault). Aplicada em 15/11/2026.

- `migrations/012_contas_criado_por.sql`: quem lançou e quem pagou a conta passam a ser gravados pelo gatilho.
- `migrations/013_fotos_produtos.sql`: coluna `foto` em produtos, área pública `produtos` (só o dono envia e apaga)
  e o cardápio do delivery passa a mandar a foto.
  Aplicada em 15/11/2026.

- `functions/lembretes/index.ts`: função (Deno) que avisa o dono das contas 3 dias antes, 1 dia antes, no dia e
  todo dia enquanto vencida, por notificação no celular e por e-mail (Resend). Cria as chaves de notificação no
  cofre na primeira chamada. O e-mail só sai depois de cadastrar o segredo `RESEND_API_KEY` na função
  (e, com domínio próprio verificado no Resend, `LEMBRETES_REMETENTE`, por exemplo `Adega do Pezão <contas@seudominio>`).
  Publicar: `supabase functions deploy lembretes --no-verify-jwt` (ela confere o acesso sozinha).

`esquema.sql` foi tirado antes da 004: para recriar o banco, rode ele e depois da 004 à 013.
