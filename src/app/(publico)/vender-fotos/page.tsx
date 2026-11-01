import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgePercent,
  Banknote,
  BarChart3,
  Clapperboard,
  CreditCard,
  Images,
  KeyRound,
  Layers,
  LockKeyhole,
  Mail,
  ScanFace,
  ShoppingBag,
  Stamp,
  Store,
  Tag,
  UserRoundX,
  Users,
} from "lucide-react";

import { CONTAINER } from "@/components/inicio/comum";
import { buttonVariants } from "@/components/ui/button";
import { CarrosselTopo } from "@/components/vender-fotos/carrossel-topo";
import { comissaoPadraoPct } from "@/dados";
import { urlDoSite } from "@/lib/endereco";
import { formatarPreco } from "@/lib/formatar";
import { taxaCartaoPct } from "@/lib/taxas";
import { exemploDeVenda, FOTO_BENEFICIOS, SLIDES_TOPO } from "@/lib/vender-fotos";
import { IMAGENS_INICIO } from "@/lib/vitrine-inicio";
import { SAQUE_MINIMO_CENTAVOS, TAXA_ANTECIPACAO_TEXTO } from "@/servicos/financeiro";

// Página pública para atrair fotógrafos. Toda taxa sai do sistema: a comissão de
// `comissaoPadraoPct()`, as demais de src/servicos/financeiro.ts e src/lib/taxas.ts. Nada de
// comparar com outras plataformas: não temos como provar. Imagens: só as da vitrine autorizada e a foto de divulgação do dono.

const CADASTRO = "/cadastro?tipo=fotografo";

const pct = (valor: number) => `${valor.toLocaleString("pt-BR")}%`;

export function generateMetadata(): Metadata {
  const titulo = "Venda as fotos dos seus eventos";
  const descricao = `Publique fotos e vídeos de eventos, defina o preço e receba por Pix. Só ${pct(comissaoPadraoPct())} de comissão, sem mensalidade.`;
  return {
    title: titulo,
    description: descricao,
    alternates: { canonical: urlDoSite("/vender-fotos") },
    openGraph: {
      title: `${titulo} | ClicouAí`,
      description: descricao,
      url: urlDoSite("/vender-fotos"),
      type: "website",
      locale: "pt_BR",
      // Foto de divulgação da vitrine, sem relação com nenhuma foto à venda.
      images: [{ url: urlDoSite(IMAGENS_INICIO.corridaRua.reduzida) }],
    },
  };
}

const gruposDeRecursos = [
  {
    titulo: "Para o cliente encontrar",
    recursos: [
      {
        icone: ScanFace,
        titulo: "Busca por selfie",
        texto: "A pessoa envia uma selfie e vê só as fotos do evento em que aparece.",
      },
      {
        icone: Clapperboard,
        titulo: "Fotos e vídeos",
        texto: "Venda também vídeos curtos, de até 30 segundos, em MP4 ou MOV, com preço próprio.",
      },
    ],
  },
  {
    titulo: "Para o cliente comprar",
    recursos: [
      {
        icone: CreditCard,
        titulo: "Pix e cartão",
        texto: "O pagamento acontece dentro do site, com as duas formas que o público mais usa.",
      },
      {
        icone: UserRoundX,
        titulo: "Compra sem cadastro",
        texto: "Nome e e-mail bastam para comprar. Menos passos até a venda fechar.",
      },
      {
        icone: Mail,
        titulo: "Entrega por e-mail",
        texto: "Pagamento aprovado, o cliente baixa o original na tela e recebe o link por e-mail.",
      },
      {
        icone: Tag,
        titulo: "Cupons e descontos",
        texto: "Crie cupons, desconto por quantidade e pacote com todas as fotos da pessoa.",
      },
    ],
  },
  {
    titulo: "Para o seu trabalho",
    recursos: [
      {
        icone: Users,
        titulo: "Colaboradores",
        texto: "Chame outros fotógrafos para o evento. A divisão de cada venda é automática.",
      },
      {
        icone: Store,
        titulo: "Loja própria",
        texto:
          "Sua página com banner, logo, cores e só os seus eventos, para divulgar onde quiser.",
      },
      {
        icone: Stamp,
        titulo: "Marca d'água do seu jeito",
        texto: "Escolha o modelo, o tamanho e a força da marca nas prévias das suas fotos.",
      },
      {
        icone: BarChart3,
        titulo: "Relatórios",
        texto: "Acompanhe vendas, visitas e ganhos de cada evento, e imprima o relatório em PDF.",
      },
      {
        icone: Layers,
        titulo: "Lightroom Classic",
        texto: "Publique as fotos editadas direto do Lightroom Classic, com o nosso plugin.",
      },
    ],
  },
];

