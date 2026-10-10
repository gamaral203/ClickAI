"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";

import {
  ativarNotificacoesAcao,
  desativarNotificacoesAcao,
} from "@/app/(cliente)/conta/notificacoes-acoes";
import { Button } from "@/components/ui/button";

type Estado = "carregando" | "sem_suporte" | "bloqueado" | "desligado" | "ligado";

/** Chave pública VAPID (base64url) no formato que o navegador pede. */
function chaveParaBytes(base64: string) {
  const preenchida = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const bruto = atob(preenchida);
  return Uint8Array.from(bruto, (c) => c.charCodeAt(0));
}

async function registro() {
  return navigator.serviceWorker.register("/sw.js");
}

/**
 * Botão de ativar as notificações do navegador neste aparelho (venda de foto, pedido e pagamento
 * de saque). No iPhone, só funciona com o site adicionado à Tela de Início.
 */
export function BotaoNotificacoes({ contexto }: { contexto: string }) {
  const chave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const [estado, setEstado] = useState<Estado>("carregando");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const suportado =
        Boolean(chave) &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;
      if (!suportado) return ativo && setEstado("sem_suporte");
      if (Notification.permission === "denied") return ativo && setEstado("bloqueado");
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const inscricao = await reg?.pushManager.getSubscription();
      if (ativo) setEstado(inscricao ? "ligado" : "desligado");
    })().catch(() => ativo && setEstado("sem_suporte"));
    return () => {
      ativo = false;
    };
  }, [chave]);

  async function ativar() {
    if (!chave) return;
    setOcupado(true);
    setErro(null);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "bloqueado" : "desligado");
        return;
      }
      const reg = await registro();
      await navigator.serviceWorker.ready;
      const inscricao =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: chaveParaBytes(chave),
        }));
      const r = await ativarNotificacoesAcao(inscricao.toJSON());
      if (!r.ok) throw new Error("servidor");
      setEstado("ligado");
    } catch {
      setErro("Não foi possível ativar agora. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  async function desativar() {
    setOcupado(true);
    setErro(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const inscricao = await reg?.pushManager.getSubscription();
      if (inscricao) {
        await desativarNotificacoesAcao(inscricao.endpoint);
        await inscricao.unsubscribe();
      }
      setEstado("desligado");
    } catch {
      setErro("Não foi possível desativar agora.");
    } finally {
      setOcupado(false);
    }
  }

  if (estado === "carregando" || estado === "sem_suporte") return null;

  return (
    <div className="flex flex-col items-start gap-1">
      {estado === "ligado" ? (
        <Button variant="outline" size="touch" disabled={ocupado} onClick={desativar}>
          {ocupado ? (
            <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
          ) : (
            <BellRing aria-hidden="true" data-icon="inline-start" />
          )}
          Notificações ativadas
        </Button>
      ) : estado === "bloqueado" ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <BellOff aria-hidden="true" className="size-4" />
          Notificações bloqueadas neste navegador. Libere nas configurações do site.
        </p>
      ) : (
        <Button size="touch" disabled={ocupado} onClick={ativar}>
          {ocupado ? (
            <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
          ) : (
            <Bell aria-hidden="true" data-icon="inline-start" />
          )}
          Ativar notificações
        </Button>
      )}
      <span className="text-xs text-muted-foreground">
        {estado === "ligado"
          ? `Você recebe aviso de ${contexto} neste aparelho. Clique para desligar.`
          : `Receba aviso de ${contexto} no celular ou no computador.`}
      </span>
      {erro && (
        <span role="alert" className="text-xs text-destructive">
          {erro}
        </span>
      )}
    </div>
  );
}
