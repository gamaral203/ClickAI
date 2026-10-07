import type { Metadata } from "next";
import { Suspense } from "react";
import { Mail, MessageCircle } from "lucide-react";

import { listarMensagens } from "@/dados";
import { formatarDataEHora } from "@/lib/formatar";
import { exigirEquipe } from "@/servicos/sessao";

export const metadata: Metadata = { title: "Mensagens", robots: { index: false, follow: false } };

export default function PaginaMensagens() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Mensagens</h1>
        <p className="text-muted-foreground">
          E-mails e WhatsApp enviados aos compradores: entrega das fotos e lembrete de carrinho
          abandonado. Por enquanto o envio é simulado e as mensagens ficam só aqui.
        </p>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  await exigirEquipe("/admin/mensagens");
  const mensagens = await listarMensagens();
  if (mensagens.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        Nenhuma mensagem enviada ainda.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {mensagens.map((m) => (
        <li key={m.id} className="flex flex-col gap-2 rounded-xl border p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {m.canal === "email" ? (
              <Mail aria-hidden="true" className="size-4" />
            ) : (
              <MessageCircle aria-hidden="true" className="size-4" />
            )}
            <span className="font-medium">{m.canal === "email" ? "E-mail" : "WhatsApp"}</span>
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
              {m.tipo === "entrega" ? "Entrega" : "Lembrete"}
            </span>
            <span className="text-muted-foreground">
              para {m.para} · {formatarDataEHora(m.criadoEm)}
            </span>
          </div>
          <p className="font-semibold">{m.assunto}</p>
          <p className="text-sm break-all text-muted-foreground">{m.texto}</p>
        </li>
      ))}
    </ul>
  );
}
