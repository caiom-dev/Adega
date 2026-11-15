"use client";

import { useEffect, useState } from "react";
import { BellRinging } from "@phosphor-icons/react";
import { desligarPush, estadoPush, ligarPush, testarPush, type EstadoPush } from "@/lib/notificacoes";
import { Botao, Cartao, Chave } from "@/components/ui";

const DICA: Record<EstadoPush, string> = {
  ligado: "Este aparelho recebe o lembrete das contas às 8h, mesmo com o app fechado",
  desligado: "Ligue para receber o lembrete das contas às 8h, mesmo com o app fechado",
  bloqueado: "A notificação está bloqueada neste navegador. Libere nas configurações do site e volte aqui",
  instalar: "No iPhone, instale o app na tela de início (Compartilhar › Adicionar à Tela de Início) e abra por lá",
  "sem-suporte": "Este navegador não recebe notificação com o app fechado",
};

/** Ligar a notificação do lembrete neste aparelho e mandar um teste. */
export function AjustesLembretes({ avisar }: { avisar: (texto: string, erro?: boolean) => void }) {
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    void estadoPush().then((e) => vivo && setEstado(e));
    return () => {
      vivo = false;
    };
  }, []);

  async function mudar(ligar: boolean) {
    setOcupado(true);
    if (ligar) {
      const erro = await ligarPush();
      if (erro) avisar(erro, true);
      else avisar("Notificação ligada neste aparelho");
    } else {
      await desligarPush().catch(() => undefined);
      avisar("Notificação desligada neste aparelho");
    }
    setEstado(await estadoPush());
    setOcupado(false);
  }

  async function testar() {
    setOcupado(true);
    const erro = await testarPush();
    setOcupado(false);
    avisar(erro ?? "Teste enviado. A notificação chega em alguns segundos", !!erro);
  }

  return (
    <Cartao className="space-y-4 p-4 md:p-5">
      <Chave
        ligada={estado === "ligado"}
        disabled={!estado || ocupado || estado === "sem-suporte" || estado === "instalar" || estado === "bloqueado"}
        aoMudar={(v) => void mudar(v)}
        rotulo="Notificação neste aparelho"
        dica={estado ? DICA[estado] : "Conferindo este aparelho"}
      />
      {estado === "ligado" && (
        <Botao className="h-10" disabled={ocupado} onClick={() => void testar()}>
          <BellRinging size={18} />
          Mandar um teste
        </Botao>
      )}
      <p className="border-t border-line pt-4 text-[13px] text-muted">
        O lembrete sai 3 dias antes, 1 dia antes e no dia do vencimento, e todo dia enquanto a conta estiver vencida.
        Também chega no e-mail de recuperação do dono, cadastrado em Sua conta.
      </p>
    </Cartao>
  );
}
