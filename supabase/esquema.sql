-- Retrato do banco do projeto "adega" em 13/11/2026, depois da migração 003_seguranca.
-- Gerado a partir do próprio banco (tabelas, regras de acesso, índices e funções dos schemas public e interno).
-- Serve de referência e para recriar o banco do zero; o histórico das mudanças fica em migrations/.
-- Ao mudar o banco, atualize este arquivo junto.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists interno;

/* ───────── Tabelas ───────── */

-- Chave que libera a função importar_lote. Sem regras de acesso: ninguém de fora lê.
create table interno.importacao (
  chave text not null,
  constraint importacao_pkey primary key (chave)
);
alter table interno.importacao enable row level security;

create table public.categorias (
  id uuid not null default gen_random_uuid(),
  nome text not null,
  ordem integer not null default 0,
  constraint categorias_pkey primary key (id)
);
alter table public.categorias enable row level security;

-- Comanda sem itens = lugar livre. Ao fechar a venda a linha é esvaziada, não apagada.
create table public.comandas (
  id text not null,
  tipo text not null,
  numero integer not null,
  cliente text not null default ''::text,
  itens jsonb not null default '[]'::jsonb,
  desconto integer not null default 0,
  acrescimo integer not null default 0,
  aberta_em timestamp with time zone not null default now(),
  constraint comandas_pkey primary key (id),
  constraint comandas_acrescimo_check check ((acrescimo >= 0)),
  constraint comandas_desconto_check check ((desconto >= 0)),
  constraint comandas_tipo_check check ((tipo = any (array['mesa'::text, 'balcao'::text])))
);
alter table public.comandas enable row level security;

-- Uma linha só (id = 1).
create table public.configuracao (
  id integer not null default 1,
  mesas integer not null default 24,
  balcoes integer not null default 10,
  inicio_em timestamp with time zone not null default now(),
  constraint configuracao_pkey primary key (id),
  constraint configuracao_balcoes_check check (((balcoes >= 0) and (balcoes <= 99))),
  constraint configuracao_id_check check ((id = 1)),
  constraint configuracao_mesas_check check (((mesas >= 0) and (mesas <= 99)))
);
alter table public.configuracao enable row level security;

create table public.produtos (
  id uuid not null default gen_random_uuid(),
  nome text not null,
  categoria_id uuid,
  preco integer not null,
  ativo boolean not null default true,
  criado_em timestamp with time zone not null default now(),
  constraint produtos_pkey primary key (id),
  constraint produtos_categoria_id_fkey foreign key (categoria_id) references public.categorias(id) on delete set null,
  constraint produtos_preco_check check ((preco >= 0))
);
alter table public.produtos enable row level security;

-- Custo separado do produto: só o dono lê esta tabela.
create table public.custos (
  produto_id uuid not null,
  custo integer not null,
  constraint custos_pkey primary key (produto_id),
  constraint custos_produto_id_fkey foreign key (produto_id) references public.produtos(id) on delete cascade,
  constraint custos_custo_check check ((custo >= 0))
);
alter table public.custos enable row level security;

create table public.formas (
  id text not null,
  nome text not null,
  taxa numeric(5,2) not null default 0,
  ordem integer not null default 0,
  constraint formas_pkey primary key (id),
  constraint formas_taxa_check check (((taxa >= (0)::numeric) and (taxa <= (100)::numeric)))
);
alter table public.formas enable row level security;

-- Cada pessoa tem um usuário de autenticação por trás (auth_id), com senha aleatória trocada a cada entrada.
create table public.pessoas (
  id uuid not null default gen_random_uuid(),
  auth_id uuid not null,
  nome text not null,
  papel text not null,
  pin_hash text not null,
  erros integer not null default 0,
  bloqueado_ate timestamp with time zone,
  ativo boolean not null default true,
  criado_em timestamp with time zone not null default now(),
  constraint pessoas_auth_id_key unique (auth_id),
  constraint pessoas_pkey primary key (id),
  constraint pessoas_auth_id_fkey foreign key (auth_id) references auth.users(id) on delete cascade,
  constraint pessoas_nome_check check (((length(trim(both from nome)) >= 1) and (length(trim(both from nome)) <= 30))),
  constraint pessoas_papel_check check ((papel = any (array['dono'::text, 'atendente'::text])))
);
alter table public.pessoas enable row level security;

