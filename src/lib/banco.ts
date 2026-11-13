import { createClient } from "@supabase/supabase-js";

/*
 * Endereço e chave pública do banco. A chave "publishable" foi feita para ficar no navegador:
 * quem manda no que cada pessoa pode ler ou gravar são as regras de acesso do próprio banco.
 */
const URL_BANCO = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://lrrhwpsoiezxdexlrzdi.supabase.co";
const CHAVE_PUBLICA = process.env.NEXT_PUBLIC_SUPABASE_KEY ?? "sb_publishable_nx_4oTyLkrz3ZHBKFVy80Q_4tpbKQwd";

export const banco = createClient(URL_BANCO, CHAVE_PUBLICA, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
