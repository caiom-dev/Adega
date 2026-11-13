"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "@phosphor-icons/react";
import { useLoja } from "@/lib/loja";
import {
  criarPessoa,
  definirMeuEmail,
  desbloquearPessoa,
  listarPessoas,
  meuEmail,
  removerPessoa,
  trocarPin,
  type PessoaCadastro,
} from "@/lib/acessos";
import type { Papel } from "@/lib/tipos";
import { Aviso, Botao, CampoTexto, Cartao, Janela, Segmentado } from "@/components/ui";

const rotuloPapel = (papel: Papel) => (papel === "dono" ? "Dono" : "Atendente");

/** Mensagem de erro do PIN, ou null se está certo. */
function validarPin(pin: string, repetir: string): string | null {
  if (!/^\d{4}$/.test(pin)) return "O PIN precisa ter 4 números";
  if (pin !== repetir) return "Os dois PINs estão diferentes";
  return null;
}

const soDigitos = (valor: string) => valor.replace(/\D/g, "").slice(0, 4);

function CamposPin({
  pin,
  repetir,
  aoMudarPin,
  aoMudarRepetir,
}: {
  pin: string;
  repetir: string;
  aoMudarPin: (v: string) => void;
  aoMudarRepetir: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <CampoTexto
        rotulo="PIN"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        placeholder="4 números"
        value={pin}
        onChange={(e) => aoMudarPin(soDigitos(e.target.value))}
      />
      <CampoTexto
        rotulo="Repita o PIN"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        placeholder="4 números"
        value={repetir}
        onChange={(e) => aoMudarRepetir(soDigitos(e.target.value))}
      />
    </div>
  );
}

function JanelaNovaPessoa({ aoFechar, aoCriar }: { aoFechar: () => void; aoCriar: () => void }) {
  const [nome, setNome] = useState("");
  const [papel, setPapel] = useState<Papel>("atendente");
  const [pin, setPin] = useState("");
  const [repetir, setRepetir] = useState("");
  const [tentou, setTentou] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const nomeLimpo = nome.trim();
  const erroNome = tentou && !nomeLimpo ? "Informe o nome" : null;
  const erroPin = tentou ? validarPin(pin, repetir) : null;
  const mensagem = erro ?? erroPin;

  async function salvar(fechar: () => void) {
    setTentou(true);
    setErro(null);
    if (!nomeLimpo || validarPin(pin, repetir)) return;
    setEnviando(true);
    const msg = await criarPessoa(nomeLimpo, papel, pin);
    setEnviando(false);
    if (msg) return setErro(msg);
    fechar();
    aoCriar();
  }

  return (
    <Janela
      aberta
      aoFechar={aoFechar}
      titulo="Nova pessoa"
      rodape={(fechar) => (
        <Botao variante="principal" className="h-12 w-full" disabled={enviando} onClick={() => salvar(fechar)}>
          {enviando ? "Salvando..." : "Criar pessoa"}
        </Botao>
      )}
    >
      <div className="space-y-4">
        <CampoTexto
          rotulo="Nome"
          maxLength={40}
          placeholder="Nome da pessoa"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          autoFocus
          erro={erroNome}
        />

        <div>
          <span className="mb-2 block text-[13px] text-body">Papel</span>
          <Segmentado
            rotulo="Papel"
            opcoes={[
              { id: "atendente", nome: "Atendente" },
              { id: "dono", nome: "Dono" },
            ]}
            valor={papel}
            aoMudar={setPapel}
          />
          <p className="mt-2 text-[13px] text-muted">Atendente usa só o caixa. Dono vê tudo.</p>
        </div>

        <CamposPin pin={pin} repetir={repetir} aoMudarPin={setPin} aoMudarRepetir={setRepetir} />
        {mensagem && <p className="aparece text-[13px] text-red-ink">{mensagem}</p>}
      </div>
    </Janela>
  );
}