create sequence if not exists public.vendas_numero_seq;

create table public.vendas (
  id uuid not null default gen_random_uuid(),
  numero bigint not null default nextval('public.vendas_numero_seq'::regclass),
  comanda_nome text not null default ''::text,
  itens jsonb not null default '[]'::jsonb,
  subtotal integer not null,
  desconto integer not null default 0,
  acrescimo integer not null default 0,
  total integer not null,
  pagamentos jsonb not null default '[]'::jsonb,
  troco integer not null default 0,
  criada_em timestamp with time zone not null default now(),
  cancelada_em timestamp with time zone,
  origem text not null default 'app'::text,
  codigo_yooga bigint,
  chave uuid,
  pessoa_id uuid,
  constraint vendas_chave_key unique (chave),
  constraint vendas_codigo_yooga_key unique (codigo_yooga),
  constraint vendas_pkey primary key (id),
  constraint vendas_pessoa_id_fkey foreign key (pessoa_id) references public.pessoas(id) on delete set null,
  constraint vendas_origem_check check ((origem = any (array['app'::text, 'yooga'::text, 'delivery'::text])))
);
alter table public.vendas enable row level security;

create index produtos_categoria_id_idx on public.produtos using btree (categoria_id);
create index vendas_origem_criada_em_idx on public.vendas using btree (origem, criada_em);

-- Tempo real (publicação supabase_realtime): pessoas, categorias, produtos, custos, formas,
-- configuracao, comandas e vendas.

/* ───────── Funções ───────── */

create or replace function public.meu_papel()
 returns text
 language sql
 stable security definer
 set search_path to ''
as $function$
  select papel from public.pessoas where auth_id = (select auth.uid()) and ativo
$function$;

create or replace function interno.pin_valido(p_pin text)
 returns boolean
 language sql
 immutable
 set search_path to ''
as $function$ select p_pin ~ '^[0-9]{4}$' $function$;

create or replace function interno.exigir_dono()
 returns void
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
begin
  if (select public.meu_papel()) is distinct from 'dono' then
    raise exception 'so_dono' using errcode = '42501';
  end if;
end $function$;

create or replace function interno.criar_auth(p_email text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', lower(p_email),
    extensions.crypt(encode(extensions.gen_random_bytes(24), 'hex'), extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', lower(p_email), 'email_verified', true),
    'email', now(), now(), now());
  return v_id;
end $function$;

create or replace function public.pessoas_login()
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'papel', papel) order by papel desc, nome), '[]'::jsonb)
  from public.pessoas where ativo
$function$;

