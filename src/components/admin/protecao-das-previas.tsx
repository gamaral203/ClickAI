"use client";

import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { Loader2, RefreshCw, Save, ShieldCheck } from "lucide-react";

import {
  confirmarRegeracaoAcao,
  regerarLoteAcao,
  salvarProtecaoAcao,
  type EstadoMarca,
} from "@/app/(admin)/admin/marca-dagua/acoes";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { formatarDataEHora, formatarPreco } from "@/lib/formatar";
import { INFO_MODELOS_MARCA, MODELOS_MARCA, type ModeloMarca } from "@/lib/marca-dagua";
import {
  estimarRegeracao,
  LIMITES_MARCA,
  PREMISSAS_REGERACAO,
  type CampoConfigMarca,
  type ConfigMarca,
} from "@/lib/protecao-previas";
import type { SituacaoDaProtecao } from "@/servicos/protecao-previas";

// Tela da proteção das prévias na gestão (/admin/marca-dagua). Os limites aqui são só para a
// tela guiar; o servidor valida tudo de novo (src/lib/protecao-previas.ts).

const numero = new Intl.NumberFormat("pt-BR");
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

type CampoNumerico = Exclude<CampoConfigMarca, "variacao">;

const CAMPOS: {
  campo: CampoNumerico;
  rotulo: string;
  unidade: string;
  passo: number;
  ajuda: string;
}[] = [
  {
    campo: "opacidadePct",
    rotulo: "Opacidade das logos",
    unidade: "%",
    passo: 1,
    ajuda: "Quanto as logos aparecem. O piso impede desligar a marca.",
  },
  {
    campo: "quantidade",
    rotulo: "Logos espalhadas por prévia",
    unidade: "",
    passo: 1,
    ajuda: "Fora delas, sempre há uma logo grande no centro e outra no terço de cima.",
  },
  {
    campo: "tamanhoPct",
    rotulo: "Tamanho das logos",
    unidade: "%",
    passo: 5,
    ajuda: "100% = cerca de 19% do lado maior da prévia.",
  },
  {
    campo: "larguraPrevia",
    rotulo: "Resolução máxima da prévia",
    unidade: " px",
    passo: 40,
    ajuda: "Lado maior da prévia da página da foto. A do celular fica em até 1.000 px.",
  },
  {
    campo: "qualidade",
    rotulo: "Qualidade da compressão (WebP)",
    unidade: "",
    passo: 1,
    ajuda: "Mais baixa: arquivo menor e mais difícil de aproveitar, mas com menos detalhe.",
  },
];

export function ProtecaoDasPrevias({ situacao }: { situacao: SituacaoDaProtecao }) {
  const { config } = situacao;
  const [valores, setValores] = useState<ConfigMarca>(() => ({
    tamanhoPct: config.tamanhoPct,
    quantidade: config.quantidade,
    opacidadePct: config.opacidadePct,
    larguraPrevia: config.larguraPrevia,
    qualidade: config.qualidade,
    variacao: config.variacao,
  }));
  const [estado, salvar, salvando] = useActionState<EstadoMarca, FormData>(salvarProtecaoAcao, {});
  const idVariacao = useId();

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="titulo-config-marca"
        className="grid gap-6 rounded-xl border bg-card p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"
      >
        <form action={salvar} className="flex min-w-0 flex-col gap-5" noValidate>
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
            >
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <h2 id="titulo-config-marca" className="text-base font-semibold sm:text-lg">
                Configuração em vigor: revisão {config.revisao}
              </h2>
              <p className="text-sm text-muted-foreground">
                Vale para as fotos enviadas a partir de agora. As que já estão no ar só mudam com a
                regeração, logo abaixo.
              </p>
            </div>
          </div>

          {CAMPOS.map(({ campo, rotulo, unidade, passo, ajuda }) => (
            <CampoFaixa
              key={campo}
              campo={campo}
              rotulo={rotulo}
              unidade={unidade}
              passo={passo}
              ajuda={ajuda}
              valor={valores[campo]}
              erro={estado.erros?.[campo]}
              aoMudar={(v) => setValores((atual) => ({ ...atual, [campo]: v }))}
            />
          ))}

          <div className="flex items-start gap-3">
            <input
              id={idVariacao}
              type="checkbox"
              name="variacao"
              checked={valores.variacao}
              onChange={(e) => setValores((atual) => ({ ...atual, variacao: e.target.checked }))}
              aria-describedby={`${idVariacao}-ajuda`}
              className="mt-0.5 size-5 shrink-0 accent-primary"
            />
            <div className="flex flex-col gap-0.5">
              <label htmlFor={idVariacao} className="text-sm font-medium">
                Variar o desenho de cada foto
              </label>
              <span id={`${idVariacao}-ajuda`} className="text-xs text-muted-foreground">
                Posição, tamanho, giro e opacidade de cada logo mudam de uma foto para outra (a
                mesma foto sai sempre igual). Desligado, todas as fotos ficam com o mesmo desenho, o
                que facilita apagar a marca em lote.
              </span>
            </div>
          </div>

          {estado.erros?.geral && (
            <p role="alert" className="text-sm text-destructive">
              {estado.erros.geral}
            </p>
          )}
          {estado.ok && (
            <p role="status" className="text-sm font-medium text-foreground">
              {estado.ok}
            </p>
          )}
          <Button type="submit" size="touch" disabled={salvando} className="self-start">
            {salvando ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <Save aria-hidden="true" />
            )}
            Salvar configuração
          </Button>
        </form>

        <Amostra valores={valores} />
      </section>

      <Regeracao situacao={situacao} />
      <Bloqueios bloqueios={situacao.bloqueiosHoje} />
      <Historico historico={situacao.historico} />
    </div>
  );
}

