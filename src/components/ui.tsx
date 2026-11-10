"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import { numeroReais, type NivelMargem } from "@/lib/dinheiro";

/* ───────── Botões ───────── */

type VarianteBotao = "principal" | "secundario" | "fantasma" | "perigo";

const ESTILO_BOTAO: Record<VarianteBotao, string> = {
  principal: "vidro-ambar font-semibold disabled:opacity-40",
  secundario: "vidro-leve text-ink disabled:opacity-40",
  fantasma: "text-body hover:bg-white/5 hover:text-ink disabled:opacity-40",
  perigo: "vidro-leve text-red-ink disabled:opacity-40",
};

export function Botao({
  variante = "secundario",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: VarianteBotao }) {
  return (
    <button
      type="button"
      data-luz={variante === "fantasma" ? undefined : ""}
      {...props}
      className={`aperta inline-flex items-center justify-center gap-2 rounded-[14px] px-4 text-[15px] font-medium disabled:cursor-not-allowed ${ESTILO_BOTAO[variante]} ${className}`}
    />
  );
}

/* ───────── Etiquetas ───────── */

const ESTILO_ETIQUETA: Record<NivelMargem, string> = {
  "sem-custo": "bg-yellow-soft text-yellow-ink",
  baixa: "bg-red-soft text-red-ink",
  media: "bg-white/8 text-body",
  boa: "bg-green-soft text-green-ink",
};

export function Etiqueta({ nivel, children }: { nivel: NivelMargem; children: React.ReactNode }) {
  return (
    <span className={`num inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ESTILO_ETIQUETA[nivel]}`}>
      {children}
    </span>
  );
}

/* ───────── Campos ───────── */

const CAMPO =
  "h-12 w-full rounded-[14px] bg-sunk px-4 text-base text-ink outline-none ring-1 ring-line transition-shadow duration-150 placeholder:text-muted focus-within:ring-2 focus-within:ring-accent focus:ring-2 focus:ring-accent";

function Rotulo({ children, erro }: { children: React.ReactNode; erro?: string | null }) {
  return (
    <span className="mb-2 flex items-baseline justify-between gap-2 text-[13px]">
      <span className="text-body">{children}</span>
      {erro && <span className="aparece text-red-ink">{erro}</span>}
    </span>
  );
}

/** Campo de dinheiro: digita só números e ele preenche os centavos (1 → 0,01 → 1000 → 10,00). */
export function CampoDinheiro({
  rotulo,
  valor,
  aoMudar,
  autoFocus,
  dica,
  erro,
}: {
  rotulo: string;
  valor: number | null;
  aoMudar: (v: number | null) => void;
  autoFocus?: boolean;
  dica?: string;
  erro?: string | null;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="block">
      <Rotulo erro={erro}>{rotulo}</Rotulo>
      <div className={`${CAMPO} flex items-center ${erro ? "ring-red-ink/60" : ""}`}>
        <span className="text-muted">R$</span>
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          autoFocus={autoFocus}
          aria-invalid={!!erro}
          className="num h-full w-full bg-transparent pl-2 text-base text-ink outline-none placeholder:text-muted"
          placeholder="0,00"
          value={valor === null ? "" : numeroReais(valor)}
          onChange={(e) => {
            const digitos = e.target.value.replace(/\D/g, "").slice(0, 8);
            aoMudar(digitos ? Number(digitos) : null);
          }}
        />
      </div>
      {dica && <span className="mt-2 block text-[13px] text-muted">{dica}</span>}
    </label>
  );
}

