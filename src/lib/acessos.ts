"use client";

import { banco } from "./banco";
import type { Papel } from "./tipos";

/*
 * Entrada por PIN e cadastro de pessoas. Quem confere o PIN é o banco:
 * o app nunca recebe o PIN de ninguém, só a resposta "bateu" ou "não bateu".
 * Depois de entrar ou sair, useLoja() muda de situação sozinho.
 */

export interface PessoaLogin {
  id: string;
  nome: string;
  papel: Papel;
}

export interface PessoaCadastro extends PessoaLogin {
  /** Preenchido enquanto a pessoa está bloqueada por errar o PIN. */
  bloqueadoAte: string | null;
}

export type RespostaEntrada =
  | { ok: true }
  /** PIN errado. "restam" = tentativas antes de bloquear. */
  | { ok: false; motivo: "pin"; restam?: number }
  /** Bloqueado até o horário "ate" (ISO). */
  | { ok: false; motivo: "bloqueado"; ate: string }
  | { ok: false; motivo: "rede" };

const MENSAGENS: Record<string, string> = {
  pin_invalido: "O PIN precisa ter 4 números",
  email_invalido: "Esse e-mail não parece certo",
  email_em_uso: "Esse e-mail já está em uso",
  nome_em_uso: "Já existe alguém com esse nome",
  ultimo_dono: "Precisa ficar pelo menos um dono",
  ja_configurado: "O primeiro acesso já foi feito. Recarregue a página",
  so_dono: "Só o dono pode fazer isso",
};
const SEM_REDE = "Não consegui falar com o sistema. Confira a internet";

/** Mensagem pronta para mostrar na tela, ou null se deu certo. */
function mensagem(erro: { message?: string } | null): string | null {
  if (!erro) return null;
  const codigo = Object.keys(MENSAGENS).find((c) => erro.message?.includes(c));
  return codigo ? MENSAGENS[codigo] : SEM_REDE;
}

async function chamar(funcao: string, parametros?: Record<string, unknown>): Promise<string | null> {
  try {
    return mensagem((await banco.rpc(funcao, parametros)).error);
  } catch {
    return SEM_REDE;
  }
}

/** Nomes para a tela de entrada. Lista vazia = ninguém cadastrado ainda (primeiro acesso). null = sem internet. */
export async function pessoasParaEntrar(): Promise<PessoaLogin[] | null> {
  try {
    const { data, error } = await banco.rpc("pessoas_login");
    return error ? null : (data as PessoaLogin[]);
  } catch {
    return null;
  }
}

export async function entrar(pessoaId: string, pin: string): Promise<RespostaEntrada> {
  try {
    const { data, error } = await banco.rpc("entrar", { p_pessoa: pessoaId, p_pin: pin });
    if (error) return { ok: false, motivo: "rede" };
    if (!data.ok) return data as RespostaEntrada;
    const sessao = await banco.auth.signInWithPassword({ email: data.email, password: data.senha });
    return sessao.error ? { ok: false, motivo: "rede" } : { ok: true };
  } catch {
    return { ok: false, motivo: "rede" };
  }
}

export async function sair() {
  await banco.auth.signOut();
}

/** Primeiro acesso: cria o dono e já entra. Devolve a mensagem de erro, ou null se deu certo. */
export async function criarPrimeiroDono(nome: string, pin: string, email: string): Promise<string | null> {
  try {
    const { data, error } = await banco.rpc("criar_primeiro_dono", { p_nome: nome, p_pin: pin, p_email: email.trim() });
    if (error) return mensagem(error);
    const resposta = await entrar(data as string, pin);
    return resposta.ok ? null : SEM_REDE;
  } catch {
    return SEM_REDE;
  }
}

/** Manda para o e-mail do dono o link para escolher um PIN novo. */
export async function pedirRecuperacao(email: string): Promise<string | null> {
  try {
    const { error } = await banco.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    return error ? "Não consegui enviar o e-mail. Tente de novo em alguns minutos" : null;
  } catch {
    return SEM_REDE;
  }
}

/* Cadastro de pessoas (só o dono) */

export async function listarPessoas(): Promise<PessoaCadastro[] | null> {
  try {
    const { data, error } = await banco.from("pessoas").select("id,nome,papel,bloqueado_ate").eq("ativo", true).order("nome");
    if (error) return null;
    const agora = Date.now();
    return data.map((p) => ({
      id: p.id,
      nome: p.nome,
      papel: p.papel as Papel,
      bloqueadoAte: p.bloqueado_ate && new Date(p.bloqueado_ate).getTime() > agora ? p.bloqueado_ate : null,
    }));
  } catch {
    return null;
  }
}

/* As funções abaixo devolvem a mensagem de erro para mostrar, ou null se deu certo. */

export const criarPessoa = (nome: string, papel: Papel, pin: string) =>
  chamar("criar_pessoa", { p_nome: nome, p_papel: papel, p_pin: pin });

/** O dono troca o PIN de qualquer pessoa; cada um pode trocar o próprio. */
export const trocarPin = (pessoaId: string, pin: string) => chamar("trocar_pin", { p_pessoa: pessoaId, p_pin: pin });

export const desbloquearPessoa = (pessoaId: string) => chamar("desbloquear_pessoa", { p_pessoa: pessoaId });

export const removerPessoa = (pessoaId: string) => chamar("remover_pessoa", { p_pessoa: pessoaId });

/** E-mail de recuperação do dono logado. null se não tem. */
export async function meuEmail(): Promise<string | null> {
  try {
    return ((await banco.rpc("meu_email")).data as string | null) ?? null;
  } catch {
    return null;
  }
}

export const definirMeuEmail = (email: string) => chamar("definir_meu_email", { p_email: email.trim() });
