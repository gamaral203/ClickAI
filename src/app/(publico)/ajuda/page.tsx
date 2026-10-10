import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Camera, ShoppingBag } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { classeLink } from "@/components/site/pagina-legal";

// Central de ajuda: artigos curtos para quem compra e para quem vende. Conteúdo estático; os
// números (Pix de 1 hora, comissão de 10%, antecipação com 1% a mais, saque mínimo de R$ 1,00,
// fotos JPEG, PNG, WebP, TIFF, AVIF ou HEIC até 200 MB, sem limite de quantidade) são os do código (src/servicos/pedidos.ts,
// src/servicos/saques.ts, src/lib/limites-envio.ts). Se uma regra mudar, o texto muda junto.

export const metadata: Metadata = {
  title: "Central de ajuda",
  description: "Como achar, pagar e baixar suas fotos, e como vender, receber e sacar no ClicouAí.",
};

type Artigo = { id: string; titulo: string; corpo: React.ReactNode };

const paraQuemCompra: Artigo[] = [
  {
    id: "achar-fotos",
    titulo: "Como acho as minhas fotos?",
    corpo: (
      <>
        <p>
          Procure o evento em{" "}
          <Link href="/eventos" className={classeLink}>
            Eventos
          </Link>{" "}
          (pelo nome ou pela data) ou abra o link e o QR Code que o fotógrafo divulgou. Na página do
          evento, use a <strong>busca por selfie</strong>: tire uma foto do rosto ou escolha uma da
          galeria do celular e mostramos só as fotos em que você aparece. Em corridas, dá para
          buscar também pelo <strong>número de peito</strong>.
        </p>
        <p>
          Não achou? Tente outra selfie, de frente e com boa luz, ou olhe a galeria do evento: a
          busca pode deixar passar fotos de lado ou com o rosto coberto.
        </p>
      </>
    ),
  },
  {
    id: "selfie",
    titulo: "A minha selfie fica guardada?",
    corpo: (
      <p>
        Não. A selfie é usada só para comparar com as fotos daquele evento e é descartada assim que
        a busca termina: não vai para o nosso banco de dados, para o armazenamento nem para os
        registros do sistema. Detalhes na{" "}
        <Link href="/privacidade" className={classeLink}>
          política de privacidade
        </Link>
        .
      </p>
    ),
  },
  {
    id: "pagar",
    titulo: "Como pago?",
    corpo: (
      <>
        <p>
          Coloque as fotos no carrinho (pode juntar fotos de vários eventos) e finalize com nome e
          e-mail; não precisa criar conta. Você escolhe entre:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Pix:</strong> aparece um QR Code e o código copia e cola. Ele vale por{" "}
            <strong>1 hora</strong>; o pagamento é reconhecido em segundos.
          </li>
          <li>
            <strong>Cartão de crédito:</strong> à vista, na página segura do processador de
            pagamento. Os dados do cartão não passam pelo ClicouAí.
          </li>
        </ul>
        <p>
          Descontos do fotógrafo (pacote, desconto por quantidade e cupom) já aparecem no carrinho,
          antes de pagar.
        </p>
      </>
    ),
  },
  {
    id: "baixar",
    titulo: "Como baixo as fotos depois de pagar?",
    corpo: (
      <>
        <p>
          Assim que o pagamento é confirmado, a página do pedido mostra o botão{" "}
          <strong>Baixar</strong> em cada foto. Você também recebe o link por e-mail (e pelo
          WhatsApp, se pediu). As fotos vêm no tamanho original, sem marca d&apos;água, e podem ser
          baixadas quantas vezes quiser.
        </p>
        <p>
          <strong>Perdeu o e-mail?</strong>{" "}
          <Link href="/cadastro" className={classeLink}>
            Crie uma conta
          </Link>{" "}
          com o mesmo e-mail da compra e confirme o endereço: as compras aparecem em Minhas compras.
        </p>
      </>
    ),
  },
  {
    id: "reembolso",
    titulo: "Tive um problema com a compra. Tem reembolso?",
    corpo: (
      <>
        <p>
          Se o arquivo não abre, veio diferente da prévia ou você comprou por engano uma foto que
          não é sua, responda o e-mail do pedido em até 7 dias contando o que aconteceu. Analisamos
          cada caso e, quando cabe a devolução, o valor volta pelo mesmo meio de pagamento (Pix ou
          estorno no cartão).
        </p>
        <p>
          Como a foto é entregue na hora, confira as prévias antes de comprar. Pagou e a página
          ainda mostra “aguardando pagamento”? Espere alguns segundos e recarregue: a confirmação do
          Pix pode levar um instante.
        </p>
      </>
    ),
  },
  {
    id: "remover",
    titulo: "Apareço numa foto e não quero que ela fique à venda",
    corpo: (
      <p>
        Peça a remoção em{" "}
        <Link href="/remover-foto" className={classeLink}>
          Remover uma foto
        </Link>
        : cole o link da foto e diga como reconhecemos você. A equipe analisa e responde por e-mail.
      </p>
    ),
  },
  {
    id: "excluir-conta-cliente",
    titulo: "Como excluo a minha conta?",
    corpo: (
      <p>
        Entre na conta e abra{" "}
        <Link href="/conta/excluir" className={classeLink}>
          Excluir minha conta
        </Link>
        . Seus dados pessoais são apagados e você sai em todos os aparelhos; o registro das compras
        fica guardado sem o seu nome e e-mail, como a lei fiscal exige.
      </p>
    ),
  },
];

