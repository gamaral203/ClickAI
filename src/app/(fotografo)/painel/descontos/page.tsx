import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";

import { ListaCupons, type CupomNoFormulario } from "@/components/painel/cupons";
import { EditorFaixas } from "@/components/painel/editor-faixas";
import {
  listarCuponsDoFotografo,
  listarEventosDoFotografo,
  listarFaixas,
  type Cupom,
} from "@/dados";
import { isoParaCampo } from "@/lib/datas";
import { centavosParaCampo } from "@/lib/dinheiro";
import { formatarData, formatarPreco } from "@/lib/formatar";
import { exigirFotografo } from "@/servicos/sessao";

export const metadata: Metadata = {
  title: "Descontos e cupons",
  robots: { index: false, follow: false },
};

export default function PaginaDescontos() {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-bold tracking-tight">Descontos e cupons</h1>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

function resumoDoCupom(c: Cupom) {
  const desconto =
    c.tipo === "percentual"
      ? `${c.valor}% de desconto`
      : c.tipo === "valor"
        ? `${formatarPreco(c.valor)} de desconto`
        : `${c.valor} ${c.valor === 1 ? "foto grátis" : "fotos grátis"}`;
  const minimo =
    c.minimoTipo === "valor"
      ? ` em compras a partir de ${formatarPreco(c.minimoValor)}`
      : c.minimoTipo === "quantidade"
        ? ` a partir de ${c.minimoValor} itens`
        : "";
  return desconto + minimo;
}

function situacaoDoCupom(c: Cupom, agora: number) {
  if (!c.ativo) return "pausado";
  if (new Date(c.inicioEm).getTime() > agora) return `começa em ${formatarData(c.inicioEm)}`;
  if (c.expiraEm && new Date(c.expiraEm).getTime() <= agora) return "vencido";
  if (c.usosMax !== null && c.usos >= c.usosMax) return `esgotado (${c.usos} usos)`;
  const usos = `${c.usos}${c.usosMax !== null ? ` de ${c.usosMax}` : ""} ${c.usos === 1 ? "uso" : "usos"}`;
  return c.expiraEm ? `${usos}, vale até ${formatarData(c.expiraEm)}` : usos;
}

/** Hora atual, lida depois de esperar a requisição (Cache Components). */
async function instanteAtual() {
  await connection();
  return Date.now();
}

async function Conteudo() {
  const { conta } = await exigirFotografo("/painel/descontos");
  const agora = await instanteAtual();
  const [faixas, cupons, eventos] = await Promise.all([
    listarFaixas(conta.id, null),
    listarCuponsDoFotografo(conta.id),
    listarEventosDoFotografo(conta.id),
  ]);

  const paraFormulario = (c: Cupom): CupomNoFormulario => ({
    id: c.id,
    codigo: c.codigo,
    tipo: c.tipo,
    valor: c.tipo === "valor" ? centavosParaCampo(c.valor) : String(c.valor),
    usosMax: c.usosMax === null ? "" : String(c.usosMax),
    usos: c.usos,
    inicioEm: isoParaCampo(c.inicioEm),
    expiraEm: c.expiraEm ? isoParaCampo(c.expiraEm) : "",
    minimoTipo: c.minimoTipo,
    minimoValor:
      c.minimoTipo === "valor"
        ? centavosParaCampo(c.minimoValor)
        : c.minimoTipo === "quantidade"
          ? String(c.minimoValor)
          : "",
    todosEventos: c.todosEventos,
    eventoIds: c.eventoIds,
    ativo: c.ativo,
    resumo: resumoDoCupom(c),
    situacao: situacaoDoCupom(c, agora),
  });

  return (
    <>
      <section className="flex flex-col gap-4 rounded-xl border p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">Desconto progressivo padrão</h2>
          <p className="text-sm text-muted-foreground">
            Quanto mais fotos do mesmo evento a pessoa leva, maior o desconto. Vale para todos os
            seus eventos, menos os que têm faixas próprias. Só para fotos: vídeos e fotos do pacote
            não entram.
          </p>
        </div>
        <EditorFaixas
          eventoId={null}
          inicial={(faixas ?? []).map((f) => ({
            quantidadeMin: f.quantidadeMin,
            descontoPct: f.descontoPct,
          }))}
          semFaixas="Sem desconto progressivo: cada foto sai pelo preço cheio."
        />
      </section>

      <section className="flex flex-col gap-4 rounded-xl border p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">Cupons</h2>
          <p className="text-sm text-muted-foreground">
            O cupom vale só nas fotos e vídeos dos seus eventos e é aplicado depois do desconto
            progressivo. Não se combina com o pacote.
          </p>
        </div>
        <ListaCupons
          cupons={cupons.map(paraFormulario)}
          eventos={eventos.map((e) => ({ id: e.id, titulo: e.titulo }))}
          agoraCampo={isoParaCampo(new Date(agora).toISOString())}
        />
      </section>
    </>
  );
}
