"use client";

import { useEffect, useMemo, useState } from "react";
import { CaretRight, Copy, MagnifyingGlass } from "@phosphor-icons/react";
import { reais } from "@/lib/dinheiro";
import { DIAS, formatarCep } from "@/lib/delivery";
import { buscarCep } from "@/lib/endereco";
import { marcarDelivery, salvarDelivery, useLoja } from "@/lib/loja";
import type { DiaHorario } from "@/lib/tipos";
import { Aviso, Botao, CampoDinheiro, CampoTexto, Cartao, Chave, Janela } from "@/components/ui";

const PADRAO: DiaHorario = { abre: "18:00", fecha: "02:00" };
const HORA = "num h-10 w-[5.5rem] rounded-[12px] bg-sunk px-2 text-center text-base text-ink ring-1 ring-line outline-none focus:ring-2 focus:ring-accent md:text-[15px]";

export function AjustesDelivery({ i }: { i: number }) {
  const loja = useLoja();
  const d = loja.delivery;
  const [minimo, setMinimo] = useState<number | null>(d.pedidoMinimo || null);
  const [taxa, setTaxa] = useState<number | null>(d.taxaEntrega || null);
  const [raio, setRaio] = useState(String(d.raioKm).replace(".", ","));
  const [mudarEndereco, setMudarEndereco] = useState(false);
  const [produtos, setProdutos] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // O endereço do site só existe no navegador.
  const [host, setHost] = useState("");
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setHost(window.location.host), []);

  const noCardapio = loja.produtos.filter((p) => p.ativo && p.delivery).length;
  const usaHorario = d.horario.length === 7;

  function salvarRaio() {
    const km = Number(raio.replace(",", "."));
    if (Number.isFinite(km) && km > 0 && km <= 50) {
      if (km !== d.raioKm) salvarDelivery({ raioKm: Math.round(km * 10) / 10 });
    } else setRaio(String(d.raioKm).replace(".", ","));
  }

  function mudarDia(dia: number, valor: DiaHorario) {
    salvarDelivery({ horario: d.horario.map((h, k) => (k === dia ? valor : h)) });
  }

  return (
    <section className="entra mt-8" style={{ "--i": i } as React.CSSProperties}>
      <h2 className="text-xl font-semibold tracking-tight text-ink">Delivery</h2>
      <p className="mt-1 mb-4 text-[15px] text-body">O cardápio online, onde o cliente faz o pedido pelo celular</p>

      <Cartao className="divide-y divide-line">
        <div className="p-4 md:px-5">
          <Chave
            ligada={d.aberto}
            aoMudar={(v) => salvarDelivery({ aberto: v })}
            rotulo="Aceitar pedidos"
            dica="Desligado, o cliente vê a loja fechada. Também dá para ligar e desligar na tela Delivery"
          />
        </div>
        <div className="flex items-center gap-3 p-4 md:px-5">
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] text-ink">Link do cardápio</span>
            <span className="block truncate text-[13px] text-muted">
              {host}/pedir
            </span>
          </span>
          <Botao
            className="h-10 shrink-0 px-3 text-sm"
            onClick={() => {
              const link = `${window.location.origin}/pedir`;
              void navigator.clipboard?.writeText(link).then(
                () => {
                  setAviso("Link copiado");
                  setTimeout(() => setAviso(null), 3000);
                },
                () => setAviso(link),
              );
            }}
          >
            <Copy size={16} className="shrink-0" />
            Copiar
          </Botao>
        </div>
        <div
          className="p-4 md:px-5"
          onBlur={() => {
            if ((minimo ?? 0) !== d.pedidoMinimo) salvarDelivery({ pedidoMinimo: minimo ?? 0 });
          }}
        >
          <CampoDinheiro rotulo="Pedido mínimo" valor={minimo} aoMudar={setMinimo} dica="Só os produtos contam, sem a taxa de entrega. Vazio = sem mínimo" />
        </div>
        <div className="p-4 md:px-5">
          <Chave ligada={d.retirada} aoMudar={(v) => salvarDelivery({ retirada: v })} rotulo="Retirar na loja" dica="O cliente pode escolher buscar o pedido, sem taxa" />
        </div>
      </Cartao>

      <h3 className="mt-6 text-[17px] font-medium text-ink">Horário</h3>
      <Cartao className="mt-3 divide-y divide-line">
        <div className="p-4 md:px-5">
          <Chave
            ligada={usaHorario}
            aoMudar={(v) => salvarDelivery({ horario: v ? DIAS.map(() => PADRAO) : [] })}
            rotulo="Usar horário de funcionamento"
            dica={usaHorario ? "Fora do horário, a página fica fechada sozinha" : "Sem horário, vale só a chave Aceitar pedidos"}
          />
        </div>
        {usaHorario &&
          DIAS.map((nome, dia) => {
            const h = d.horario[dia];
            return (
              <div key={nome} className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-5">
                <span className="w-20 text-[15px] text-ink">{nome}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!h}
                  aria-label={`${nome} aberto`}
                  onClick={() => mudarDia(dia, h ? null : PADRAO)}
                  className={`aperta h-8 rounded-full px-3 text-[13px] font-medium ${h ? "vidro-ambar" : "vidro-leve text-body"}`}
                >
                  {h ? "Aberto" : "Fechado"}
                </button>
                {h && (
                  <span className="flex items-center gap-2 text-[15px] text-body">
                    <input
                      type="time"
                      aria-label={`${nome}, abre às`}
                      defaultValue={h.abre}
                      onBlur={(e) => e.target.value && e.target.value !== h.abre && mudarDia(dia, { ...h, abre: e.target.value })}
                      className={HORA}
                    />
                    às
                    <input
                      type="time"
                      aria-label={`${nome}, fecha às`}
                      defaultValue={h.fecha}
                      onBlur={(e) => e.target.value && e.target.value !== h.fecha && mudarDia(dia, { ...h, fecha: e.target.value })}
                      className={HORA}
                    />
                  </span>
                )}
              </div>
            );
          })}
      </Cartao>
      {usaHorario && <p className="mt-2 text-[13px] text-muted">Fechando depois da meia-noite (ex.: 18:00 às 02:00), conta como a noite do dia em que abriu.</p>}

      <h3 className="mt-6 text-[17px] font-medium text-ink">Área de entrega</h3>
      <Cartao className="mt-3 divide-y divide-line">
        <button
          type="button"
          onClick={() => setMudarEndereco(true)}
          className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors duration-150 hover:bg-sunk md:px-5"
        >
          <span className="min-w-0">
            <span className="block text-[15px] text-ink">Sai de</span>
            <span className="block text-[13px] text-muted">
              {d.lojaLat === null ? "Endereço não definido: o cliente só consegue retirar na loja" : d.lojaEndereco}
            </span>
          </span>
          <CaretRight size={14} className="shrink-0 text-muted" />
        </button>
        <div className="grid gap-4 p-4 sm:grid-cols-2 md:px-5">
          <div onBlur={salvarRaio}>
            <CampoTexto
              rotulo="Raio atendido (km)"
              inputMode="decimal"
              maxLength={4}
              value={raio}
              onChange={(e) => setRaio(e.target.value.replace(/[^\d,.]/g, ""))}
              dica="Em linha reta a partir da adega"
            />
          </div>
          <div
            onBlur={() => {
              if ((taxa ?? 0) !== d.taxaEntrega) salvarDelivery({ taxaEntrega: taxa ?? 0 });
            }}
          >
            <CampoDinheiro rotulo="Taxa de entrega" valor={taxa} aoMudar={setTaxa} dica="Vazio = entrega grátis" />
          </div>
        </div>
      </Cartao>
      <p className="mt-2 text-[13px] text-muted">O cliente digita o CEP e o app confere a distância. Fora do raio, ele só consegue retirar na loja.</p>

      <h3 className="mt-6 text-[17px] font-medium text-ink">Cardápio</h3>
      <Cartao className="mt-3">
        <button
          type="button"
          onClick={() => setProdutos(true)}
          className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left md:px-5"
        >
          <span>
            <span className="block text-[15px] text-ink">Produtos no delivery</span>
            <span className="num block text-[13px] text-muted">
              {noCardapio === 0 ? "Nenhum produto marcado: o cardápio aparece vazio" : `${noCardapio} ${noCardapio === 1 ? "produto aparece" : "produtos aparecem"} para o cliente`}
            </span>
          </span>
          <CaretRight size={14} className="shrink-0 text-muted" />
        </button>
      </Cartao>
      <p className="mt-2 text-[13px] text-muted">Produto com estoque controlado e zerado some do cardápio sozinho.</p>

      {mudarEndereco && <JanelaEnderecoLoja aoFechar={() => setMudarEndereco(false)} />}
      {produtos && <JanelaProdutosDelivery aoFechar={() => setProdutos(false)} />}
      {aviso && (
        <Aviso>
          <p className="font-medium text-ink">{aviso}</p>
        </Aviso>
      )}
    </section>
  );
}