const paraQuemVende: Artigo[] = [
  {
    id: "comecar",
    titulo: "Como começo a vender?",
    corpo: (
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          <Link href="/cadastro?tipo=fotografo" className={classeLink}>
            Crie a sua conta de fotógrafo
          </Link>
          .
        </li>
        <li>
          Em <strong>Perfil e recebimento</strong>, complete o perfil público, informe o CPF ou CNPJ
          e confirme a chave Pix (o próprio CPF ou CNPJ). Sem a chave confirmada, não dá para
          publicar.
        </li>
        <li>
          Em <strong>Meus eventos</strong>, crie o evento (data, local, preço por foto,
          visibilidade) e envie as fotos.
        </li>
        <li>Publique e divulgue o link. Pronto: as vendas entram no seu saldo.</li>
      </ol>
    ),
  },
  {
    id: "enviar",
    titulo: "Como envio as fotos?",
    corpo: (
      <p>
        Na página do evento no painel, arraste as fotos ou escolha os arquivos. Aceitamos{" "}
        <strong>JPEG, PNG, WebP, TIFF, AVIF e HEIC</strong>, do tamanho que você exportar (até 200
        MB por foto), quantas fotos quiser de uma vez. O comprador recebe o original no mesmo
        formato; a foto HEIC (do iPhone) é convertida para JPEG de alta qualidade no seu navegador
        antes do envio. Arquivo RAW não é aceito: exporte em JPEG (ou PNG/TIFF) no Lightroom ou no
        Capture One antes. O envio vai várias fotos ao mesmo tempo, com barra de progresso e tempo
        restante; arquivos grandes sobem em partes, e se a conexão cair ou um arquivo falhar, use
        “Tentar de novo”. Fotos repetidas são puladas sozinhas. A marca d&apos;água das prévias é
        colocada automaticamente: você envia o original.
      </p>
    ),
  },
  {
    id: "precos",
    titulo: "Como defino preços e descontos?",
    corpo: (
      <p>
        Cada evento tem um preço por foto (e por vídeo), e você pode mudar o preço de uma foto
        específica. Em <strong>Descontos e cupons</strong>, crie desconto por quantidade (ex.: 3
        fotos com 10% off), o pacote “todas as minhas fotos” (oferecido depois da busca por selfie)
        e cupons com limite de uso e validade. O site calcula tudo sozinho no carrinho.
      </p>
    ),
  },
  {
    id: "divulgar",
    titulo: "Como divulgo o evento?",
    corpo: (
      <p>
        Ao publicar, o painel mostra o link do evento, o QR Code para imprimir, uma mensagem pronta
        para o WhatsApp e imagens de story e feed com o QR Code. Você também tem um link próprio com
        todos os seus eventos.
      </p>
    ),
  },
  {
    id: "taxas",
    titulo: "Quais são as taxas?",
    corpo: (
      <>
        <p>
          Não há mensalidade nem custo para publicar. A comissão do ClicouAí é de{" "}
          <strong>10% sobre o que você vende</strong>, descontada só na hora do saque. Se você
          antecipar, as vendas com menos de 30 dias pagam <strong>11%</strong> (10% + 1% de
          antecipação).
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Exemplo com uma venda de R$ 20,00</caption>
            <thead className="bg-muted text-left">
              <tr>
                <th scope="col" className="p-2 font-medium">
                  Venda de R$ 20,00
                </th>
                <th scope="col" className="p-2 font-medium">
                  Taxa
                </th>
                <th scope="col" className="p-2 font-medium">
                  Você recebe
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <th scope="row" className="p-2 text-left font-normal">
                  Saque normal (30 dias)
                </th>
                <td className="p-2 whitespace-nowrap">R$ 2,00</td>
                <td className="p-2 font-semibold whitespace-nowrap text-foreground">R$ 18,00</td>
              </tr>
              <tr>
                <th scope="row" className="p-2 text-left font-normal">
                  Saque antecipado
                </th>
                <td className="p-2 whitespace-nowrap">R$ 2,20</td>
                <td className="p-2 font-semibold whitespace-nowrap text-foreground">R$ 17,80</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Em <strong>Financeiro</strong>, cada venda mostra quanto o cliente pagou, a sua parte, a
          taxa e o líquido.
        </p>
      </>
    ),
  },
  {
    id: "saque",
    titulo: "Como e quando saco?",
    corpo: (
      <>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Saque normal:</strong> as vendas com 30 dias ou mais, com 10% de comissão.
          </li>
          <li>
            <strong>Saque antecipado:</strong> as vendas a partir de 1 dia; o que ainda não tem 30
            dias paga 11%.
          </li>
          <li>
            O dinheiro vai por <strong>Pix, só para a chave do seu próprio CPF ou CNPJ</strong>.
            Saque mínimo de R$ 1,00 líquido.
          </li>
        </ul>
        <p>
          Se o saque aparecer “em processamento”, o Pix está sendo confirmado com o banco. O saldo
          fica reservado até a resposta e só volta se o Pix com certeza não saiu.
        </p>
      </>
    ),
  },
  {
    id: "colaboradores",
    titulo: "Posso vender com outros fotógrafos no mesmo evento?",
    corpo: (
      <p>
        Pode. Na página do evento, adicione colaboradores pelo e-mail da conta de fotógrafo deles e
        defina a sua comissão como dono do evento. Cada colaborador envia as fotos dele em{" "}
        <strong>Colaborações</strong>, e a divisão de cada venda é feita automaticamente.
      </p>
    ),
  },
  {
    id: "denuncias",
    titulo: "Recebi uma denúncia ou pedido de remoção. E agora?",
    corpo: (
      <p>
        A equipe do ClicouAí analisa cada caso. Se procede, a foto sai da galeria (quem já comprou
        continua baixando) ou o evento vai para revisão; você é avisado por e-mail. Veja o que pode
        e o que não pode na{" "}
        <Link href="/politica-de-conteudo" className={classeLink}>
          política de conteúdo
        </Link>
        .
      </p>
    ),
  },
  {
    id: "excluir-conta-fotografo",
    titulo: "Como excluo a minha conta de fotógrafo?",
    corpo: (
      <p>
        Antes, saque todo o saldo e espere os saques em processamento terminarem. Depois, abra{" "}
        <Link href="/conta/excluir" className={classeLink}>
          Excluir minha conta
        </Link>
        . Os seus eventos saem do ar e os seus dados pessoais são apagados, mas quem já comprou
        continua baixando as fotos que pagou.
      </p>
    ),
  },
];

