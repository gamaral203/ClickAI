import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CalendarRange,
  CreditCard,
  ExternalLink,
  HardDrive,
  Images,
  Mail,
  Plus,
  ReceiptText,
  ScanFace,
  ShoppingBag,
} from "lucide-react";

import { CartaoNumero } from "@/components/admin/tabela";
import { AbasDoPainelDeUso } from "@/components/admin/painel-de-uso/abas";
import { AcoesAssinatura } from "@/components/admin/painel-de-uso/acoes-assinatura";
import {
  FormularioAssinatura,
  type AssinaturaNoFormulario,
} from "@/components/admin/painel-de-uso/formulario-assinatura";
import { FormularioConfiguracoes } from "@/components/admin/painel-de-uso/formulario-configuracoes";
import { buttonVariants } from "@/components/ui/button";
import {
  lerConfiguracoesGestao,
  lerUsoInterno,
  listarAssinaturas,
  type Assinatura,
  type ConfiguracoesGestao,
  type UsoInterno,
} from "@/dados";
import { centavosParaCampo } from "@/lib/dinheiro";
import { textoCotacao } from "@/lib/financeiro-plataforma";
import { formatarBytes, formatarDataCurta, formatarPreco } from "@/lib/formatar";
import {
  BYTES_ORIGINAL_ESTIMADO,
  BYTES_PREVIA_ESTIMADA,
  CATEGORIAS_ASSINATURA,
  custoR2CentavosUsd,
  diasParaVencer,
  dolarParaReal,
  FRACAO_ALERTA,
  formatarDia,
  formatarMoeda,
  fracaoDoLimite,
  hojeEmBrasilia,
  periodoDoMes,
  R2_GB_GRATIS,
  resumirGastos,
  ROTULO_CATEGORIA,
  ROTULO_CICLO,
  textoDoVencimento,
  type CategoriaAssinatura,
} from "@/lib/painel-de-uso";
import { exigirGestor } from "@/servicos/sessao";

export const metadata: Metadata = {
  title: "Painel de uso",
  robots: { index: false, follow: false },
};

const CAMINHO = "/admin/uso";

/** Hora atual, lida depois de esperar a requisição (Cache Components). */
async function instanteAtual() {
  await connection();
  return Date.now();
}

type Situacao = "ativas" | "inativas" | "todas";
type Filtros = {
  situacao: Situacao;
  categoria: CategoriaAssinatura | null;
  periodo: "atual" | "anterior";
};

/** Endereço da página com os filtros (sem os padrões) e, opcionalmente, o formulário aberto. */
function endereco(f: Filtros, extra: Record<string, string> = {}) {
  const p = new URLSearchParams();
  if (f.situacao !== "ativas") p.set("situacao", f.situacao);
  if (f.categoria) p.set("categoria", f.categoria);
  if (f.periodo !== "atual") p.set("periodo", f.periodo);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  const q = p.toString();
  return q ? `${CAMINHO}?${q}` : CAMINHO;
}