export function CampoTexto({
  rotulo,
  erro,
  dica,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { rotulo: string; erro?: string | null; dica?: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="block">
      <Rotulo erro={erro}>{rotulo}</Rotulo>
      <input id={id} autoComplete="off" aria-invalid={!!erro} {...props} className={`${CAMPO} ${erro ? "ring-red-ink/60" : ""}`} />
      {dica && <span className="mt-2 block text-[13px] text-muted">{dica}</span>}
    </label>
  );
}

export function CampoEscolha({
  rotulo,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { rotulo: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="block">
      <Rotulo>{rotulo}</Rotulo>
      <select id={id} {...props} className={CAMPO}>
        {children}
      </select>
    </label>
  );
}

/* ───────── Seletor segmentado: a marca desliza até a opção escolhida ───────── */

export function Segmentado<T extends string>({
  opcoes,
  valor,
  aoMudar,
  rotulo,
  className = "",
}: {
  opcoes: { id: T; nome: React.ReactNode }[];
  valor: T;
  aoMudar: (v: T) => void;
  rotulo: string;
  className?: string;
}) {
  const indice = Math.max(0, opcoes.findIndex((o) => o.id === valor));
  return (
    <div role="tablist" aria-label={rotulo} className={`relative flex rounded-[14px] bg-sunk p-1 ring-1 ring-line ${className}`}>
      <span
        aria-hidden
        className="vidro-leve desliza absolute inset-y-1 left-1 rounded-[10px]"
        style={{ width: `calc((100% - 8px) / ${opcoes.length})`, transform: `translateX(${indice * 100}%)` }}
      />
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={o.id === valor}
          onClick={() => aoMudar(o.id)}
          className={`relative z-10 flex h-9 flex-1 items-center justify-center gap-2 rounded-[10px] px-1 text-[13px] font-medium whitespace-nowrap transition-colors duration-200 sm:px-2 sm:text-sm ${
            o.id === valor ? "text-ink" : "text-muted hover:text-body"
          }`}
        >
          {o.nome}
        </button>
      ))}
    </div>
  );
}

/* ───────── Janela ─────────
 * No celular sobe do rodapé e fecha arrastando para baixo. No computador abre no centro.
 * Sempre sai animada: quem fecha pela própria janela (X, fundo, Esc, arrasto) ou pelo rodapé
 * (função `fechar` recebida) vê a saída antes de a janela sumir.
 */

const SAIDA_MS = 240;

export function Janela({
  aberta,
  aoFechar,
  titulo,
  children,
  rodape,
  larga,
}: {
  aberta: boolean;
  aoFechar: () => void;
  titulo: string;
  children: React.ReactNode;
  rodape?: React.ReactNode | ((fechar: () => void) => React.ReactNode);
  larga?: boolean;
}) {
  const [montada, setMontada] = useState(aberta);
  const [saindo, setSaindo] = useState(false);
  const painel = useRef<HTMLDivElement>(null);
  const abertaRef = useRef(aberta);
  const aoFecharRef = useRef(aoFechar);
  useEffect(() => {
    abertaRef.current = aberta;
    aoFecharRef.current = aoFechar;
  });

  // Acompanha a prop durante a renderização: abrir monta, fechar começa a saída.
  if (aberta && !montada) {
    setMontada(true);
    setSaindo(false);
  }
  if (!aberta && montada && !saindo) setSaindo(true);

  const fechar = useCallback(() => setSaindo(true), []);

  useEffect(() => {
    if (!saindo) return;
    const t = setTimeout(() => {
      setMontada(false);
      setSaindo(false);
      if (abertaRef.current) aoFecharRef.current();
    }, SAIDA_MS);
    return () => clearTimeout(t);
  }, [saindo]);

  useEffect(() => {
    if (!montada) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    document.addEventListener("keydown", tecla);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", tecla);
      document.body.style.overflow = overflow;
    };
  }, [montada, fechar]);

  // Arrastar o topo para baixo fecha (só toque). Mexe direto no estilo para não re-renderizar a cada quadro.
  const arrasto = useRef<{ y: number; t: number } | null>(null);
  function aoApertar(e: React.PointerEvent) {
    if (e.pointerType === "mouse" || (e.target as HTMLElement).closest("button")) return;
    arrasto.current = { y: e.clientY, t: e.timeStamp };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function aoMover(e: React.PointerEvent) {
    if (!arrasto.current || !painel.current) return;
    const dy = Math.max(0, e.clientY - arrasto.current.y);
    painel.current.style.animation = "none";
    painel.current.style.transform = `translateY(${dy}px)`;
  }
  function aoSoltar(e: React.PointerEvent) {
    if (!arrasto.current || !painel.current) return;
    const dy = Math.max(0, e.clientY - arrasto.current.y);
    const velocidade = dy / Math.max(1, e.timeStamp - arrasto.current.t);
    arrasto.current = null;
    painel.current.style.animation = "";
    if (dy > 120 || velocidade > 0.6) {
      fechar();
    } else {
      painel.current.style.transition = "transform 300ms var(--ease-mola)";
      painel.current.style.transform = "";
      setTimeout(() => painel.current && (painel.current.style.transition = ""), 320);
    }
  }

  if (!montada) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
      <div className={`absolute inset-0 bg-black/55 ${saindo ? "some" : "aparece"}`} onClick={fechar} aria-hidden />
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`vidro vidro-flutua relative flex max-h-[92dvh] w-full flex-col rounded-t-[28px] will-change-transform md:rounded-[28px] ${
          larga ? "md:max-w-2xl" : "md:max-w-md"
        } ${saindo ? "desce" : "sobe"}`}
      >
        <header
          className="relative flex touch-none items-center justify-between px-5 pt-6 pb-3 md:pt-5"
          onPointerDown={aoApertar}
          onPointerMove={aoMover}
          onPointerUp={aoSoltar}
          onPointerCancel={aoSoltar}
        >
          <span aria-hidden className="absolute top-2 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-white/25 md:hidden" />
          <h2 className="text-xl font-semibold tracking-tight text-ink">{titulo}</h2>
          <button
            type="button"
            data-luz=""
            onClick={fechar}
            className="vidro-leve aperta -mr-1 flex h-8 w-8 items-center justify-center rounded-full text-body"
            aria-label="Fechar"
          >
            <X size={14} weight="bold" />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pt-2 pb-5">{children}</div>
        {rodape && (
          <footer className="border-t border-line px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-5">
            {typeof rodape === "function" ? rodape(fechar) : rodape}
          </footer>
        )}
      </div>
    </div>
  );
}