function CampoFaixa({
  campo,
  rotulo,
  unidade,
  passo,
  ajuda,
  valor,
  erro,
  aoMudar,
}: {
  campo: CampoNumerico;
  rotulo: string;
  unidade: string;
  passo: number;
  ajuda: string;
  valor: number;
  erro?: string;
  aoMudar: (valor: number) => void;
}) {
  const id = useId();
  const { min, max } = LIMITES_MARCA[campo];
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {rotulo}
        </label>
        <output htmlFor={id} className="text-sm font-semibold tabular-nums">
          {numero.format(valor)}
          {unidade}
        </output>
      </div>
      <input
        id={id}
        name={campo}
        type="range"
        min={min}
        max={max}
        step={passo}
        value={valor}
        onChange={(e) => aoMudar(Number(e.target.value))}
        aria-describedby={`${id}-ajuda${erro ? ` ${id}-erro` : ""}`}
        aria-invalid={erro ? true : undefined}
        className="h-10 w-full cursor-pointer accent-primary"
      />
      <span id={`${id}-ajuda`} className="text-xs text-muted-foreground">
        {ajuda} De {numero.format(min)} a {numero.format(max)}
        {unidade}.
      </span>
      {erro && (
        <span id={`${id}-erro`} role="alert" className="text-xs text-destructive">
          {erro}
        </span>
      )}
    </div>
  );
}

