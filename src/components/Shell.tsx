"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CashRegister, ChartBar, GearSix, House, Package, type Icon } from "@phosphor-icons/react";
import { useLoja } from "@/lib/loja";

const ITENS: { href: string; nome: string; icone: Icon }[] = [
  { href: "/", nome: "Início", icone: House },
  { href: "/caixa", nome: "Caixa", icone: CashRegister },
  { href: "/produtos", nome: "Produtos", icone: Package },
  { href: "/relatorios", nome: "Relatórios", icone: ChartBar },
  { href: "/ajustes", nome: "Ajustes", icone: GearSix },
];

function ativo(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const indice = Math.max(0, ITENS.findIndex((i) => ativo(pathname, i.href)));
  const abertas = useLoja().comandas.length;

  return (
    <div className="min-h-dvh">
      {/* Computador: painel de vidro fixo na lateral */}
      <aside className="vidro fixed inset-y-3 left-3 z-30 hidden w-60 flex-col rounded-[28px] p-3 md:flex">
        <Link href="/" className="aperta mx-auto mt-2 mb-4 block" aria-label="Adega do Pezão, início">
          <Image src="/logo-p.webp" alt="Adega do Pezão" width={240} height={217} priority className="h-auto w-36" />
        </Link>
        <nav className="relative flex flex-col gap-1">
          {/* Marca que desliza até o item escolhido: 44 de altura + 4 de espaço por item */}
          <span
            aria-hidden
            className="vidro-leve desliza absolute inset-x-0 top-0 h-11 rounded-[14px]"
            style={{ transform: `translateY(${indice * 48}px)` }}
          />
          {ITENS.map(({ href, nome, icone: Icone }) => {
            const marcado = ativo(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                data-luz=""
                aria-current={marcado ? "page" : undefined}
                className={`aperta relative flex h-11 items-center gap-3 rounded-[14px] px-3 text-[15px] ${
                  marcado ? "font-medium text-ink" : "text-body hover:text-ink"
                }`}
              >
                <Icone size={20} weight={marcado ? "fill" : "regular"} className={marcado ? "text-accent" : ""} />
                {nome}
                {href === "/caixa" && abertas > 0 && (
                  <span className="num estala ml-auto rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-yellow-ink">
                    {abertas}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <p className="mt-auto px-3 pb-2 text-xs text-muted">Caixa, produtos e lucro da loja</p>
      </aside>

      <main className="min-w-0 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-0 md:pl-[264px]">
        {/* A chave troca a cada página, então o conteúdo novo entra com a animação de tela */}
        <div key={pathname} className="tela">
          {children}
        </div>
      </main>

      {/* Celular (PWA): cápsula de vidro flutuando acima da barra de gestos */}
      <nav
        aria-label="Navegação"
        className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:hidden"
      >
        <div className="vidro vidro-flutua relative mx-auto flex h-16 max-w-md rounded-full p-1">
          <span
            aria-hidden
            className="vidro-leve desliza absolute inset-y-1 left-1 rounded-full"
            style={{ width: "calc((100% - 8px) / 5)", transform: `translateX(${indice * 100}%)` }}
          />
          {ITENS.map(({ href, nome, icone: Icone }) => {
            const marcado = ativo(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={marcado ? "page" : undefined}
                className={`aperta relative z-10 flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] ${
                  marcado ? "font-medium text-accent" : "text-body"
                }`}
              >
                <span className="relative">
                  <Icone size={24} weight={marcado ? "fill" : "regular"} />
                  {href === "/caixa" && abertas > 0 && (
                    <span className="num estala absolute -top-1 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-ink">
                      {abertas}
                    </span>
                  )}
                </span>
                {nome}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
