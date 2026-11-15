-- 011: todo dia às 8h de Brasília (11h UTC) o banco chama a função "lembretes".
-- A chave que a função confere é sorteada aqui e fica só no cofre do banco.
-- As chaves da notificação (VAPID) a própria função cria e guarda no cofre na primeira chamada.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'lembretes_chave')
where not exists (select 1 from vault.secrets where name = 'lembretes_chave');

create or replace function interno.disparar_lembretes() returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://lrrhwpsoiezxdexlrzdi.supabase.co/functions/v1/lembretes',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-lembretes', (select decrypted_secret from vault.decrypted_secrets where name = 'lembretes_chave')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000)
$$;
revoke execute on function interno.disparar_lembretes() from public, anon, authenticated;

select cron.schedule('lembretes-contas', '0 11 * * *', 'select interno.disparar_lembretes()');
