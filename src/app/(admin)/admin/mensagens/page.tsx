import type { Metadata } from "next";
import { Suspense } from "react";
import { ChevronDown, Mail, MessageCircle } from "lucide-react";

import { listarMensagens } from "@/dados";
import { formatarDataCurta } from "@/lib/formatar";
import { exigirGestor } from "@/servicos/sessao";

export const metadata: Metadata = { title: "Mensagens", robots: { index: false, follow: false } };

export default function PaginaMensagens() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Mensagens</h1>
        <p className="text-muted-foreground">
          E-mails e WhatsApp enviados: entrega das fotos, lembrete de carrinho abandonado e avisos
          de denúncia. Por enquanto o envio é simulado e as mensagens ficam só aqui.
        </p>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  await exigirGestor("/admin/mensagens");
  const mensagens = await listarMensagens();
  if (mensagens.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        Nenhuma mensagem enviada ainda.
      </p>
    );
  }
  return (
    // Cada mensagem começa fechada (só o assunto e para quem foi); clicar abre o texto.
    <ul className="flex flex-col gap-2">
      {mensagens.map((m) => (
        <li key={m.id}>
          <details className="group rounded-lg border">
            <summary className="flex cursor-pointer list-none flex-col gap-0.5 px-3 py-2 [&::-webkit-details-marker]:hidden">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {m.canal === "email" ? (
                  <Mail aria-hidden="true" className="size-3.5 text-muted-foreground" />
                ) : (
                  <MessageCircle aria-hidden="true" className="size-3.5 text-muted-foreground" />
                )}
                <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                  {
                    {
                      entrega: "Entrega",
                      lembrete: "Lembrete",
                      denuncia: "Denúncia",
                      lembrete_pix: "Lembrete do Pix",
                      venda: "Aviso de venda",
                      seguranca: "Segurança da conta",
                      liberacao: "Fotos liberadas",
                    }[m.tipo]
                  }
                </span>
                <span className="min-w-0 truncate text-muted-foreground">
                  {m.para} · {formatarDataCurta(m.criadoEm)}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                />
              </div>
              <p className="text-sm font-medium">{m.assunto}</p>
            </summary>
            <p className="border-t px-3 py-2 text-sm break-words whitespace-pre-line text-muted-foreground">
              {m.texto}
            </p>
          </details>
        </li>
      ))}
    </ul>
  );
}
