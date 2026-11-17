"use client";

import { useEffect } from "react";

/** Registra o service worker só no build de produção (em dev ele atrapalha o recarregamento). */
export function RegistraServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Sem service worker o app continua funcionando, só não abre offline.
    });
  }, []);
  // iPhone: o Safari ignora o bloqueio de zoom da meta viewport; o gesto de pinça é barrado aqui.
  useEffect(() => {
    const barrar = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", barrar);
    return () => document.removeEventListener("gesturestart", barrar);
  }, []);
  return null;
}
