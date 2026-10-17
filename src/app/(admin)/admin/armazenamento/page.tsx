import type { Metadata } from "next";
import { Suspense } from "react";
import { AlertTriangle, CheckCircle2, Cloud, HardDrive, Timer, XCircle } from "lucide-react";

import {
  AcoesConexaoDrive,
  BotaoVoltarParaR2,
  ChaveExperimental,
  FormularioEventoHibrido,
} from "@/components/admin/armazenamento";
import { Celula, CartaoNumero, Tabela } from "@/components/admin/tabela";
import {
  armazenamentoExperimentalAtivo,
  eventosHibridos,
  resumoMetricasArmazenamento,
  situacaoDaConexaoDrive,
} from "@/dados/configuracoes";
import { formatarDataEHora, formatarGb as emGb } from "@/lib/formatar";
import { mascararEmail } from "@/lib/mascarar-email";
import { conexaoDriveConfigurada, espacoDoDrive } from "@/servicos/conexao-drive";
import { exigirGestor } from "@/servicos/sessao";

export const metadata: Metadata = {
  title: "Armazenamento",
  robots: { index: false, follow: false },
};

const TELA = "/admin/armazenamento";

/** Textos dos códigos curtos que as rotas do OAuth devolvem em `?erro=`. */
const ERROS: Record<string, string> = {
  nao_configurado:
    "O Google Drive não está configurado: faltam GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET ou APP_URL.",
  limite: "Muitas tentativas de conexão seguidas. Espere um pouco e tente de novo.",
  state:
    "A conexão expirou ou não começou neste navegador. Clique em “Conectar conta Google” de novo.",
  negado: "A conexão foi cancelada no Google.",
  sem_permissao:
    "O acesso ao Google Drive não foi concedido. Na tela do Google, deixe marcada a permissão de ver e gerenciar os arquivos criados pelo app.",
  token: "O Google não completou a conexão. Tente de novo.",
  pasta:
    "A conta foi conectada, mas a pasta ClicouAI_Storage não foi criada agora. Ela será criada no primeiro uso; use “Testar conexão” para conferir.",
  falha: "Não foi possível conectar o Google Drive. Tente de novo.",
};