/* ───────── De onde sai a entrega ───────── */

function JanelaEnderecoLoja({ aoFechar }: { aoFechar: () => void }) {
  const [cep, setCep] = useState("");
  const [numero, setNumero] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const valido = cep.length === 8 && numero.trim().length > 0;

  async function salvar(fechar: () => void) {
    if (!valido || salvando) return;
    setSalvando(true);
    setErro(null);
    const r = await buscarCep(cep);
    setSalvando(false);
    if (r === undefined) return setErro("Não consegui consultar o CEP. Confira a internet.");
    if (r === null) return setErro("Esse CEP não existe");
    if (!r.ponto) return setErro("Esse CEP não tem localização no mapa. Tente o CEP da rua ao lado.");
    const lugar = [r.bairro, r.cidade].filter(Boolean).join(", ");
    void salvarDelivery({
      lojaEndereco: `${r.rua || "Endereço"}, ${numero.trim()}${lugar ? ` · ${lugar}` : ""}`,
      lojaLat: r.ponto.lat,
      lojaLng: r.ponto.lng,
    });
    fechar();
  }

  return (
    <Janela
      aberta
      aoFechar={aoFechar}
      titulo="Endereço da adega"
      rodape={(fechar) => (
        <Botao variante="principal" className="h-12 w-full" disabled={!valido || salvando} onClick={() => void salvar(fechar)}>
          {salvando ? "Conferindo o CEP" : "Salvar"}
        </Botao>
      )}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void salvar(aoFechar);
        }}
      >
        <p className="text-[15px] text-body">A distância até o cliente é medida a partir daqui.</p>
        <CampoTexto
          rotulo="CEP"
          inputMode="numeric"
          autoFocus
          placeholder="00000-000"
          value={formatarCep(cep)}
          onChange={(e) => setCep(e.target.value.replace(/\D/g, "").slice(0, 8))}
          erro={erro}
        />
        <CampoTexto rotulo="Número" inputMode="numeric" maxLength={10} value={numero} onChange={(e) => setNumero(e.target.value)} />
        <button type="submit" hidden />
      </form>
    </Janela>
  );
}

