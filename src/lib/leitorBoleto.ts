"use client";

import { banco } from "./banco";
import { acharBoletos, lerBoleto, type LeituraBoleto } from "./boleto";
import { lerBarrasItf } from "./barrasItf";

/*
 * Lê o boleto a partir do anexo, tudo no aparelho:
 * 1. PDF: procura a linha digitável no texto das páginas.
 * 2. Sem a linha no texto (ela vem como imagem, ou o PDF é escaneado) ou foto: lê o código de
 *    barras na imagem. Usa o leitor do navegador quando existe (Chrome no Android e no Mac) e o
 *    leitor próprio do app nos outros (Chrome no Windows, iPhone).
 * Um carnê traz vários boletos no mesmo PDF: devolve todos, na ordem em que aparecem.
 */

/** Carnê de um ano tem 12 boletos, dois por página. */
const PAGINAS = 12;
/** Escala da página ao procurar o código de barras: as barras finas precisam de uns 3 px. */
const ESCALA_BARRAS = 4;
/** Lado maior da foto ao procurar o código de barras: mais que isso só fica lento. */
const LADO_FOTO = 2400;

type Detector = {
  detect: (img: ImageBitmapSource) => Promise<{ rawValue: string }[]>;
};

function detector(): Detector | null {
  const D = (
    globalThis as unknown as {
      BarcodeDetector?: new (o: { formats: string[] }) => Detector;
    }
  ).BarcodeDetector;
  try {
    return D ? new D({ formats: ["itf"] }) : null;
  } catch {
    return null;
  }
}

const valido = (barras: string) => lerBoleto(barras).ok;

function juntar(lista: LeituraBoleto[], novos: LeituraBoleto[]) {
  for (const l of novos)
    if (!lista.some((x) => x.barras === l.barras)) lista.push(l);
}

/** Códigos de barras numa imagem já desenhada. */
async function barrasNaTela(tela: HTMLCanvasElement): Promise<LeituraBoleto[]> {
  const achados: LeituraBoleto[] = [];
  const d = detector();
  if (d) {
    try {
      const lidos = await d.detect(tela);
      // O leitor do navegador não garante a ordem: põe de cima para baixo.
      const r = lidos
        .map(({ rawValue }) => lerBoleto(rawValue))
        .flatMap((x) => (x.ok ? [x.leitura] : []));
      juntar(achados, r);
    } catch {
      // Segue com o leitor próprio.
    }
  }
  if (achados.length === 0) {
    const ctx = tela.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      const { data } = ctx.getImageData(0, 0, tela.width, tela.height);
      juntar(
        achados,
        lerBarrasItf(data, tela.width, tela.height, valido).flatMap((b) => {
          const r = lerBoleto(b);
          return r.ok ? [r.leitura] : [];
        }),
      );
    }
  }
  return achados;
}

async function lerPdf(arquivo: File): Promise<LeituraBoleto[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(await arquivo.arrayBuffer()),
  }).promise;
  const achados: LeituraBoleto[] = [];
  try {
    const total = Math.min(doc.numPages, PAGINAS);
    for (let n = 1; n <= total; n++) {
      const pagina = await doc.getPage(n);
      const itens = (await pagina.getTextContent()).items.map((i) =>
        "str" in i ? i.str : "",
      );
      // Com espaço entre os pedaços e sem: tem PDF que quebra a linha no meio de um número.
      const doTexto = acharBoletos(itens.join(" "));
      juntar(achados, doTexto.length ? doTexto : acharBoletos(itens.join("")));
    }
    if (achados.length) return achados;
    for (let n = 1; n <= total; n++) {
      const pagina = await doc.getPage(n);
      const vista = pagina.getViewport({ scale: ESCALA_BARRAS });
      const tela = document.createElement("canvas");
      tela.width = vista.width;
      tela.height = vista.height;
      await pagina.render({ canvas: tela, viewport: vista }).promise;
      juntar(achados, await barrasNaTela(tela));
      // Libera a memória da página antes da próxima (4x dá umas 9 MB por página).
      tela.width = 0;
    }
    return achados;
  } finally {
    void doc.destroy();
  }
}

async function lerFoto(arquivo: File): Promise<LeituraBoleto[]> {
  const img = await createImageBitmap(arquivo);
  const escala = Math.min(1, LADO_FOTO / Math.max(img.width, img.height));
  const w = Math.round(img.width * escala);
  const h = Math.round(img.height * escala);
  // Deitada e em pé: a foto do boleto costuma vir com o celular em pé e o código na horizontal,
  // mas também pode vir girada.
  for (const girar of [false, true]) {
    const tela = document.createElement("canvas");
    tela.width = girar ? h : w;
    tela.height = girar ? w : h;
    const ctx = tela.getContext("2d", { willReadFrequently: true });
    if (!ctx) break;
    if (girar) {
      ctx.translate(h, 0);
      ctx.rotate(Math.PI / 2);
    }
    ctx.drawImage(img, 0, 0, w, h);
    const achados = await barrasNaTela(tela);
    if (achados.length) {
      img.close();
      return achados;
    }
  }
  img.close();
  return [];
}

export const ehPdf = (f: File) =>
  f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");

/** Todos os boletos do anexo, na ordem. Vazio quando não achou nada: o dono cola a linha ou digita os campos. */
export async function lerArquivo(arquivo: File): Promise<LeituraBoleto[]> {
  try {
    return ehPdf(arquivo) ? await lerPdf(arquivo) : await lerFoto(arquivo);
  } catch {
    return [];
  }
}

/* ───────── Anexo na área privada ───────── */

/** Envia o anexo e devolve o caminho guardado na conta, ou null se falhou. */
export async function enviarAnexo(
  contaId: string,
  arquivo: File,
): Promise<string | null> {
  const extensao = (
    arquivo.name.match(/\.[a-z0-9]{2,5}$/i)?.[0] ??
    (ehPdf(arquivo) ? ".pdf" : ".jpg")
  ).toLowerCase();
  const caminho = `${contaId}/${Date.now()}${extensao}`;
  const { error } = await banco.storage
    .from("boletos")
    .upload(caminho, arquivo, {
      contentType:
        arquivo.type || (ehPdf(arquivo) ? "application/pdf" : "image/jpeg"),
    });
  return error ? null : caminho;
}

/** Link que vale por 10 minutos para abrir o anexo. */
export async function linkAnexo(caminho: string): Promise<string | null> {
  const { data, error } = await banco.storage
    .from("boletos")
    .createSignedUrl(caminho, 600);
  return error ? null : data.signedUrl;
}

export async function apagarAnexo(caminho: string) {
  await banco.storage.from("boletos").remove([caminho]);
}
