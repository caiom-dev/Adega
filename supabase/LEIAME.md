# Banco (Supabase)

Projeto `adega`, região São Paulo. As migrações foram aplicadas direto no projeto e o
histórico completo fica lá (Database > Migrations).

- `migrations/002_acessos_e_venda.sql`: cópia de referência das funções de login por PIN,
  cadastro de pessoas e fechamento de venda.
- `../scripts/importar-yooga.mjs`: importação única dos produtos e das vendas do Yooga.
  A função `importar_lote` que ele usa está com o acesso fechado; para importar de novo
  é preciso liberar o acesso dela e usar a chave guardada em `interno.importacao`.
