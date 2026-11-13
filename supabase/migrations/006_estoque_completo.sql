-- 006: perda de estoque (com o custo da época) e contagem de vários produtos de uma vez.

alter table public.movimentos_estoque drop constraint movimentos_estoque_tipo_check;
alter table public.movimentos_estoque add constraint movimentos_estoque_tipo_check
  check (tipo in ('venda', 'cancelamento', 'entrada', 'contagem', 'perda'));
-- Custo da unidade na hora da perda: o valor perdido não muda se o custo mudar depois.
alter table public.movimentos_estoque add column custo integer;
create index movimentos_estoque_tipo_idx on public.movimentos_estoque (tipo, criado_em desc);

-- Entrada soma, contagem troca pelo número contado, perda tira. Só o dono.
create or replace function public.registrar_estoque(p_produto uuid, p_tipo text, p_qtd integer, p_motivo text) returns integer
language plpgsql security definer set search_path = '' as $$
declare p public.produtos; v_antes int; v_depois int;
begin
  perform interno.exigir_dono();
  if p_tipo not in ('entrada', 'contagem', 'perda') then raise exception 'tipo_invalido'; end if;
  if p_qtd is null or p_qtd < 0 or p_qtd > 99999 or (p_tipo in ('entrada', 'perda') and p_qtd = 0) then
    raise exception 'valor_invalido';
  end if;
  select * into p from public.produtos where id = p_produto for update;
  if not found then raise exception 'produto_nao_encontrado'; end if;
  if p_tipo = 'perda' and p.estoque is null then raise exception 'sem_controle'; end if;
  v_antes := coalesce(p.estoque, 0);
  v_depois := case p_tipo when 'entrada' then v_antes + p_qtd when 'perda' then v_antes - p_qtd else p_qtd end;
  update public.produtos set estoque = v_depois where id = p.id;
  insert into public.movimentos_estoque (produto_id, tipo, qtd, saldo, pessoa_id, motivo, custo)
  values (p.id, p_tipo, v_depois - v_antes, v_depois, interno.eu(), left(trim(coalesce(p_motivo, '')), 120),
          case when p_tipo = 'perda' then (select k.custo from public.custos k where k.produto_id = p.id) end);
  return v_depois;
end $$;

-- Contagem de prateleira: [{"produtoId": "...", "qtd": 12}, ...]. Entra tudo ou nada.
create or replace function public.registrar_contagem(p_itens jsonb, p_motivo text) returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  perform interno.exigir_dono();
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 or jsonb_array_length(p_itens) > 500 then
    raise exception 'valor_invalido';
  end if;
  for r in select (x->>'produtoId')::uuid as id, (x->>'qtd')::int as qtd from jsonb_array_elements(p_itens) x loop
    perform public.registrar_estoque(r.id, 'contagem', r.qtd, p_motivo);
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function public.registrar_contagem(jsonb, text) from public, anon;
grant execute on function public.registrar_contagem(jsonb, text) to authenticated;
