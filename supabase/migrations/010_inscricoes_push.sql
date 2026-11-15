-- 010: aparelhos do dono inscritos para receber notificação com o app fechado (Web Push).
-- Sem políticas de acesso: só as duas funções abaixo e a função "lembretes" (supabase/functions) mexem nela.

create table public.inscricoes_push (
  endpoint text primary key check (endpoint ~ '^https://'),
  pessoa_id uuid not null references public.pessoas(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  aparelho text not null default '',
  criado_em timestamptz not null default now()
);
alter table public.inscricoes_push enable row level security;

create or replace function public.inscrever_push(p_endpoint text, p_p256dh text, p_auth text, p_aparelho text default '')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select public.meu_papel()) is distinct from 'dono' then raise exception 'sem_permissao'; end if;
  insert into public.inscricoes_push (endpoint, pessoa_id, p256dh, auth, aparelho)
  values (p_endpoint, interno.eu(), p_p256dh, p_auth, left(coalesce(p_aparelho, ''), 120))
  on conflict (endpoint) do update set pessoa_id = excluded.pessoa_id, p256dh = excluded.p256dh,
    auth = excluded.auth, aparelho = excluded.aparelho;
end $$;

create or replace function public.desinscrever_push(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from public.inscricoes_push where endpoint = p_endpoint and pessoa_id = interno.eu()
$$;

revoke execute on function public.inscrever_push(text, text, text, text), public.desinscrever_push(text) from public, anon;
grant execute on function public.inscrever_push(text, text, text, text), public.desinscrever_push(text) to authenticated;
