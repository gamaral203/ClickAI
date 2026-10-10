"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { Check, Info, Loader2 } from "lucide-react";

import { escolherAvatarAcao } from "@/app/(fotografo)/painel/perfil/avatar-acoes";
import { AVATARES } from "@/lib/avatares";
import { cn } from "@/lib/utils";

/**
 * Foto de perfil em Perfil e recebimento: mostra o que está em uso (a foto enviada em Minha loja
 * ou o avatar) e a grade para escolher um dos avatares. A foto enviada tem prioridade: com ela,
 * o avatar escolhido fica guardado para quando a foto sair.
 */
export function EscolherAvatar({
  escolhido,
  foto,
}: {
  /** Id do avatar em vigor: o escolhido ou, sem escolha, o padrão da conta. */
  escolhido: string;
  /** URL da foto de perfil enviada, ou `null`. */
  foto: string | null;
}) {
  const router = useRouter();
  const [salvo, setSalvo] = useState(escolhido);
  const [selecionado, selecionar] = useOptimistic(salvo);
  const [salvando, iniciar] = useTransition();
  const [mensagem, setMensagem] = useState<{ ok: boolean; texto: string } | null>(null);

  const avatar = AVATARES.find((a) => a.id === selecionado) ?? AVATARES[0];

  function escolher(id: string) {
    if (id === selecionado) return;
    setMensagem(null);
    iniciar(async () => {
      selecionar(id);
      const resultado = await escolherAvatarAcao(id);
      if (resultado.ok) {
        setSalvo(id);
        setMensagem({ ok: true, texto: "Avatar salvo." });
        router.refresh();
      } else {
        setMensagem({ ok: false, texto: resultado.erro });
      }
    });
  }

  return (
    <section aria-labelledby="foto-de-perfil" className="flex flex-col gap-5 rounded-xl border p-5">
      <div className="flex items-center gap-4">
        <span className="relative size-20 shrink-0 overflow-hidden rounded-full border bg-muted">
          <Image
            src={foto ?? avatar.url}
            alt={foto ? "Sua foto de perfil" : avatar.nome}
            fill
            sizes="80px"
            className="object-cover"
          />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="foto-de-perfil" className="text-lg font-semibold">
            Foto de perfil
          </h2>
          <p className="text-sm text-muted-foreground">
            {foto
              ? "Em uso: a foto que você enviou."
              : "Em uso: o avatar marcado abaixo. Aparece no painel, no seu link e na sua loja."}{" "}
            <Link
              href="/painel/loja"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {foto ? "Trocar ou remover a foto" : "Enviar uma foto"}
            </Link>
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Ou escolha um avatar</h3>
        {foto && (
          <p className="flex items-start gap-2 rounded-lg bg-accent p-3 text-sm text-accent-foreground">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />A foto enviada tem
            prioridade; remova-a em Minha loja para usar o avatar.
          </p>
        )}
        <ul className="grid max-w-2xl grid-cols-4 gap-3 sm:grid-cols-6">
          {AVATARES.map((a) => {
            const marcado = a.id === selecionado;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  aria-pressed={marcado}
                  aria-label={a.nome}
                  disabled={salvando}
                  onClick={() => escolher(a.id)}
                  className={cn(
                    "relative block aspect-square w-full rounded-full p-1 transition-[box-shadow,transform] duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none enabled:hover:scale-[1.03] disabled:cursor-wait",
                    marcado
                      ? "ring-3 ring-primary"
                      : "ring-1 ring-border enabled:hover:ring-primary/50",
                  )}
                >
                  <span className="relative block size-full overflow-hidden rounded-full">
                    <Image src={a.url} alt="" fill sizes="96px" className="object-cover" />
                  </span>
                  {marcado && (
                    <span
                      aria-hidden="true"
                      className="absolute right-0 bottom-0 flex size-6 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground"
                    >
                      {salvando ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Check className="size-3.5" strokeWidth={3} />
                      )}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <p
          role="status"
          className={cn("min-h-5 text-sm", mensagem?.ok ? "text-primary" : "text-destructive")}
        >
          {mensagem?.texto}
        </p>
      </div>
    </section>
  );
}