const protecoes = [
  {
    icone: Images,
    titulo: "A prévia não é a sua foto",
    texto:
      "Na galeria aparece só uma prévia gerada por nós, com a marca d'água gravada nos pixels da imagem. Ela faz parte da imagem, não é uma camada por cima.",
  },
  {
    icone: LockKeyhole,
    titulo: "O original só depois do pagamento",
    texto:
      "O arquivo fica em área privada. O comprador só recebe o link, que expira, depois que o pagamento é conferido pelo nosso servidor.",
  },
  {
    icone: ScanFace,
    titulo: "A selfie não fica guardada",
    texto:
      "A selfie do cliente vai só ao serviço de reconhecimento, durante a busca. Ela nunca é gravada no nosso banco, nos nossos arquivos ou nos registros.",
  },
];

export default function PaginaVenderFotos() {
  const comissao = pct(comissaoPadraoPct());
  const taxaCartao = taxaCartaoPct();
  const metadeTaxa = pct(taxaCartao / 2);
  const preco = 10000;

  const exemplos = [
    {
      titulo: "Venda no Pix",
      prazo: "Disponível em 1 dia",
      ...exemploDeVenda(preco, "pix", comissaoPadraoPct(), taxaCartao),
    },
    {
      titulo: "Venda no cartão",
      prazo: "Disponível em 30 dias",
      ...exemploDeVenda(preco, "cartao", comissaoPadraoPct(), taxaCartao),
    },
    {
      titulo: "Cartão com antecipação",
      prazo: "Disponível em 1 dia (opcional)",
      ...exemploDeVenda(preco, "cartao_antecipado", comissaoPadraoPct(), taxaCartao),
    },
  ];

  const perguntas = [
    {
      pergunta: "Quanto custa usar o ClicouAí?",
      resposta: `Não há mensalidade nem custo para publicar. A comissão é de ${comissao} sobre o que você vendeu e é descontada só na hora do saque. Nas vendas no cartão, metade da taxa do cartão sai da sua parte, e a antecipação, se você ligar, custa ${TAXA_ANTECIPACAO_TEXTO}.`,
    },
    {
      pergunta: "Quando o dinheiro fica disponível?",
      resposta: `Vendas no Pix ficam disponíveis 1 dia depois do pagamento, sem taxa extra. Vendas no cartão ficam em 30 dias, sem taxa extra, ou em 1 dia se você ligar a antecipação do cartão. Depois do pedido de saque, a equipe do ClicouAí faz o Pix em até 1 dia. O saque mínimo é de ${formatarPreco(SAQUE_MINIMO_CENTAVOS)} líquido.`,
    },
    {
      pergunta: "A antecipação é obrigatória?",
      resposta: `Não. Ela vem desligada. Se você ligar, as vendas no cartão com menos de 30 dias pagam ${TAXA_ANTECIPACAO_TEXTO} a mais e entram no saque a partir de 1 dia. As vendas no Pix nunca pagam essa taxa.`,
    },
    {
      pergunta: "Preciso ter CNPJ?",
      resposta:
        "Não. Você pode usar o seu CPF ou CNPJ. O saque vai sempre por Pix para a chave do seu próprio documento, e é preciso confirmar essa chave antes de publicar um evento.",
    },
    {
      pergunta: "Quais arquivos posso enviar?",
      resposta:
        "Fotos em JPEG, PNG, WebP, TIFF, AVIF ou HEIC, até 200 MB cada. Vídeos em MP4 ou MOV, de até 30 segundos e 300 MB. Arquivo RAW não é aceito: exporte antes de enviar. O comprador recebe o original no formato enviado; só o HEIC é convertido em JPEG antes do envio.",
    },
    {
      pergunta: "Quem define o preço?",
      resposta:
        "Você. Cada evento tem um preço por foto e outro por vídeo, e dá para mudar o preço de uma foto específica. Os cupons e os descontos também são seus, e o site calcula tudo no carrinho.",
    },
    {
      pergunta: "Funciona com o Lightroom?",
      resposta:
        "Sim, com o Lightroom Classic, o programa instalado no computador. Você baixa o plugin no painel e publica as fotos nas coleções dos seus eventos. O Lightroom da web e o do celular não aceitam plugins.",
    },
    {
      pergunta: "Como funciona com outros fotógrafos no mesmo evento?",
      resposta:
        "O dono do evento adiciona os colaboradores pelo e-mail da conta de fotógrafo deles e define a própria comissão. Em cada venda de foto de colaborador, a divisão é feita sozinha, e cada um paga a comissão da plataforma no próprio saque.",
    },
    {
      pergunta: "Alguém consegue pegar o original sem pagar?",
      resposta:
        "O cliente, não: ele só baixa o que comprou. Você baixa os originais que enviou. Outro fotógrafo também não tem acesso, nem no mesmo evento. A gestão do ClicouAí pode baixar originais para suporte e operação, sempre com registro de cada entrega.",
    },
    {
      pergunta: "As fotos continuam sendo minhas?",
      resposta:
        "Sim. Os direitos autorais continuam com você. O comprador pode usar a foto para fins pessoais, inclusive nas redes sociais, mas não pode revender nem usar em publicidade sem a sua autorização.",
    },
    {
      pergunta: "O que acontece se uma venda for estornada?",
      resposta:
        "O valor da venda estornada ou contestada no cartão pode ser descontado do seu saldo ou dos próximos saques. O detalhe de cada venda aparece no Financeiro do painel.",
    },
  ];

  return (
    <>
      <section
        aria-labelledby="titulo-vender-fotos"
        className="relative isolate overflow-hidden bg-linear-150 from-primary from-10% to-profundo to-95% text-white"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(rgb(255_255_255/0.07)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,black,transparent_85%)] [background-size:22px_22px]"
        />
        <div
          className={`${CONTAINER} grid items-center gap-8 py-10 md:py-14 lg:grid-cols-[1.1fr_1fr] lg:gap-12 lg:py-16`}
        >
          <div className="flex min-w-0 flex-col items-start gap-5 md:gap-6">
            <p className="border-l-[3px] border-highlight pl-3 text-xs font-semibold tracking-[0.16em] text-white/90 uppercase">
              Para fotógrafos
            </p>
            <h1
              id="titulo-vender-fotos"
              className="text-[clamp(2.1rem,1.2rem+4.2vw,3.75rem)] leading-[1.06] font-extrabold tracking-tight text-balance"
            >
              Você fotografa o evento.{" "}
              <span className="text-highlight">A gente ajuda a vender.</span>
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-pretty text-white/90 md:text-lg">
              Publique as fotos e os vídeos, escolha o preço e deixe cada pessoa encontrar as
              próprias imagens com uma selfie.
            </p>
            <p className="inline-flex flex-wrap items-center gap-x-2 rounded-2xl bg-highlight px-4 py-2 text-base font-extrabold text-highlight-foreground">
              Só {comissao} de comissão
              <span aria-hidden="true">·</span>
              <span>sem mensalidade</span>
            </p>
            <div className="flex w-full flex-wrap items-center gap-3">
              <ChamadaCadastro />
              <a
                href="#preco"
                className="inline-flex h-13 items-center rounded-full px-4 font-semibold text-white underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-white/70 focus-visible:outline-none"
              >
                Ver preço e condições
              </a>
            </div>
          </div>
          <div className="min-w-0">
            <CarrosselTopo slides={SLIDES_TOPO} />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="titulo-beneficios"
        className={`${CONTAINER} grid gap-8 py-12 md:py-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12`}
      >
        {/* A faixa limão atrás do canto é só decoração. No celular a foto vem depois do título. */}
        <div className="relative isolate order-2 mr-2 mb-2 lg:order-1 lg:mr-0">
          <span
            aria-hidden="true"
            className="absolute -right-2 -bottom-2 -z-10 h-2/5 w-3/5 rounded-3xl bg-highlight"
          />
          <div className="relative aspect-[4/5] overflow-hidden rounded-3xl sm:aspect-[3/2] lg:aspect-auto lg:h-full">
            <Image
              src={FOTO_BENEFICIOS.src}
              alt={FOTO_BENEFICIOS.alt}
              fill
              sizes="(min-width: 1280px) 520px, (min-width: 1024px) 40vw, 100vw"
              className="object-cover object-[50%_62%] sm:object-[50%_44%] lg:object-[50%_60%]"
            />
          </div>
        </div>
        <div className="contents lg:order-2 lg:flex lg:min-w-0 lg:flex-col lg:gap-8">
          <h2
            id="titulo-beneficios"
            className="order-1 max-w-2xl text-2xl font-extrabold tracking-tight text-balance md:text-4xl"
          >
            Mais tempo fotografando, menos tempo vendendo foto por mensagem
          </h2>
          <div className="order-3 grid gap-4">
            <div className="relative isolate flex flex-col justify-between gap-6 overflow-hidden rounded-3xl bg-profundo p-6 text-white md:p-8">
              <span
                aria-hidden="true"
                className="absolute -top-20 -right-20 -z-10 size-72 rounded-full bg-primary/40 blur-2xl"
              />
              <BadgePercent
                aria-hidden="true"
                strokeWidth={1.75}
                className="size-8 text-highlight"
              />
              <div>
                <p className="text-[clamp(3.5rem,2rem+8vw,6.5rem)] leading-none font-extrabold tracking-tight text-highlight">
                  Só {comissao}
                </p>
                <p className="mt-3 max-w-md text-lg text-pretty text-white/90">
                  de comissão sobre o que você vende. Sem mensalidade e sem custo para publicar.
                </p>
              </div>
              <a
                href="#preco"
                className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md text-sm font-semibold underline underline-offset-4 focus-visible:ring-3 focus-visible:ring-white/70 focus-visible:outline-none"
              >
                Veja as condições do cartão e da antecipação
              </a>
            </div>
            <ul className="flex flex-col gap-4">
              {[
                {
                  icone: Tag,
                  titulo: "O preço é você quem define",
                  texto:
                    "Cada evento tem o seu preço por foto e por vídeo, e você pode mudar o de uma foto específica.",
                },
                {
                  icone: ShoppingBag,
                  titulo: "O cliente compra sem depender de você",
                  texto:
                    "Ele encontra as fotos, paga e baixa o original na hora, mesmo enquanto você está no próximo evento.",
                },
                {
                  icone: Banknote,
                  titulo: "O dinheiro vai para a sua chave Pix",
                  texto:
                    "Você acompanha cada venda no painel e saca por Pix, sempre para o seu próprio CPF ou CNPJ.",
                },
              ].map(({ icone: Icone, titulo, texto }) => (
                <li key={titulo} className="flex flex-1 gap-4 rounded-2xl border bg-card p-5">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                    <Icone aria-hidden="true" className="size-5" />
                  </span>
                  <span className="flex flex-col gap-1">
                    <span className="text-lg font-bold">{titulo}</span>
                    <span className="text-muted-foreground">{texto}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section aria-labelledby="titulo-recursos" className="border-y bg-card">
        <div className={`${CONTAINER} py-12 md:py-16`}>
          <h2
            id="titulo-recursos"
            className="max-w-2xl text-2xl font-extrabold tracking-tight text-balance md:text-4xl"
          >
            O que você encontra no ClicouAí
          </h2>
          <div className="mt-8 flex flex-col gap-10">
            {gruposDeRecursos.map((grupo) => (
              <div key={grupo.titulo}>
                <h3 className="text-sm font-bold tracking-wide text-primary uppercase">
                  {grupo.titulo}
                </h3>
                <ul className="mt-4 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
                  {grupo.recursos.map(({ icone: Icone, titulo, texto }) => (
                    <li key={titulo} className="flex gap-3">
                      <Icone
                        aria-hidden="true"
                        strokeWidth={1.75}
                        className="mt-0.5 size-6 shrink-0 text-primary"
                      />
                      <span className="flex flex-col gap-1">
                        <span className="font-bold">{titulo}</span>
                        <span className="text-sm leading-relaxed text-muted-foreground">
                          {texto}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="titulo-seguranca" className={`${CONTAINER} py-12 md:py-16`}>
        <h2
          id="titulo-seguranca"
          className="max-w-2xl text-2xl font-extrabold tracking-tight text-balance md:text-4xl"
        >
          Seu trabalho protegido, e o rosto do cliente também
        </h2>
        <ul className="mt-6 grid gap-4 md:mt-8 md:grid-cols-3">
          {protecoes.map(({ icone: Icone, titulo, texto }) => (
            <li key={titulo} className="flex flex-col gap-3 rounded-2xl bg-accent p-6">
              <Icone aria-hidden="true" strokeWidth={1.75} className="size-7 text-primary" />
              <span className="text-lg font-bold">{titulo}</span>
              <span className="text-foreground">{texto}</span>
            </li>
          ))}
        </ul>
      </section>

      <section
        id="preco"
        aria-labelledby="titulo-preco"
        className="scroll-mt-20 bg-profundo text-white"
      >
        <div
          className={`${CONTAINER} grid gap-8 py-12 md:py-16 lg:grid-cols-[1fr_1.3fr] lg:gap-12`}
        >
          <div className="flex min-w-0 flex-col items-start gap-5">
            <h2
              id="titulo-preco"
              className="text-2xl font-extrabold tracking-tight text-balance md:text-4xl"
            >
              Um preço simples
            </h2>
            <p className="text-[clamp(4rem,2.5rem+8vw,7rem)] leading-none font-extrabold tracking-tight text-highlight">
              {comissao}
            </p>
            <p className="text-lg text-pretty text-white/90">
              de comissão do ClicouAí, descontada no saque. <strong>Sem mensalidade.</strong> Sem
              custo para publicar.
            </p>
            <ChamadaCadastro />
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <h3 className="text-lg font-bold">Exemplo: uma venda de {formatarPreco(preco)}</h3>
            <ul className="grid gap-3 md:grid-cols-3">
              {exemplos.map((e) => (
                <li key={e.titulo} className="flex flex-col gap-2 rounded-2xl bg-white/8 p-4">
                  <span className="font-bold">{e.titulo}</span>
                  <span className="text-sm text-white/80">{e.prazo}</span>
                  <span className="mt-1 text-sm text-white/80">
                    Cliente paga {formatarPreco(e.clientePagaCentavos)}
                  </span>
                  <ul className="flex flex-col gap-0.5 text-sm text-white/80">
                    {e.taxaCartaoCentavos > 0 && (
                      <li>− {formatarPreco(e.taxaCartaoCentavos)} metade da taxa do cartão</li>
                    )}
                    <li>− {formatarPreco(e.comissaoCentavos)} comissão</li>
                    {e.antecipacaoCentavos > 0 && (
                      <li>− {formatarPreco(e.antecipacaoCentavos)} antecipação</li>
                    )}
                  </ul>
                  <span className="mt-auto pt-2 text-sm">
                    Você recebe
                    <span className="block text-2xl font-extrabold tracking-tight text-highlight">
                      {formatarPreco(e.recebeCentavos)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-white/80">
              Valores arredondados como no sistema. No Financeiro do painel, cada venda mostra a
              conta real.
            </p>
            <div>
              <h3 className="font-bold">O que mais entra na conta</h3>
              <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-white/85">
                <li>
                  <strong className="text-white">Taxa do cartão:</strong> o Mercado Pago cobra{" "}
                  {pct(taxaCartao)}. Ela é dividida: o cliente paga um acréscimo e {metadeTaxa} sai
                  da sua parte, antes da comissão. No Pix, não existe essa taxa.
                </li>
                <li>
                  <strong className="text-white">Antecipação do cartão:</strong> opcional e
                  desligada no começo. Se você ligar, recebe em 1 dia e paga{" "}
                  {TAXA_ANTECIPACAO_TEXTO} sobre as vendas com menos de 30 dias.
                </li>
                <li>
                  <strong className="text-white">Saque:</strong> mínimo de{" "}
                  {formatarPreco(SAQUE_MINIMO_CENTAVOS)} líquido. Depois do pedido, a equipe do
                  ClicouAí faz o Pix em até 1 dia.
                </li>
                <li>
                  <strong className="text-white">Colaboradores:</strong> quando há divisão, cada um
                  paga as taxas sobre a própria parte.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="titulo-perguntas" className={`${CONTAINER} py-12 md:py-16`}>
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <h2
            id="titulo-perguntas"
            className="text-2xl font-extrabold tracking-tight text-balance md:text-4xl"
          >
            Perguntas frequentes
          </h2>
          <div className="flex flex-col divide-y rounded-xl border bg-card">
            {perguntas.map(({ pergunta, resposta }) => (
              <details key={pergunta} className="group p-4">
                <summary className="cursor-pointer list-none rounded-sm font-medium focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-3">
                    {pergunta}
                    <span aria-hidden="true" className="text-muted-foreground group-open:rotate-45">
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-2 text-muted-foreground">{resposta}</p>
              </details>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Veja também a{" "}
            <Link href="/ajuda" className="font-medium text-primary hover:underline">
              central de ajuda
            </Link>{" "}
            e os{" "}
            <Link href="/termos" className="font-medium text-primary hover:underline">
              termos de uso
            </Link>
            .
          </p>
          <Link href={CADASTRO} className={`${buttonVariants({ size: "touch" })} self-start`}>
            Criar conta de fotógrafo
            <ArrowRight aria-hidden="true" data-icon="inline-end" />
          </Link>
        </div>
      </section>

      <section aria-labelledby="titulo-chamada-final" className={`${CONTAINER} pb-12 md:pb-16`}>
        <div className="relative isolate flex flex-col items-start gap-5 overflow-hidden rounded-3xl bg-linear-150 from-primary from-10% to-profundo to-95% p-6 text-white md:p-12">
          <Image src="/logo-clara.png" alt="" width={544} height={160} className="h-9 w-auto" />
          <h2
            id="titulo-chamada-final"
            className="max-w-2xl text-2xl font-extrabold tracking-tight text-balance md:text-4xl"
          >
            Seu próximo evento pode começar a vender aqui
          </h2>
          <p className="max-w-xl text-pretty text-white/90">
            Crie a conta, confirme a sua chave Pix e publique. Só {comissao} de comissão, sem
            mensalidade.
          </p>
          <ChamadaCadastro />
          <p className="flex items-center gap-2 text-sm text-white/85">
            <KeyRound aria-hidden="true" className="size-4 shrink-0" />
            Já tem conta?{" "}
            <Link
              href="/entrar"
              className="font-semibold underline underline-offset-4 focus-visible:ring-3 focus-visible:ring-white/70 focus-visible:outline-none"
            >
              Entrar no painel
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}

/** Chamada principal: o botão limão em pílula, como o "Quero ser fotógrafo" da inicial. */
function ChamadaCadastro() {
  return (
    <Link
      href={CADASTRO}
      className="group inline-flex min-h-13 items-center justify-center gap-2 rounded-full bg-highlight px-6 py-3 text-center font-semibold text-highlight-foreground transition hover:brightness-95 focus-visible:ring-3 focus-visible:ring-white/70 focus-visible:outline-none"
    >
      Quero vender minhas fotos
      <ArrowRight
        aria-hidden="true"
        className="size-5 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none"
      />
    </Link>
  );
}
