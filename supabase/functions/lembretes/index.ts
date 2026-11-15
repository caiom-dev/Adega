// Função "lembretes": avisa o dono das contas a pagar por notificação no celular e por e-mail.
//
// Quem chama:
// - O agendamento diário do banco (pg_cron), às 8h de Brasília, com o cabeçalho x-lembretes.
// - O app, com o login do dono: {acao: "chave"} devolve a chave pública da notificação;
//   {acao: "teste"} manda uma notificação de teste para os aparelhos do próprio dono.
//
// Regra: 3 dias antes, 1 dia antes, no dia e todo dia enquanto estiver vencida. Uma vez por dia por conta.
// As chaves da notificação nascem aqui na primeira chamada e ficam no cofre do banco (vault).
// O e-mail sai pelo Resend quando o segredo RESEND_API_KEY existir.

import postgres from "npm:postgres@3.4.5";
import webpush from "npm:web-push@3.6.7";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
const URL_APP = "https://adega-omega.vercel.app";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};
const json = (dados: unknown, status = 200) =>
  new Response(JSON.stringify(dados), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function segredo(nome: string): Promise<string | null> {
  const [l] = await sql`select decrypted_secret from vault.decrypted_secrets where name = ${nome}`;
  return l?.decrypted_secret ?? null;
}

/** Chaves VAPID: criadas uma vez e guardadas no cofre. */
async function chaves() {
  let publica = await segredo("vapid_publica");
  let privada = await segredo("vapid_privada");
  if (!publica || !privada) {
    const novas = webpush.generateVAPIDKeys();
    await sql`select vault.create_secret(${novas.publicKey}, 'vapid_publica')`;
    await sql`select vault.create_secret(${novas.privateKey}, 'vapid_privada')`;
    publica = novas.publicKey;
    privada = novas.privateKey;
  }
  webpush.setVapidDetails(URL_APP, publica, privada);
  return publica;
}

const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function quando(dias: number) {
  if (dias === 0) return "vence hoje";
  if (dias === 1) return "vence amanhã";
  if (dias > 1) return `vence em ${dias} dias`;
  return dias === -1 ? "venceu ontem" : `venceu há ${-dias} dias`;
}

interface Inscricao {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Manda para cada aparelho. Devolve quantos receberam e os aparelhos que o navegador já cancelou. */
async function enviarPush(inscricoes: Inscricao[], aviso: { title: string; body: string; url: string; tag: string }) {
  let enviadas = 0;
  const vencidas: string[] = [];
  const falhas: string[] = [];
  for (const i of inscricoes) {
    try {
      await webpush.sendNotification({ endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } }, JSON.stringify(aviso), {
        TTL: 60 * 60 * 12,
        urgency: "high",
      });
      enviadas++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) vencidas.push(i.endpoint);
      else falhas.push(String(status ?? (e as Error).message));
    }
  }
  if (vencidas.length) await sql`delete from public.inscricoes_push where endpoint = any(${vencidas})`;
  return { enviadas, vencidas: vencidas.length, falhas };
}

async function enviarEmail(para: string[], assunto: string, html: string) {
  const chave = Deno.env.get("RESEND_API_KEY");
  if (!chave || !para.length) return { enviado: false, motivo: !chave ? "sem RESEND_API_KEY" : "dono sem e-mail" };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("LEMBRETES_REMETENTE") ?? "Adega do Pezão <onboarding@resend.dev>",
      to: para,
      subject: assunto,
      html,
    }),
  });
  return r.ok ? { enviado: true } : { enviado: false, motivo: `Resend ${r.status}: ${await r.text()}` };
}

