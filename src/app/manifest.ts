import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Adega do Pezão",
    short_name: "Pezão",
    description: "Caixa, produtos e lucro da Adega do Pezão",
    lang: "pt-BR",
    // No celular o app abre direto no caixa, que é a tela mais usada.
    start_url: "/caixa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0b",
    theme_color: "#0a0a0b",
    icons: [
      { src: "/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icone-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Caixa", url: "/caixa" },
      { name: "Relatórios", url: "/relatorios" },
      { name: "Produtos", url: "/produtos" },
    ],
  };
}
