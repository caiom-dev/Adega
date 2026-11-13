"use client";

import Image from "next/image";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Backspace } from "@phosphor-icons/react";
import {
  criarPrimeiroDono,
  entrar,
  pedirRecuperacao,
  pessoasParaEntrar,
  trocarPin,
  type PessoaLogin,
} from "@/lib/acessos";
import { Botao, CampoTexto } from "@/components/ui";

/* Só números, no máximo 4 (PIN). */
const soPin = (v: string) => v.replace(/\D/g, "").slice(0, 4);

function horaCurta(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/* Moldura comum das telas de entrada: logo no topo, conteúdo centralizado embaixo dele. */
function Tela({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center px-4 pt-[calc(env(safe-area-inset-top)+2.5rem)] pb-[calc(env(safe-area-inset-bottom)+2rem)]">
      <Image src="/logo-p.webp" alt="Adega do Pezão" width={240} height={217} priority className="h-auto w-36" />
      <div className="flex w-full max-w-sm flex-1 flex-col justify-center py-8">{children}</div>
    </main>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <h1 className="text-[28px] leading-[1.15] font-semibold tracking-tight text-ink">{children}</h1>;
}

/* ───────── Entrada: quem é você, e o PIN ───────── */

export function Entrada() {
  // undefined = ainda carregando; null = sem internet; [] = primeiro acesso; lista = quem pode entrar.
  const [pessoas, setPessoas] = useState<PessoaLogin[] | null | undefined>(undefined);
  const [tentativa, setTentativa] = useState(0);
  const [escolhida, setEscolhida] = useState<PessoaLogin | null>(null);

  useEffect(() => {
    let vivo = true;
    pessoasParaEntrar().then((lista) => {
      if (vivo) setPessoas(lista);
    });
    return () => {
      vivo = false;
    };
  }, [tentativa]);

  if (escolhida) return <PedirPin pessoa={escolhida} aoVoltar={() => setEscolhida(null)} />;

  if (pessoas === undefined) return <Tela>{null}</Tela>;

  if (pessoas === null) {
    return (
      <Tela>
        <div className="entra flex flex-col">
          <Titulo>Sem internet</Titulo>
          <p className="mt-3 text-[15px] text-body">Confira a conexão e tente de novo.</p>
          <Botao
            variante="principal"
            className="mt-8 h-12 w-full"
            onClick={() => {
              setPessoas(undefined);
              setTentativa((t) => t + 1);
            }}
          >
            Tentar de novo
          </Botao>
        </div>
      </Tela>
    );
  }

  if (pessoas.length === 0) return <PrimeiroAcesso />;

  return (
    <Tela>
      <div className="entra flex flex-col">
        <Titulo>Quem é você?</Titulo>
        <div className="mt-6 flex flex-col gap-3">
          {pessoas.map((p) => (
            <button
              key={p.id}
              type="button"
              data-luz=""
              onClick={() => setEscolhida(p)}
              className="vidro-leve aperta flex h-20 w-full flex-col items-start justify-center rounded-[20px] px-5 text-left"
            >
              <span className="text-lg font-medium text-ink">{p.nome}</span>
              <span className="mt-0.5 text-[13px] text-muted">{p.papel === "dono" ? "Dono" : "Atendente"}</span>
            </button>
          ))}
        </div>
      </div>
    </Tela>
  );
}

/* ───────── PIN ───────── */

const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "apagar"];

function PedirPin({ pessoa, aoVoltar }: { pessoa: PessoaLogin; aoVoltar: () => void }) {
  const [digitos, setDigitos] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // Muda a cada erro de PIN: a chave nova faz a animação de tremer tocar de novo.
  const [tremor, setTremor] = useState(0);
  const [esqueci, setEsqueci] = useState(false);

  const teclar = useCallback(
    (tecla: string) => {
      if (ocupado) return;
      if (tecla === "apagar") {
        setDigitos((d) => d.slice(0, -1));
        return;
      }
      if (digitos.length >= 4) return;
      const novo = digitos + tecla;
      setDigitos(novo);
      if (novo.length < 4) return;

      // Quatro números digitados: confere sozinho.
      setOcupado(true);
      setAviso(null);
      entrar(pessoa.id, novo).then((r) => {
        // Se deu certo, a tela troca sozinha quando o app carregar.
        if (r.ok) return;
        setDigitos("");
        setOcupado(false);
        if (r.motivo === "pin") {
          setTremor((t) => t + 1);
          setAviso(
            r.restam === undefined
              ? "PIN errado"
              : `PIN errado, restam ${r.restam} ${r.restam === 1 ? "tentativa" : "tentativas"}`,
          );
        } else if (r.motivo === "bloqueado") {
          setAviso(`Muitas tentativas. Tente de novo às ${horaCurta(r.ate)}`);
        } else {
          setAviso("Sem internet. Tente de novo");
        }
      });
    },
    [digitos, ocupado, pessoa.id],
  );

  // Teclado do computador: números e Backspace. Não age quando alguém digita num campo.
  useEffect(() => {
    if (esqueci) return;
    function tecla(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      if (e.key === "Backspace") {
        e.preventDefault();
        teclar("apagar");
      } else if (/^[0-9]$/.test(e.key)) {
        teclar(e.key);
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [esqueci, teclar]);

  if (esqueci) return <RecuperarPin aoVoltar={() => setEsqueci(false)} />;

  return (
    <Tela>
      <style>{estiloTremor}</style>
      <div className="entra flex flex-col items-center">
        <p className="text-[15px] text-body">Digite o PIN de</p>
        <Titulo>{pessoa.nome}</Titulo>

        <div
          key={tremor}
          role="group"
          aria-label={`${digitos.length} de 4 números digitados`}
          className={`mt-8 flex gap-4 ${tremor > 0 ? "tremer" : ""}`}
        >
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              aria-hidden
              className={`h-3.5 w-3.5 rounded-full transition-colors duration-150 ${i < digitos.length ? "bg-accent" : "bg-line-strong"}`}
            />
          ))}
        </div>

        <p aria-live="polite" className="mt-4 min-h-6 text-center text-[15px] text-red-ink">
          {aviso}
        </p>

        <div className="mt-4 grid w-full max-w-[280px] grid-cols-3 gap-4">
          {TECLAS.map((tecla, i) => {
            if (tecla === "") return <span key={i} aria-hidden />;
            if (tecla === "apagar") {
              return (
                <button
                  key={i}
                  type="button"
                  aria-label="Apagar"
                  disabled={ocupado}
                  onClick={() => teclar("apagar")}
                  className="vidro-leve aperta flex h-16 items-center justify-center rounded-full text-body disabled:opacity-40"
                >
                  <Backspace size={26} />
                </button>
              );
            }
            return (
              <button
                key={i}
                type="button"
                data-luz=""
                disabled={ocupado}
                onClick={() => teclar(tecla)}
                className="vidro-leve aperta num flex h-16 items-center justify-center rounded-full text-[28px] font-medium text-ink disabled:opacity-40"
              >
                {tecla}
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex w-full items-center justify-between">
          <Botao variante="fantasma" onClick={aoVoltar}>
            Trocar pessoa
          </Botao>
          {pessoa.papel === "dono" && (
            <Botao variante="fantasma" onClick={() => setEsqueci(true)}>
              Esqueci meu PIN
            </Botao>
          )}
        </div>
      </div>
    </Tela>
  );
}

/* Dono que esqueceu o PIN: manda o link para o e-mail cadastrado. */
function RecuperarPin({ aoVoltar }: { aoVoltar: () => void }) {
  const [email, setEmail] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    const falha = await pedirRecuperacao(email);
    setOcupado(false);
    if (falha) setErro(falha);
    else setEnviado(true);
  }

  return (
    <Tela>
      <div className="entra flex flex-col">
        <Titulo>Esqueci meu PIN</Titulo>
        {enviado ? (
          <p className="mt-3 text-[15px] text-body">Se o e-mail estiver certo, o link chega em instantes</p>
        ) : (
          <form onSubmit={enviar} className="mt-6 flex flex-col gap-4">
            <p className="text-[15px] text-body">Digite o e-mail do dono. Vamos mandar um link para você escolher um PIN novo.</p>
            <CampoTexto
              rotulo="E-mail"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {erro && <p className="text-[15px] text-red-ink">{erro}</p>}
            <Botao type="submit" variante="principal" className="h-12 w-full" disabled={ocupado || !email.includes("@")}>
              Enviar link
            </Botao>
          </form>
        )}
        <Botao variante="fantasma" className="mt-6 self-center" onClick={aoVoltar}>
          Voltar
        </Botao>
      </div>
    </Tela>
  );
}

/* ───────── Primeiro acesso: cria o dono ───────── */

function PrimeiroAcesso() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [repetir, setRepetir] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const pronto = nome.trim() !== "" && email.includes("@") && pin.length === 4 && repetir.length === 4;

  async function criar(e: FormEvent) {
    e.preventDefault();
    if (ocupado) return;
    if (pin !== repetir) {
      setErro("Os PINs não são iguais");
      return;
    }
    setOcupado(true);
    setErro(null);
    const falha = await criarPrimeiroDono(nome.trim(), pin, email);
    // Se deu certo, o app troca esta tela sozinho.
    if (falha) {
      setErro(falha);
      setOcupado(false);
    }
  }

  return (
    <Tela>
      <div className="entra flex flex-col">
        <Titulo>Primeiro acesso</Titulo>
        <p className="mt-3 text-[15px] text-body">Crie o acesso do dono da adega.</p>
        <form onSubmit={criar} className="mt-6 flex flex-col gap-4">
          <CampoTexto
            rotulo="Nome"
            autoComplete="name"
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
          <CampoTexto
            rotulo="E-mail"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            dica="Serve para recuperar o PIN se você esquecer"
          />
          <CampoTexto
            rotulo="PIN de 4 números"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            required
            value={pin}
            onChange={(e) => setPin(soPin(e.target.value))}
          />
          <CampoTexto
            rotulo="Repetir PIN"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            required
            value={repetir}
            onChange={(e) => setRepetir(soPin(e.target.value))}
          />
          {erro && (
            <p role="alert" className="text-[15px] text-red-ink">
              {erro}
            </p>
          )}
          <Botao type="submit" variante="principal" className="mt-2 h-12 w-full" disabled={!pronto || ocupado}>
            Criar acesso do dono
          </Botao>
        </form>
      </div>
    </Tela>
  );
}

/* ───────── Recuperação: o dono abriu o link do e-mail e escolhe um PIN novo ───────── */

export function NovoPin({ pessoaId }: { pessoaId: string }) {
  const [pin, setPin] = useState("");
  const [repetir, setRepetir] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const pronto = pin.length === 4 && repetir.length === 4;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!pronto || ocupado) return;
    if (pin !== repetir) {
      setErro("Os PINs não são iguais");
      return;
    }
    setOcupado(true);
    setErro(null);
    const falha = await trocarPin(pessoaId, pin);
    if (falha) {
      setErro(falha);
      setOcupado(false);
      return;
    }
    // Recarrega a página limpa: o app volta ao normal.
    window.location.replace("/");
  }

  return (
    <Tela>
      <div className="entra flex flex-col">
        <Titulo>Escolha um PIN novo</Titulo>
        <p className="mt-3 text-[15px] text-body">Ele vai ser usado para entrar daqui em diante.</p>
        <form onSubmit={salvar} className="mt-6 flex flex-col gap-4">
          <CampoTexto
            rotulo="PIN de 4 números"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            required
            value={pin}
            onChange={(e) => setPin(soPin(e.target.value))}
          />
          <CampoTexto
            rotulo="Repetir PIN"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            required
            value={repetir}
            onChange={(e) => setRepetir(soPin(e.target.value))}
          />
          {erro && (
            <p role="alert" className="text-[15px] text-red-ink">
              {erro}
            </p>
          )}
          <Botao type="submit" variante="principal" className="mt-2 h-12 w-full" disabled={!pronto || ocupado}>
            Salvar PIN
          </Botao>
        </form>
      </div>
    </Tela>
  );
}

/* Tremor do PIN errado: só transform, e some para quem pediu menos movimento. */
const estiloTremor = `
@media (prefers-reduced-motion: no-preference) {
  .tremer { animation: tremer 360ms ease-out; }
}
@keyframes tremer {
  20% { transform: translateX(-10px); }
  40% { transform: translateX(9px); }
  60% { transform: translateX(-6px); }
  80% { transform: translateX(3px); }
}
`;
