-- 004: abertura e fechamento de caixa, controle de estoque e registro de quem fez o quê.

/* ───────── Quem está usando o app ───────── */

create or replace function interno.eu() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.pessoas where auth_id = (select auth.uid())
$$;

/* ───────── Caixa ───────── */

-- Um turno de caixa. Só pode haver um aberto por vez.
create table public.caixas (
  id uuid primary key default gen_random_uuid(),
  aberto_em timestamptz not null default now(),
  aberto_por uuid references public.pessoas(id) on delete set null,
  valor_inicial integer not null check (valor_inicial >= 0),
  fechado_em timestamptz,
  fechado_por uuid references public.pessoas(id) on delete set null,
  -- Dinheiro que deveria estar na gaveta na hora de fechar, e o que foi contado.
  esperado integer,
  contado integer check (contado >= 0),
  observacao text not null default ''
);
create unique index caixas_um_aberto on public.caixas ((fechado_em is null)) where fechado_em is null;
create index caixas_aberto_em_idx on public.caixas (aberto_em desc);
alter table public.caixas enable row level security;
create policy caixas_ler on public.caixas for select to authenticated using ((select public.meu_papel()) is not null);

-- Sangria (tira dinheiro da gaveta) e suprimento (põe dinheiro na gaveta).
create table public.movimentos_caixa (
  id uuid primary key default gen_random_uuid(),
  caixa_id uuid not null references public.caixas(id) on delete cascade,
  tipo text not null check (tipo in ('sangria', 'suprimento')),
  valor integer not null check (valor > 0),
  motivo text not null default '',
  pessoa_id uuid references public.pessoas(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index movimentos_caixa_caixa_id_idx on public.movimentos_caixa (caixa_id);
alter table public.movimentos_caixa enable row level security;
create policy movimentos_caixa_ler on public.movimentos_caixa for select to authenticated using ((select public.meu_papel()) is not null);

alter table public.vendas
  add column caixa_id uuid references public.caixas(id) on delete set null,
  add column cancelada_por uuid references public.pessoas(id) on delete set null;
create index vendas_caixa_id_idx on public.vendas (caixa_id);

/** Dinheiro que deveria estar na gaveta: troco inicial + suprimentos − sangrias + vendas em dinheiro (já sem o troco). */
create or replace function interno.esperado_caixa(p_caixa uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select c.valor_inicial
    + coalesce((select sum(case m.tipo when 'suprimento' then m.valor else -m.valor end)
                from public.movimentos_caixa m where m.caixa_id = c.id), 0)::int
    + coalesce((select sum((p->>'valor')::int) from public.vendas v, jsonb_array_elements(v.pagamentos) p
                where v.caixa_id = c.id and v.cancelada_em is null and p->>'formaId' = 'dinheiro'), 0)::int
  from public.caixas c where c.id = p_caixa
$$;

create or replace function public.caixa_atual() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when (select public.meu_papel()) is null then null else (
    select jsonb_build_object(
      'id', c.id, 'aberto_em', c.aberto_em, 'aberto_por', c.aberto_por, 'valor_inicial', c.valor_inicial,
      'movimentos', coalesce((select jsonb_agg(jsonb_build_object(
          'id', m.id, 'tipo', m.tipo, 'valor', m.valor, 'motivo', m.motivo, 'pessoa_id', m.pessoa_id, 'criado_em', m.criado_em)
          order by m.criado_em) from public.movimentos_caixa m where m.caixa_id = c.id), '[]'::jsonb))
    from public.caixas c where c.fechado_em is null) end
$$;

create or replace function public.abrir_caixa(p_valor integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if (select public.meu_papel()) is null then raise exception 'sem_acesso' using errcode = '42501'; end if;
  if p_valor is null or p_valor < 0 or p_valor > 9999999 then raise exception 'valor_invalido'; end if;
  if exists (select 1 from public.caixas where fechado_em is null) then raise exception 'caixa_aberto'; end if;
  insert into public.caixas (aberto_por, valor_inicial) values (interno.eu(), p_valor) returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'caixa_aberto';
end $$;

create or replace function public.movimentar_caixa(p_tipo text, p_valor integer, p_motivo text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_caixa uuid; v_id uuid;
begin
  if (select public.meu_papel()) is null then raise exception 'sem_acesso' using errcode = '42501'; end if;
  if p_tipo not in ('sangria', 'suprimento') then raise exception 'tipo_invalido'; end if;
  if p_valor is null or p_valor <= 0 or p_valor > 9999999 then raise exception 'valor_invalido'; end if;
  select id into v_caixa from public.caixas where fechado_em is null for share;
  if v_caixa is null then raise exception 'caixa_fechado'; end if;
  insert into public.movimentos_caixa (caixa_id, tipo, valor, motivo, pessoa_id)
  values (v_caixa, p_tipo, p_valor, left(trim(coalesce(p_motivo, '')), 120), interno.eu())
  returning id into v_id;
  return v_id;
end $$;

-- Resumo de um caixa. O atendente vê o caixa aberto (sem os valores, para contar a gaveta às cegas)
-- e os caixas que ele mesmo fechou. O dono vê todos.
create or replace function public.resumo_caixa(p_caixa uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.caixas; v_papel text := (select public.meu_papel()); v_cego boolean;
begin
  if v_papel is null then raise exception 'sem_acesso' using errcode = '42501'; end if;
  select * into c from public.caixas where id = p_caixa;
  if not found then raise exception 'caixa_nao_encontrado'; end if;
  if v_papel <> 'dono' and c.fechado_em is not null and c.fechado_por is distinct from interno.eu() then
    raise exception 'so_dono' using errcode = '42501';
  end if;
  v_cego := v_papel <> 'dono' and c.fechado_em is null;
  return jsonb_build_object(
    'id', c.id, 'aberto_em', c.aberto_em, 'aberto_por', c.aberto_por, 'valor_inicial', c.valor_inicial,
    'fechado_em', c.fechado_em, 'fechado_por', c.fechado_por, 'contado', c.contado, 'observacao', c.observacao,
    'esperado', case when v_cego then null when c.fechado_em is null then interno.esperado_caixa(c.id) else c.esperado end,
    'movimentos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'tipo', m.tipo, 'valor', m.valor, 'motivo', m.motivo, 'pessoa_id', m.pessoa_id, 'criado_em', m.criado_em)
        order by m.criado_em) from public.movimentos_caixa m where m.caixa_id = c.id), '[]'::jsonb),
    'pedidos', (select count(*) from public.vendas where caixa_id = c.id and cancelada_em is null),
    'canceladas', (select count(*) from public.vendas where caixa_id = c.id and cancelada_em is not null),
    'total', case when v_cego then null else
      (select coalesce(sum(total), 0) from public.vendas where caixa_id = c.id and cancelada_em is null) end,
    'por_forma', case when v_cego then '[]'::jsonb else
      (select coalesce(jsonb_agg(jsonb_build_object('formaId', f, 'formaNome', n, 'valor', s) order by s desc), '[]'::jsonb)
       from (select p->>'formaId' f, max(p->>'formaNome') n, sum((p->>'valor')::int) s
             from public.vendas v, jsonb_array_elements(v.pagamentos) p
             where v.caixa_id = c.id and v.cancelada_em is null group by 1) x) end
  );
end $$;

create or replace function public.fechar_caixa(p_contado integer, p_observacao text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.caixas;
begin
  if (select public.meu_papel()) is null then raise exception 'sem_acesso' using errcode = '42501'; end if;
  if p_contado is null or p_contado < 0 or p_contado > 9999999 then raise exception 'valor_invalido'; end if;
  -- Trava o caixa: uma venda sendo fechada agora termina antes da conta do esperado.
  select * into c from public.caixas where fechado_em is null for update;
  if not found then raise exception 'caixa_fechado'; end if;
  update public.caixas
     set fechado_em = now(), fechado_por = interno.eu(), contado = p_contado,
         esperado = interno.esperado_caixa(c.id), observacao = left(trim(coalesce(p_observacao, '')), 200)
   where id = c.id;
  return public.resumo_caixa(c.id);
end $$;

/* ───────── Estoque ───────── */

-- null = o produto não tem estoque controlado.
alter table public.produtos
  add column estoque integer,
  add column estoque_minimo integer check (estoque_minimo >= 0);

-- Cada mudança no estoque, com quem fez. qtd é quanto mudou (+ entrou, − saiu); saldo é o estoque depois.
create table public.movimentos_estoque (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos(id) on delete cascade,
  tipo text not null check (tipo in ('venda', 'cancelamento', 'entrada', 'contagem')),
  qtd integer not null,
  saldo integer not null,
  venda_id uuid references public.vendas(id) on delete set null,
  pessoa_id uuid references public.pessoas(id) on delete set null,
  motivo text not null default '',
  criado_em timestamptz not null default now()
);
create index movimentos_estoque_produto_idx on public.movimentos_estoque (produto_id, criado_em desc);
alter table public.movimentos_estoque enable row level security;
create policy movimentos_estoque_dono on public.movimentos_estoque for select to authenticated
  using ((select public.meu_papel()) = 'dono');

-- Tira (p_sinal = -1) ou devolve (+1) do estoque os itens de uma venda. Produtos sem controle ficam como estão.
create or replace function interno.mexer_estoque(p_venda uuid, p_itens jsonb, p_sinal integer, p_tipo text) returns void
language sql security definer set search_path = '' as $$
  with q as (
    select (i->>'produtoId')::uuid as id, sum((i->>'qtd')::int)::int as qtd
    from jsonb_array_elements(p_itens) i group by 1
  ), m as (
    update public.produtos p set estoque = p.estoque + p_sinal * q.qtd
    from q where p.id = q.id and p.estoque is not null
    returning p.id, p.estoque, q.qtd
  )
  insert into public.movimentos_estoque (produto_id, tipo, qtd, saldo, venda_id, pessoa_id)
  select m.id, p_tipo, p_sinal * m.qtd, m.estoque, p_venda, interno.eu() from m
$$;

-- Entrada de mercadoria (soma) ou contagem (o número contado vira o estoque). Só o dono.
create or replace function public.registrar_estoque(p_produto uuid, p_tipo text, p_qtd integer, p_motivo text) returns integer
language plpgsql security definer set search_path = '' as $$
declare p public.produtos; v_antes int; v_depois int;
begin
  perform interno.exigir_dono();
  if p_tipo not in ('entrada', 'contagem') then raise exception 'tipo_invalido'; end if;
  if p_qtd is null or p_qtd < 0 or p_qtd > 99999 or (p_tipo = 'entrada' and p_qtd = 0) then raise exception 'valor_invalido'; end if;
  select * into p from public.produtos where id = p_produto for update;
  if not found then raise exception 'produto_nao_encontrado'; end if;
  v_antes := coalesce(p.estoque, 0);
  v_depois := case when p_tipo = 'entrada' then v_antes + p_qtd else p_qtd end;
  update public.produtos set estoque = v_depois where id = p.id;
  insert into public.movimentos_estoque (produto_id, tipo, qtd, saldo, pessoa_id, motivo)
  values (p.id, p_tipo, v_depois - v_antes, v_depois, interno.eu(), left(trim(coalesce(p_motivo, '')), 120));
  return v_depois;
end $$;

/* ───────── Cancelamento: quem cancelou e devolução ao estoque ───────── */

create or replace function interno.ao_cancelar_venda() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (old.cancelada_em is null) = (new.cancelada_em is null) then return new; end if;
  new.cancelada_por := case when new.cancelada_em is null then null else interno.eu() end;
  if new.origem <> 'yooga' then
    if new.cancelada_em is null then
      perform interno.mexer_estoque(new.id, new.itens, -1, 'venda');
    else
      perform interno.mexer_estoque(new.id, new.itens, 1, 'cancelamento');
    end if;
  end if;
  return new;
end $$;

create trigger vendas_cancelamento before update of cancelada_em on public.vendas
  for each row execute function interno.ao_cancelar_venda();

/* ───────── Fechar venda: liga a venda ao caixa aberto e baixa o estoque ───────── */

create or replace function public.fechar_venda(p_comanda text, p_pagamentos jsonb, p_chave uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_papel text := (select public.meu_papel());
  c public.comandas; v public.vendas; f public.formas;
  v_itens jsonb; v_sub int; v_total int; v_pago int; v_troco int; v_sobra int; v_caixa uuid;
  v_pags jsonb := '[]'::jsonb; r record; v_valor int; v_tira int;
begin
  if v_papel is null then raise exception 'sem_acesso' using errcode = '42501'; end if;
  select * into v from public.vendas where chave = p_chave;
  if not found then
    -- Trava o caixa para ele não fechar no meio desta venda.
    -- A exigência de caixa aberto entra na 005, junto com o app que sabe abrir o caixa.
    select id into v_caixa from public.caixas where fechado_em is null for share;

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

    insert into public.vendas (comanda_nome, itens, subtotal, desconto, acrescimo, total, pagamentos, troco, chave, pessoa_id, caixa_id)
    values (
      case c.tipo when 'mesa' then 'Mesa ' else 'Balcão ' end || c.numero
        || case when c.cliente <> '' then ' · ' || c.cliente else '' end,
      v_itens, v_sub, c.desconto, c.acrescimo, v_total, v_pags, v_troco, p_chave, interno.eu(), v_caixa)
    returning * into v;
    perform interno.mexer_estoque(v.id, v.itens, -1, 'venda');
    -- A comanda fechada fica vazia (lugar livre); o app trata comanda sem itens como inexistente.
    update public.comandas set itens = '[]'::jsonb, cliente = '', desconto = 0, acrescimo = 0 where id = c.id;
  end if;

  -- O atendente recebe a venda sem o custo.
  if v_papel <> 'dono' then
    v.itens := (select jsonb_agg(i - 'custo') from jsonb_array_elements(v.itens) i);
  end if;
  return to_jsonb(v);
end $$;

/* ───────── Tempo real e permissões ───────── */

alter publication supabase_realtime add table public.caixas, public.movimentos_caixa;

revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema interno from public, anon, authenticated;
grant execute on function public.pessoas_login(), public.criar_primeiro_dono(text,text,text), public.entrar(uuid,text)
  to anon, authenticated;
grant execute on function public.meu_papel(), public.criar_pessoa(text,text,text), public.trocar_pin(uuid,text),
  public.desbloquear_pessoa(uuid), public.remover_pessoa(uuid), public.meu_email(), public.definir_meu_email(text),
  public.fechar_venda(text,jsonb,uuid), public.vendas_yooga(),
  public.caixa_atual(), public.abrir_caixa(integer), public.movimentar_caixa(text,integer,text),
  public.resumo_caixa(uuid), public.fechar_caixa(integer,text), public.registrar_estoque(uuid,text,integer,text)
  to authenticated;
