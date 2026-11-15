-- 009: contas a pagar (boletos) com anexo privado. Só o dono vê.

/* ───────── Contas ───────── */

create table public.contas (
  id uuid primary key default gen_random_uuid(),
  descricao text not null check (length(trim(descricao)) between 1 and 80),
  valor integer not null check (valor > 0 and valor <= 99999999),
  vencimento date not null,
  -- Linha digitável só com os dígitos (47 no boleto bancário, 48 nas contas de consumo). Vazia se não tiver.
  linha text not null default '' check (linha ~ '^(\d{47}|\d{48})?$'),
  -- Caminho do arquivo no armazenamento "boletos" ({id da conta}/{nome}). null = sem anexo.
  anexo text,
  pago_em date,
  pago_por uuid references public.pessoas(id) on delete set null,
  -- Último dia em que o lembrete saiu: o envio diário não repete no mesmo dia.
  lembrado_em date,
  criado_em timestamptz not null default now(),
  criado_por uuid references public.pessoas(id) on delete set null default interno.eu()
);
create index contas_vencimento_idx on public.contas (vencimento) where pago_em is null;
alter table public.contas enable row level security;
create policy contas_dono_ler on public.contas for select to authenticated using ((select public.meu_papel()) = 'dono');
create policy contas_dono_inserir on public.contas for insert to authenticated with check ((select public.meu_papel()) = 'dono');
create policy contas_dono_mudar on public.contas for update to authenticated
  using ((select public.meu_papel()) = 'dono') with check ((select public.meu_papel()) = 'dono');
create policy contas_dono_apagar on public.contas for delete to authenticated using ((select public.meu_papel()) = 'dono');

-- Quem marcou como pago fica registrado sem depender do aparelho.
create or replace function interno.ao_pagar_conta() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.pago_em is distinct from old.pago_em then
    new.pago_por := case when new.pago_em is null then null else interno.eu() end;
  end if;
  return new;
end $$;
create trigger contas_ao_pagar before update on public.contas for each row execute function interno.ao_pagar_conta();

/* ───────── Anexos: área privada ───────── */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('boletos', 'boletos', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

create policy boletos_dono_ler on storage.objects for select to authenticated
  using (bucket_id = 'boletos' and (select public.meu_papel()) = 'dono');
create policy boletos_dono_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'boletos' and (select public.meu_papel()) = 'dono');
create policy boletos_dono_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'boletos' and (select public.meu_papel()) = 'dono');

alter publication supabase_realtime add table public.contas;
revoke execute on function interno.ao_pagar_conta() from public, anon, authenticated;