/** Amostra ao vivo, desenhada no servidor com os valores da tela (antes de salvar). */
function Amostra({ valores }: { valores: ConfigMarca }) {
  const [modelo, setModelo] = useState<ModeloMarca>("padrao");
  const [src, setSrc] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const idModelo = useId();

  useEffect(() => {
    // Espera o gestor parar de arrastar antes de pedir outra amostra.
    const espera = window.setTimeout(() => {
      const busca = new URLSearchParams({
        modelo,
        tamanhoPct: String(valores.tamanhoPct),
        quantidade: String(valores.quantidade),
        opacidadePct: String(valores.opacidadePct),
        larguraPrevia: String(valores.larguraPrevia),
        qualidade: String(valores.qualidade),
        variacao: valores.variacao ? "1" : "0",
      });
      setCarregando(true);
      setSrc(`/admin/marca-dagua/amostra?${busca}`);
    }, 400);
    return () => window.clearTimeout(espera);
  }, [modelo, valores]);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Como fica a prévia</h3>
        <label htmlFor={idModelo} className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Modelo do fotógrafo</span>
          <select
            id={idModelo}
            value={modelo}
            onChange={(e) => setModelo(e.target.value as ModeloMarca)}
            className="h-10 rounded-lg border border-input bg-card px-2 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {MODELOS_MARCA.map((m) => (
              <option key={m} value={m}>
                {INFO_MODELOS_MARCA[m].nome}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="relative aspect-[3/2] w-full overflow-hidden rounded-lg bg-muted">
        {src && (
          // A amostra é gerada na hora pelo servidor (rota só de gestor): sem next/image.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={`Amostra da prévia com a marca d'água no modelo ${INFO_MODELOS_MARCA[modelo].nome}`}
            className="size-full object-contain"
            onLoad={() => setCarregando(false)}
            onError={() => setCarregando(false)}
          />
        )}
        {carregando && (
          <span className="absolute inset-0 flex items-center justify-center bg-background/40">
            <Loader2 aria-hidden="true" className="size-6 animate-spin" />
            <span className="sr-only">Gerando a amostra</span>
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Amostra em 800 px com a configuração da tela, ainda sem salvar. A marca é gravada nos pixels
        da prévia: um print leva a marca junto. Nenhum desenho é impossível de remover por IA; a
        ideia é que a remoção dê trabalho e saia pior que comprar.
      </p>
    </div>
  );
}

type Progresso = { regeradas: number; falhas: number; restantes: number };

function Regeracao({ situacao }: { situacao: SituacaoDaProtecao }) {
  const { config, foraDaConfiguracao, cotacaoCentavos } = situacao;
  const [aberto, setAberto] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, iniciar] = useTransition();
  const parar = useRef(false);
  const total = foraDaConfiguracao;
  const estimativa = estimarRegeracao(total);
  const reais =
    cotacaoCentavos !== null
      ? formatarPreco(Math.max(1, Math.ceil(estimativa.custoUsd * cotacaoCentavos)))
      : null;

  async function rodarLotes() {
    setRodando(true);
    parar.current = false;
    let somadas = { regeradas: 0, falhas: 0 };
    try {
      while (!parar.current) {
        const r = await regerarLoteAcao();
        if ("erro" in r) {
          setErro(r.erro ?? "Não foi possível regerar agora.");
          break;
        }
        somadas = { regeradas: somadas.regeradas + r.regeradas, falhas: somadas.falhas + r.falhas };
        setProgresso({ ...somadas, restantes: r.restantes });
        // Sem avanço (só falhas, ou nada a fazer): para e deixa o job de revisão tentar depois.
        if (r.restantes === 0 || !r.pedida || r.regeradas === 0) break;
      }
    } finally {
      setRodando(false);
    }
  }

  function confirmar() {
    setErro(null);
    iniciar(async () => {
      const r = await confirmarRegeracaoAcao(config.revisao);
      setAberto(false);
      if (r.erro) {
        setErro(r.erro);
        return;
      }
      await rodarLotes();
    });
  }

  const feitas = progresso ? total - progresso.restantes : 0;
  const pct = total > 0 ? Math.min(100, Math.round((feitas / total) * 100)) : 100;

  return (
    <section
      aria-labelledby="titulo-regeracao"
      className="flex flex-col gap-4 rounded-xl border p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
        >
          <RefreshCw className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id="titulo-regeracao" className="text-base font-semibold sm:text-lg">
            Prévias já publicadas
          </h2>
          <p className="text-sm text-muted-foreground">
            {total === 0
              ? "Todas as prévias já estão com a configuração em vigor."
              : `${numero.format(total)} ${total === 1 ? "foto está" : "fotos estão"} com uma marca de antes desta revisão. Regerar refaz a prévia, a do celular e a miniatura de cada uma a partir do original, no servidor (o original nunca sai do armazenamento privado), em lotes. Fotos novas já saem com a configuração em vigor.`}
          </p>
          {config.regeracaoPedida && total > 0 && !rodando && (
            <p className="mt-1 text-sm">
              A regeração desta revisão já foi pedida: o job de revisão continua sozinho a cada
              execução. Você pode acelerar por aqui.
            </p>
          )}
        </div>
      </div>

      {total > 0 && (
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Numero rotulo="Fotos" valor={numero.format(total)} />
          <Numero rotulo="Tempo estimado" valor={`~${numero.format(estimativa.minutos)} min`} />
          <Numero rotulo="CPU estimada" valor={`${decimal.format(estimativa.horasDeCpu)} h`} />
          <Numero
            rotulo="Custo estimado"
            valor={`US$ ${decimal.format(Math.max(0.01, estimativa.custoUsd))}${reais ? ` (~${reais})` : ""}`}
          />
        </dl>
      )}
      {total > 0 && (
        <p className="text-xs text-muted-foreground">
          Estimativa, não cobrança: {decimal.format(PREMISSAS_REGERACAO.segundosDeCpuPorFoto)} s de
          CPU por foto, {decimal.format(PREMISSAS_REGERACAO.fotosPorSegundo)} fotos por segundo, CPU
          da Vercel a US$ {decimal.format(PREMISSAS_REGERACAO.usdPorHoraDeCpu)}/h,{" "}
          {numero.format(estimativa.gravacoesR2)} gravações e {numero.format(estimativa.leiturasR2)}{" "}
          leituras no R2. Pode sair de graça dentro das cotas dos planos. O espaço ocupado quase não
          muda: as prévias antigas são apagadas depois da troca.
        </p>
      )}

      {progresso && (
        <div className="flex flex-col gap-1.5">
          <div
            role="progressbar"
            aria-label="Regeração das prévias"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-sm tabular-nums" aria-live="polite">
            {numero.format(progresso.regeradas)} regeradas nesta tela
            {progresso.falhas > 0
              ? ` · ${numero.format(progresso.falhas)} com falha (voltam depois)`
              : ""}{" "}
            · {numero.format(progresso.restantes)} restantes
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {total > 0 && !rodando && (
          <AlertDialog open={aberto} onOpenChange={(abrir) => !confirmando && setAberto(abrir)}>
            <AlertDialogTrigger render={<Button size="touch" />}>
              <RefreshCw aria-hidden="true" />
              {config.regeracaoPedida
                ? "Continuar a regeração"
                : `Regerar ${numero.format(total)} prévias`}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Regerar {numero.format(total)} prévias?</AlertDialogTitle>
                <AlertDialogDescription>
                  A prévia, a do celular e a miniatura de cada foto serão refeitas com a revisão{" "}
                  {config.revisao} da configuração, a partir do original, no servidor. Leva cerca de{" "}
                  {numero.format(estimativa.minutos)} min, com custo estimado de US${" "}
                  {decimal.format(Math.max(0.01, estimativa.custoUsd))}
                  {reais ? ` (~${reais})` : ""}. Se você fechar a página, o job de revisão continua
                  sozinho. Quem comprou não é afetado.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={confirmando}>Cancelar</AlertDialogCancel>
                <Button size="touch" onClick={confirmar} disabled={confirmando}>
                  {confirmando && <Loader2 aria-hidden="true" className="animate-spin" />}
                  Sim, regerar
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {rodando && (
          <Button size="touch" variant="outline" onClick={() => (parar.current = true)}>
            <Loader2 aria-hidden="true" className="animate-spin" />
            Parar por aqui
          </Button>
        )}
      </div>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </section>
  );
}

/** Acessos barrados hoje pelos limites contra raspagem (src/servicos/limites.ts). */
function Bloqueios({ bloqueios }: { bloqueios: SituacaoDaProtecao["bloqueiosHoje"] }) {
  return (
    <section
      aria-labelledby="titulo-bloqueios"
      className="flex flex-col gap-3 rounded-xl border p-4 sm:p-5"
    >
      <div>
        <h2 id="titulo-bloqueios" className="text-base font-semibold sm:text-lg">
          Acessos barrados hoje
        </h2>
        <p className="text-sm text-muted-foreground">
          Limites por conexão contra quem tenta baixar as prévias em massa. Só a contagem: nada de
          IP nem de quem acessou. Um pico costuma ser um script.
        </p>
      </div>
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <Numero rotulo="Páginas da galeria" valor={numero.format(bloqueios.galeria_ip)} />
        <Numero rotulo="Páginas de foto" valor={numero.format(bloqueios.foto_ip)} />
        <Numero rotulo="Buscas por número" valor={numero.format(bloqueios.busca_numero_ip)} />
      </dl>
    </section>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-muted/60 p-3">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="font-semibold tabular-nums">{valor}</dd>
    </div>
  );
}

function Historico({ historico }: { historico: SituacaoDaProtecao["historico"] }) {
  if (historico.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma mudança salva ainda: valem os padrões da plataforma.
      </p>
    );
  }
  return (
    <section aria-labelledby="titulo-historico-marca" className="flex flex-col gap-3">
      <h2 id="titulo-historico-marca" className="text-base font-semibold sm:text-lg">
        Histórico de mudanças
      </h2>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <caption className="sr-only">
            Últimas revisões da configuração da marca d&apos;água
          </caption>
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Revisão
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Quando e quem
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Marca
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Prévia
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Regeração
              </th>
            </tr>
          </thead>
          <tbody>
            {historico.map((r) => (
              <tr key={r.revisao} className="border-t align-top">
                <td className="px-3 py-2 font-semibold tabular-nums">{r.revisao}</td>
                <td className="px-3 py-2">
                  {formatarDataEHora(r.em)}
                  <span className="block text-xs text-muted-foreground">
                    {r.por ?? "Conta excluída"}
                  </span>
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {r.opacidadePct}% · {r.quantidade} logos · {r.tamanhoPct}%
                  <span className="block text-xs text-muted-foreground">
                    {r.variacao ? "Varia por foto" : "Igual em todas"}
                  </span>
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {numero.format(r.larguraPrevia)} px · WebP {r.qualidade}
                </td>
                <td className="px-3 py-2">
                  {r.regeracaoPedidaEm ? (
                    <>
                      Pedida em {formatarDataEHora(r.regeracaoPedidaEm)}
                      <span className="block text-xs text-muted-foreground">
                        {r.regeracaoPedidaPor ?? "Conta excluída"}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Não pedida</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