/* ───────── Cabeçalho de página: título grande, como no iOS ───────── */

export function Cabecalho({
  titulo,
  subtitulo,
  acao,
}: {
  titulo: string;
  subtitulo?: React.ReactNode;
  acao?: React.ReactNode;
}) {
  return (
    <header className="pt-seguro">
      <div className="flex items-end justify-between gap-4 pt-8 pb-6 md:pt-12">
        <div className="min-w-0">
          <h1 className="text-[32px] leading-[1.1] font-semibold tracking-tight text-ink md:text-4xl">{titulo}</h1>
          {subtitulo && <p className="num mt-2 text-[15px] text-body">{subtitulo}</p>}
        </div>
        {acao}
      </div>
    </header>
  );
}

/** Bloco de conteúdo. Superfície opaca: o vidro fica para o que flutua. */
export function Cartao({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`rounded-[20px] bg-surface ring-1 ring-line ${className}`} />;
}

/* ───────── Número que conta até o valor novo ───────── */

export function NumeroAnimado({
  valor,
  formato,
  className,
}: {
  valor: number;
  formato: (v: number) => string;
  className?: string;
}) {
  const el = useRef<HTMLSpanElement>(null);
  const anterior = useRef(valor);
  const formatoRef = useRef(formato);
  useEffect(() => {
    formatoRef.current = formato;
  });

  useEffect(() => {
    const de = anterior.current;
    anterior.current = valor;
    const no = el.current;
    if (!no || de === valor) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      no.textContent = formatoRef.current(valor);
      return;
    }
    const inicio = performance.now();
    let quadro = 0;
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / 500);
      const suave = 1 - Math.pow(1 - t, 4);
      no.textContent = formatoRef.current(Math.round(de + (valor - de) * suave));
      if (t < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [valor]);

  return (
    <span ref={el} className={className}>
      {formato(valor)}
    </span>
  );
}

/* ───────── Data e hora só no navegador: o servidor não sabe o fuso de quem usa ───────── */

export function useAgora(): Date | null {
  const [agora, setAgora] = useState<Date | null>(null);
  useEffect(() => {
    const atualizar = () => setAgora(new Date());
    atualizar();
    const t = setInterval(atualizar, 60_000);
    return () => clearInterval(t);
  }, []);
  return agora;
}

/** Aviso que aparece no topo e some sozinho. */
export function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="vidro vidro-flutua estala fixed inset-x-3 top-[calc(env(safe-area-inset-top)+12px)] z-[60] origin-top rounded-[20px] px-4 py-3 text-sm md:inset-x-auto md:right-6 md:w-80"
    >
      {children}
    </div>
  );
}
