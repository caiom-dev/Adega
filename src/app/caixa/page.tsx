"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { reais } from "@/lib/dinheiro";
import type { Venda } from "@/lib/tipos";
import { Aviso } from "@/components/ui";
import { MapaLugares } from "@/components/caixa/MapaLugares";
import { TelaVenda } from "@/components/caixa/TelaVenda";

/*
 * /caixa          → mesas e balcões
 * /caixa?c=mesa-3 → venda da mesa 3
 * Fica tudo na mesma página (e não em /caixa/mesa-3) para o PWA abrir offline
 * e o botão voltar do celular voltar para as mesas.
 */
export default function CaixaPage() {
  return (
    <Suspense>
      <Caixa />
    </Suspense>
  );
}

function Caixa() {
  const params = useSearchParams();
  const id = params.get("c");
  const [aviso, setAviso] = useState<Venda | null>(null);

  function mostrarAviso(venda: Venda) {
    setAviso(venda);
    setTimeout(() => setAviso((a) => (a?.id === venda.id ? null : a)), 4000);
  }

  return (
    <>
      {/* A chave refaz a animação de entrada ao trocar entre as mesas e uma venda */}
      <div key={id ?? "mapa"} className="tela">
        {id ? <TelaVenda id={id} aoVender={mostrarAviso} /> : <MapaLugares />}
      </div>

      {aviso && (
        <Aviso>
          <p className="font-medium text-ink">
            Venda nº {aviso.numero} registrada · {aviso.comandaNome}
          </p>
          <p className="num text-body">
            {reais(aviso.total)}
            {aviso.troco > 0 && ` · troco de ${reais(aviso.troco)}`}
          </p>
        </Aviso>
      )}
    </>
  );
}
