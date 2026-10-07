"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Clock, ExternalLink, Globe, Loader2 } from "lucide-react";

import {
  conectarDominioAcao,
  removerDominioAcao,
  verificarDominioAcao,
  type ResultadoDominio,
} from "@/app/(fotografo)/painel/loja/acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DesafioDns } from "@/lib/vercel";

/**
 * Domínio próprio da loja: o fotógrafo conecta, aponta o DNS e verifica. A loja só abre no
 * domínio depois de verificado.
 */
export function DominioProprio({
  dominio,
  verificado,
  temLoja,
}: {
  dominio: string | null;
  verificado: boolean;
  temLoja: boolean;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [desafios, setDesafios] = useState<DesafioDns[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function executar(
    acao: () => Promise<ResultadoDominio>,
    sucesso?: (r: ResultadoDominio) => void,
  ) {
    setErro(null);
    setAviso(null);
    startTransition(async () => {
      const resultado = await acao().catch((): ResultadoDominio => ({
        ok: false,
        erro: "Não foi possível concluir.",
      }));
      if (!resultado.ok) return setErro(resultado.erro);
      setDesafios(resultado.desafios);
      sucesso?.(resultado);
      router.refresh();
    });
  }

  if (!temLoja) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Salve a loja primeiro; depois você conecta um domínio seu.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {dominio ? (
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <Globe aria-hidden="true" className="size-4" />
            {dominio}
            {verificado ? (
              <span className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                <CheckCircle2 aria-hidden="true" className="size-3.5" />
                No ar
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                <Clock aria-hidden="true" className="size-3.5" />
                Esperando o DNS
              </span>
            )}
          </p>
          {verificado ? (
            <a
              href={`https://${dominio}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Abrir a loja no domínio
              <ExternalLink aria-hidden="true" className="size-4" />
            </a>
          ) : (
            <InstrucoesDns dominio={dominio} desafios={desafios} />
          )}
          <div className="flex flex-wrap gap-2">
            {!verificado && (
              <Button
                size="touch"
                disabled={pendente}
                onClick={() =>
                  executar(verificarDominioAcao, (r) =>
                    setAviso(
                      r.ok && r.verificado
                        ? "Domínio verificado. A loja já abre nele."
                        : "Ainda não encontramos o DNS certo. A mudança pode levar até algumas horas para valer.",
                    ),
                  )
                }
              >
                {pendente && (
                  <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
                )}
                Verificar agora
              </Button>
            )}
            <Button
              variant="outline"
              size="touch"
              disabled={pendente}
              onClick={() => executar(removerDominioAcao)}
            >
              Desconectar
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            executar(
              () => conectarDominioAcao(texto),
              () => setTexto(""),
            );
          }}
        >
          <div className="flex min-w-56 flex-1 flex-col gap-1">
            <label htmlFor="dominio-proprio" className="text-sm font-medium">
              Seu domínio
            </label>
            <Input
              id="dominio-proprio"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="fotos.seusite.com.br"
              autoCapitalize="none"
              autoComplete="off"
              aria-invalid={Boolean(erro)}
              className="h-11"
            />
          </div>
          <Button type="submit" size="touch" disabled={pendente || !texto.trim()}>
            {pendente && (
              <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
            )}
            Conectar
          </Button>
        </form>
      )}
      {aviso && (
        <p role="status" className="text-sm">
          {aviso}
        </p>
      )}
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}

/** O que configurar no DNS, no site onde o domínio foi comprado (Registro.br, GoDaddy…). */
function InstrucoesDns({ dominio, desafios }: { dominio: string; desafios: DesafioDns[] }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>No site onde você comprou o domínio, crie este registro DNS:</p>
      <ul className="flex flex-col gap-1 rounded-lg bg-muted/60 p-3 font-mono text-xs">
        <li>
          Subdomínio ({dominio}): CNAME → <strong>cname.vercel-dns.com</strong>
        </li>
        <li>
          Domínio principal (sem “fotos.” na frente): A → <strong>76.76.21.21</strong>
        </li>
        {desafios.map((d) => (
          <li key={`${d.tipo}-${d.nome}`}>
            {d.nome}: {d.tipo} → <strong className="break-all">{d.valor}</strong>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">
        Depois clique em Verificar. A mudança no DNS pode levar algumas horas para valer.
      </p>
    </div>
  );
}
