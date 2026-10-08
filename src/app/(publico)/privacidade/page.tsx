import type { Metadata } from "next";
import Link from "next/link";

import { AvisoRevisaoJuridica, ContatoPrivacidade } from "@/components/site/pagina-legal";

// Política de privacidade (LGPD, Lei 13.709/2018). Descreve o que o site faz de verdade, com os
// operadores usados hoje. Rascunho técnico: precisa da revisão de um advogado antes do
// lançamento (docs/tarefas.md, Fase 14). O e-mail do encarregado vem de
// NEXT_PUBLIC_EMAIL_PRIVACIDADE; sem ele, a página aponta o formulário de remoção (/remover-foto).

export const metadata: Metadata = {
  title: "Política de privacidade",
  description: "Como o ClicouAí trata os seus dados, inclusive a selfie da busca por rosto.",
};

const ATUALIZADA_EM = "outubro de 2026";

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">{titulo}</h2>
      <div className="flex flex-col gap-3 leading-relaxed text-muted-foreground [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}

export default function PaginaPrivacidade() {
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <AvisoRevisaoJuridica />
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Política de privacidade</h1>
        <p className="text-muted-foreground">Atualizada em {ATUALIZADA_EM}.</p>
        <p className="leading-relaxed">
          O ClicouAí é uma plataforma onde fotógrafos vendem as fotos de eventos e as pessoas
          fotografadas encontram e compram as suas. Aqui explicamos, sem juridiquês, quais dados
          tratamos, para quê e quais são os seus direitos pela Lei Geral de Proteção de Dados
          (LGPD).
        </p>
      </header>

      <Secao titulo="A selfie da busca por rosto">
        <p>
          A busca por rosto é <strong>opcional</strong> e só acontece depois que você aceita o aviso
          na tela. A selfie é um dado biométrico (dado pessoal sensível na LGPD) e por isso tem
          regras próprias:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            é reduzida no seu próprio aparelho e enviada só para comparar com os rostos das fotos
            daquele evento;
          </li>
          <li>
            <strong>não é guardada</strong>: não vai para o nosso banco de dados, para o
            armazenamento de fotos nem para os registros (logs) do sistema, e é descartada assim que
            a busca termina;
          </li>
          <li>
            a comparação é feita pelo Amazon Rekognition (AWS), que atua só como operador e não
            guarda a imagem da busca;
          </li>
          <li>
            nunca é usada para outra finalidade, como publicidade ou identificar você fora do
            evento.
          </li>
        </ul>
        <p>
          Para encontrar as pessoas, os rostos que aparecem nas fotos publicadas pelos fotógrafos
          são cadastrados numa coleção separada por evento. Se você aparece numa foto e não quer que
          ela fique à venda, peça a remoção (veja “Seus direitos”).
        </p>
      </Secao>

      <Secao titulo="Quais dados tratamos e para quê">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Compra:</strong> nome, e-mail e, se você quiser, WhatsApp, para entregar as
            fotos e mandar o comprovante. O pagamento é feito no Mercado Pago: os dados do cartão
            vão direto para ele e nunca passam pelo ClicouAí.
          </li>
          <li>
            <strong>Conta:</strong> nome, e-mail e senha (guardada só como código, nunca a senha em
            si), ou o login com o Google, para você acessar as suas compras.
          </li>
          <li>
            <strong>Fotógrafos:</strong> perfil público, CPF ou CNPJ e chave Pix (o próprio CPF ou
            CNPJ), para publicar eventos e receber os saques.
          </li>
          <li>
            <strong>Navegação:</strong> um cookie de sessão para manter você conectado e contagens
            de visitas e carrinhos sem nenhum dado que identifique você, para os fotógrafos
            acompanharem os eventos. Não usamos cookies de publicidade.
          </li>
          <li>
            <strong>Segurança:</strong> registros de erros e tentativas de acesso (guardadas como
            código, sem o seu IP), para evitar fraudes e invasões.
          </li>
        </ul>
        <p>
          As bases legais são a execução do contrato (compra e venda das fotos), o cumprimento de
          obrigações legais (fiscais), o legítimo interesse (segurança e melhoria do serviço) e o
          seu consentimento (selfie e WhatsApp), que você pode retirar quando quiser.
        </p>
      </Secao>

      <Secao titulo="Com quem compartilhamos">
        <p>
          Só com os serviços necessários para o site funcionar, que tratam os dados em nosso nome:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Mercado Pago: pagamentos com Pix e cartão e saques dos fotógrafos;</li>
          <li>Supabase: banco de dados, na região de São Paulo;</li>
          <li>Cloudflare R2: armazenamento das fotos;</li>
          <li>Amazon Web Services (Rekognition): busca por rosto;</li>
          <li>Resend: envio dos e-mails;</li>
          <li>Vercel: hospedagem do site, na região de São Paulo;</li>
          <li>Sentry: registro de erros, sem dados pessoais;</li>
          <li>Google: somente se você escolher entrar com o Google.</li>
        </ul>
        <p>
          O fotógrafo de quem você compra recebe o seu nome e e-mail apenas para atender o pedido.
          Não vendemos dados a ninguém.
        </p>
      </Secao>

      <Secao titulo="Por quanto tempo guardamos">
        <p>
          As fotos compradas ficam disponíveis para você baixar enquanto o serviço existir. Dados de
          compra são guardados pelo prazo exigido pela legislação fiscal. A selfie não é guardada.
          Você pode excluir a sua conta quando quiser: os dados pessoais são apagados e os registros
          de venda e de saque ficam guardados sem eles, pelos prazos legais. Se um fotógrafo exclui
          a conta, as fotos dele saem do ar, mas quem já comprou continua baixando.
        </p>
      </Secao>

      <Secao titulo="Seus direitos">
        <p>
          Pela LGPD, você pode confirmar se tratamos seus dados, acessá-los, corrigi-los, pedir a
          exclusão, a portabilidade, informações sobre o compartilhamento e retirar o consentimento.
          Você também pode pedir a <strong>remoção de uma foto em que aparece</strong>.
        </p>
        <p>
          Para qualquer pedido, fale com o nosso encarregado de dados por <ContatoPrivacidade />. Se
          você tem conta, pode excluí-la a qualquer momento em{" "}
          <Link href="/conta/excluir" className="font-medium text-primary hover:underline">
            Excluir minha conta
          </Link>
          ; para tirar uma foto em que aparece, use{" "}
          <Link href="/remover-foto" className="font-medium text-primary hover:underline">
            Remover uma foto
          </Link>
          .
        </p>
      </Secao>

      <Secao titulo="Mudanças nesta política">
        <p>
          Se esta política mudar, a data no topo da página é atualizada. Mudanças importantes são
          avisadas por e-mail a quem tem conta.
        </p>
      </Secao>
    </article>
  );
}