const grupos = [
  { id: "comprador", titulo: "Para quem compra", icone: ShoppingBag, artigos: paraQuemCompra },
  { id: "fotografo", titulo: "Para quem vende", icone: Camera, artigos: paraQuemVende },
] as const;

export default function PaginaAjuda() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          Central de ajuda
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Respostas rápidas para quem procura as fotos de um evento e para quem vende as suas.
        </p>
      </header>

      <nav aria-label="Artigos" className="grid gap-4 md:grid-cols-2">
        {grupos.map(({ id, titulo, icone: Icone, artigos }) => (
          <div key={id} className="flex flex-col gap-3 rounded-xl border p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Icone aria-hidden="true" className="size-4" />
              </span>
              <a href={`#${id}`} className="hover:underline">
                {titulo}
              </a>
            </h2>
            <ul className="flex flex-col">
              {artigos.map((a) => (
                <li key={a.id}>
                  <a
                    href={`#${a.id}`}
                    className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-primary" />
                    {a.titulo}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {grupos.map(({ id, titulo, artigos }) => (
        <section
          key={id}
          id={id}
          aria-labelledby={`${id}-titulo`}
          className="flex scroll-mt-20 flex-col gap-4"
        >
          <h2 id={`${id}-titulo`} className="text-2xl font-bold tracking-tight">
            {titulo}
          </h2>
          <div className="flex flex-col gap-4">
            {artigos.map((a) => (
              <article
                key={a.id}
                id={a.id}
                className="flex scroll-mt-20 flex-col gap-3 rounded-xl border p-5 target:border-primary target:ring-3 target:ring-primary/20"
              >
                <h3 className="text-lg font-semibold">{a.titulo}</h3>
                <div className="flex flex-col gap-3 leading-relaxed text-muted-foreground [&_strong]:text-foreground">
                  {a.corpo}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      <section className="flex flex-col items-start gap-3 rounded-xl bg-accent p-6 text-accent-foreground">
        <h2 className="text-lg font-semibold">Não achou a resposta?</h2>
        <p>
          Sobre um pedido, responda o e-mail da compra. Para regras e dados, veja os{" "}
          <Link href="/termos" className={classeLink}>
            termos de uso
          </Link>{" "}
          e a{" "}
          <Link href="/privacidade" className={classeLink}>
            política de privacidade
          </Link>
          .
        </p>
        <Link
          href="/como-funciona"
          className={buttonVariants({ variant: "outline", size: "touch" })}
        >
          Como funciona o ClicouAí
        </Link>
      </section>
    </div>
  );
}
