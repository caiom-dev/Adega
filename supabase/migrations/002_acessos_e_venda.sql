-- Login por PIN, pessoas e fechamento de venda.
-- A tabela "pessoas" guarda o PIN (com hash). Cada pessoa tem um usuário de autenticação
-- por trás, com senha aleatória: quem acerta o PIN recebe uma senha de uso único para abrir a sessão.

create schema if not exists interno;

create or replace function interno.pin_valido(p_pin text) returns boolean
language sql immutable as $$ select p_pin ~ '^[0-9]{4}$' $$;

create or replace function interno.criar_auth(p_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
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
end $$;

create or replace function interno.exigir_dono() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select public.meu_papel()) is distinct from 'dono' then
    raise exception 'so_dono' using errcode = '42501';
  end if;
end $$;

-- Tela de entrada: nomes de quem pode entrar.
create or replace function public.pessoas_login() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'papel', papel) order by papel desc, nome), '[]'::jsonb)
  from public.pessoas where ativo
$$;

-- Primeiro acesso: só funciona enquanto não existe ninguém cadastrado.
create or replace function public.criar_primeiro_dono(p_nome text, p_pin text, p_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
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
end $$;

-- Confere o PIN. 5 erros seguidos bloqueiam por 15 minutos.
create or replace function public.entrar(p_pessoa uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
end $$;

create or replace function public.criar_pessoa(p_nome text, p_papel text, p_pin text) returns uuid
language plpgsql security definer set search_path = '' as $$
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
end $$;

-- O dono troca o PIN de qualquer pessoa; cada um troca o próprio.
create or replace function public.trocar_pin(p_pessoa uuid, p_pin text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not interno.pin_valido(p_pin) then raise exception 'pin_invalido'; end if;
  if (select public.meu_papel()) is distinct from 'dono'
     and not exists (select 1 from public.pessoas where id = p_pessoa and auth_id = (select auth.uid()) and ativo) then
    raise exception 'so_dono' using errcode = '42501';
  end if;
  update public.pessoas set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')), erros = 0, bloqueado_ate = null
    where id = p_pessoa;
end $$;

create or replace function public.desbloquear_pessoa(p_pessoa uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform interno.exigir_dono();
  update public.pessoas set erros = 0, bloqueado_ate = null where id = p_pessoa;
end $$;

-- Não apaga: desativa. As regras de acesso já barram quem está inativo. O último dono não pode ser removido.
create or replace function public.remover_pessoa(p_pessoa uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.pessoas;
begin
  perform interno.exigir_dono();
  select * into p from public.pessoas where id = p_pessoa and ativo;
  if not found then return; end if;
  if p.papel = 'dono' and (select count(*) from public.pessoas where ativo and papel = 'dono') <= 1 then
    raise exception 'ultimo_dono';
  end if;
  update public.pessoas set ativo = false where id = p_pessoa;
end $$;

-- E-mail de recuperação do dono (é o e-mail da conta de autenticação dele).
create or replace function public.meu_email() returns text
language sql stable security definer set search_path = '' as $$
  select case when email like '%@adega.invalid' then null else email end
  from auth.users where id = (select auth.uid())
$$;

create or replace function public.definir_meu_email(p_email text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform interno.exigir_dono();
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_invalido'; end if;
  if exists (select 1 from auth.users where email = lower(p_email) and id <> (select auth.uid())) then
    raise exception 'email_em_uso';
  end if;
  update auth.users set email = lower(p_email), updated_at = now() where id = (select auth.uid());
  update auth.identities set identity_data = identity_data || jsonb_build_object('email', lower(p_email)), updated_at = now()
    where user_id = (select auth.uid()) and provider = 'email';
end $$;

-- Fecha a venda de uma vez: ou entra inteira, ou não entra.
-- A chave impede duplicar quando tocam duas vezes em "Finalizar".
create or replace function public.fechar_venda(p_comanda text, p_pagamentos jsonb, p_chave uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
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

    -- O custo de cada item é copiado agora: mudar o produto depois não altera esta venda.
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

    -- O troco sai do dinheiro, do último pagamento para o primeiro.
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
    -- A comanda fechada fica vazia (lugar livre); o app trata comanda sem itens como inexistente.
    update public.comandas set itens = '[]'::jsonb, cliente = '', desconto = 0, acrescimo = 0 where id = c.id;
  end if;

  -- O atendente recebe a venda sem o custo.
  if v_papel <> 'dono' then
    v.itens := (select jsonb_agg(i - 'custo') from jsonb_array_elements(v.itens) i);
  end if;
  return to_jsonb(v);
end $$;

-- Histórico do Yooga em formato enxuto: [código, segundos, total, desconto, acréscimo, forma, cancelada]
create or replace function public.vendas_yooga() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform interno.exigir_dono();
  return (select coalesce(jsonb_agg(jsonb_build_array(codigo_yooga, extract(epoch from criada_em)::bigint, total,
            desconto, acrescimo, pagamentos->0->>'formaId', cancelada_em is not null) order by criada_em), '[]'::jsonb)
          from public.vendas where origem = 'yooga');
end $$;

revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema interno from public, anon, authenticated;
grant execute on function public.pessoas_login(), public.criar_primeiro_dono(text,text,text), public.entrar(uuid,text)
  to anon, authenticated;
grant execute on function public.meu_papel(), public.criar_pessoa(text,text,text), public.trocar_pin(uuid,text),
  public.desbloquear_pessoa(uuid), public.remover_pessoa(uuid), public.meu_email(), public.definir_meu_email(text),
  public.fechar_venda(text,jsonb,uuid), public.vendas_yooga() to authenticated;
