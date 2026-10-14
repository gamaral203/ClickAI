import Image from "next/image";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Construction, TriangleAlert, Wrench } from "lucide-react";

import { situacaoDaManutencao } from "@/dados";
import { bloqueiaNaManutencao } from "@/lib/manutencao";
import { usuarioAtual } from "@/servicos/sessao";

// Modo de manutenção nas páginas (docs/arquitetura.md, "Modo de manutenção").
//
// O portão fica nos layouts dos grupos do site ((publico), (cliente), (fotografo) e loja/). As
// páginas que continuam abertas (login e gestão) ficam em grupos sem ele ((acesso) e (admin)):
// o layout não sabe o caminho de forma confiável, então a separação é pela estrutura das pastas,
// conferida pelo teste src/lib/manutencao.test.ts.
//
// Status: a tela sai com 200 e `noindex`. O App Router não deixa a página escolher o status
// (só 404, 403, 401 e redirecionamentos), e o proxy, que poderia responder 503, não sabe o papel
// de quem pede (a sessão é conferida no banco). As rotas de API recusadas respondem 503 com
// Retry-After (src/servicos/manutencao.ts).

/**
 * Com a manutenção ligada e quem pede não sendo gestor, troca o conteúdo do layout (cabeçalho e
 * rodapé inclusive) pela tela de manutenção. Desligada, nem lê a sessão.
 */
export function PortaoManutencao({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Portao>{children}</Portao>
    </Suspense>
  );
}

async function Portao({ children }: { children: ReactNode }) {
  const situacao = await situacaoDaManutencao();
  if (!situacao.ativa) return children;
  if (!bloqueiaNaManutencao(true, await usuarioAtual())) return children;
  return <TelaManutencao mensagem={situacao.mensagem} />;
}

/** Tela "Estamos em manutenção": a única coisa que o público vê com a manutenção ligada. */
export function TelaManutencao({ mensagem }: { mensagem: string | null }) {
  return (
    <main className="relative isolate flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-12 sm:py-20">
      {/* Fora do índice dos buscadores enquanto durar (o React leva a tag para o <head>). */}
      <meta name="robots" content="noindex, nofollow" />
      <div
        aria-hidden="true"
        className="absolute -top-24 -right-24 -z-10 size-72 rounded-full bg-highlight/50 blur-3xl sm:size-96"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-32 -left-24 -z-10 size-72 rounded-full bg-primary/15 blur-3xl sm:size-96"
      />
      <div className="flex w-full max-w-lg flex-col items-center gap-6 text-center">
        <Image
          src="/logo.png"
          alt="ClicouAí"
          width={544}
          height={160}
          loading="eager"
          className="h-9 w-auto sm:h-10"
        />
        <div aria-hidden="true" className="relative">
          <span className="flex size-24 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-8 ring-highlight sm:size-28">
            <Construction className="size-11 sm:size-12" />
          </span>
          <span className="absolute -right-1 -bottom-1 flex size-10 items-center justify-center rounded-full bg-highlight text-highlight-foreground ring-4 ring-pagina">
            <Wrench className="size-5" />
          </span>
        </div>
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
            Estamos em manutenção
          </h1>
          <p className="text-base text-pretty text-muted-foreground sm:text-lg">
            Estamos melhorando o ClicouAí. Volte em alguns minutos.
          </p>
        </div>
        {mensagem && (
          <p className="w-full rounded-xl border bg-background p-4 text-base break-words text-foreground shadow-sm">
            {mensagem}
          </p>
        )}
        <Link
          href="/entrar"
          prefetch={false}
          className="inline-flex min-h-11 items-center rounded-md px-2 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Sou da equipe — entrar
        </Link>
      </div>
    </main>
  );
}

/**
 * Faixa no topo de todas as páginas, só para o gestor logado, enquanto a manutenção está
 * ligada: lembra que o público está vendo a tela de manutenção. Chamar dentro de <Suspense>.
 */
export async function FaixaManutencaoGestor() {
  const situacao = await situacaoDaManutencao();
  if (!situacao.ativa) return null;
  const usuario = await usuarioAtual();
  if (usuario?.papel !== "admin") return null;
  return (
    // Fixa no topo a partir do tablet; no celular rola com a página, para não roubar a tela.
    <div
      role="status"
      className="z-40 border-b border-highlight-foreground/15 bg-highlight text-highlight-foreground sm:sticky sm:top-0 print:hidden"
    >
      <p className="mx-auto max-w-7xl px-4 py-1.5 text-center text-xs sm:py-2 sm:text-sm">
        <TriangleAlert
          aria-hidden="true"
          className="mr-1.5 inline size-4 align-[-3px] max-sm:hidden"
        />
        <strong className="font-bold">Modo manutenção ATIVO</strong> — clientes e fotógrafos estão
        vendo a tela de manutenção.{" "}
        <Link
          href="/admin"
          className="inline-block rounded-md px-1 py-1 font-semibold underline underline-offset-4 focus-visible:ring-3 focus-visible:ring-highlight-foreground/40 focus-visible:outline-none"
        >
          Desativar
        </Link>
      </p>
    </div>
  );
}

/** Faixa discreta na tela de login enquanto a manutenção está ligada. Chamar dentro de <Suspense>. */
export async function AvisoManutencaoLogin() {
  const situacao = await situacaoDaManutencao();
  if (!situacao.ativa) return null;
  return (
    <div role="status" className="border-b bg-muted text-muted-foreground">
      <p className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-2 text-center text-sm">
        <Construction aria-hidden="true" className="size-4 shrink-0" />
        Site em manutenção — acesso só para a equipe
      </p>
    </div>
  );
}
