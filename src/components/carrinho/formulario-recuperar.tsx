"use client";

import { useState, useTransition } from "react";
import { Loader2, MailCheck } from "lucide-react";

import { recuperarComprasAcao } from "@/app/(cliente)/recuperar-compras/acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Formulário de "Recuperar minhas compras": o e-mail da compra, e a mesma resposta sempre. */
export function FormularioRecuperar() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  if (enviado) {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-3 rounded-2xl border p-6 text-center"
      >
        <MailCheck aria-hidden="true" className="size-10 text-primary" />
        <p className="text-lg font-semibold">Confira o seu e-mail</p>
        <p className="text-sm text-muted-foreground">
          Se houver compras pagas com <strong className="text-foreground">{enviado}</strong>, o link
          para baixar as fotos chega em alguns minutos. Veja também a caixa de spam e a aba
          Promoções.
        </p>
        <Button variant="outline" size="touch" onClick={() => setEnviado(null)}>
          Usar outro e-mail
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-2xl border p-5 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        startTransition(async () => {
          const r = await recuperarComprasAcao(email).catch(() => ({
            ok: false as const,
            erro: "Não foi possível enviar agora. Tente de novo.",
          }));
          if (r.ok) setEnviado(email.trim());
          else setErro(r.erro);
        });
      }}
    >
      <label htmlFor="email-compra" className="text-sm font-semibold">
        E-mail usado na compra
      </label>
      <Input
        id="email-compra"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        maxLength={254}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="voce@email.com"
        aria-invalid={Boolean(erro)}
        className="h-11"
      />
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      <Button type="submit" size="touch" disabled={pendente || !email.trim()}>
        {pendente && <Loader2 aria-hidden="true" className="animate-spin" />}
        Enviar o link das minhas fotos
      </Button>
    </form>
  );
}
