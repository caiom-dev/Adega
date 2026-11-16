-- Foto dos produtos: aparece no cadastro, na lista de produtos e no cardápio do delivery.
-- Fica numa área pública (o cliente do delivery não tem login); só o dono envia, troca e apaga.
-- O app guarda o caminho do arquivo (ex.: "<produto>/1731700000000.webp").

alter table public.produtos add column if not exists foto text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produtos', 'produtos', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- Ler o arquivo pela URL pública não passa por política; listar a pasta, sim (só o dono).
create policy produtos_fotos_dono_ler on storage.objects for select to authenticated
  using (bucket_id = 'produtos' and (select public.meu_papel()) = 'dono');
create policy produtos_fotos_dono_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'produtos' and (select public.meu_papel()) = 'dono');
create policy produtos_fotos_dono_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'produtos' and (select public.meu_papel()) = 'dono');

-- O cardápio do delivery passa a mandar a foto.
create or replace function public.cardapio_delivery() returns jsonb
language sql stable security definer set search_path = '' as $$
  with disponiveis as (
    select p.id, p.nome, p.preco, p.categoria_id, p.foto from public.produtos p
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
    'produtos', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'nome', d.nome, 'preco', d.preco, 'categoriaId', d.categoria_id, 'foto', d.foto)
                          order by d.nome) from disponiveis d), '[]'::jsonb)
  ) from public.configuracao c where c.id = 1
$$;
