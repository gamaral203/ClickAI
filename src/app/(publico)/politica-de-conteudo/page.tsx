import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, CircleX } from "lucide-react";

import { CabecalhoLegal, classeLink, Secao } from "@/components/site/pagina-legal";

// Política de conteúdo: o que pode e o que não pode ser publicado, e como funciona a moderação
// (denúncia em /denunciar, remoção em /remover-foto, decisão em /admin/denuncias). Rascunho que
// precisa da revisão de um advogado antes do lançamento (docs/tarefas.md, Fase 14).

export const metadata: Metadata = {
  title: "Política de conteúdo",
  description: "O que pode e o que não pode ser publicado no ClicouAí, e como denunciar.",
};

const ATUALIZADA_EM = "outubro de 2026";

const permitido = [
  "Fotos e vídeos de eventos que você mesmo fotografou, ou que a sua equipe fez com a sua autorização.",
  "Eventos em que você tinha permissão para fotografar: corridas, festas, formaturas, shows, campeonatos e outros.",
  "Títulos, descrições e capas que mostrem o evento de forma fiel.",
];

const proibido = [
  "Nudez, conteúdo sexual ou erótico.",
  "Fotos de crianças ou adolescentes em situação constrangedora, íntima ou que os exponha a risco.",
  "Fotos feitas em lugares onde as pessoas esperam privacidade, como banheiros e vestiários.",
  "Violência explícita, discurso de ódio, discriminação ou humilhação de qualquer pessoa.",
  "Fotos de outros fotógrafos ou de bancos de imagem sem autorização, ou com a marca d'água de outra pessoa.",
  "Eventos falsos, títulos enganosos ou qualquer tentativa de golpe.",
  "Dados pessoais de terceiros em títulos e descrições (CPF, telefone, endereço).",
  "Links, códigos ou scripts na loja além do que o painel permite (Google Analytics e Tag Manager só pelo ID).",
];

export default function PaginaPoliticaDeConteudo() {
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
      <CabecalhoLegal titulo="Política de conteúdo" atualizadaEm={ATUALIZADA_EM} rascunho>
        <p>
          O ClicouAí existe para as pessoas encontrarem as fotos dos eventos de que participaram.
          Estas regras valem para tudo o que os fotógrafos publicam: fotos, vídeos, eventos, perfis
          e lojas. Elas completam os{" "}
          <Link href="/termos" className={classeLink}>
            termos de uso
          </Link>
          .
        </p>
      </CabecalhoLegal>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-xl border p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CircleCheck aria-hidden="true" className="size-5 text-primary" />
            Pode publicar
          </h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-muted-foreground">
            {permitido.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section className="flex flex-col gap-3 rounded-xl border border-destructive/30 p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CircleX aria-hidden="true" className="size-5 text-destructive" />
            Não pode publicar
          </h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-muted-foreground">
            {proibido.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>

      <Secao titulo="A imagem de quem foi fotografado">
        <p>
          A imagem de uma pessoa é um dado pessoal. Quem fotografa um evento precisa ter permissão
          para isso (normalmente, do organizador) e respeitar quem está nas fotos. Em eventos com
          crianças e adolescentes, siga as regras do organizador e o Estatuto da Criança e do
          Adolescente.
        </p>
        <p>
          <strong>Qualquer pessoa que apareça numa foto pode pedir que ela saia de venda</strong>,
          em{" "}
          <Link href="/remover-foto" className={classeLink}>
            Remover uma foto
          </Link>
          . Quando o pedido procede, a foto sai da galeria e das buscas.
        </p>
      </Secao>

      <Secao titulo="Como denunciar">
        <p>
          Em toda página de evento e de foto há o link “Denunciar”. Escolha o motivo, conte o que
          aconteceu e deixe um e-mail para resposta. Para direitos autorais, informe também os dados
          da empresa, se for o caso. O fotógrafo não vê o seu e-mail nem o seu telefone.
        </p>
      </Secao>

      <Secao titulo="O que acontece depois">
        <ul className="list-disc space-y-2 pl-5">
          <li>A equipe do ClicouAí analisa cada denúncia; só a equipe decide.</li>
          <li>
            Se a denúncia procede, a foto sai da galeria ou o evento vai para revisão e deixa de
            aparecer. Quem já comprou continua com acesso ao que pagou.
          </li>
          <li>Se não procede, o conteúdo continua (ou volta) no ar.</li>
          <li>Quem denunciou e o fotógrafo são avisados por e-mail.</li>
          <li>
            Violações graves ou repetidas levam à suspensão da conta do fotógrafo, e as vendas do
            conteúdo removido podem ser estornadas aos compradores.
          </li>
        </ul>
      </Secao>
    </article>
  );
}
