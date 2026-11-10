"use client";

import { useEffect } from "react";

/**
 * Reflexo do vidro: guarda a posição do ponteiro dentro de cada elemento [data-luz] em
 * --lx / --ly, que o CSS usa para desenhar o brilho. Um ouvinte só para a página inteira,
 * no máximo uma escrita por quadro, e só em aparelho com mouse.
 */
export function LuzVidro() {
  useEffect(() => {
    if (!window.matchMedia("(hover: hover)").matches) return;
    let quadro = 0;
    let ultimo: PointerEvent | null = null;

    const aplicar = () => {
      quadro = 0;
      const e = ultimo;
      if (!e) return;
      const alvo = (e.target as Element | null)?.closest?.<HTMLElement>("[data-luz]");
      if (!alvo) return;
      const r = alvo.getBoundingClientRect();
      alvo.style.setProperty("--lx", `${e.clientX - r.left}px`);
      alvo.style.setProperty("--ly", `${e.clientY - r.top}px`);
    };

    const mover = (e: PointerEvent) => {
      ultimo = e;
      if (!quadro) quadro = requestAnimationFrame(aplicar);
    };

    document.addEventListener("pointermove", mover, { passive: true });
    return () => {
      document.removeEventListener("pointermove", mover);
      if (quadro) cancelAnimationFrame(quadro);
    };
  }, []);

  return null;
}