create or replace function public.criar_primeiro_dono(p_nome text, p_pin text, p_email text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_auth uuid; v_id uuid;
begin
  lock table public.pessoas in exclusive mode;
  if exists (select 1 from public.pessoas) then raise exception 'ja_configurado'; end if;
  if not interno.pin_valido(p_pin) then raise exception 'pin_invalido'; end if;
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_invalido'; end if;
  v_auth := interno.criar_auth(p_email);
  insert into public.pessoas (auth_id, nome, papel, pin_hash)
  values (v_auth, trim(p_nome), 'dono', extensions.crypt(p_pin, extensions.gen_salt('bf')))
  returning id into v_id;
  return v_id;
end $function$;

create or replace function public.entrar(p_pessoa uuid, p_pin text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare p public.pessoas; v_senha text; v_email text; v_erros int;
begin
  select * into p from public.pessoas where id = p_pessoa and ativo for update;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'pin'); end if;
  if p.bloqueado_ate is not null and p.bloqueado_ate > now() then
    return jsonb_build_object('ok', false, 'motivo', 'bloqueado', 'ate', p.bloqueado_ate);
  end if;
  if p.pin_hash <> extensions.crypt(coalesce(p_pin, ''), p.pin_hash) then
    v_erros := p.erros + 1;
    if v_erros >= 5 then
      update public.pessoas set erros = 0, bloqueado_ate = now() + interval '15 minutes' where id = p.id;
      return jsonb_build_object('ok', false, 'motivo', 'bloqueado', 'ate', now() + interval '15 minutes');
    end if;
    update public.pessoas set erros = v_erros where id = p.id;
    return jsonb_build_object('ok', false, 'motivo', 'pin', 'restam', 5 - v_erros);
  end if;
  v_senha := encode(extensions.gen_random_bytes(24), 'hex');
  update auth.users set encrypted_password = extensions.crypt(v_senha, extensions.gen_salt('bf')), updated_at = now()
    where id = p.auth_id returning email into v_email;
  update public.pessoas set erros = 0, bloqueado_ate = null where id = p.id;
  return jsonb_build_object('ok', true, 'email', v_email, 'senha', v_senha);
end $function$;

create or replace function public.criar_pessoa(p_nome text, p_papel text, p_pin text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_auth uuid; v_id uuid := gen_random_uuid();
begin
  perform interno.exigir_dono();
  if not interno.pin_valido(p_pin) then raise exception 'pin_invalido'; end if;
  if p_papel not in ('dono','atendente') then raise exception 'papel_invalido'; end if;
  if exists (select 1 from public.pessoas where ativo and lower(trim(nome)) = lower(trim(p_nome))) then
    raise exception 'nome_em_uso';
  end if;
  v_auth := interno.criar_auth('pessoa-' || v_id || '@adega.invalid');
  insert into public.pessoas (id, auth_id, nome, papel, pin_hash)
  values (v_id, v_auth, trim(p_nome), p_papel, extensions.crypt(p_pin, extensions.gen_salt('bf')));
  return v_id;
end $function$;

create or replace function public.trocar_pin(p_pessoa uuid, p_pin text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not interno.pin_valido(p_pin) then raise exception 'pin_invalido'; end if;
  if (select public.meu_papel()) is distinct from 'dono'
     and not exists (select 1 from public.pessoas where id = p_pessoa and auth_id = (select auth.uid()) and ativo) then
    raise exception 'so_dono' using errcode = '42501';
  end if;
  update public.pessoas set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')), erros = 0, bloqueado_ate = null
    where id = p_pessoa;
end $function$;

create or replace function public.desbloquear_pessoa(p_pessoa uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  perform interno.exigir_dono();
  update public.pessoas set erros = 0, bloqueado_ate = null where id = p_pessoa;
end $function$;

create or replace function public.remover_pessoa(p_pessoa uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare p public.pessoas;
begin
  perform interno.exigir_dono();
  select * into p from public.pessoas where id = p_pessoa and ativo;
  if not found then return; end if;
  if p.papel = 'dono' and (select count(*) from public.pessoas where ativo and papel = 'dono') <= 1 then
    raise exception 'ultimo_dono';
  end if;
  update public.pessoas set ativo = false where id = p_pessoa;
end $function$;

create or replace function public.meu_email()
 returns text
 language sql
 stable security definer
 set search_path to ''
as $function$
  select case when email like '%@adega.invalid' then null else email end
  from auth.users where id = (select auth.uid())
$function$;

create or replace function public.definir_meu_email(p_email text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  perform interno.exigir_dono();
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_invalido'; end if;
  if exists (select 1 from auth.users where email = lower(p_email) and id <> (select auth.uid())) then
    raise exception 'email_em_uso';
  end if;
  update auth.users set email = lower(p_email), updated_at = now() where id = (select auth.uid());
  update auth.identities set identity_data = identity_data || jsonb_build_object('email', lower(p_email)), updated_at = now()
    where user_id = (select auth.uid()) and provider = 'email';
end $function$;

create or replace function public.fechar_venda(p_comanda text, p_pagamentos jsonb, p_chave uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_papel text := (select public.meu_papel());
  c public.comandas; v public.vendas; f public.formas;
  v_itens jsonb; v_sub int; v_total int; v_pago int; v_troco int; v_sobra int;
  v_pags jsonb := '[]'::jsonb; r record; v_valor int; v_tira int;
begin
  if v_papel is null then raise exception 'sem_acesso' using errcode = '42501'; end if;
  select * into v from public.vendas where chave = p_chave;
  if not found then
    select * into c from public.comandas where id = p_comanda for update;
    if not found or jsonb_array_length(c.itens) = 0 then raise exception 'comanda_vazia'; end if;

    select jsonb_agg(jsonb_build_object(
             'produtoId', i->>'produtoId', 'nome', i->>'nome',
             'preco', (i->>'preco')::int, 'qtd', (i->>'qtd')::int,
             'custo', (select k.custo from public.custos k where k.produto_id::text = i->>'produtoId'))),
           sum((i->>'preco')::int * (i->>'qtd')::int)
      into v_itens, v_sub
      from jsonb_array_elements(c.itens) i;
    v_total := greatest(0, v_sub - c.desconto + c.acrescimo);

    select coalesce(sum((x->>'valor')::int), 0) into v_pago
      from jsonb_array_elements(p_pagamentos) x where (x->>'valor')::int > 0;
    if v_pago < v_total then raise exception 'falta_pagar'; end if;
    v_troco := v_pago - v_total;
    v_sobra := v_troco;

    for r in select x, n from jsonb_array_elements(p_pagamentos) with ordinality as t(x, n) order by n desc loop
      v_valor := (r.x->>'valor')::int;
      if v_valor <= 0 then continue; end if;
      if v_sobra > 0 and r.x->>'formaId' = 'dinheiro' then
        v_tira := least(v_sobra, v_valor);
        v_sobra := v_sobra - v_tira;
        v_valor := v_valor - v_tira;
      end if;
      if v_valor > 0 then
        select * into f from public.formas where id = r.x->>'formaId';
        if not found then raise exception 'forma_invalida'; end if;
        v_pags := jsonb_build_array(jsonb_build_object(
          'formaId', f.id, 'formaNome', f.nome, 'taxa', f.taxa, 'valor', v_valor)) || v_pags;
      end if;
    end loop;
    if v_sobra > 0 then raise exception 'troco_sem_dinheiro'; end if;

    insert into public.vendas (comanda_nome, itens, subtotal, desconto, acrescimo, total, pagamentos, troco, chave, pessoa_id)
    values (
      case c.tipo when 'mesa' then 'Mesa ' else 'Balcão ' end || c.numero
        || case when c.cliente <> '' then ' · ' || c.cliente else '' end,
      v_itens, v_sub, c.desconto, c.acrescimo, v_total, v_pags, v_troco, p_chave,
      (select id from public.pessoas where auth_id = (select auth.uid())))
    returning * into v;
    update public.comandas set itens = '[]'::jsonb, cliente = '', desconto = 0, acrescimo = 0 where id = c.id;
  end if;

  if v_papel <> 'dono' then
    v.itens := (select jsonb_agg(i - 'custo') from jsonb_array_elements(v.itens) i);
  end if;
  return to_jsonb(v);
end $function$;

create or replace function public.vendas_yooga()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
begin
  perform interno.exigir_dono();
  return (select coalesce(jsonb_agg(jsonb_build_array(codigo_yooga, extract(epoch from criada_em)::bigint, total,
            desconto, acrescimo, pagamentos->0->>'formaId', cancelada_em is not null) order by criada_em), '[]'::jsonb)
          from public.vendas where origem = 'yooga');
end $function$;

-- Importação única do Yooga. Execução fechada para todos: liberar só para importar de novo.
create or replace function public.importar_lote(p_chave text, p_tipo text, p_linhas jsonb)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare n int;
begin
  if not exists (select 1 from interno.importacao where chave = p_chave) then raise exception 'chave'; end if;
  if p_tipo = 'categorias' then
    insert into public.categorias (id, nome, ordem)
    select (x->>'id')::uuid, x->>'nome', (x->>'ordem')::int from jsonb_array_elements(p_linhas) x
    on conflict (id) do nothing;
  elsif p_tipo = 'produtos' then
    insert into public.produtos (id, nome, categoria_id, preco)
    select (x->>'id')::uuid, x->>'nome', (x->>'categoria')::uuid, (x->>'preco')::int from jsonb_array_elements(p_linhas) x
    on conflict (id) do nothing;
    insert into public.custos (produto_id, custo)
    select (x->>'id')::uuid, (x->>'custo')::int from jsonb_array_elements(p_linhas) x where x->>'custo' is not null
    on conflict (produto_id) do nothing;
  elsif p_tipo = 'vendas' then
    insert into public.vendas (numero, comanda_nome, subtotal, desconto, acrescimo, total, pagamentos, criada_em, origem, codigo_yooga)
    select (x->>'codigo')::bigint, 'Yooga', (x->>'subtotal')::int, (x->>'desconto')::int, (x->>'acrescimo')::int, (x->>'total')::int,
      jsonb_build_array(jsonb_build_object('formaId', x->>'forma', 'formaNome', x->>'formaNome', 'taxa', 0, 'valor', (x->>'total')::int)),
      (x->>'quando')::timestamptz, 'yooga', (x->>'codigo')::bigint
    from jsonb_array_elements(p_linhas) x
    on conflict (codigo_yooga) do nothing;
  else
    raise exception 'tipo';
  end if;
  get diagnostics n = row_count;
  return n;
end $function$;

/* ───────── Regras de acesso ───────── */
-- Atendente: lê cadastros e mexe nas comandas. Dono: tudo. Custos e vendas: só o dono.

create policy categorias_dono on public.categorias as permissive for all to authenticated
  using (((select public.meu_papel()) = 'dono'::text))
  with check (((select public.meu_papel()) = 'dono'::text));
create policy categorias_ler on public.categorias as permissive for select to authenticated
  using (((select public.meu_papel()) is not null));

create policy comandas_todos on public.comandas as permissive for all to authenticated
  using (((select public.meu_papel()) is not null))
  with check (((select public.meu_papel()) is not null));

create policy config_dono on public.configuracao as permissive for update to authenticated
  using (((select public.meu_papel()) = 'dono'::text))
  with check (((select public.meu_papel()) = 'dono'::text));
create policy config_ler on public.configuracao as permissive for select to authenticated
  using (((select public.meu_papel()) is not null));

create policy custos_dono on public.custos as permissive for all to authenticated
  using (((select public.meu_papel()) = 'dono'::text))
  with check (((select public.meu_papel()) = 'dono'::text));

create policy formas_dono on public.formas as permissive for all to authenticated
  using (((select public.meu_papel()) = 'dono'::text))
  with check (((select public.meu_papel()) = 'dono'::text));
create policy formas_ler on public.formas as permissive for select to authenticated
  using (((select public.meu_papel()) is not null));

create policy pessoas_ler on public.pessoas as permissive for select to authenticated
  using (((auth_id = (select auth.uid())) or ((select public.meu_papel()) = 'dono'::text)));

create policy produtos_dono on public.produtos as permissive for all to authenticated
  using (((select public.meu_papel()) = 'dono'::text))
  with check (((select public.meu_papel()) = 'dono'::text));
create policy produtos_ler on public.produtos as permissive for select to authenticated
  using (((select public.meu_papel()) is not null));

create policy vendas_dono_apagar on public.vendas as permissive for delete to authenticated
  using ((((select public.meu_papel()) = 'dono'::text) and (origem <> 'yooga'::text)));
create policy vendas_dono_ler on public.vendas as permissive for select to authenticated
  using (((select public.meu_papel()) = 'dono'::text));
create policy vendas_dono_mudar on public.vendas as permissive for update to authenticated
  using (((select public.meu_papel()) = 'dono'::text))
  with check (((select public.meu_papel()) = 'dono'::text));

/* ───────── Permissões das funções ───────── */

revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema interno from public, anon, authenticated;
revoke all on all tables in schema interno from public, anon, authenticated;
grant execute on function public.pessoas_login(), public.criar_primeiro_dono(text,text,text), public.entrar(uuid,text)
  to anon, authenticated;
grant execute on function public.meu_papel(), public.criar_pessoa(text,text,text), public.trocar_pin(uuid,text),
  public.desbloquear_pessoa(uuid), public.remover_pessoa(uuid), public.meu_email(), public.definir_meu_email(text),
  public.fechar_venda(text,jsonb,uuid), public.vendas_yooga() to authenticated;
