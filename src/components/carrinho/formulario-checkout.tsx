"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Loader2, Lock, TicketPercent, X } from "lucide-react";

import { obterCarrinho } from "@/app/(cliente)/carrinho/acoes";
import {
  finalizarCompra,
  type CampoCheckout,
  type ResultadoCheckout,
} from "@/app/(cliente)/checkout/acoes";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatarPreco } from "@/lib/formatar";
import type { ResumoCarrinho } from "@/servicos/carrinho";

import { esvaziarCarrinho, useCarrinho, usePacotes } from "./carrinho";

export function FormularioCheckout({ inicial }: { inicial?: { nome: string; email: string } }) {
  const router = useRouter();
  const ids = useCarrinho();
  const pacotes = usePacotes();
  const tokensPacote = pacotes.map((p) => p.token);
  /** Código que a pessoa pediu para aplicar; o servidor diz se vale. */
  const [cupom, setCupom] = useState<string | null>(null);
  const chave = `${ids.join(",")}|${tokensPacote.join(",")}|${cupom ?? ""}`;
  const [resumo, setResumo] = useState<ResumoCarrinho | null>(null);
  const [erros, setErros] = useState<Partial<Record<CampoCheckout, string>>>({});
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();
  const [redirecionando, setRedirecionando] = useState(false);

  useEffect(() => {
    if (ids.length === 0) return;
    let ativo = true;
    obterCarrinho([...ids], { pacotes: tokensPacote, cupom }).then((r) => ativo && setResumo(r));
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  if (redirecionando) {
    return (
      <p className="flex items-center gap-2 text-muted-foreground" role="status">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        Pedido criado. Abrindo o pagamento…
      </p>
    );
  }

  if (ids.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed p-10 text-center">
        <p className="text-lg font-semibold">Seu carrinho está vazio</p>
        <Link href="/eventos" className={buttonVariants({ size: "touch" })}>
          Encontrar meu evento
        </Link>
      </div>
    );
  }

  const cupomAplicado = resumo?.cupom.situacao === "aplicado" ? resumo.cupom.codigo : null;
  const mensagemCupom =
    erros.cupom ?? (resumo?.cupom.situacao === "recusado" ? resumo.cupom.mensagem : null);

  function enviar(formulario: FormData) {
    setMensagem(null);
    startTransition(async () => {
      let resultado: ResultadoCheckout;
      try {
        resultado = await finalizarCompra({
          ids: [...ids],
          nome: String(formulario.get("nome") ?? ""),
          email: String(formulario.get("email") ?? ""),
          whatsapp: String(formulario.get("whatsapp") ?? ""),
          aceitaWhatsapp: formulario.get("aceitaWhatsapp") === "on",
          metodo: formulario.get("metodo"),
          // Só manda o cupom que o servidor aceitou no resumo; o pedido confere de novo.
          opcoes: { pacotes: tokensPacote, cupom: cupomAplicado },
        });
      } catch {
        setMensagem("Não foi possível criar o pedido. Verifique a conexão e tente de novo.");
        return;
      }
      if (resultado.ok) {
        setRedirecionando(true);
        router.push(resultado.url);
        esvaziarCarrinho();
        return;
      }
      setErros(resultado.erros);
      if (resultado.erros.cupom) setCupom(null);
      if (resultado.mensagem) setMensagem(resultado.mensagem);
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      <form action={enviar} noValidate className="flex flex-col gap-6">
        {mensagem && (
          <p role="alert" className="rounded-lg border border-destructive/30 p-4 text-destructive">
            {mensagem}{" "}
            <Link href="/carrinho" className="font-medium underline">
              Ir para o carrinho
            </Link>
          </p>
        )}

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-2 text-lg font-semibold">Seus dados</legend>
          <Campo id="nome" rotulo="Nome completo" erro={erros.nome}>
            <Input
              id="nome"
              name="nome"
              defaultValue={inicial?.nome}
              autoComplete="name"
              required
              maxLength={100}
              aria-invalid={Boolean(erros.nome)}
              aria-describedby={erros.nome ? "nome-erro" : undefined}
              className="h-11"
            />
          </Campo>
          <Campo
            id="email"
            rotulo="E-mail"
            ajuda="Enviamos para ele o link para baixar as fotos."
            erro={erros.email}
          >
            <Input
              id="email"
              name="email"
              defaultValue={inicial?.email}
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              maxLength={254}
              aria-invalid={Boolean(erros.email)}
              aria-describedby={erros.email ? "email-erro" : "email-ajuda"}
              className="h-11"
            />
          </Campo>
          <Campo
            id="whatsapp"
            rotulo="WhatsApp (opcional)"
            ajuda="Com DDD. Só enviamos o link das fotos se você marcar a opção abaixo."
            erro={erros.whatsapp}
          >
            <Input
              id="whatsapp"
              name="whatsapp"
              type="tel"
              autoComplete="tel-national"
              inputMode="tel"
              maxLength={20}
              placeholder="(11) 91234-5678"
              aria-invalid={Boolean(erros.whatsapp)}
              aria-describedby={erros.whatsapp ? "whatsapp-erro" : "whatsapp-ajuda"}
              className="h-11"
            />
          </Campo>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="aceitaWhatsapp"
              className="mt-0.5 size-5 shrink-0 accent-primary"
            />
            Quero receber o link das fotos também pelo WhatsApp.
          </label>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-lg font-semibold">Forma de pagamento</legend>
          {(
            [
              ["pix", "Pix", "Aprovação na hora. O código vale por 1 hora."],
              [
                "cartao",
                "Cartão de crédito",
                "Os dados do cartão ficam com o processador de pagamento.",
              ],
            ] as const
          ).map(([valor, rotulo, descricao], i) => (
            <label
              key={valor}
              className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 has-checked:border-primary has-checked:bg-accent"
            >
              <input
                type="radio"
                name="metodo"
                value={valor}
                defaultChecked={i === 0}
                className="mt-1 size-4 accent-primary"
              />
              <span className="flex flex-col">
                <span className="font-medium">{rotulo}</span>
                <span className="text-sm text-muted-foreground">{descricao}</span>
              </span>
            </label>
          ))}
          {erros.metodo && <p className="text-sm text-destructive">{erros.metodo}</p>}
        </fieldset>

        <Button type="submit" size="touch" disabled={enviando || !resumo}>
          {enviando ? (
            <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
          ) : (
            <Lock aria-hidden="true" data-icon="inline-start" />
          )}
          {enviando
            ? "Criando o pedido…"
            : resumo
              ? `Pagar ${formatarPreco(resumo.totalCentavos)}`
              : "Calculando…"}
        </Button>
      </form>

      <aside className="flex h-fit flex-col gap-3 rounded-xl border bg-card p-5">
        <h2 className="text-lg font-semibold">Resumo</h2>
        {resumo ? (
          <dl className="flex flex-col gap-2 text-sm">
            {resumo.grupos.map((g) => (
              <div key={g.eventoId} className="flex justify-between gap-4">
                <dt className="flex flex-col text-muted-foreground">
                  <span>
                    {g.eventoTitulo} ({g.itens.length})
                  </span>
                  {g.autores.length > 0 && (
                    <span className="text-xs">Fotos por {g.autores.join(", ")}</span>
                  )}
                </dt>
                <dd className="tabular-nums">{formatarPreco(g.subtotalCentavos)}</dd>
              </div>
            ))}
            {resumo.descontos.map((linha) => (
              <div key={linha.rotulo} className="flex justify-between gap-4 text-primary">
                <dt>{linha.rotulo}</dt>
                <dd className="tabular-nums">−{formatarPreco(linha.valorCentavos)}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatarPreco(resumo.totalCentavos)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Calculando…</p>
        )}
        {cupomAplicado ? (
          <p className="flex items-center justify-between gap-2 rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
            <span className="flex items-center gap-2">
              <TicketPercent aria-hidden="true" className="size-4" />
              Cupom <strong>{cupomAplicado}</strong> aplicado
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label="Tirar o cupom"
              onClick={() => setCupom(null)}
            >
              <X aria-hidden="true" />
            </Button>
          </p>
        ) : (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const codigo = String(new FormData(e.currentTarget).get("cupom") ?? "").trim();
              setErros((atuais) => ({ ...atuais, cupom: undefined }));
              setCupom(codigo || null);
            }}
          >
            <Label htmlFor="cupom">Cupom de desconto</Label>
            <div className="flex gap-2">
              <Input
                id="cupom"
                name="cupom"
                autoComplete="off"
                autoCapitalize="characters"
                maxLength={40}
                aria-invalid={Boolean(mensagemCupom)}
                aria-describedby={mensagemCupom ? "cupom-erro" : undefined}
                className="h-11 uppercase"
              />
              <Button type="submit" variant="outline" size="touch">
                Aplicar
              </Button>
            </div>
            {mensagemCupom && (
              <p id="cupom-erro" role="alert" className="text-sm text-destructive">
                {mensagemCupom}
              </p>
            )}
          </form>
        )}
        <Link href="/carrinho" className="text-sm font-medium text-primary hover:underline">
          Revisar o carrinho
        </Link>
      </aside>
    </div>
  );
}

function Campo({
  id,
  rotulo,
  ajuda,
  erro,
  children,
}: {
  id: string;
  rotulo: string;
  ajuda?: string;
  erro?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
      {erro ? (
        <p id={`${id}-erro`} className="text-sm text-destructive">
          {erro}
        </p>
      ) : (
        ajuda && (
          <p id={`${id}-ajuda`} className="text-sm text-muted-foreground">
            {ajuda}
          </p>
        )
      )}
    </div>
  );
}
