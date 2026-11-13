-- 003: fecha o que o verificador de segurança do Supabase apontou.
-- Aplicada no projeto em 13/11/2026 (migração "seguranca").

-- A chave de importação do Yooga não pode ser lida por ninguém de fora.
-- Sem políticas, só o dono das tabelas lê: a função importar_lote (security definer) continua funcionando.
alter table interno.importacao enable row level security;
revoke all on all tables in schema interno from public, anon, authenticated;

-- Função com search_path fixo não pode ser enganada por um objeto de mesmo nome em outro schema.
alter function interno.pin_valido(text) set search_path = '';