export default function PaginaPainelDeUso({ searchParams }: PageProps<"/admin/uso">) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">Painel de uso</h1>
          <p className="text-muted-foreground">
            Quanto a plataforma gasta com os serviços que assina e quanto usa de cada um.
          </p>
        </div>
        <AbasDoPainelDeUso atual="uso" />
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({
  searchParams,
}: {
  searchParams: PageProps<"/admin/uso">["searchParams"];
}) {
  await exigirGestor(CAMINHO);
  const p = await searchParams;
  const texto = (v: unknown) => (typeof v === "string" ? v : "");
  const situacao: Situacao =
    (["inativas", "todas"] as const).find((s) => s === p.situacao) ?? "ativas";
  const categoria = CATEGORIAS_ASSINATURA.find((c) => c === p.categoria) ?? null;
  const periodo = p.periodo === "anterior" ? "anterior" : "atual";
  const filtros: Filtros = { situacao, categoria, periodo };
  const nova = texto(p.nova) === "1";
  const editarId = texto(p.editar);

  const agora = await instanteAtual();
  const mes = periodoDoMes(periodo, agora);
  const [assinaturas, config, uso] = await Promise.all([
    listarAssinaturas(),
    lerConfiguracoesGestao(),
    lerUsoInterno(mes, mes.inicioHoje, mes.hoje),
  ]);
  const editando = assinaturas.find((a) => a.id === editarId);

  return (
    <>
      <section aria-labelledby="titulo-gastos" className="flex flex-col gap-5">
        <h2 id="titulo-gastos" className="text-xl font-semibold">
          Assinaturas e gastos
        </h2>
        <ResumoDeGastos assinaturas={assinaturas} config={config} agora={agora} />
        <ListaDeAssinaturas
          assinaturas={assinaturas}
          filtros={filtros}
          agora={agora}
          formulario={
            nova || editando ? (
              <FormularioAssinatura
                key={editando?.id ?? "nova"}
                assinatura={editando ? noFormulario(editando) : undefined}
                voltar={endereco(filtros)}
                hoje={hojeEmBrasilia(agora)}
              />
            ) : null
          }
        />
        <details className="group rounded-xl border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-semibold [&::-webkit-details-marker]:hidden">
            Cotação do dólar e limites de e-mail
            <span className="text-sm font-normal text-muted-foreground group-open:hidden">
              {config.cotacaoUsdCentavos
                ? `US$ 1 = ${formatarPreco(config.cotacaoUsdCentavos)}`
                : "Cotação não definida"}
            </span>
          </summary>
          <div className="border-t p-4">
            <FormularioConfiguracoes
              cotacao={config.cotacaoUsdCentavos ? textoCotacao(config.cotacaoDezMilesimos) : ""}
              cotacaoAtualizada={
                config.cotacaoAtualizadaEm
                  ? `Atualizada em ${formatarDataCurta(config.cotacaoAtualizadaEm)}`
                  : null
              }
              limiteDia={config.limiteEmailDia}
              limiteMes={config.limiteEmailMes}
            />
          </div>
        </details>
      </section>

      <section aria-labelledby="titulo-uso" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="titulo-uso" className="text-xl font-semibold">
              Uso interno
            </h2>
            <p className="text-sm text-muted-foreground">
              Dados do próprio sistema em <span className="font-medium">{mes.rotulo}</span> (horário
              de Brasília). Só leitura.
            </p>
          </div>
          <nav aria-label="Período" className="flex gap-2">
            {(
              [
                ["atual", "Mês atual"],
                ["anterior", "Mês anterior"],
              ] as const
            ).map(([id, rotulo]) => (
              <Chip
                key={id}
                href={endereco({ ...filtros, periodo: id })}
                ativo={periodo === id}
                rotulo={rotulo}
              />
            ))}
          </nav>
        </div>
        <UsoDoSistema uso={uso} config={config} periodo={periodo} />
      </section>
    </>
  );
}

function noFormulario(a: Assinatura): AssinaturaNoFormulario {
  return {
    id: a.id,
    nome: a.nome,
    categoria: a.categoria,
    plano: a.plano,
    valor: centavosParaCampo(a.valorCentavos),
    moeda: a.moeda,
    ciclo: a.ciclo,
    assinadaEm: a.assinadaEm,
    renovaEm: a.renovaEm ?? "",
    formaPagamento: a.formaPagamento,
    responsavel: a.responsavel,
    linkPainel: a.linkPainel ?? "",
    observacoes: a.observacoes,
  };
}

// ---------------------------------------------------------------- Peças

