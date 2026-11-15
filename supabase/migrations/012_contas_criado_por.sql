-- 012: "quem lançou" passa a ser gravado pelo gatilho; o valor padrão chamava uma função interna sem permissão para o app.
alter table public.contas alter column criado_por drop default;

create or replace function interno.ao_pagar_conta() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.criado_por := interno.eu();
    new.pago_por := case when new.pago_em is null then null else interno.eu() end;
  elsif new.pago_em is distinct from old.pago_em then
    new.pago_por := case when new.pago_em is null then null else interno.eu() end;
  end if;
  return new;
end $$;

create or replace trigger contas_ao_pagar before insert or update on public.contas
  for each row execute function interno.ao_pagar_conta();
revoke execute on function interno.ao_pagar_conta() from public, anon, authenticated;