/* ───────── Quais produtos aparecem ───────── */

function JanelaProdutosDelivery({ aoFechar }: { aoFechar: () => void }) {
  const loja = useLoja();
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("todas");

  const lista = useMemo(() => {
    const termo = busca.toLowerCase().trim();
    return loja.produtos
      .filter((p) => p.ativo)
      .filter((p) => categoria === "todas" || p.categoriaId === categoria)
      .filter((p) => !termo || p.nome.toLowerCase().includes(termo))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [loja.produtos, categoria, busca]);
  const marcados = lista.filter((p) => p.delivery).length;
  const todos = lista.length > 0 && marcados === lista.length;

  return (
    <Janela aberta larga aoFechar={aoFechar} titulo="Produtos no delivery">
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex h-11 items-center gap-2 rounded-[14px] bg-sunk px-3 ring-1 ring-line focus-within:ring-2 focus-within:ring-accent sm:flex-1">
            <MagnifyingGlass size={18} className="text-muted" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar"
              aria-label="Buscar produto"
              className="h-full w-full bg-transparent text-base text-ink outline-none placeholder:text-muted md:text-sm"
            />
          </label>
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            aria-label="Categoria"
            className="h-11 rounded-[14px] bg-sunk px-3 text-base text-ink ring-1 ring-line outline-none focus:ring-2 focus:ring-accent md:text-sm"
          >
            <option value="todas">Todas as categorias</option>
            {loja.categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="num flex items-center justify-between gap-3">
          <p className="text-[13px] text-body">
            {marcados} de {lista.length} no cardápio
          </p>
          <Botao className="h-9 px-3 text-[13px]" disabled={lista.length === 0} onClick={() => void marcarDelivery(lista.map((p) => p.id), !todos)}>
            {todos ? "Tirar todos da lista" : "Pôr todos da lista"}
          </Botao>
        </div>
        <ul className="divide-y divide-line rounded-[16px] bg-sunk px-4 ring-1 ring-line">
          {lista.map((p) => (
            <li key={p.id} className="py-3">
              <Chave
                ligada={p.delivery}
                aoMudar={(v) => void marcarDelivery([p.id], v)}
                rotulo={p.nome}
                dica={`${reais(p.preco)}${p.estoque !== null ? ` · ${p.estoque <= 0 ? "acabou" : `${p.estoque} em estoque`}` : ""}`}
              />
            </li>
          ))}
        </ul>
      </div>
    </Janela>
  );
}

