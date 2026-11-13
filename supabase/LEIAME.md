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
