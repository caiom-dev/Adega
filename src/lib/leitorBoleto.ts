"use client";

import { banco } from "./banco";
import { acharBoleto, lerBoleto, type LeituraBoleto } from "./boleto";

/*
 * Lê o boleto a partir do anexo, tudo no aparelho:
 * 1. PDF: procura a linha digitável no texto das primeiras páginas.
 * 2. Sem texto (PDF escaneado) ou foto: procura o código de barras na imagem, quando o navegador
 *    sabe ler (Chrome no Android e no computador). No iPhone o Safari não lê: o dono cola a linha.
 */

const PAGINAS = 3;

type Detector = { detect: (img: ImageBitmapSource) => Promise<{ rawValue: string }[]> };

function detector(): Detector | null {
  const D = (globalThis as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  try {
    return D ? new D({ formats: ["itf"] }) : null;
  } catch {
    return null;
  }
}

async function barrasNaImagem(img: ImageBitmapSource): Promise<LeituraBoleto | null> {
  const d = detector();
  if (!d) return null;
  try {
    for (const { rawValue } of await d.detect(img)) {
      const r = lerBoleto(rawValue);
      if (r.ok) return r.leitura;
    }
  } catch {
    // Imagem que o leitor não abriu: segue sem leitura.
  }
  return null;
}

async function lerPdf(arquivo: File): Promise<LeituraBoleto | null> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise;
  try {
    const total = Math.min(doc.numPages, PAGINAS);
    for (let n = 1; n <= total; n++) {
      const pagina = await doc.getPage(n);
      const itens = (await pagina.getTextContent()).items.map((i) => ("str" in i ? i.str : ""));
      // Com espaço entre os pedaços e sem: tem PDF que quebra a linha no meio de um número.
      const achado = acharBoleto(itens.join(" ")) ?? acharBoleto(itens.join(""));
      if (achado) return achado;
    }
    if (!detector()) return null;
    for (let n = 1; n <= total; n++) {
      const pagina = await doc.getPage(n);
      const vista = pagina.getViewport({ scale: 2.5 });
      const tela = document.createElement("canvas");
      tela.width = vista.width;
      tela.height = vista.height;
      await pagina.render({ canvas: tela, viewport: vista }).promise;
      const achado = await barrasNaImagem(tela);
      if (achado) return achado;
    }
    return null;
  } finally {
    void doc.destroy();
  }
}

export const ehPdf = (f: File) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");

/** null quando não achou nada para ler: o dono cola a linha ou digita os campos. */
export async function lerArquivo(arquivo: File): Promise<LeituraBoleto | null> {
  try {
    if (ehPdf(arquivo)) return await lerPdf(arquivo);
    if (!detector()) return null;
    return await barrasNaImagem(await createImageBitmap(arquivo));
  } catch {
    return null;
  }
}

/** O navegador deste aparelho lê código de barras em foto? */
export const leFoto = () => detector() !== null;

/* ───────── Anexo na área privada ───────── */

/** Envia o anexo e devolve o caminho guardado na conta, ou null se falhou. */
export async function enviarAnexo(contaId: string, arquivo: File): Promise<string | null> {
  const extensao = (arquivo.name.match(/\.[a-z0-9]{2,5}$/i)?.[0] ?? (ehPdf(arquivo) ? ".pdf" : ".jpg")).toLowerCase();
  const caminho = `${contaId}/${Date.now()}${extensao}`;
  const { error } = await banco.storage.from("boletos").upload(caminho, arquivo, {
    contentType: arquivo.type || (ehPdf(arquivo) ? "application/pdf" : "image/jpeg"),
  });
  return error ? null : caminho;
}

/** Link que vale por 10 minutos para abrir o anexo. */
export async function linkAnexo(caminho: string): Promise<string | null> {
  const { data, error } = await banco.storage.from("boletos").createSignedUrl(caminho, 600);
  return error ? null : data.signedUrl;
}

export async function apagarAnexo(caminho: string) {
  await banco.storage.from("boletos").remove([caminho]);
}
