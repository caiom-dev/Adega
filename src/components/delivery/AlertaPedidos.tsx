"use client";

import { useEffect } from "react";
import { reais } from "@/lib/dinheiro";
import { ouvirNovosPedidos, useLoja } from "@/lib/loja";
import type { Pedido } from "@/lib/tipos";

/*
 * Avisa a adega quando chega pedido: som, notificação do sistema e o número no título da aba.
 * Enquanto houver pedido sem resposta, o som repete a cada 20 segundos.
 */

let audio: AudioContext | null = null;

/** Dois bipes curtos. O navegador só deixa tocar depois que a pessoa tocou na tela alguma vez. */
export function tocarAviso() {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    const agora = audio.currentTime;
    for (const [i, freq] of [880, 1320].entries()) {
      const osc = audio.createOscillator();
      const vol = audio.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      vol.gain.setValueAtTime(0.0001, agora + i * 0.18);
      vol.gain.exponentialRampToValueAtTime(0.35, agora + i * 0.18 + 0.02);
      vol.gain.exponentialRampToValueAtTime(0.0001, agora + i * 0.18 + 0.16);
      osc.connect(vol).connect(audio.destination);
      osc.start(agora + i * 0.18);
      osc.stop(agora + i * 0.18 + 0.17);
    }
  } catch {
    // Sem som disponível: o aviso na tela continua.
  }
}

async function notificar(p: Pedido) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const titulo = `Pedido nº ${p.numero} · ${reais(p.total)}`;
  const corpo = `${p.cliente} · ${p.retirada ? "retirada na loja" : p.bairro}`;
  try {
    // Pelo service worker a notificação também aparece no celular com o app em segundo plano.
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(titulo, { body: corpo, tag: `pedido-${p.id}`, icon: "/icone-192.png", data: { url: "/delivery" } });
    else new Notification(titulo, { body: corpo, icon: "/icone-192.png" });
  } catch {
    // Notificação recusada pelo sistema: o som e o contador continuam.
  }
}

export function AlertaPedidos() {
  const novos = useLoja().pedidos.filter((p) => p.situacao === "novo").length;

  useEffect(
    () =>
      ouvirNovosPedidos((p) => {
        tocarAviso();
        void notificar(p);
      }),
    [],
  );

  useEffect(() => {
    if (novos === 0) return;
    const t = setInterval(tocarAviso, 20_000);
    return () => clearInterval(t);
  }, [novos]);

  useEffect(() => {
    const base = "Adega do Pezão";
    document.title = novos > 0 ? `(${novos}) Pedido novo · ${base}` : base;
  }, [novos]);

  return null;
}
