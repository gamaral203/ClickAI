"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Copy, Download, KeyRound, Loader2, ShieldCheck } from "lucide-react";

import {
  verificacaoDuasEtapasAcao,
  type EstadoMfa,
} from "@/app/(fotografo)/painel/perfil/mfa-acoes";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputSenha } from "@/components/ui/input-senha";
import { Label } from "@/components/ui/label";
import { formatarData } from "@/lib/formatar";

const inicial: EstadoMfa = {};

/**
 * Verificação em duas etapas (TOTP) em Perfil e recebimento: ligar com QR Code e primeiro código,
 * ver os códigos de emergência (recuperação) uma vez, gerar novos e desligar (sempre com um código
 * válido do app ou de emergência: é a saída de quem perdeu o celular).
 */
export function VerificacaoDuasEtapas({
  ativa,
  ativadaEm,
  codigosRestantes,
  temSenha,
}: {
  ativa: boolean;
  ativadaEm: string | null;
  codigosRestantes: number;
  temSenha: boolean;
}) {
  const [estado, acao, enviando] = useActionState(verificacaoDuasEtapasAcao, inicial);
  // Os códigos de emergência saem da tela quando a pessoa marca que guardou.
  const [guardados, setGuardados] = useState<string[] | null>(null);
  const mostrarCodigos = estado.codigos && estado.codigos !== guardados ? estado.codigos : null;

  return (
    <section className="flex flex-col gap-4 rounded-xl border p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <ShieldCheck aria-hidden="true" className="size-5" />
        Verificação em duas etapas
      </h2>
      <p className="text-sm text-muted-foreground">
        Além da senha (ou do Google), o login, os saques e a troca do CPF/CNPJ pedem um código do
        app autenticador do seu celular (Google Authenticator, Authy, 1Password…). Quem descobrir
        sua senha não entra nem saca sem o celular.
      </p>

      {estado.ok && (
        <p role="status" className="flex items-center gap-1.5 text-sm text-primary">
          <CheckCircle2 aria-hidden="true" className="size-4" />
          {estado.ok}
        </p>
      )}
      {estado.erro && (
        <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-destructive">
          {estado.erro}
        </p>
      )}
      {estado.reentrarComGoogle && (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border p-4 text-sm">
          <p>
            Por segurança, para ligar a verificação, entre de novo com o Google. Depois, volte aqui
            em até 10 minutos.
          </p>
          <a
            href="/api/auth/google?proximo=%2Fpainel%2Fperfil"
            className={buttonVariants({ variant: "outline", size: "touch", className: "w-fit" })}
          >
            Entrar de novo com o Google
          </a>
        </div>
      )}

      {mostrarCodigos ? (
        <CodigosRecuperacao
          codigos={mostrarCodigos}
          onGuardei={() => setGuardados(mostrarCodigos)}
        />
      ) : estado.cadastro ? (
        <form action={acao} className="flex flex-col gap-4">
          <input type="hidden" name="etapa" value="confirmar" />
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
            <li>No app autenticador, adicione uma conta e leia o QR Code abaixo.</li>
            <li>Digite o código de 6 dígitos que o app mostrar.</li>
          </ol>
          {/* eslint-disable-next-line @next/next/no-img-element -- QR Code em data URL, gerado no servidor */}
          <img
            src={estado.cadastro.qrCode}
            alt="QR Code para cadastrar o ClicouAí no app autenticador"
            width={200}
            height={200}
            className="size-50 rounded-lg border bg-white p-1"
          />
          <p className="text-sm text-muted-foreground">
            Não consegue ler? Digite no app a chave{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
              {estado.cadastro.segredo}
            </code>{" "}
            (tipo: baseado em tempo).
          </p>
          <CampoCodigo rotulo="Código do app" />
          <Botao enviando={enviando}>Confirmar e ligar</Botao>
        </form>
      ) : ativa ? (
        <div className="flex flex-col gap-4">
          <p className="flex items-center gap-2 text-sm font-medium text-primary">
            <CheckCircle2 aria-hidden="true" className="size-5" />
            Ligada{ativadaEm ? ` desde ${formatarData(ativadaEm)}` : ""}. Códigos de emergência
            restantes: {codigosRestantes}.
          </p>
          <AcaoComCodigo
            acao={acao}
            enviando={enviando}
            etapa="codigos"
            titulo="Gerar novos códigos de emergência"
            botao="Gerar códigos novos"
          />
          <AcaoComCodigo
            acao={acao}
            enviando={enviando}
            etapa="desligar"
            titulo="Desligar a verificação"
            botao="Desligar"
            variante="outline"
          />
        </div>
      ) : (
        <form action={acao} className="flex flex-col gap-4">
          <input type="hidden" name="etapa" value="iniciar" />
          {temSenha && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="mfa-senha">Senha atual</Label>
              <InputSenha
                id="mfa-senha"
                name="senha"
                nome="senha atual"
                autoComplete="current-password"
                required
                classeContainer="max-w-sm"
              />
            </div>
          )}
          <Botao enviando={enviando}>Ligar a verificação em duas etapas</Botao>
        </form>
      )}
    </section>
  );
}

