import type { Metadata } from "next";
import Link from "next/link";

import { FormularioRemocao } from "@/components/denuncia/formulario-remocao";
import { classeLink, ContatoPrivacidade, emailPrivacidade } from "@/components/site/pagina-legal";

// Canal de remoção de fotos (LGPD): quem aparece numa foto pede para tirá-la de venda. O pedido
// vira uma denúncia com o motivo "privacidade" (ver ./acoes.ts).

export const metadata: Metadata = {
  title: "Remover uma foto em que apareço",
  description:
    "Apareceu numa foto do ClicouAí e não quer que ela fique à venda? Peça a remoção aqui.",
};

export default function PaginaRemoverFoto() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          Remover uma foto em que apareço
        </h1>
        <p className="leading-relaxed text-muted-foreground">
          A sua imagem é um dado pessoal. Se você aparece numa foto publicada no ClicouAí e não quer
          que ela fique à venda, peça a remoção. A equipe analisa cada pedido e, quando ele procede,
          a foto sai da galeria, da busca por rosto e da busca por número.
        </p>
      </header>

      <ol className="grid gap-3 sm:grid-cols-3">
        {[
          ["Cole o link", "Da foto (ou do evento, se forem várias)."],
          ["Diga como achamos você", "Roupa, número de peito, posição na foto."],
          ["Acompanhe pelo e-mail", "Você recebe o protocolo e a resposta por lá."],
        ].map(([titulo, texto], i) => (
          <li key={titulo} className="flex gap-3 rounded-xl border p-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {i + 1}
            </span>
            <span className="flex flex-col">
              <span className="font-medium">{titulo}</span>
              <span className="text-sm text-muted-foreground">{texto}</span>
            </span>
          </li>
        ))}
      </ol>

      <FormularioRemocao />

      <section className="flex flex-col gap-2 rounded-xl bg-accent p-5 text-sm leading-relaxed text-accent-foreground">
        <h2 className="font-semibold">Outros pedidos sobre os seus dados</h2>
        <p>
          {emailPrivacidade() && (
            <>
              Para acessar, corrigir ou excluir os seus dados, fale com o encarregado de dados por{" "}
              <ContatoPrivacidade />.{" "}
            </>
          )}
          Se você tem conta, pode excluí-la você mesmo em{" "}
          <Link href="/conta/excluir" className={classeLink}>
            Excluir minha conta
          </Link>
          . Para denunciar direitos autorais, conteúdo impróprio ou golpe, use o link “Denunciar” na
          página da foto ou do evento. Veja também a{" "}
          <Link href="/privacidade" className={classeLink}>
            política de privacidade
          </Link>{" "}
          e a{" "}
          <Link href="/politica-de-conteudo" className={classeLink}>
            política de conteúdo
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