/** Janela de uma pessoa: troca o PIN e, para os outros, remove. Também serve para "Trocar meu PIN". */
export function JanelaPessoa({
  pessoa,
  euMesmo,
  titulo,
  aoFechar,
  aoMudou,
}: {
  pessoa: { id: string; nome: string };
  euMesmo: boolean;
  titulo?: string;
  aoFechar: () => void;
  aoMudou: (texto: string, erro?: boolean) => void;
}) {
  const [pin, setPin] = useState("");
  const [repetir, setRepetir] = useState("");
  const [tentou, setTentou] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [confirmarRemocao, setConfirmarRemocao] = useState(false);

  const erroPin = tentou ? validarPin(pin, repetir) : null;
  const mensagem = erro ?? erroPin;

  async function trocar(fechar: () => void) {
    setTentou(true);
    setErro(null);
    if (validarPin(pin, repetir)) return;
    setEnviando(true);
    const msg = await trocarPin(pessoa.id, pin);
    setEnviando(false);
    if (msg) return setErro(msg);
    fechar();
    aoMudou(euMesmo ? "Seu PIN foi trocado" : `PIN de ${pessoa.nome} trocado`);
  }

  async function remover(fechar: () => void) {
    setErro(null);
    setEnviando(true);
    const msg = await removerPessoa(pessoa.id);
    setEnviando(false);
    if (msg) return setErro(msg);
    fechar();
    aoMudou(`${pessoa.nome} foi removido`);
  }

  return (
    <Janela
      aberta
      aoFechar={aoFechar}
      titulo={titulo ?? pessoa.nome}
      rodape={(fechar) => (
        <div className="flex gap-2">
          {!euMesmo &&
            (confirmarRemocao ? (
              <Botao variante="perigo" className="aparece h-12" disabled={enviando} onClick={() => remover(fechar)}>
                Remover mesmo?
              </Botao>
            ) : (
              <Botao
                variante="fantasma"
                className="h-12 text-red-ink hover:text-red-ink"
                onClick={() => setConfirmarRemocao(true)}
              >
                Remover
              </Botao>
            ))}
          <Botao variante="principal" className="h-12 flex-1" disabled={enviando} onClick={() => trocar(fechar)}>
            {enviando ? "Salvando..." : "Trocar PIN"}
          </Botao>
        </div>
      )}
    >
      <div className="space-y-4">
        <p className="text-[15px] text-body">Escolha um PIN novo de 4 números.</p>
        <CamposPin pin={pin} repetir={repetir} aoMudarPin={setPin} aoMudarRepetir={setRepetir} />
        {mensagem && <p className="aparece text-[13px] text-red-ink">{mensagem}</p>}
        {!euMesmo && (
          <p className="text-[13px] text-muted">
            {confirmarRemocao ? "A pessoa deixa de aparecer e perde o acesso." : "Remover tira o acesso dessa pessoa ao sistema."}
          </p>
        )}
      </div>
    </Janela>
  );
}