export default function PaginaArmazenamento({ searchParams }: PageProps<"/admin/armazenamento">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Armazenamento</h1>
        <p className="text-muted-foreground">
          Onde ficam os originais das fotos. O Google Drive é um teste: fica desligado até você
          ativar e só vale para os eventos marcados como híbridos.
        </p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function Aviso({ tipo, children }: { tipo: "ok" | "erro"; children: React.ReactNode }) {
  return (
    <p
      role={tipo === "erro" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-xl border p-4 text-sm ${
        tipo === "erro"
          ? "border-destructive/50 bg-destructive/5 text-destructive"
          : "border-emerald-600/40 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
      }`}
    >
      {tipo === "erro" ? (
        <XCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      ) : (
        <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      )}
      <span>{children}</span>
    </p>
  );
}

function Selo({ ligado, children }: { ligado: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        ligado ? "bg-highlight text-highlight-foreground" : "bg-muted text-muted-foreground"
      }`}
    >
      {children}
    </span>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="shrink-0 text-sm text-muted-foreground sm:w-40">{rotulo}</dt>
      <dd className="min-w-0 text-sm break-words">{children}</dd>
    </div>
  );
}

const ms = (valor: number | null) => (valor === null ? "—" : `${valor} ms`);

async function Conteudo({ searchParams }: Pick<PageProps<"/admin/armazenamento">, "searchParams">) {
  await exigirGestor(TELA);
  const params = await searchParams;
  const codigoErro = typeof params.erro === "string" ? params.erro : null;
  const conectouAgora = params.ok === "conectado";

  const configurado = conexaoDriveConfigurada();
  const [ativo, conexao, metricas, eventos] = await Promise.all([
    armazenamentoExperimentalAtivo(),
    situacaoDaConexaoDrive(),
    resumoMetricasArmazenamento(),
    eventosHibridos(),
  ]);

  return (
    <>
      {conectouAgora && <Aviso tipo="ok">Conta do Google Drive conectada.</Aviso>}
      {codigoErro && (
        <Aviso tipo="erro">
          {Object.hasOwn(ERROS, codigoErro) ? ERROS[codigoErro] : ERROS.falha}
        </Aviso>
      )}

      <section aria-labelledby="titulo-servicos" className="flex flex-col gap-3">
        <h2 id="titulo-servicos" className="text-xl font-semibold">
          Serviço ativo
        </h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <li className="flex items-center justify-between gap-3 rounded-xl border p-4">
            <span className="flex items-center gap-2 font-medium">
              <HardDrive aria-hidden="true" className="size-5 text-primary" />
              Cloudflare R2
            </span>
            <Selo ligado>Sempre ligado</Selo>
          </li>
          <li className="flex items-center justify-between gap-3 rounded-xl border p-4">
            <span className="flex items-center gap-2 font-medium">
              <Cloud aria-hidden="true" className="size-5 text-primary" />
              Google Drive (experimental)
            </span>
            <Selo ligado={ativo}>{ativo ? "Ligado" : "Desligado"}</Selo>
          </li>
        </ul>
      </section>

      <section
        aria-labelledby="titulo-conexao"
        className="flex flex-col gap-4 rounded-xl border p-4 sm:p-5"
      >
        <h2 id="titulo-conexao" className="text-xl font-semibold">
          Conexão com o Google Drive
        </h2>
        <dl className="flex flex-col gap-2">
          <Linha rotulo="Configurado">
            {configurado
              ? "Sim"
              : "Não: faltam GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET ou APP_URL"}
          </Linha>
          <Linha rotulo="Conta conectada">
            {conexao
              ? conexao.contaEmail
                ? mascararEmail(conexao.contaEmail)
                : "Conectada (o Google não informou o e-mail)"
              : "Nenhuma"}
          </Linha>
          {conexao && (
            <>
              <Linha rotulo="Conectada em">{formatarDataEHora(conexao.conectadoEm)}</Linha>
              <Linha rotulo="Último uso">
                {conexao.ultimoUsoEm ? formatarDataEHora(conexao.ultimoUsoEm) : "Ainda não usada"}
              </Linha>
              <Linha rotulo="Último erro">
                {conexao.ultimoErro ? (
                  <span className="text-destructive">
                    {conexao.ultimoErro}
                    {conexao.ultimoErroEm && ` (${formatarDataEHora(conexao.ultimoErroEm)})`}
                  </span>
                ) : (
                  "Nenhum"
                )}
              </Linha>
              <Linha rotulo="Espaço usado">
                <Suspense fallback={<span className="text-muted-foreground">Lendo…</span>}>
                  <EspacoUsado />
                </Suspense>
              </Linha>
            </>
          )}
        </dl>
        <AcoesConexaoDrive configurado={configurado} conectado={!!conexao} />
      </section>

      <section aria-labelledby="titulo-metricas" className="flex flex-col gap-3">
        <h2 id="titulo-metricas" className="text-xl font-semibold">
          Números por serviço
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <CartaoNumero
            icone={<HardDrive aria-hidden="true" className="size-4" />}
            titulo="Fotos no R2"
            valor={String(metricas.prontasPorProvedor.r2)}
          />
          <CartaoNumero
            icone={<Cloud aria-hidden="true" className="size-4" />}
            titulo="Fotos no Drive"
            valor={String(metricas.prontasPorProvedor.drive)}
          />
          <CartaoNumero
            icone={<AlertTriangle aria-hidden="true" className="size-4" />}
            titulo="Falhas no R2 (7 dias)"
            valor={String(metricas.falhas7dPorProvedor.r2)}
          />
          <CartaoNumero
            icone={<AlertTriangle aria-hidden="true" className="size-4" />}
            titulo="Falhas no Drive (7 dias)"
            valor={String(metricas.falhas7dPorProvedor.drive)}
          />
        </div>
        <Tabela
          colunas={[
            { rotulo: "Serviço" },
            { rotulo: "Upload médio (7 dias)", direita: true },
            { rotulo: "Download médio (7 dias)", direita: true },
          ]}
        >
          <tr>
            <Celula>Cloudflare R2</Celula>
            <Celula direita>{ms(metricas.mediaUploadMs7d.r2)}</Celula>
            <Celula direita>{ms(metricas.mediaDownloadMs7d.r2)}</Celula>
          </tr>
          <tr>
            <Celula>Google Drive</Celula>
            <Celula direita>{ms(metricas.mediaUploadMs7d.drive)}</Celula>
            <Celula direita>{ms(metricas.mediaDownloadMs7d.drive)}</Celula>
          </tr>
        </Tabela>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Timer aria-hidden="true" className="size-3.5" />
          Fotos e vídeos prontos (inclusive excluídos, que continuam guardados). Tempos médios das
          operações que deram certo.
        </p>
      </section>

      <section
        aria-labelledby="titulo-experimental"
        className="flex flex-col gap-3 rounded-xl border p-4 sm:p-5"
      >
        <h2 id="titulo-experimental" className="text-xl font-semibold">
          Armazenamento experimental
        </h2>
        <p className="text-sm text-muted-foreground">
          Ligado, só os eventos marcados como híbridos gravam os originais das próximas fotos no
          Google Drive. Os outros eventos continuam no R2, e nenhuma foto já enviada muda de lugar.
        </p>
        <ChaveExperimental ativo={ativo} />
        {ativo && !conexao && (
          <p role="alert" className="text-sm text-destructive">
            Está ligado, mas não há conta do Google Drive conectada.
          </p>
        )}
      </section>

      <section aria-labelledby="titulo-hibridos" className="flex flex-col gap-3">
        <h2 id="titulo-hibridos" className="text-xl font-semibold">
          Eventos híbridos
        </h2>
        <p className="text-sm text-muted-foreground">
          Marcar ou desmarcar um evento muda só onde as <strong>próximas</strong> fotos dele são
          gravadas. As fotos já gravadas ficam onde estão (R2 ou Drive) e continuam sendo entregues
          a quem comprou.
        </p>
        <FormularioEventoHibrido />
        <Tabela
          colunas={[
            { rotulo: "Evento" },
            { rotulo: "Fotógrafo" },
            { rotulo: "Fotos no R2", direita: true },
            { rotulo: "Fotos no Drive", direita: true },
            { rotulo: "Ação", direita: true },
          ]}
          vazio="Nenhum evento híbrido ainda."
        >
          {eventos.map((e) => (
            <tr key={e.id}>
              <Celula>
                <span className="flex flex-col">
                  <span className="font-medium">{e.titulo}</span>
                  <span className="text-xs text-muted-foreground">
                    {e.slug}
                    {e.armazenamento === "r2" && " · voltou ao R2 (fotos antigas no Drive)"}
                  </span>
                </span>
              </Celula>
              <Celula>{e.fotografo}</Celula>
              <Celula direita>{e.fotosR2}</Celula>
              <Celula direita>{e.fotosDrive}</Celula>
              <Celula direita>
                {e.armazenamento === "hibrido" ? (
                  <BotaoVoltarParaR2 eventoId={e.id} titulo={e.titulo} />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Celula>
            </tr>
          ))}
        </Tabela>
      </section>
    </>
  );
}

/** Espaço do Drive (uma chamada ao Google): em Suspense, para não segurar o resto da tela. */
async function EspacoUsado() {
  const espaco = await espacoDoDrive();
  if (!espaco) return <span className="text-muted-foreground">Não foi possível ler agora</span>;
  return (
    <span className="tabular-nums">
      {emGb(espaco.usadoBytes)}
      {espaco.limiteBytes !== null ? ` de ${emGb(espaco.limiteBytes)}` : " (sem limite)"}
    </span>
  );
}
