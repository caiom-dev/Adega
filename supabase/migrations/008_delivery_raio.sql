-- 008: entrega por raio a partir da adega, com taxa única (no lugar da lista de bairros).
-- O cliente informa o CEP; o aparelho dele busca as coordenadas e o banco confere a distância em linha reta.

alter table public.configuracao
  add column loja_endereco text not null default '',
  add column loja_lat double precision,
  add column loja_lng double precision,
  add column raio_km numeric(4,1) not null default 5 check (raio_km > 0 and raio_km <= 50),
  add column taxa_entrega integer not null default 0 check (taxa_entrega >= 0);

alter table public.pedidos
  add column cep text not null default '',
  add column lat double precision,
  add column lng double precision,
  -- null = o CEP não trouxe localização e o cliente não usou o GPS: a adega confere pelo endereço.
  add column distancia_m integer;

-- Adega do Pezão: Rua João Domingues Corrêa, 5 · Jardim Maracanã, Campinas (CEP 13058-343).
update public.configuracao set
  loja_endereco = 'Rua João Domingues Corrêa, 5 · Jardim Maracanã, Campinas',
  loja_lat = -22.9571447, loja_lng = -47.1898468,
  raio_km = 5, taxa_entrega = 500, pedido_minimo = 0
where id = 1;

create or replace function interno.distancia_m(lat1 double precision, lng1 double precision,
                                               lat2 double precision, lng2 double precision)
returns integer language sql immutable set search_path = '' as $$
  select round(2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )))::integer
$$;

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
    'entrega', case when c.loja_lat is null then null else jsonb_build_object(
      'taxa', c.taxa_entrega, 'raioKm', c.raio_km, 'lat', c.loja_lat, 'lng', c.loja_lng, 'endereco', c.loja_endereco) end,
    'categorias', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'nome', k.nome) order by k.ordem, k.nome)
                            from public.categorias k where exists (select 1 from disponiveis d where d.categoria_id = k.id)), '[]'::jsonb),
    'produtos', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'nome', d.nome, 'preco', d.preco, 'categoriaId', d.categoria_id)
                          order by d.nome) from disponiveis d), '[]'::jsonb)
  ) from public.configuracao c where c.id = 1
$$;

create or replace function public.fazer_pedido(p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.configuracao;
  v_nome text := left(trim(coalesce(p_dados->>'cliente', '')), 60);
  v_fone text := regexp_replace(coalesce(p_dados->>'telefone', ''), '\D', '', 'g');
  v_retirada boolean := coalesce((p_dados->>'retirada')::boolean, false);
  v_endereco text := left(trim(coalesce(p_dados->>'endereco', '')), 160);
  v_cep text := regexp_replace(coalesce(p_dados->>'cep', ''), '\D', '', 'g');
  v_bairro text := left(trim(coalesce(p_dados->>'bairro', '')), 80);
  v_lat double precision; v_lng double precision; v_dist integer;
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
    if c.loja_lat is null then raise exception 'sem_entrega'; end if;
    if length(v_cep) <> 8 then raise exception 'cep_invalido'; end if;
    if length(v_endereco) < 5 then raise exception 'endereco_invalido'; end if;
    if jsonb_typeof(p_dados->'lat') = 'number' and jsonb_typeof(p_dados->'lng') = 'number' then
      v_lat := (p_dados->>'lat')::double precision;
      v_lng := (p_dados->>'lng')::double precision;
      if v_lat not between -90 and 90 or v_lng not between -180 and 180 then raise exception 'cep_invalido'; end if;
      v_dist := interno.distancia_m(c.loja_lat, c.loja_lng, v_lat, v_lng);
      if v_dist > c.raio_km * 1000 then raise exception 'fora_da_area'; end if;
    end if;
    v_taxa := c.taxa_entrega;
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

  insert into public.pedidos (cliente, telefone, retirada, endereco, complemento, bairro_nome, cep, lat, lng, distancia_m,
    itens, subtotal, taxa, total, pagamento, troco_para, observacao, aparelho)
  values (v_nome, v_fone, v_retirada,
    case when v_retirada then '' else v_endereco end,
    case when v_retirada then '' else left(trim(coalesce(p_dados->>'complemento', '')), 80) end,
    case when v_retirada then '' else v_bairro end,
    case when v_retirada then '' else v_cep end,
    case when v_retirada then null else v_lat end,
    case when v_retirada then null else v_lng end,
    case when v_retirada then null else v_dist end,
    v_itens, v_sub, v_taxa, v_total, v_pag, v_troco, left(trim(coalesce(p_dados->>'observacao', '')), 200), v_aparelho)
  returning * into v_pedido;
  return jsonb_build_object('token', v_pedido.token, 'numero', v_pedido.numero);
end $$;
