"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Loader2, Package, ShoppingCart, Trash2 } from "lucide-react";

import { obterCarrinho } from "@/app/(cliente)/carrinho/acoes";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatarPreco } from "@/lib/formatar";
import type { ResumoCarrinho } from "@/servicos/carrinho";

import {
  descartarPacotes,
  manterNoCarrinho,
  removerDoCarrinho,
  removerPacote,
  useCarrinho,
  usePacotes,
} from "./carrinho";

type Estado =
  | { tipo: "carregando" }
  | { tipo: "erro" }
  | { tipo: "pronto"; chave: string; resumo: ResumoCarrinho };

export function ConteudoCarrinho() {
  const ids = useCarrinho();
  const pacotes = usePacotes();
  const chave = `${ids.join(",")}|${pacotes.map((p) => p.token).join(",")}`;
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [avisoIndisponiveis, setAvisoIndisponiveis] = useState(0);
  const [avisoPacote, setAvisoPacote] = useState(false);

  useEffect(() => {
    if (ids.length === 0) return;
    let ativo = true;
    const chaveAtual = chave;
    obterCarrinho([...ids], { pacotes: pacotes.map((p) => p.token) })
      .then((resumo) => {
        if (!ativo) return;
        if (!resumo) return setEstado({ tipo: "erro" });
        if (resumo.indisponiveis.length > 0) {
          // Tira do carrinho o que saiu de venda e avisa uma vez.
          setAvisoIndisponiveis(resumo.indisponiveis.length);
          manterNoCarrinho(resumo.grupos.flatMap((g) => g.itens.map((i) => i.fotoId)));
        }
        const recusados = pacotes
          .map((p) => p.eventoId)
          .filter((id) => !resumo.pacotesAplicados.includes(id));
        if (recusados.length > 0) {
          // Pacote vencido, alterado ou com fotos tiradas do carrinho: volta ao preço normal.
          setAvisoPacote(true);
          descartarPacotes(recusados);
        }
        setEstado({ tipo: "pronto", chave: chaveAtual, resumo });
      })
      .catch(() => ativo && setEstado({ tipo: "erro" }));
    return () => {
      ativo = false;
    };
    // `chave` resume `ids`; evita refazer a busca quando só a referência muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  if (ids.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed p-10 text-center">
        <ShoppingCart aria-hidden="true" className="size-10 text-muted-foreground" />
        <p className="text-lg font-semibold">Seu carrinho está vazio</p>
        {avisoIndisponiveis > 0 && <AvisoIndisponiveis quantidade={avisoIndisponiveis} />}
        <Link href="/eventos" className={buttonVariants({ size: "touch" })}>
          Encontrar meu evento
        </Link>
      </div>
    );
  }

  if (estado.tipo === "erro") {
    return (
      <p role="alert" className="rounded-xl border border-destructive/30 p-6 text-destructive">
        Não foi possível carregar o carrinho. Atualize a página para tentar de novo.
      </p>
    );
  }

  // Enquanto o servidor recalcula, mostra o último resultado (se houver) esmaecido.
  const atualizando = estado.tipo === "carregando" || estado.chave !== chave;
  if (estado.tipo === "carregando") {
    return (
      <p className="flex items-center gap-2 text-muted-foreground" role="status">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        Calculando o carrinho…
      </p>
    );
  }

  const { resumo } = estado;
  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)] gap-8 transition-opacity data-[atualizando=true]:opacity-60 lg:grid-cols-[minmax(0,1fr)_300px]"
      data-atualizando={atualizando}
      aria-busy={atualizando}
    >
      <div className="flex flex-col gap-6">
        {avisoIndisponiveis > 0 && <AvisoIndisponiveis quantidade={avisoIndisponiveis} />}
        {avisoPacote && (
          <p
            role="status"
            className="rounded-lg bg-accent px-4 py-3 text-sm text-accent-foreground"
          >
            Um pacote deixou de valer (ele venceu ou você tirou fotos dele). As fotos continuam no
            carrinho, com o preço normal.
          </p>
        )}
        {resumo.grupos.map((grupo) => {
          const temPacote = grupo.itens.some((i) => i.viaPacote);
          return (
            <section key={grupo.eventoId} className="flex flex-col gap-3 rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">
                  <Link
                    href={`/eventos/${grupo.eventoSlug}`}
                    className="-my-2 inline-block py-2 hover:underline"
                  >
                    {grupo.eventoTitulo}
                  </Link>
                </h2>
                {temPacote && (
                  <span className="flex items-center gap-2 text-sm">
                    <span className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
                      <Package aria-hidden="true" className="size-3.5" />
                      Pacote
                    </span>
                    <Button
                      variant="link"
                      className="h-11 px-1"
                      onClick={() => removerPacote(grupo.eventoId)}
                    >
                      Tirar o pacote
                    </Button>
                  </span>
                )}
              </div>
              <ul className="flex flex-col divide-y">
                {grupo.itens.map((item) => (
                  <li key={item.fotoId} className="flex items-center gap-2.5 py-3 sm:gap-4">
                    <Link
                      href={`/fotos/${item.fotoId}`}
                      className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-muted sm:size-16"
                    >
                      <Image
                        src={item.urlMiniatura}
                        alt={item.tipo === "video" ? "Vídeo" : "Foto"}
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    </Link>
                    <span className="flex min-w-0 flex-1 flex-col text-sm text-muted-foreground">
                      {item.tipo === "video" ? "Vídeo" : "Foto"} em alta resolução
                      {item.autor && <span className="text-xs">Foto por {item.autor}</span>}
                    </span>
                    <span className="flex flex-col items-end tabular-nums">
                      {item.descontoCentavos > 0 && (
                        <s className="text-xs text-muted-foreground">
                          {formatarPreco(item.precoCentavos)}
                        </s>
                      )}
                      <span className="font-semibold">
                        {formatarPreco(item.precoCentavos - item.descontoCentavos)}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-lg"
                      aria-label="Remover do carrinho"
                      onClick={() => removerDoCarrinho(item.fotoId)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <aside className="flex h-fit flex-col gap-4 rounded-xl border bg-card p-5 lg:sticky lg:top-6">
        <h2 className="text-lg font-semibold">Resumo</h2>
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">
              {resumo.quantidade} {resumo.quantidade === 1 ? "item" : "itens"}
            </dt>
            <dd className="tabular-nums">{formatarPreco(resumo.subtotalCentavos)}</dd>
          </div>
          {resumo.descontos.map((linha) => (
            <div key={linha.rotulo} className="flex justify-between gap-4 text-primary">
              <dt>{linha.rotulo}</dt>
              <dd className="tabular-nums">−{formatarPreco(linha.valorCentavos)}</dd>
            </div>
          ))}
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatarPreco(resumo.totalCentavos)}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">Tem cupom? Use na próxima etapa.</p>
        <Link href="/checkout" className={buttonVariants({ size: "touch" })}>
          Finalizar compra
          <ArrowRight aria-hidden="true" data-icon="inline-end" />
        </Link>
      </aside>
    </div>
  );
}

function AvisoIndisponiveis({ quantidade }: { quantidade: number }) {
  return (
    <p role="status" className="rounded-lg bg-accent px-4 py-3 text-sm text-accent-foreground">
      {quantidade === 1
        ? "1 item saiu do carrinho porque não está mais à venda."
        : `${quantidade} itens saíram do carrinho porque não estão mais à venda.`}
    </p>
  );
}
