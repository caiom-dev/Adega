-- 007: delivery. Página pública de pedidos, bairros com taxa, horário e pedidos ao vivo na adega.

/* ───────── Cadastro ───────── */

-- Só aparece no delivery o que o dono marcar.
alter table public.produtos add column delivery boolean not null default false;

create table public.bairros (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) between 1 and 60),
  taxa integer not null default 0 check (taxa >= 0 and taxa <= 99999),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table public.bairros enable row level security;
create policy bairros_ler on public.bairros for select to authenticated using ((select public.meu_papel()) is not null);
create policy bairros_dono_inserir on public.bairros for insert to authenticated with check ((select public.meu_papel()) = 'dono');
create policy bairros_dono_mudar on public.bairros for update to authenticated
  using ((select public.meu_papel()) = 'dono') with check ((select public.meu_papel()) = 'dono');

-- horario: 7 posições, de domingo (0) a sábado (6). Cada uma é null (fechado no dia) ou {"abre":"18:00","fecha":"02:00"}.
-- Lista vazia = sem horário: vale só a chave "delivery aberto".
alter table public.configuracao
  add column delivery_aberto boolean not null default false,
  add column pedido_minimo integer not null default 0 check (pedido_minimo >= 0),
  add column retirada boolean not null default true,
  add column horario jsonb not null default '[]'::jsonb;

/* ───────── Pedidos ───────── */

create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  -- O cliente acompanha o pedido por este código, sem login.
  token uuid not null unique default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  cliente text not null,
  telefone text not null,
  retirada boolean not null default false,
  endereco text not null default '',
  complemento text not null default '',
  bairro_id uuid references public.bairros(id) on delete set null,
  bairro_nome text not null default '',
  itens jsonb not null,
  subtotal integer not null,
  taxa integer not null default 0,
  total integer not null,
  pagamento text not null check (pagamento in ('dinheiro', 'cartao', 'pix')),
  troco_para integer,
  observacao text not null default '',
  situacao text not null default 'novo' check (situacao in ('novo', 'aceito', 'saiu', 'entregue', 'recusado')),
  motivo text not null default '',
  aparelho text not null default '',
  atualizado_em timestamptz not null default now(),
  pessoa_id uuid references public.pessoas(id) on delete set null,
  venda_id uuid references public.vendas(id) on delete set null
);
create index pedidos_situacao_idx on public.pedidos (situacao, criado_em desc);
create index pedidos_criado_em_idx on public.pedidos (criado_em desc);
create index pedidos_telefone_idx on public.pedidos (telefone, criado_em desc);
alter table public.pedidos enable row level security;
-- Dono e atendente leem. Mudanças só pelas funções abaixo.
create policy pedidos_ler on public.pedidos for select to authenticated using ((select public.meu_papel()) is not null);

/* ───────── Loja aberta? ───────── */

create or replace function interno.delivery_aberto_agora() returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.configuracao; agora timestamp := now() at time zone 'America/Sao_Paulo';
  h time := (now() at time zone 'America/Sao_Paulo')::time; dia int; d jsonb; abre time; fecha time;
begin
  select * into c from public.configuracao where id = 1;
  if not found or not c.delivery_aberto then return false; end if;
  if jsonb_array_length(c.horario) <> 7 then return true; end if;
  dia := extract(dow from agora)::int;
  -- Horário de hoje.
  d := c.horario -> dia;
  if jsonb_typeof(d) = 'object' then
    abre := (d->>'abre')::time; fecha := (d->>'fecha')::time;
    if abre < fecha and h >= abre and h < fecha then return true; end if;
    if abre >= fecha and h >= abre then return true; end if;
  end if;
  -- Horário de ontem que passa da meia-noite.
  d := c.horario -> ((dia + 6) % 7);
  if jsonb_typeof(d) = 'object' then
    abre := (d->>'abre')::time; fecha := (d->>'fecha')::time;
    if abre >= fecha and h < fecha then return true; end if;
  end if;
  return false;
end $$;

/* ───────── Público (sem login) ───────── */

create or replace function public.cardapio_delivery() returns jsonb
language sql stable security definer set search_path = '' as $$
  with disponiveis as (
    select p.id, p.nome, p.preco, p.categoria_id from public.produtos p
    where p.ativo and p.delivery and (p.estoque is null or p.estoque > 0)
  )
  select jsonb_build_object(
    'aberto', interno.delivery_aberto_agora(),
    'horario', c.horario,
    'pedidoMinimo', c.pedido_minimo,
    'retirada', c.retirada,
    'bairros', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'nome', b.nome, 'taxa', b.taxa) order by b.nome)
                         from public.bairros b where b.ativo), '[]'::jsonb),
    'categorias', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'nome', k.nome) order by k.ordem, k.nome)
                            from public.categorias k where exists (select 1 from disponiveis d where d.categoria_id = k.id)), '[]'::jsonb),
    'produtos', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'nome', d.nome, 'preco', d.preco, 'categoriaId', d.categoria_id)
                          order by d.nome) from disponiveis d), '[]'::jsonb)
  ) from public.configuracao c where c.id = 1
