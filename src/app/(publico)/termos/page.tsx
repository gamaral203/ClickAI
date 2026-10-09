import type { Metadata } from "next";
import Link from "next/link";

import {
  CabecalhoLegal,
  classeLink,
  ContatoPrivacidade,
  Secao,
} from "@/components/site/pagina-legal";

// Termos de uso. Rascunho que descreve as regras que o código já aplica (preços do servidor,
// Pix de 1 hora, comissão de 10% no saque, antecipação com 1% a mais, saque só para o próprio
// CPF/CNPJ). Precisa da revisão de um advogado antes do lançamento (docs/tarefas.md, Fase 14).
// Se uma regra do código mudar, este texto muda junto.

export const metadata: Metadata = {
  title: "Termos de uso",
  description: "As regras para comprar e vender fotos de eventos no ClicouAí.",
};

const ATUALIZADA_EM = "outubro de 2026";

const indice = [
  ["o-servico", "O serviço"],
  ["contas", "Contas"],
  ["comprar", "Para quem compra"],
  ["vender", "Para quem vende"],
  ["conteudo", "Conteúdo e moderação"],
  ["responsabilidades", "Responsabilidades"],
  ["geral", "Disposições gerais"],
] as const;

export default function PaginaTermos() {
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
      <CabecalhoLegal titulo="Termos de uso" atualizadaEm={ATUALIZADA_EM} rascunho>
        <p>
          Ao usar o ClicouAí, você concorda com estes termos. Eles valem para quem procura e compra
          fotos e para os fotógrafos que vendem por aqui. Escrevemos em linguagem simples; se algo
          não ficar claro, fale com a gente.
        </p>
      </CabecalhoLegal>

      <nav aria-label="Nesta página" className="rounded-xl border p-4">
        <p className="mb-2 text-sm font-semibold">Nesta página</p>
        <ol className="grid gap-1 text-sm sm:grid-cols-2">
          {indice.map(([id, rotulo], i) => (
            <li key={id}>
              <a href={`#${id}`} className={`inline-flex min-h-8 items-center ${classeLink}`}>
                {i + 1}. {rotulo}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <Secao id="o-servico" titulo="1. O serviço">
        <p>
          O ClicouAí é uma plataforma que liga fotógrafos de eventos a quem foi fotografado. Os
          fotógrafos publicam as fotos e vídeos, definem os preços e recebem pelas vendas; o
          ClicouAí hospeda as galerias, oferece a busca por rosto e por número de peito, recebe os
          pagamentos e entrega os arquivos comprados.
        </p>
        <p>
          <strong>Quem vende cada foto é o fotógrafo que a publicou.</strong> O ClicouAí atua como
          intermediário: não é autor das fotos e não organiza os eventos.
        </p>
      </Secao>

      <Secao id="contas" titulo="2. Contas">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Dá para comprar sem conta, só com nome e e-mail. A conta serve para reunir as compras e
            é obrigatória para vender.
          </li>
          <li>
            Para criar uma conta, você precisa ter 18 anos ou mais, ou ter a autorização de um
            responsável. Os dados informados devem ser verdadeiros.
          </li>
          <li>
            A senha é pessoal. Se perceber um acesso que não foi você, troque a senha e avise a
            gente.
          </li>
          <li>
            Você pode excluir a sua conta quando quiser, em{" "}
            <Link href="/conta/excluir" className={classeLink}>
              Excluir minha conta
            </Link>
            . Os registros de vendas e saques continuam guardados, sem os seus dados pessoais, pelo
            prazo que a lei fiscal exige.
          </li>
          <li>
            Podemos suspender contas que descumpram estes termos ou a{" "}
            <Link href="/politica-de-conteudo" className={classeLink}>
              política de conteúdo
            </Link>
            , ou que sejam usadas para fraude.
          </li>
        </ul>
      </Secao>

      <Secao id="comprar" titulo="3. Para quem compra">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Preço.</strong> O preço de cada foto ou vídeo é definido pelo fotógrafo e
            mostrado em reais antes da compra. Descontos (pacote, desconto progressivo e cupom) são
            calculados pelo site e aparecem no carrinho antes do pagamento.
          </li>
          <li>
            <strong>Pagamento.</strong> Por Pix ou cartão de crédito à vista, processados pelo
            Asaas. O código Pix vale por 1 hora; depois disso, o pedido expira e é preciso fazer
            outro. Os dados do cartão vão direto ao Asaas.
          </li>
          <li>
            <strong>Entrega.</strong> Assim que o pagamento é confirmado, os arquivos originais, sem
            marca d&apos;água, ficam disponíveis para baixar na página do pedido, no link enviado
            por e-mail e em Minhas compras. Cada link de download vale por alguns minutos e pode ser
            gerado de novo quantas vezes você quiser.
          </li>
          <li>
            <strong>Uso das fotos.</strong> As fotos compradas são para uso pessoal, inclusive em
            redes sociais, citando o fotógrafo. Não é permitido revender, sublicenciar ou usar as
            fotos em publicidade ou outro fim comercial sem autorização do fotógrafo. Os direitos
            autorais continuam sendo do fotógrafo.
          </li>
          <li>
            <strong>Problemas com a compra.</strong> Se um arquivo não abrir, vier diferente da
            prévia ou se você comprou uma foto que não é sua por engano da busca, fale com a gente
            em até 7 dias pelo e-mail do pedido. Analisamos cada caso e, quando cabível, devolvemos
            o valor pelo mesmo meio de pagamento. Veja a{" "}
            <Link href="/ajuda#reembolso" className={classeLink}>
              central de ajuda
            </Link>
            .
          </li>
        </ul>
      </Secao>

      <Secao id="vender" titulo="4. Para quem vende">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Direitos sobre as fotos.</strong> Você declara que é autor das fotos e vídeos
            que publica (ou que tem autorização de quem é) e que pode fotografar e vender as imagens
            daquele evento. Você responde pelo que publica.
          </li>
          <li>
            <strong>Regras de conteúdo.</strong> Tudo o que é publicado precisa seguir a{" "}
            <Link href="/politica-de-conteudo" className={classeLink}>
              política de conteúdo
            </Link>
            . Fotos podem ser retiradas da galeria por denúncia procedente ou pedido de remoção de
            quem aparece nelas.
          </li>
          <li>
            <strong>Recebimento.</strong> O valor de cada venda entra no seu saldo. O saque é feito
            pelo painel, por Pix, <strong>somente para a chave do seu próprio CPF ou CNPJ</strong>.
          </li>
          <li>
            <strong>Taxas.</strong> A comissão do ClicouAí é de <strong>10%</strong>, descontada no
            saque. No saque normal, entram as vendas com 30 dias ou mais. No saque antecipado, você
            pode sacar vendas a partir de 1 dia; sobre o valor que ainda não completou 30 dias, a
            taxa é de <strong>11%</strong> (10% de comissão + 1% de antecipação). O saque mínimo é
            de R$ 1,00 líquido. Não há mensalidade.
          </li>
          <li>
            <strong>Estornos.</strong> Se uma venda for estornada ou contestada no cartão
            (chargeback), o valor correspondente pode ser descontado do seu saldo ou dos próximos
            saques.
          </li>
          <li>
            <strong>Colaboradores.</strong> O dono do evento pode adicionar outros fotógrafos e
            definir a parte de cada um nas vendas das fotos deles. A divisão é feita automaticamente
            em cada venda.
          </li>
          <li>
            <strong>Impostos.</strong> Você é responsável pelos tributos sobre o que recebe pelas
            suas vendas.
          </li>
          <li>
            <strong>Dados dos compradores.</strong> Você recebe o nome e o e-mail de quem compra
            apenas para atender o pedido, e não pode usá-los para outra finalidade.
          </li>
          <li>
            <strong>Saída.</strong> Para excluir a conta, é preciso antes sacar o saldo e não ter
            saque em processamento. Depois da exclusão, os seus eventos saem do ar, mas quem já
            comprou continua baixando as fotos que pagou.
          </li>
        </ul>
      </Secao>

      <Secao id="conteudo" titulo="5. Conteúdo e moderação">
        <p>
          Qualquer pessoa pode denunciar uma foto ou um evento pelo link “Denunciar” na página. Quem
          aparece numa foto pode pedir a remoção em{" "}
          <Link href="/remover-foto" className={classeLink}>
            Remover uma foto
          </Link>
          . A equipe do ClicouAí analisa cada caso e pode tirar a foto da galeria, colocar o evento
          em revisão ou suspender a conta do fotógrafo.
        </p>
      </Secao>

      <Secao id="responsabilidades" titulo="6. Responsabilidades">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Trabalhamos para manter o site no ar e os arquivos guardados com segurança, mas podem
            acontecer interrupções para manutenção ou por falhas de serviços de terceiros.
          </li>
          <li>
            A busca por rosto e por número de peito ajuda a encontrar as fotos, mas pode deixar de
            mostrar alguma foto sua ou mostrar fotos de outra pessoa. Confira as prévias antes de
            comprar.
          </li>
          <li>
            O ClicouAí não responde pelo conteúdo publicado pelos fotógrafos, mas age para retirar o
            que viola estes termos assim que fica sabendo.
          </li>
        </ul>
      </Secao>

      <Secao id="geral" titulo="7. Disposições gerais">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            O tratamento dos seus dados segue a{" "}
            <Link href="/privacidade" className={classeLink}>
              política de privacidade
            </Link>
            . Para pedidos sobre dados pessoais, fale com o encarregado por <ContatoPrivacidade />.
          </li>
          <li>
            Se estes termos mudarem, a data no topo é atualizada e as mudanças importantes são
            avisadas por e-mail a quem tem conta.
          </li>
          <li>
            Estes termos seguem as leis do Brasil, incluindo o Código de Defesa do Consumidor e a
            Lei Geral de Proteção de Dados.
          </li>
        </ul>
      </Secao>
    </article>
  );
}
