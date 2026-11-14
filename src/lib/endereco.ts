import type { Ponto } from "./pedidos";

/*
 * Busca de endereço pelo CEP, direto do aparelho de quem pede.
 * A AwesomeAPI traz rua, bairro e a localização; o ViaCEP fica de reserva quando ela falha
 * (aí vem só o endereço, sem a localização).
 */

export interface EnderecoCep {
  cep: string;
  rua: string;
  bairro: string;
  cidade: string;
  uf: string;
  ponto: Ponto | null;
}

async function json(url: string): Promise<Record<string, unknown> | null> {
  const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (r.status === 404 || r.status === 400) return null;
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as Record<string, unknown>;
}

/** null = CEP não existe; undefined = não deu para consultar (internet ou serviço fora). */
export async function buscarCep(texto: string): Promise<EnderecoCep | null | undefined> {
  const cep = texto.replace(/\D/g, "");
  if (cep.length !== 8) return null;
  try {
    const a = await json(`https://cep.awesomeapi.com.br/json/${cep}`);
    if (a && a.cep) {
      const lat = Number(a.lat);
      const lng = Number(a.lng);
      return {
        cep,
        rua: String(a.address ?? ""),
        bairro: String(a.district ?? ""),
        cidade: String(a.city ?? ""),
        uf: String(a.state ?? ""),
        ponto: a.lat && a.lng && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
      };
    }
  } catch {
    // Tenta o ViaCEP abaixo.
  }
  try {
    const v = await json(`https://viacep.com.br/ws/${cep}/json/`);
    if (!v || v.erro) return null;
    return { cep, rua: String(v.logradouro ?? ""), bairro: String(v.bairro ?? ""), cidade: String(v.localidade ?? ""), uf: String(v.uf ?? ""), ponto: null };
  } catch {
    return undefined;
  }
}

/** Localização pelo GPS do celular. null = a pessoa não deixou ou o aparelho não conseguiu. */
export function minhaLocalizacao(): Promise<Ponto | null> {
  return new Promise((ok) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return ok(null);
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => ok(null),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}