$$;

create or replace function public.fazer_pedido(p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.configuracao; b public.bairros;
  v_nome text := left(trim(coalesce(p_dados->>'cliente', '')), 60);
  v_fone text := regexp_replace(coalesce(p_dados->>'telefone', ''), '\D', '', 'g');
  v_retirada boolean := coalesce((p_dados->>'retirada')::boolean, false);
  v_endereco text := left(trim(coalesce(p_dados->>'endereco', '')), 160);
  v_pag text := p_dados->>'pagamento';
  v_aparelho text := left(coalesce(p_dados->>'aparelho', ''), 64);
  v_itens jsonb; v_sub int; v_qtd_itens int; v_validos int; v_taxa int := 0; v_total int; v_troco int;
  v_pedido public.pedidos;
begin
  select * into c from public.configuracao where id = 1;
  if not interno.delivery_aberto_agora() then raise exception 'fechado'; end if;
  if coalesce((p_dados->>'maior')::boolean, false) is not true then raise exception 'idade'; end if;
  if length(v_nome) < 2 then raise exception 'nome_invalido'; end if;
  if length(v_fone) not between 10 and 11 then raise exception 'telefone_invalido'; end if;
  if v_pag is null or v_pag not in ('dinheiro', 'cartao', 'pix') then raise exception 'pagamento_invalido'; end if;

  if v_retirada then
    if not c.retirada then raise exception 'sem_retirada'; end if;
  else
    select * into b from public.bairros where id = (p_dados->>'bairroId')::uuid and ativo;
    if not found then raise exception 'bairro_invalido'; end if;
    if length(v_endereco) < 5 then raise exception 'endereco_invalido'; end if;
    v_taxa := b.taxa;
  end if;

  -- Proteção contra pedido falso: no máximo 3 pedidos em andamento por telefone e 5 por aparelho em 30 minutos.
  if (select count(*) from public.pedidos where telefone = v_fone and situacao in ('novo', 'aceito', 'saiu')) >= 3 then
    raise exception 'limite';
  end if;
  if v_aparelho <> '' and (select count(*) from public.pedidos
      where aparelho = v_aparelho and criado_em > now() - interval '30 minutes') >= 5 then
    raise exception 'limite';
  end if;

  if jsonb_typeof(p_dados->'itens') <> 'array' or jsonb_array_length(p_dados->'itens') not between 1 and 50 then
    raise exception 'itens_invalidos';
  end if;
  -- Preço e nome vêm do banco, nunca do aparelho do cliente.
  select jsonb_agg(jsonb_build_object('produtoId', p.id, 'nome', p.nome, 'preco', p.preco, 'qtd', q.qtd) order by p.nome),
         sum(p.preco * q.qtd), count(*)
    into v_itens, v_sub, v_validos
    from (select (x->>'produtoId')::uuid as id, sum(least(greatest((x->>'qtd')::int, 0), 99))::int as qtd
          from jsonb_array_elements(p_dados->'itens') x group by 1) q
    join public.produtos p on p.id = q.id
   where q.qtd > 0 and p.ativo and p.delivery and (p.estoque is null or p.estoque >= q.qtd);
  select count(distinct x->>'produtoId') into v_qtd_itens from jsonb_array_elements(p_dados->'itens') x;
  if v_validos is null or v_validos <> v_qtd_itens then raise exception 'produto_indisponivel'; end if;
  if v_sub < c.pedido_minimo then raise exception 'minimo'; end if;

  v_total := v_sub + v_taxa;
  if v_pag = 'dinheiro' and p_dados->>'trocoPara' is not null then
    v_troco := (p_dados->>'trocoPara')::int;
    if v_troco < v_total then raise exception 'troco_invalido'; end if;
  end if;

  insert into public.pedidos (cliente, telefone, retirada, endereco, complemento, bairro_id, bairro_nome,
    itens, subtotal, taxa, total, pagamento, troco_para, observacao, aparelho)
  values (v_nome, v_fone, v_retirada, case when v_retirada then '' else v_endereco end,
    case when v_retirada then '' else left(trim(coalesce(p_dados->>'complemento', '')), 80) end,
    case when v_retirada then null else b.id end, case when v_retirada then '' else b.nome end,
    v_itens, v_sub, v_taxa, v_total, v_pag, v_troco, left(trim(coalesce(p_dados->>'observacao', '')), 200), v_aparelho)
  returning * into v_pedido;
  return jsonb_build_object('token', v_pedido.token, 'numero', v_pedido.numero);
end $$;

-- Acompanhamento do pedido pelo cliente: só o que ele mesmo mandou e a situação.
create or replace function public.acompanhar_pedido(p_token uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'numero', numero, 'situacao', situacao, 'motivo', motivo, 'criadoEm', criado_em, 'atualizadoEm', atualizado_em,
    'retirada', retirada, 'itens', itens, 'subtotal', subtotal, 'taxa', taxa, 'total', total,
    'pagamento', pagamento, 'trocoPara', troco_para, 'bairro', bairro_nome)
  from public.pedidos where token = p_token
$$;

/* ───────── Na adega ───────── */

-- novo → aceito → saiu → entregue. Retirada pula o "saiu". Recusado vale até antes de entregar.
-- Ao entregar, o pedido vira venda (com a forma de pagamento que o cliente usou de fato) e baixa o estoque.
create or replace function public.mudar_pedido(p_pedido uuid, p_situacao text, p_motivo text, p_forma text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.pedidos; f public.formas; v public.vendas; v_caixa uuid; v_itens jsonb; v_valido boolean;
begin
  if (select public.meu_papel()) is null then raise exception 'sem_acesso' using errcode = '42501'; end if;
  select * into p from public.pedidos where id = p_pedido for update;
  if not found then raise exception 'pedido_nao_encontrado'; end if;
  v_valido := case p_situacao
    when 'aceito' then p.situacao = 'novo'
    when 'saiu' then p.situacao = 'aceito' and not p.retirada
    when 'entregue' then p.situacao = 'saiu' or (p.situacao = 'aceito' and p.retirada)
    when 'recusado' then p.situacao in ('novo', 'aceito', 'saiu')
    else false end;
  if not v_valido then raise exception 'situacao_invalida'; end if;
  if p_situacao = 'recusado' and length(trim(coalesce(p_motivo, ''))) = 0 then raise exception 'motivo_obrigatorio'; end if;

  if p_situacao = 'entregue' then
    select * into f from public.formas where id = coalesce(p_forma, case p.pagamento when 'cartao' then 'debito' else p.pagamento end);
    if not found then raise exception 'forma_invalida'; end if;
    select id into v_caixa from public.caixas where fechado_em is null for share;
    select jsonb_agg(i || jsonb_build_object('custo', (select k.custo from public.custos k where k.produto_id::text = i->>'produtoId')))
      into v_itens from jsonb_array_elements(p.itens) i;
    insert into public.vendas (comanda_nome, itens, subtotal, desconto, acrescimo, total, pagamentos, troco, pessoa_id, caixa_id, origem)
    values ('Delivery #' || p.numero || ' · ' || p.cliente, v_itens, p.subtotal, 0, p.taxa, p.total,
      jsonb_build_array(jsonb_build_object('formaId', f.id, 'formaNome', f.nome, 'taxa', f.taxa, 'valor', p.total)),
      case when f.id = 'dinheiro' and p.troco_para is not null then greatest(0, p.troco_para - p.total) else 0 end,
      interno.eu(), v_caixa, 'delivery')
    returning * into v;
    perform interno.mexer_estoque(v.id, v.itens, -1, 'venda');
  end if;

  update public.pedidos
     set situacao = p_situacao, atualizado_em = now(), pessoa_id = interno.eu(),
         motivo = case when p_situacao = 'recusado' then left(trim(p_motivo), 120) else motivo end,
         venda_id = coalesce(v.id, venda_id)
   where id = p.id returning * into p;
  return to_jsonb(p);
end $$;

/* ───────── Tempo real e permissões ───────── */

alter publication supabase_realtime add table public.pedidos, public.bairros;

revoke execute on function interno.delivery_aberto_agora() from public, anon, authenticated;
revoke execute on function public.cardapio_delivery(), public.fazer_pedido(jsonb), public.acompanhar_pedido(uuid),
  public.mudar_pedido(uuid, text, text, text) from public, anon;
grant execute on function public.cardapio_delivery(), public.fazer_pedido(jsonb), public.acompanhar_pedido(uuid) to anon, authenticated;
grant execute on function public.mudar_pedido(uuid, text, text, text) to authenticated;
