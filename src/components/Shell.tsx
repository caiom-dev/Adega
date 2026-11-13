"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { CashRegister, ChartBar, GearSix, House, Moped, Package, type Icon } from "@phosphor-icons/react";
import { sair } from "@/lib/acessos";
import { fecharErro, useLoja } from "@/lib/loja";
import { Entrada, NovoPin } from "@/components/Entrada";
import { AlertaPedidos } from "@/components/delivery/AlertaPedidos";

const ITENS: { href: string; nome: string; icone: Icon }[] = [
  { href: "/", nome: "Início", icone: House },
  { href: "/caixa", nome: "Caixa", icone: CashRegister },
  { href: "/delivery", nome: "Delivery", icone: Moped },
  { href: "/produtos", nome: "Produtos", icone: Package },
  { href: "/relatorios", nome: "Relatórios", icone: ChartBar },
  { href: "/ajustes", nome: "Ajustes", icone: GearSix },
];

function ativo(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/* Logo da tela de carregamento: pulsa de leve, só com opacity. */
const ESTILO_PULSO = `
@media (prefers-reduced-motion: no-preference) {
  .logo-pulsa { animation: logo-pulsa 1.8s ease-in-out infinite; }
}
@keyframes logo-pulsa {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
`;

const FAIXA =
  "vidro vidro-flutua estala fixed inset-x-3 top-[calc(env(safe-area-inset-top)+12px)] z-50 origin-top rounded-[20px] px-4 py-3 text-sm md:inset-x-auto md:right-6 md:w-96";

function inscreverRede(avisar: () => void) {
  window.addEventListener("online", avisar);
  window.addEventListener("offline", avisar);
  return () => {
    window.removeEventListener("online", avisar);
    window.removeEventListener("offline", avisar);
  };
}

/* Uma faixa só: erro ao salvar tem prioridade (some ao fechar) e, sem ele, o aviso de sem internet. */
function Avisos() {
  const erro = useLoja().erro;
  const semRede = !useSyncExternalStore(
    inscreverRede,
    () => navigator.onLine,
    () => true,
  );

  if (erro) {
    return (
      <div role="alert" className={`${FAIXA} flex items-center gap-3`}>
        <p className="min-w-0 flex-1 text-ink">{erro}</p>
        <button
          type="button"
          onClick={fecharErro}
          className="vidro-leve aperta h-8 shrink-0 rounded-full px-3 text-[13px] font-medium text-ink"
        >
          Fechar
        </button>
      </div>
    );
  }

  if (semRede) {
    return (
      <div role="status" className={`${FAIXA} text-ink`}>
        Sem internet. O app só funciona conectado.
      </div>
    );
  }

  return null;
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const loja = useLoja();
  const { situacao, pessoa, recuperando } = loja;

  const atendente = pessoa?.papel === "atendente";
  // Atendente só tem o Caixa e o Delivery. O dono vê o menu inteiro.
  const itens = atendente ? ITENS.filter((i) => i.href === "/caixa" || i.href === "/delivery") : ITENS;
  const indice = Math.max(0, itens.findIndex((i) => ativo(pathname, i.href)));
  const abertas = loja.comandas.length;
  const novos = loja.pedidos.filter((p) => p.situacao === "novo").length;
  // Contador em cima do item do menu: comandas abertas no Caixa, pedidos novos no Delivery.
  const contador = (href: string) => (href === "/caixa" ? abertas : href === "/delivery" ? novos : 0);
  // A página do cliente do delivery é pública: não pede PIN nem mostra o menu.
  const publica = pathname.startsWith("/pedir");

  const logado = situacao === "dentro" && !recuperando;
  const redirecionando = logado && atendente && !publica && !pathname.startsWith("/caixa") && !pathname.startsWith("/delivery");

  useEffect(() => {
    if (redirecionando) router.replace("/caixa");
  }, [redirecionando, router]);

  if (publica) return <>{children}</>;

  if (situacao === "carregando") {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <style>{ESTILO_PULSO}</style>
        <Image
          src="/logo-p.webp"
          alt="Adega do Pezão"
          width={240}
          height={217}
          priority
          className="logo-pulsa h-auto w-36"
        />
        <Avisos />
        {/* A página continua montada, escondida: o Next precisa dela para preparar a navegação. */}
        <div hidden>{children}</div>
      </div>
    );
  }

  if (situacao === "fora") {
    return (
      <>
        <Avisos />
        <Entrada />
        {/* A página continua montada, escondida: o Next precisa dela para preparar a navegação. */}
        <div hidden>{children}</div>
      </>
    );
  }

  // Abriu o link de recuperação do e-mail: escolhe um PIN novo antes de usar o app.
  if (recuperando && pessoa) {
    return (
      <>
        <Avisos />
        <NovoPin pessoaId={pessoa.id} />
        {/* A página continua montada, escondida: o Next precisa dela para preparar a navegação. */}
        <div hidden>{children}</div>
      </>
    );
  }

  return (
    <div className="min-h-dvh">
      <Avisos />
      <AlertaPedidos />

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
          {itens.map(({ href, nome, icone: Icone }) => {
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
                {contador(href) > 0 && (
                  <span className="num estala ml-auto rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-yellow-ink">
                    {contador(href)}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex items-center justify-between gap-2 px-3 pb-2">
          <span className="min-w-0 truncate text-sm text-body">{pessoa?.nome}</span>
          <button
            type="button"
            onClick={() => void sair()}
            className="vidro-leve aperta h-8 shrink-0 rounded-full px-3 text-[13px] font-medium text-ink"
          >
            Sair
          </button>
        </div>
      </aside>

      <main className="min-w-0 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-0 md:pl-[264px]">
        {/* Celular: o atendente não tem o menu de ajustes, então o "Sair" fica numa faixa fina no topo */}
        {atendente && (
          <div className="flex items-center justify-between gap-3 px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] md:hidden">
            <span className="min-w-0 truncate text-sm text-body">{pessoa?.nome}</span>
            <button
              type="button"
              onClick={() => void sair()}
              className="vidro-leve aperta h-8 shrink-0 rounded-full px-3 text-[13px] font-medium text-ink"
            >
              Sair
            </button>
          </div>
        )}
        {/* A chave troca a cada página, então o conteúdo novo entra com a animação de tela */}
        {!redirecionando && (
          <div key={pathname} className="tela">
            {children}
          </div>
        )}
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
            style={{ width: `calc((100% - 8px) / ${itens.length})`, transform: `translateX(${indice * 100}%)` }}
          />
          {itens.map(({ href, nome, icone: Icone }) => {
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
                  {contador(href) > 0 && (
                    <span className="num estala absolute -top-1 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-ink">
                      {contador(href)}
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