export function Pessoas() {
  const loja = useLoja();
  const euId = loja.pessoa?.id;
  const dono = loja.pessoa?.papel === "dono";

  // undefined = carregando, null = falhou
  const [pessoas, setPessoas] = useState<PessoaCadastro[] | null | undefined>(undefined);
  const [selecionada, setSelecionada] = useState<PessoaCadastro | null>(null);
  const [novaAberta, setNovaAberta] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [email, setEmail] = useState("");
  const [enviandoEmail, setEnviandoEmail] = useState(false);

  const carregar = useCallback(() => {
    listarPessoas().then(setPessoas);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (!dono) return;
    let ativo = true;
    meuEmail().then((e) => {
      if (ativo) setEmail(e ?? "");
    });
    return () => {
      ativo = false;
    };
  }, [dono]);

  function avisar(texto: string, erro?: boolean) {
    setAviso({ texto, erro });
    setTimeout(() => setAviso(null), 4000);
  }

  async function desbloquear(id: string) {
    const msg = await desbloquearPessoa(id);
    avisar(msg ?? "Pessoa desbloqueada", !!msg);
    carregar();
  }

  async function salvarEmail() {
    setEnviandoEmail(true);
    const msg = await definirMeuEmail(email);
    setEnviandoEmail(false);
    avisar(msg ?? "E-mail salvo", !!msg);
  }

  return (
    <section className="entra mt-8 first:mt-0" style={{ "--i": 0 } as React.CSSProperties}>
      <h2 className="text-xl font-semibold tracking-tight text-ink">Pessoas</h2>
      <p className="mt-1 mb-4 text-[15px] text-body">Quem usa o caixa. Cada pessoa entra com o próprio PIN</p>

      {pessoas === undefined && <p className="text-[15px] text-muted">Carregando...</p>}

      {pessoas === null && (
        <Cartao className="p-5">
          <p className="text-[15px] text-ink">Não consegui carregar. Confira a internet</p>
          <Botao
            className="mt-3 h-11"
            onClick={() => {
              setPessoas(undefined);
              carregar();
            }}
          >
            Tentar de novo
          </Botao>
        </Cartao>
      )}

      {pessoas && (
        <Cartao>
          <ul className="divide-y divide-line">
            {pessoas.map((p) => (
              <li key={p.id} className="flex items-center gap-2 pr-3">
                <button
                  type="button"
                  onClick={() => setSelecionada(p)}
                  className="aperta flex min-h-14 min-w-0 flex-1 items-center justify-between gap-3 py-2 pl-5 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] text-ink">
                      {p.nome}
                      {p.id === euId && <span className="text-muted"> (você)</span>}
                    </span>
                    <span className="block text-[13px] text-muted">{rotuloPapel(p.papel)}</span>
                  </span>
                  {p.bloqueadoAte && (
                    <span className="shrink-0 rounded-full bg-red-soft px-2 py-0.5 text-xs font-medium text-red-ink">Bloqueado</span>
                  )}
                </button>
                {p.bloqueadoAte && dono && (
                  <Botao className="h-9 shrink-0 px-3 text-[13px]" onClick={() => desbloquear(p.id)}>
                    Desbloquear
                  </Botao>
                )}
              </li>
            ))}
          </ul>
          {dono && (
            <div className="border-t border-line p-3">
              <Botao className="h-11 w-full" onClick={() => setNovaAberta(true)}>
                <Plus size={16} weight="bold" />
                Nova pessoa
              </Botao>
            </div>
          )}
        </Cartao>
      )}

      {dono && (
        <div className="mt-6">
          <CampoTexto
            rotulo="E-mail de recuperação"
            type="email"
            inputMode="email"
            placeholder="seuemail@exemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="mt-3 flex">
            <Botao className="h-11" disabled={enviandoEmail} onClick={salvarEmail}>
              {enviandoEmail ? "Salvando..." : "Salvar"}
            </Botao>
          </div>
          <p className="mt-2 text-[13px] text-muted">Se você esquecer o PIN, o link para criar outro chega nesse e-mail.</p>
        </div>
      )}

      {selecionada && (
        <JanelaPessoa
          key={selecionada.id}
          pessoa={selecionada}
          euMesmo={selecionada.id === euId}
          aoFechar={() => setSelecionada(null)}
          aoMudou={(texto, erro) => {
            avisar(texto, erro);
            carregar();
          }}
        />
      )}

      {novaAberta && (
        <JanelaNovaPessoa
          aoFechar={() => setNovaAberta(false)}
          aoCriar={() => {
            avisar("Pessoa criada");
            carregar();
          }}
        />
      )}

      {aviso && (
        <Aviso>
          <p className={`font-medium ${aviso.erro ? "text-red-ink" : "text-ink"}`}>{aviso.texto}</p>
        </Aviso>
      )}
    </section>
  );
}
