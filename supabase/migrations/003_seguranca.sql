-- 003: fecha o que o verificador de segurança do Supabase apontou.
-- Ainda NÃO aplicada no projeto: rodar pelo painel (SQL Editor) ou pelo MCP do Supabase.

-- A chave de importação do Yooga não pode ser lida por ninguém de fora.
-- Sem políticas, só o dono das tabelas lê: a função importar_lote (security definer) continua funcionando.
alter table interno.importacao enable row level security;
revoke all on all tables in schema interno from public, anon, authenticated;

-- Função com search_path fixo não pode ser enganada por um objeto de mesmo nome em outro schema.
alter function interno.pin_valido(text) set search_path = '';