async function lembretesDoDia() {
  await chaves();
  const contas = await sql<{ id: string; descricao: string; valor: number; vencimento: string; dias: number }[]>`
    with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d)
    select c.id, c.descricao, c.valor, c.vencimento::text, (c.vencimento - h.d)::int as dias
    from public.contas c, hoje h
    where c.pago_em is null
      and (c.lembrado_em is null or c.lembrado_em < h.d)
      and (c.vencimento - h.d in (3, 1, 0) or c.vencimento < h.d)
    order by c.vencimento, c.descricao`;
  if (!contas.length) return { contas: 0 };

  const donos = await sql<{ email: string }[]>`
    select u.email from public.pessoas p join auth.users u on u.id = p.auth_id where p.papel = 'dono' and p.ativo`;
  const inscricoes = await sql<Inscricao[]>`
    select i.endpoint, i.p256dh, i.auth from public.inscricoes_push i
    join public.pessoas p on p.id = i.pessoa_id where p.papel = 'dono' and p.ativo`;
  const emails = donos.map((d) => d.email).filter((e) => e && !e.endsWith("@adega.invalid"));

  const vencidas = contas.filter((c) => c.dias < 0);
  const total = contas.reduce((s, c) => s + c.valor, 0);
  const titulo =
    contas.length === 1
      ? `${contas[0].descricao} ${quando(contas[0].dias)}`
      : vencidas.length
        ? `${contas.length} contas para pagar, ${vencidas.length} vencida${vencidas.length > 1 ? "s" : ""}`
        : `${contas.length} contas para pagar`;
  const linhas = contas.map((c) => `${c.descricao} · ${reais(c.valor)} · ${quando(c.dias)}`);

  const push = await enviarPush(inscricoes, {
    title: titulo,
    body: contas.length === 1 ? reais(contas[0].valor) : linhas.slice(0, 4).join("\n") + (linhas.length > 4 ? "\n…" : ""),
    url: "/contas",
    tag: "lembrete-contas",
  });

  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#1c1917">
    <p>Contas da Adega do Pezão para pagar:</p>
    <table cellpadding="6" style="border-collapse:collapse">${contas
      .map(
        (c) =>
          `<tr><td>${c.descricao.replace(/</g, "&lt;")}</td><td style="text-align:right"><b>${reais(c.valor)}</b></td>` +
          `<td style="color:${c.dias < 0 ? "#b91c1c" : "#57534e"}">${quando(c.dias)}</td></tr>`,
      )
      .join("")}</table>
    <p>Total: <b>${reais(total)}</b></p>
    <p><a href="${URL_APP}/contas">Abrir as contas no app</a></p></div>`;
  const email = await enviarEmail(emails, titulo, html);

  // Só marca como lembrada se o aviso chegou por algum caminho; senão tenta de novo amanhã também.
  if (push.enviadas > 0 || email.enviado) {
    const ids = contas.map((c) => c.id);
    await sql`update public.contas set lembrado_em = (now() at time zone 'America/Sao_Paulo')::date where id = any(${ids})`;
  }
  return { contas: contas.length, push, email };
}

/** Pessoa do login (token do app), se for dono ativo. */
async function donoDoToken(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: Deno.env.get("SUPABASE_ANON_KEY")! },
  });
  if (!r.ok) return null;
  const { id } = await r.json();
  const [p] = await sql`select id from public.pessoas where auth_id = ${id} and papel = 'dono' and ativo`;
  return (p?.id as string) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const agendado = req.headers.get("x-lembretes");
    if (agendado) {
      const chave = await segredo("lembretes_chave");
      if (!chave || agendado !== chave) return json({ erro: "sem_permissao" }, 401);
      return json(await lembretesDoDia());
    }

    const dono = await donoDoToken(req);
    if (!dono) return json({ erro: "sem_permissao" }, 401);
    const { acao } = await req.json().catch(() => ({}));
    if (acao === "chave") return json({ publica: await chaves() });
    if (acao === "teste") {
      await chaves();
      const inscricoes = await sql<Inscricao[]>`select endpoint, p256dh, auth from public.inscricoes_push where pessoa_id = ${dono}`;
      if (!inscricoes.length) return json({ erro: "sem_aparelho" }, 400);
      return json(
        await enviarPush(inscricoes, {
          title: "Notificação ligada",
          body: "É assim que o lembrete das contas vai chegar.",
          url: "/contas",
          tag: "teste",
        }),
      );
    }
    return json({ erro: "acao_invalida" }, 400);
  } catch (e) {
    console.error(e);
    return json({ erro: "falha", detalhe: (e as Error).message }, 500);
  }
});
