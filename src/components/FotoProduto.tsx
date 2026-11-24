"use client";

import { useRef, useState } from "react";
import { Camera, ImageSquare } from "@phosphor-icons/react";
import { ehImagem, TAMANHO_MAXIMO, urlFoto } from "@/lib/fotoProduto";
import { Botao } from "@/components/ui";

/** Miniatura quadrada. Sem foto, um quadrado vazio do mesmo tamanho, para a lista não ficar torta. */
export function MiniFoto({ caminho, className = "h-[52px] w-[52px] rounded-[12px]" }: { caminho: string | null; className?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden bg-sunk ring-1 ring-line ${className}`}>
      {caminho ? (
        // Imagem já reduzida no envio e servida pela área pública: o <img> simples basta.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={urlFoto(caminho)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <ImageSquare size={18} className="text-muted" aria-hidden />
      )}
    </span>
  );
}

/** Confere o arquivo antes de reduzir. Devolve o erro, ou null. */
export function conferirArquivo(f: File): string | null {
  if (!ehImagem(f)) return "Esse arquivo não é uma foto.";
  if (f.size > TAMANHO_MAXIMO) return "Foto grande demais. Mande uma menor que 25 MB.";
  return null;
}

/**
 * O espaço da foto na janela do produto. Toca para escolher, ou arrasta a foto para cima
 * (no computador, direto do WhatsApp Web ou da pasta de downloads).
 */
export function SlotFoto({
  src,
  ocupado,
  erro,
  aoEscolher,
  aoTirar,
}: {
  /** O que mostrar agora: a foto guardada ou a prévia da que acabou de ser escolhida. */
  src: string | null;
  ocupado: boolean;
  erro: string | null;
  aoEscolher: (f: File) => void;
  aoTirar: () => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);

  return (
    <div className="flex items-center gap-4">
      <input
        ref={entrada}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) aoEscolher(f);
        }}
      />
      <button
        type="button"
        disabled={ocupado}
        aria-label={src ? "Trocar a foto" : "Escolher a foto"}
        onClick={() => entrada.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          const f = e.dataTransfer.files?.[0];
          if (f) aoEscolher(f);
        }}
        className={`aperta relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[18px] bg-sunk ring-1 transition-shadow duration-150 ${
          arrastando ? "ring-2 ring-accent" : src ? "ring-line" : "ring-line-strong hover:ring-accent"
        }`}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className={`h-full w-full object-cover transition-opacity duration-150 ${ocupado ? "opacity-40" : ""}`} />
        ) : (
          <Camera size={28} className="text-accent" aria-hidden />
        )}
        {ocupado && <span className="absolute inset-x-0 bottom-2 text-center text-[12px] font-medium text-ink">Enviando</span>}
      </button>

      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium text-ink">Foto</p>
        {erro ? (
          <p className="aparece mt-0.5 text-[13px] text-red-ink">{erro}</p>
        ) : (
          <p className="mt-0.5 text-[13px] text-body">
            {src ? "Aparece na lista e no cardápio do delivery" : "Toque para escolher, arraste ou cole a foto aqui"}
          </p>
        )}
        {src && (
          <div className="mt-2 flex gap-2">
            <Botao className="h-9 px-3 text-[13px]" disabled={ocupado} onClick={() => entrada.current?.click()}>
              Trocar
            </Botao>
            <Botao variante="fantasma" className="h-9 px-3 text-[13px] text-red-ink hover:text-red-ink" disabled={ocupado} onClick={aoTirar}>
              Apagar foto
            </Botao>
          </div>
        )}
      </div>
    </div>
  );
}
