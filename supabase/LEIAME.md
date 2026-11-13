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

`esquema.sql` foi tirado antes da 004: para recriar o banco, rode ele e depois da 004 à 006.