function Chip({
  href,
  ativo,
  rotulo,
  quantos,
}: {
  href: string;
  ativo: boolean;
  rotulo: string;
  quantos?: number;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={ativo ? "page" : undefined}
      className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold ${
        ativo ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"
      }`}
    >
      {rotulo}
      {quantos !== undefined && (
        <span
          className={`rounded-full px-1.5 text-xs tabular-nums ${ativo ? "bg-white/25" : "bg-muted text-muted-foreground"}`}
        >
          {quantos}
        </span>
      )}
    </Link>
  );
}

/** Tom do vencimento: vencido ou ≤ 1 dia em vermelho, ≤ 7 dias em âmbar. */
function tomDoVencimento(dias: number) {
  if (dias <= 1) {
    return "bg-red-50 text-red-800 ring-red-600/20 dark:bg-red-950 dark:text-red-200";
  }
  if (dias <= 7) {
    return "bg-amber-50 text-amber-900 ring-amber-600/25 dark:bg-amber-950 dark:text-amber-200";
  }
  return "bg-muted text-muted-foreground ring-border";
}

function Vencimento({ renovaEm, agora }: { renovaEm: string | null; agora: number }) {
  if (!renovaEm) return <span className="text-muted-foreground">Não renova</span>;
  const dias = diasParaVencer(renovaEm, agora);
  return (
    <span className="flex flex-col items-start gap-0.5 md:items-start">
      <span className="tabular-nums">{formatarDia(renovaEm)}</span>
      <span
        className={`rounded-md px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset ${tomDoVencimento(dias)}`}
      >
        {textoDoVencimento(dias)}
      </span>
    </span>
  );
}

/** Barra de progresso em CSS. Acima de 80% fica âmbar; no limite ou acima, vermelha. */
function Barra({ usado, limite, rotulo }: { usado: number; limite: number; rotulo: string }) {
  const fracao = fracaoDoLimite(usado, limite);
  const cor =
    fracao >= 1 ? "bg-destructive" : fracao >= FRACAO_ALERTA ? "bg-amber-500" : "bg-primary";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{rotulo}</span>
        <span className="font-semibold tabular-nums">
          {usado.toLocaleString("pt-BR")}{" "}
          <span className="font-normal text-muted-foreground">
            de {limite.toLocaleString("pt-BR")} ({Math.round(fracao * 100)}%)
          </span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={rotulo}
        aria-valuemin={0}
        aria-valuemax={limite}
        aria-valuenow={Math.min(usado, limite)}
        className="h-2.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={`h-full rounded-full ${cor}`}
          style={{ width: `${Math.min(100, fracao * 100)}%` }}
        />
      </div>
    </div>
  );
}

function Quadro({
  icone,
  titulo,
  children,
  nota,
}: {
  icone: React.ReactNode;
  titulo: string;
  children: React.ReactNode;
  nota?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5">
      <h3 className="flex items-center gap-2 font-semibold">
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          {icone}
        </span>
        {titulo}
      </h3>
      {children}
      {nota && <p className="mt-auto text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}

function Numero({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-2xl font-bold tabular-nums">{valor}</span>
      <span className="text-xs text-muted-foreground">{rotulo}</span>
    </div>
  );
}

const n = (v: number) => v.toLocaleString("pt-BR");

// ---------------------------------------------------------------- Resumo de gastos

function ResumoDeGastos({
  assinaturas,
  config,
  agora,
}: {
  assinaturas: Assinatura[];
  config: ConfiguracoesGestao;
  agora: number;
}) {
  const r = resumirGastos(assinaturas, config.cotacaoUsdCentavos);
  const separado = (brl: number, usd: number) =>
    `${formatarMoeda(brl, "BRL")} + ${formatarMoeda(usd, "USD")}`;
  const semCotacao = "Defina a cotação do dólar abaixo";
  const proximas = assinaturas
    .filter((a) => a.ativa && a.renovaEm)
    .map((a) => ({ a, dias: diasParaVencer(a.renovaEm!, agora) }))
    .filter(({ dias }) => dias >= 0 && dias <= 30);

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <CartaoNumero
        icone={<ReceiptText aria-hidden="true" className="size-4" />}
        titulo="Gasto mensal estimado"
        valor={r.mensalTotalBrl === null ? "—" : formatarPreco(r.mensalTotalBrl)}
        texto={
          r.mensalTotalBrl === null
            ? `${separado(r.mensalBrl, r.mensalUsd)}. ${semCotacao}.`
            : separado(r.mensalBrl, r.mensalUsd)
        }
      />
      <CartaoNumero
        icone={<CalendarRange aria-hidden="true" className="size-4" />}
        titulo="Gasto anual estimado"
        valor={r.anualTotalBrl === null ? "—" : formatarPreco(r.anualTotalBrl)}
        texto={separado(r.anualBrl, r.anualUsd)}
      />
      <CartaoNumero
        icone={<CreditCard aria-hidden="true" className="size-4" />}
        titulo="Assinaturas ativas"
        valor={String(r.ativas)}
        texto={`${assinaturas.length - r.ativas} inativas`}
      />
      <div className="col-span-2 flex min-w-0 flex-col gap-2 rounded-xl border p-3 sm:p-5 xl:col-span-1">
        <span className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
          <CalendarClock aria-hidden="true" className="size-4" />
          Próximos vencimentos (30 dias)
        </span>
        {proximas.length === 0 ? (
          <span className="text-sm text-muted-foreground">Nada vence nos próximos 30 dias.</span>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {proximas.slice(0, 5).map(({ a, dias }) => (
              <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate font-medium" title={a.nome}>
                  {a.nome}
                </span>
                <span
                  className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset ${tomDoVencimento(dias)}`}
                >
                  {textoDoVencimento(dias)}
                </span>
              </li>
            ))}
            {proximas.length > 5 && (
              <li className="text-xs text-muted-foreground">e mais {proximas.length - 5}</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Lista de assinaturas

function ListaDeAssinaturas({
  assinaturas,
  filtros,
  agora,
  formulario,
}: {
  assinaturas: Assinatura[];
  filtros: Filtros;
  agora: number;
  formulario: React.ReactNode;
}) {
  const daSituacao = (s: Situacao) =>
    assinaturas.filter((a) => (s === "todas" ? true : s === "ativas" ? a.ativa : !a.ativa));
  const naSituacao = daSituacao(filtros.situacao);
  const visiveis = filtros.categoria
    ? naSituacao.filter((a) => a.categoria === filtros.categoria)
    : naSituacao;
  const categoriasUsadas = CATEGORIAS_ASSINATURA.filter((c) =>
    naSituacao.some((a) => a.categoria === c),
  );

  if (assinaturas.length === 0) {
    return (
      formulario ?? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center sm:p-12">
          <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <CreditCard aria-hidden="true" className="size-6" />
          </span>
          <p className="text-lg font-semibold">Cadastre a primeira assinatura</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Vercel, Supabase, Cloudflare, Resend, domínio… Com tudo aqui, o painel soma o gasto do
            mês e avisa a gestão por e-mail antes de cada renovação.
          </p>
          <Link
            href={endereco(filtros, { nova: "1" })}
            scroll={false}
            className={buttonVariants({ size: "touch" })}
          >
            <Plus aria-hidden="true" data-icon="inline-start" />
            Cadastrar assinatura
          </Link>
        </div>
      )
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label="Situação da assinatura"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
        >
          {(
            [
              ["ativas", "Ativas"],
              ["inativas", "Inativas"],
              ["todas", "Todas"],
            ] as const
          ).map(([id, rotulo]) => (
            <Chip
              key={id}
              href={endereco({ ...filtros, situacao: id, categoria: null })}
              ativo={filtros.situacao === id}
              rotulo={rotulo}
              quantos={daSituacao(id).length}
            />
          ))}
        </nav>
        {!formulario && (
          <Link
            href={endereco(filtros, { nova: "1" })}
            scroll={false}
            className={buttonVariants({ size: "touch" })}
          >
            <Plus aria-hidden="true" data-icon="inline-start" />
            Nova assinatura
          </Link>
        )}
      </div>
      {categoriasUsadas.length > 1 && (
        <nav
          aria-label="Categoria"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
        >
          <Chip
            href={endereco({ ...filtros, categoria: null })}
            ativo={!filtros.categoria}
            rotulo="Todas as categorias"
          />
          {categoriasUsadas.map((c) => (
            <Chip
              key={c}
              href={endereco({ ...filtros, categoria: c })}
              ativo={filtros.categoria === c}
              rotulo={ROTULO_CATEGORIA[c]}
              quantos={naSituacao.filter((a) => a.categoria === c).length}
            />
          ))}
        </nav>
      )}
      {formulario}
      {visiveis.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          Nenhuma assinatura com esse filtro.
        </p>
      ) : (
        <TabelaDeAssinaturas assinaturas={visiveis} filtros={filtros} agora={agora} />
      )}
    </div>
  );
}

function NomeEPlano({ a }: { a: Assinatura }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="font-semibold [overflow-wrap:anywhere]">{a.nome}</span>
        {!a.ativa && (
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold text-muted-foreground">
            Inativa
          </span>
        )}
      </span>
      {a.plano && <span className="text-xs text-muted-foreground">{a.plano}</span>}
      {a.linkPainel && (
        <a
          href={a.linkPainel}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-0.5 inline-flex w-fit items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Abrir painel
          <ExternalLink aria-hidden="true" className="size-3" />
          <span className="sr-only"> de {a.nome} (abre em outra aba)</span>
        </a>
      )}
    </span>
  );
}

