"use client";

import { banco } from "./banco";

/*
 * Notificação com o app fechado (Web Push). O aparelho se inscreve uma vez e o banco guarda o endereço;
 * a função "lembretes" manda o aviso das contas todo dia às 8h.
 * No iPhone só funciona com o app instalado na tela de início (iOS 16.4 ou mais novo).
 */

export type EstadoPush = "sem-suporte" | "instalar" | "bloqueado" | "desligado" | "ligado";

const suporta = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const ehIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const instalado = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

async function registro() {
  return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
}

export async function estadoPush(): Promise<EstadoPush> {
  if (typeof window === "undefined") return "sem-suporte";
  if (!suporta()) return ehIphone() && !instalado() ? "instalar" : "sem-suporte";
  if (Notification.permission === "denied") return "bloqueado";
  const inscricao = await (await registro()).pushManager.getSubscription();
  return inscricao && Notification.permission === "granted" ? "ligado" : "desligado";
}

async function chamar(acao: "chave" | "teste") {
  const { data, error } = await banco.functions.invoke("lembretes", { body: { acao } });
  if (error) {
    const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(corpo?.erro ?? "falha");
  }
  return data as Record<string, unknown>;
}

function base64ParaBytes(b64: string) {
  const limpo = (b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(limpo), (c) => c.charCodeAt(0));
}

/** Pede a permissão, inscreve este aparelho e guarda no banco. Devolve a mensagem de erro, ou null. */
export async function ligarPush(): Promise<string | null> {
  if (!suporta()) return "Este aparelho não recebe notificação pelo navegador.";
  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") return "A notificação foi bloqueada. Libere nas configurações do navegador.";
  try {
    const { publica } = await chamar("chave");
    const reg = await registro();
    await navigator.serviceWorker.ready;
    let inscricao = await reg.pushManager.getSubscription();
    if (!inscricao) {
      inscricao = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ParaBytes(publica as string) });
    }
    const j = inscricao.toJSON();
    const { error } = await banco.rpc("inscrever_push", {
      p_endpoint: j.endpoint,
      p_p256dh: j.keys?.p256dh,
      p_auth: j.keys?.auth,
      p_aparelho: navigator.userAgent.slice(0, 120),
    });
    return error ? "Não consegui guardar este aparelho. Tente de novo." : null;
  } catch {
    return "Não consegui ligar a notificação neste aparelho. Confira a internet e tente de novo.";
  }
}

export async function desligarPush() {
  const inscricao = await (await registro()).pushManager.getSubscription();
  if (!inscricao) return;
  await banco.rpc("desinscrever_push", { p_endpoint: inscricao.endpoint });
  await inscricao.unsubscribe();
}

/** Manda uma notificação de teste para os aparelhos do dono. Devolve o erro, ou null. */
export async function testarPush(): Promise<string | null> {
  try {
    const r = await chamar("teste");
    return (r.enviadas as number) > 0 ? null : "O aviso não chegou ao serviço de notificação. Desligue e ligue de novo.";
  } catch (e) {
    return (e as Error).message === "sem_aparelho" ? "Ligue a notificação neste aparelho primeiro." : "Não consegui mandar o teste. Confira a internet.";
  }
}