function CampoCodigo({ rotulo, id = "mfa-codigo" }: { rotulo: string; id?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input
        id={id}
        name="codigo"
        autoComplete="one-time-code"
        autoCapitalize="none"
        spellCheck={false}
        required
        maxLength={40}
        className="h-11 max-w-xs tracking-widest"
      />
    </div>
  );
}

function Botao({
  enviando,
  children,
  variante = "default",
}: {
  enviando: boolean;
  children: React.ReactNode;
  variante?: "default" | "outline";
}) {
  return (
    <Button
      type="submit"
      size="touch"
      variant={variante}
      disabled={enviando}
      // No celular estreito o texto quebra em vez de vazar da tela.
      className="h-auto min-h-11 w-fit max-w-full py-2 text-center whitespace-normal"
    >
      {enviando && <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />}
      {children}
    </Button>
  );
}

function AcaoComCodigo({
  acao,
  enviando,
  etapa,
  titulo,
  botao,
  variante,
}: {
  acao: (formulario: FormData) => void;
  enviando: boolean;
  etapa: "codigos" | "desligar";
  titulo: string;
  botao: string;
  variante?: "default" | "outline";
}) {
  const [aberto, setAberto] = useState(false);
  if (!aberto) {
    return (
      <Button
        type="button"
        variant="outline"
        size="touch"
        className="w-fit"
        onClick={() => setAberto(true)}
      >
        {titulo}
      </Button>
    );
  }
  return (
    <form action={acao} className="flex flex-col gap-3 rounded-lg border p-4">
      <input type="hidden" name="etapa" value={etapa} />
      <p className="text-sm font-medium">{titulo}</p>
      <CampoCodigo
        id={`mfa-codigo-${etapa}`}
        rotulo="Código de 6 números do app autenticador, ou um código de emergência"
      />
      <Botao enviando={enviando} variante={variante}>
        {botao}
      </Botao>
    </form>
  );
}

/**
 * Códigos de emergência (recuperação), mostrados uma vez só. Fotógrafo confundia esta lista com
 * "o código de entrar" e tentava adivinhar qual usar: o título diz que não são para agora, e a
 * lista só sai da tela depois de a pessoa marcar que guardou.
 */
function CodigosRecuperacao({ codigos, onGuardei }: { codigos: string[]; onGuardei: () => void }) {
  const [guardei, setGuardei] = useState(false);
  const [copiou, setCopiou] = useState(false);
  const texto = [
    "ClicouAí - códigos de emergência da verificação em duas etapas",
    "Use um destes só se perder o celular com o app autenticador. Cada um vale uma vez.",
    "Para entrar no dia a dia, use o código de 6 números do app autenticador.",
    "",
    ...codigos,
    "",
  ].join("\n");

  function baixar() {
    const url = URL.createObjectURL(new Blob([texto], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "clicouai-codigos-de-emergencia.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <p className="flex items-center gap-2 font-medium">
        <KeyRound aria-hidden="true" className="size-4" />
        Códigos de emergência (não são para entrar agora)
      </p>
      <p className="text-sm text-muted-foreground">
        Para entrar, você vai usar sempre o código de 6 números do app autenticador. Estes 10
        códigos são só para o dia em que perder o celular: cada um vale uma vez, no lugar do código
        do app. Guarde num lugar seguro, porque eles não aparecem de novo.
      </p>
      <ul className="grid grid-cols-2 gap-2 font-mono text-sm" aria-label="Códigos de emergência">
        {codigos.map((c) => (
          <li key={c} className="rounded bg-muted px-2 py-1">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="touch"
          onClick={() =>
            navigator.clipboard
              ?.writeText(texto)
              .then(() => setCopiou(true))
              .catch(() => {})
          }
        >
          <Copy aria-hidden="true" data-icon="inline-start" />
          {copiou ? "Copiado" : "Copiar"}
        </Button>
        <Button type="button" variant="outline" size="touch" onClick={baixar}>
          <Download aria-hidden="true" data-icon="inline-start" />
          Baixar .txt
        </Button>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
        <input
          type="checkbox"
          checked={guardei}
          onChange={(e) => setGuardei(e.currentTarget.checked)}
          className="size-5 accent-primary"
        />
        Guardei meus códigos
      </label>
      <Button type="button" size="touch" className="w-fit" disabled={!guardei} onClick={onGuardei}>
        Continuar
      </Button>
    </div>
  );
}
