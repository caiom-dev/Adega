"use client";

import { banco } from "./banco";

/*
 * Foto dos produtos. A foto que chega pelo WhatsApp tem 2 a 4 MB; antes de enviar, o app reduz
 * para no máximo 1000 px no lado maior (fica perto de 100 KB) e guarda numa área pública,
 * porque o cardápio do delivery mostra a foto para quem não tem login.
 */

const LADO_MAXIMO = 1000;
const QUALIDADE = 0.82;
/** Antes de reduzir. Acima disso é vídeo ou arquivo errado. */
export const TAMANHO_MAXIMO = 25 * 1024 * 1024;

export const ehImagem = (f: File) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name);

function paraBlob(tela: HTMLCanvasElement, tipo: string): Promise<Blob | null> {
  return new Promise((ok) => tela.toBlob(ok, tipo, QUALIDADE));
}

/** Reduz a foto e converte para WebP (ou JPEG, no navegador que não gera WebP). null se a imagem não abriu. */
export async function prepararFoto(arquivo: File): Promise<Blob | null> {
  let img: ImageBitmap;
  try {
    img = await createImageBitmap(arquivo);
  } catch {
    return null;
  }
  const escala = Math.min(1, LADO_MAXIMO / Math.max(img.width, img.height));
  const tela = document.createElement("canvas");
  tela.width = Math.round(img.width * escala);
  tela.height = Math.round(img.height * escala);
  const ctx = tela.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, tela.width, tela.height);
  img.close();
  const webp = await paraBlob(tela, "image/webp");
  // O Safari antigo ignora o WebP e devolve PNG, que fica pesado: nesse caso vai JPEG.
  if (webp && webp.type === "image/webp") return webp;
  return paraBlob(tela, "image/jpeg");
}

/** Envia a foto já reduzida e devolve o caminho guardado no produto, ou null se falhou. */
export async function enviarFoto(produtoId: string, foto: Blob): Promise<string | null> {
  const caminho = `${produtoId}/${Date.now()}.${foto.type === "image/webp" ? "webp" : "jpg"}`;
  const { error } = await banco.storage.from("produtos").upload(caminho, foto, {
    contentType: foto.type,
    // O nome muda a cada troca, então o arquivo nunca muda: pode ficar guardado no aparelho.
    cacheControl: "31536000",
  });
  return error ? null : caminho;
}

export async function apagarFoto(caminho: string) {
  await banco.storage.from("produtos").remove([caminho]);
}

/** Endereço público da foto. */
export function urlFoto(caminho: string): string {
  return banco.storage.from("produtos").getPublicUrl(caminho).data.publicUrl;
}
