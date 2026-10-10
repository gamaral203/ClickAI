"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, ShieldCheck } from "lucide-react";

import {
  verificacaoDuasEtapasAcao,
  type EstadoMfa,
} from "@/app/(fotografo)/painel/perfil/mfa-acoes";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatarData } from "@/lib/formatar";

const inicial: EstadoMfa = {};

/**
 * Verificação em duas etapas (TOTP) em Perfil e recebimento: ligar com QR Code e primeiro código,
 * ver os códigos de recuperação uma vez, gerar novos e desligar (sempre com um código válido).
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

      {estado.codigos ? (
        <CodigosRecuperacao codigos={estado.codigos} />
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
            Ligada{ativadaEm ? ` desde ${formatarData(ativadaEm)}` : ""}. Códigos de recuperação
            restantes: {codigosRestantes}.
          </p>
          <AcaoComCodigo
            acao={acao}
            enviando={enviando}
            etapa="codigos"
            titulo="Gerar novos códigos de recuperação"
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
              <Input
                id="mfa-senha"
                name="senha"
                type="password"
                autoComplete="current-password"
                required
                className="h-11 max-w-sm"
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
      <CampoCodigo id={`mfa-codigo-${etapa}`} rotulo="Código do app (ou de recuperação)" />
      <Botao enviando={enviando} variante={variante}>
        {botao}
      </Botao>
    </form>
  );
}

function CodigosRecuperacao({ codigos }: { codigos: string[] }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <p className="flex items-center gap-2 font-medium">
        <KeyRound aria-hidden="true" className="size-4" />
        Guarde os códigos de recuperação
      </p>
      <p className="text-sm text-muted-foreground">
        Cada um vale uma vez, no lugar do código do app, se você perder o celular. Anote num lugar
        seguro: eles não aparecem de novo.
      </p>
      <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
        {codigos.map((c) => (
          <li key={c} className="rounded bg-muted px-2 py-1">
            {c}
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="outline"
        size="touch"
        className="w-fit"
        onClick={() => navigator.clipboard?.writeText(codigos.join("\n")).catch(() => {})}
      >
        Copiar os códigos
      </Button>
    </div>
  );
}
