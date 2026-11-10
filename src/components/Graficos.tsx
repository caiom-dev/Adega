"use client";

import { useState } from "react";

export interface Barra {
  rotulo: string;
  /** Nome completo, usado na dica e na leitura de tela. */
  nome: string;
  valor: number;
  detalhe?: string;
}

/** Arredonda o topo da escala para um número "redondo" (1, 2, 2,5, 5 × potência de 10). */
function teto(max: number) {
  if (max <= 0) return 1;
  const pot = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / pot;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pot;
}

/**
 * Gráfico de barras de uma série só. Barras neutras e uma em âmbar (a que importa);
 * passar o ponteiro ou tocar mostra o valor. Só o transform é animado.
 */
export function Barras({
  dados,
  formato,
  formatoEixo = formato,
  destaque,
  altura = 240,
  titulo,
}: {
  dados: Barra[];
  formato: (v: number) => string;
  formatoEixo?: (v: number) => string;
  /** Índice da barra em âmbar. */
  destaque?: number;
  altura?: number;
  titulo: string;
}) {
  const [foco, setFoco] = useState<number | null>(null);
  const topo = teto(Math.max(...dados.map((d) => d.valor), 0));
  const linhas = [1, 0.5, 0];
  // Com muitas barras, mostra só alguns rótulos para um não encostar no outro.
  const passo = Math.ceil(dados.length / 8);
  const ativo = foco !== null ? dados[foco] : null;

  return (
    <figure className="num" aria-label={titulo}>
      <div className="flex gap-3">
        {/* Largura fixa (48 + 12 de espaço) para os rótulos de baixo alinharem com as barras */}
        <div className="flex w-12 shrink-0 flex-col justify-between text-right text-xs text-muted" style={{ height: altura }} aria-hidden>
          {linhas.map((l) => (
            <span key={l} className="-translate-y-1/2 last:translate-y-1/2">
              {formatoEixo(topo * l)}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1" style={{ height: altura }} onPointerLeave={() => setFoco(null)}>
          {linhas.map((l) => (
            <span key={l} aria-hidden className="absolute inset-x-0 border-t border-line" style={{ top: `${(1 - l) * 100}%` }} />
          ))}

          <div className="absolute inset-0 flex items-end gap-0.5">
            {dados.map((d, i) => (
              <button
                key={i}
                type="button"
                aria-label={`${d.nome}: ${formato(d.valor)}`}
                onPointerEnter={() => setFoco(i)}
                onFocus={() => setFoco(i)}
                onBlur={() => setFoco(null)}
                onClick={() => setFoco(i)}
                // A coluna inteira é a área de toque; a barra é só a parte pintada
                className="group flex h-full min-w-0 flex-1 cursor-default items-end justify-center outline-none"
              >
                <span
                  className={`cresce block w-full max-w-7 rounded-t-[4px] transition-opacity duration-150 ${
                    i === destaque ? "bg-accent" : "bg-white/35"
                  } ${foco !== null && foco !== i ? "opacity-45" : ""} group-focus-visible:ring-2 group-focus-visible:ring-accent`}
                  style={{ height: `${d.valor > 0 ? Math.max((d.valor / topo) * 100, 1.5) : 0}%`, "--i": i } as React.CSSProperties}
                />
              </button>
            ))}
          </div>

          {ativo && foco !== null && (
            <div
              role="status"
              className="vidro vidro-flutua aparece pointer-events-none absolute top-0 z-10 w-max max-w-[70%] -translate-y-2 rounded-[12px] px-3 py-2 text-left"
              style={
                foco / dados.length > 0.5
                  ? { right: `${(1 - (foco + 0.5) / dados.length) * 100}%` }
                  : { left: `${((foco + 0.5) / dados.length) * 100}%` }
              }
            >
              <p className="text-xs text-body">{ativo.nome}</p>
              <p className="text-[15px] font-semibold text-ink">{formato(ativo.valor)}</p>
              {ativo.detalhe && <p className="text-xs text-body">{ativo.detalhe}</p>}
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex gap-0.5 pl-[60px] text-xs text-muted" aria-hidden>
        {dados.map((d, i) => (
          <span key={i} className="min-w-0 flex-1 text-center whitespace-nowrap">
            {i % passo === 0 ? d.rotulo : ""}
          </span>
        ))}
      </div>
    </figure>
  );
}

export interface Linha {
  id: string;
  nome: string;
  valor: number;
  detalhe?: React.ReactNode;
  aviso?: string;
}

/** Lista ordenada com uma barra fina por linha. A primeira leva o âmbar. */
export function ListaBarras({ linhas, formato }: { linhas: Linha[]; formato: (v: number) => string }) {
  const max = Math.max(...linhas.map((l) => l.valor), 1);
  return (
    <ul className="num divide-y divide-line">
      {linhas.map((l, i) => (
        <li key={l.id} className="px-5 py-3">
          <div className="flex items-baseline justify-between gap-3 text-[15px]">
            <span className="min-w-0 truncate text-ink">{l.nome}</span>
            <span className="shrink-0 font-medium text-ink">{formato(l.valor)}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
            <span
              className={`estica block h-full rounded-full ${i === 0 ? "bg-accent" : "bg-white/35"}`}
              style={{ width: `${Math.max((Math.max(l.valor, 0) / max) * 100, l.valor > 0 ? 2 : 0)}%`, "--i": i } as React.CSSProperties}
            />
          </div>
          {(l.detalhe || l.aviso) && (
            <p className="mt-1.5 flex justify-between gap-3 text-[13px] text-muted">
              <span>{l.detalhe}</span>
              {l.aviso && <span className="text-yellow-ink">{l.aviso}</span>}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
