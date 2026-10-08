import Link from "next/link";
import { Scale } from "lucide-react";

// Peças das páginas de texto legal (termos, política de conteúdo, remoção de fotos), no mesmo
// visual da política de privacidade.

export function Secao({
  titulo,
  id,
  children,
}: {
  titulo: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-20 flex-col gap-3">
      <h2 className="text-xl font-semibold">{titulo}</h2>
      <div className="flex flex-col gap-3 leading-relaxed text-muted-foreground [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}

/** Aviso no topo dos rascunhos que ainda não passaram pelo advogado. */
export function AvisoRevisaoJuridica() {
  return (
    <p
      role="note"
      className="flex gap-3 rounded-xl bg-highlight p-4 text-sm text-highlight-foreground"
    >
      <Scale aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <span>
        <strong>Rascunho sujeito a revisão jurídica.</strong> Este texto descreve como o ClicouAí
        funciona hoje e ainda vai ser revisado por um advogado antes do lançamento.
      </span>
    </p>
  );
}

export function CabecalhoLegal({
  titulo,
  atualizadaEm,
  rascunho = false,
  children,
}: {
  titulo: string;
  atualizadaEm: string;
  rascunho?: boolean;
  children: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3">
      {rascunho && <AvisoRevisaoJuridica />}
      <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{titulo}</h1>
      <p className="text-muted-foreground">Atualizada em {atualizadaEm}.</p>
      <div className="leading-relaxed">{children}</div>
    </header>
  );
}

export const classeLink = "font-medium text-primary hover:underline";

/** E-mail do encarregado de dados, se já foi cadastrado (NEXT_PUBLIC_EMAIL_PRIVACIDADE). */
export function emailPrivacidade() {
  return process.env.NEXT_PUBLIC_EMAIL_PRIVACIDADE || null;
}

/**
 * Canal do encarregado de dados: o e-mail de NEXT_PUBLIC_EMAIL_PRIVACIDADE ou, enquanto ele não
 * existir, o formulário de remoção de fotos (que cai na fila de denúncias da equipe).
 */
export function ContatoPrivacidade() {
  const email = emailPrivacidade();
  return email ? (
    <a href={`mailto:${email}`} className={classeLink}>
      {email}
    </a>
  ) : (
    <Link href="/remover-foto" className={classeLink}>
      o formulário de remoção e privacidade
    </Link>
  );
}
