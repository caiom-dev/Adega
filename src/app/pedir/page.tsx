"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loja } from "@/components/pedir/Loja";
import { Acompanhar } from "@/components/pedir/Acompanhar";

/*
 * Página pública do delivery (sem login).
 * /pedir          → cardápio e carrinho
 * /pedir?p=<código> → acompanhamento de um pedido
 */
export default function PedirPage() {
  return (
    <Suspense>
      <Pedir />
    </Suspense>
  );
}

function Pedir() {
  const token = useSearchParams().get("p");
  return <div className="tela">{token ? <Acompanhar key={token} token={token} /> : <Loja />}</div>;
}