function ValorECiclo({ a }: { a: Assinatura }) {
  return (
    <span className="flex flex-col md:items-end">
      <span className="font-semibold whitespace-nowrap tabular-nums">
        {formatarMoeda(a.valorCentavos, a.moeda)}
      </span>
      <span className="text-xs whitespace-nowrap text-muted-foreground">
        {ROTULO_CICLO[a.ciclo]}
      </span>
    </span>
  );
}

/**
 * Tabela a partir de 1024 px (rola dentro do quadro se não couber, nunca corta coluna, com as
 * ações presas à direita); abaixo disso, um cartão por assinatura.
 */
function TabelaDeAssinaturas({
  assinaturas,
  filtros,
  agora,
}: {
  assinaturas: Assinatura[];
  filtros: Filtros;
  agora: number;
}) {
  const th = "px-4 py-3 font-medium whitespace-nowrap";
  const fixaDireita =
    "sticky right-0 z-10 shadow-[inset_1px_0_0_var(--border),-8px_0_8px_-8px_rgb(0_0_0/0.18)]";
  const editar = (id: string) => endereco(filtros, { editar: id });
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border lg:block">
        <table className="w-full min-w-[64rem] text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              <th scope="col" className={th}>
                Serviço e plano
              </th>
              <th scope="col" className={`${th} w-[9rem]`}>
                Categoria
              </th>
              <th scope="col" className={`${th} w-[9rem] text-right`}>
                Valor
              </th>
              <th scope="col" className={`${th} w-[7rem]`}>
                Assinada em
              </th>
              <th scope="col" className={`${th} w-[9rem]`}>
                Renova em
              </th>
              <th scope="col" className={`${th} w-[11rem]`}>
                Pagamento
              </th>
              <th scope="col" className={`${th} w-[9rem]`}>
                Responsável
              </th>
              <th scope="col" className={`${th} ${fixaDireita} w-[15rem] bg-muted`}>
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {assinaturas.map((a) => (
              <tr key={a.id} className={`align-top ${a.ativa ? "" : "text-muted-foreground"}`}>
                <td className="min-w-[12rem] px-4 py-3">
                  <NomeEPlano a={a} />
                </td>
                <td className="px-4 py-3">{ROTULO_CATEGORIA[a.categoria]}</td>
                <td className="px-4 py-3 text-right">
                  <ValorECiclo a={a} />
                </td>
                <td className="px-4 py-3 tabular-nums">{formatarDia(a.assinadaEm)}</td>
                <td className="px-4 py-3">
                  <Vencimento renovaEm={a.renovaEm} agora={agora} />
                </td>
                <td className="max-w-[11rem] px-4 py-3 [overflow-wrap:anywhere]">
                  {a.formaPagamento || <span className="text-muted-foreground">—</span>}
                </td>
                <td className="max-w-[9rem] px-4 py-3 [overflow-wrap:anywhere]">
                  {a.responsavel || <span className="text-muted-foreground">—</span>}
                </td>
                <td className={`${fixaDireita} min-w-[14rem] bg-background px-4 py-3`}>
                  <AcoesAssinatura
                    id={a.id}
                    nome={a.nome}
                    ativa={a.ativa}
                    editar={editar(a.id)}
                    historico={`/admin/uso/despesas/${a.id}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-3 lg:hidden">
        {assinaturas.map((a) => (
          <li key={a.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <NomeEPlano a={a} />
              <span className="shrink-0 text-right">
                <ValorECiclo a={a} />
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">Renova em</dt>
                <dd>
                  <Vencimento renovaEm={a.renovaEm} agora={agora} />
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">Categoria</dt>
                <dd>{ROTULO_CATEGORIA[a.categoria]}</dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">Assinada em</dt>
                <dd className="tabular-nums">{formatarDia(a.assinadaEm)}</dd>
              </div>
              <div className="flex min-w-0 flex-col">
                <dt className="text-xs text-muted-foreground">Pagamento</dt>
                <dd className="[overflow-wrap:anywhere]">{a.formaPagamento || "—"}</dd>
              </div>
              {a.responsavel && (
                <div className="col-span-2 flex flex-col">
                  <dt className="text-xs text-muted-foreground">Responsável</dt>
                  <dd className="[overflow-wrap:anywhere]">{a.responsavel}</dd>
                </div>
              )}
            </dl>
            <div className="border-t pt-3">
              <AcoesAssinatura
                id={a.id}
                nome={a.nome}
                ativa={a.ativa}
                editar={editar(a.id)}
                historico={`/admin/uso/despesas/${a.id}`}
              />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------- Uso interno

const ROTULO_TIPO_MENSAGEM: Record<string, string> = {
  entrega: "Entrega das fotos",
  lembrete: "Carrinho abandonado",
  lembrete_pix: "Lembrete do Pix",
  denuncia: "Denúncia",
  venda: "Aviso de venda",
  seguranca: "Segurança da conta",
  liberacao: "Fotos liberadas",
  ranking: "Ranking",
};

function UsoDoSistema({
  uso,
  config,
  periodo,
}: {
  uso: UsoInterno;
  config: ConfiguracoesGestao;
  periodo: "atual" | "anterior";
}) {
  const { emails, midia, busca, armazenamento, pedidos } = uso;
  const alerta =
    (periodo === "atual" &&
      fracaoDoLimite(emails.resendHoje, config.limiteEmailDia) >= FRACAO_ALERTA) ||
    fracaoDoLimite(emails.resendPeriodo, config.limiteEmailMes) >= FRACAO_ALERTA;
  const maiorTipo = Math.max(1, ...emails.caixaPorTipo.map((t) => t.total));

  const bytesOriginais =
    armazenamento.bytesOriginaisMedidos + armazenamento.itensSemTamanho * BYTES_ORIGINAL_ESTIMADO;
  const bytesPrevias = armazenamento.itens * BYTES_PREVIA_ESTIMADA;
  const bytesTotal = bytesOriginais + bytesPrevias;
  const custoUsd = custoR2CentavosUsd(bytesTotal);
  const fracaoGratis = bytesTotal / 1024 ** 3 / R2_GB_GRATIS;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Quadro
        icone={<Mail aria-hidden="true" className="size-4" />}
        titulo="E-mails (Resend)"
        nota="Contados quando o Resend aceita o envio (cada destinatário conta um), inclusive códigos de acesso. Por tipo: e-mails registrados na caixa de saída (Mensagens)."
      >
        {alerta && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-600/25 ring-inset dark:bg-amber-950 dark:text-amber-100"
          >
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            Passou de 80% do limite do plano. Considere subir de plano antes que os e-mails parem.
          </p>
        )}
        {periodo === "atual" && (
          <Barra usado={emails.resendHoje} limite={config.limiteEmailDia} rotulo="Hoje" />
        )}
        <Barra
          usado={emails.resendPeriodo}
          limite={config.limiteEmailMes}
          rotulo={periodo === "atual" ? "No mês" : "No mês anterior"}
        />
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Por tipo, no mês</p>
          {emails.caixaPorTipo.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum e-mail registrado no período.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {emails.caixaPorTipo.map((t) => (
                <li
                  key={t.tipo}
                  className="grid grid-cols-[9rem_minmax(0,1fr)_3rem] items-center gap-2 text-sm"
                >
                  <span className="truncate text-muted-foreground">
                    {ROTULO_TIPO_MENSAGEM[t.tipo] ?? t.tipo}
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <span
                      className="block h-full rounded-full bg-primary/70"
                      style={{ width: `${(t.total / maiorTipo) * 100}%` }}
                    />
                  </span>
                  <span className="text-right font-semibold tabular-nums">{n(t.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Quadro>

      <Quadro
        icone={<Images aria-hidden="true" className="size-4" />}
        titulo="Fotos e vídeos processados"
        nota="Itens prontos pela data de envio. Em processamento e com erro: situação agora."
      >
        <div className="grid grid-cols-2 gap-4">
          <Numero valor={n(midia.fotosPeriodo)} rotulo="fotos no mês" />
          <Numero valor={n(midia.videosPeriodo)} rotulo="vídeos no mês" />
          {periodo === "atual" && (
            <>
              <Numero valor={n(midia.fotosHoje)} rotulo="fotos hoje" />
              <Numero valor={n(midia.videosHoje)} rotulo="vídeos hoje" />
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-md bg-muted px-2 py-1 tabular-nums">
            {n(midia.processandoAgora)} em processamento agora
          </span>
          <span
            className={`rounded-md px-2 py-1 tabular-nums ${midia.comErroAgora > 0 ? "bg-red-50 text-red-800 ring-1 ring-red-600/20 ring-inset dark:bg-red-950 dark:text-red-200" : "bg-muted"}`}
          >
            {n(midia.comErroAgora)} com erro
          </span>
        </div>
      </Quadro>

      <Quadro
        icone={<ScanFace aria-hidden="true" className="size-4" />}
        titulo="Busca facial"
        nota="A selfie nunca é gravada: o contador de buscas guarda só o total do dia, sem evento, IP nem imagem."
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Numero valor={n(busca.fotosIndexadasPeriodo)} rotulo="itens cadastrados no mês" />
          <Numero valor={n(busca.rostosIndexadosPeriodo)} rotulo="rostos indexados no mês" />
          <Numero
            valor={busca.diasComRegistroBusca === 0 ? "sem registro" : n(busca.buscasSelfiePeriodo)}
            rotulo="buscas por selfie no mês"
          />
        </div>
      </Quadro>

      <Quadro
        icone={<HardDrive aria-hidden="true" className="size-4" />}
        titulo="Armazenamento (R2)"
        nota={
          <>
            Estimativa: originais somados pelo tamanho gravado
            {armazenamento.itensSemTamanho > 0 &&
              ` (${n(armazenamento.itensSemTamanho)} sem tamanho, contados a ${formatarBytes(BYTES_ORIGINAL_ESTIMADO)})`}
            ; prévias e miniaturas a ~{formatarBytes(BYTES_PREVIA_ESTIMADA)} por item. R2:{" "}
            {R2_GB_GRATIS} GB grátis, US$ 0,015 por GB/mês acima. Situação atual, não do período.
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Numero
            valor={`≈ ${formatarBytes(bytesTotal)}`}
            rotulo={`${n(armazenamento.itens)} arquivos originais`}
          />
          <Numero
            valor={custoUsd === 0 ? "US$ 0,00" : `≈ ${formatarMoeda(custoUsd, "USD")}`}
            rotulo={
              custoUsd > 0 && config.cotacaoUsdCentavos
                ? `por mês (≈ ${formatarPreco(dolarParaReal(custoUsd, config.cotacaoUsdCentavos))})`
                : "por mês (estimativa)"
            }
          />
        </div>
        <Barra
          usado={Math.round(bytesTotal / 1024 ** 2)}
          limite={R2_GB_GRATIS * 1024}
          rotulo="Faixa grátis (MB)"
        />
        <p className="text-xs text-muted-foreground">
          Originais ≈ {formatarBytes(bytesOriginais)} · prévias ≈ {formatarBytes(bytesPrevias)}
          {fracaoGratis >= 1 && " · acima da faixa grátis"}
        </p>
      </Quadro>

      <Quadro
        icone={<ShoppingBag aria-hidden="true" className="size-4" />}
        titulo="Pedidos e vendas"
        nota="Pagos pela data do pagamento; criados pela data do pedido. Volume bruto é o que os compradores pagaram (faturamento, não receita): a receita está no Financeiro da ClicouAí."
      >
        <div className="grid grid-cols-3 gap-4">
          <Numero valor={n(pedidos.pagos)} rotulo="pedidos pagos" />
          <Numero
            valor={formatarPreco(pedidos.totalPagoCentavos)}
            rotulo="volume bruto de vendas"
          />
          <Numero valor={n(pedidos.criados)} rotulo="pedidos criados" />
        </div>
      </Quadro>
    </div>
  );
}
