-- 005: venda só fecha com caixa aberto. Aplicada em 13/11/2026.
create or replace function interno.exigir_caixa_aberto() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.origem = 'app' and new.caixa_id is null then raise exception 'caixa_fechado'; end if;
  return new;
end $$;

create trigger vendas_exige_caixa before insert on public.vendas
  for each row execute function interno.exigir_caixa_aberto();
