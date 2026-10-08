"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, ScanFace } from "lucide-react";

import { indexarRostosDoEventoAcao } from "@/app/(fotografo)/painel/eventos/rostos-acoes";
import { Button } from "@/components/ui/button";

/**
 * Situação da busca por selfie no evento e o botão para cadastrar os rostos que faltam. As fotos
 * sem rosto cadastrado não aparecem quando o cliente busca pela selfie.
 */
export function RostosDoEvento({
  eventoId,
  prontas,
  comRosto,
  configurado,
}: {
  eventoId: string;
  prontas: number;
  comRosto: number;
  configurado: boolean;
}) {
  const router = useRouter();
  const [rodando, setRodando] = useState(false);
  const [feitas, setFeitas] = useState(0);
  const [falhas, setFalhas] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [terminou, setTerminou] = useState(false);
  if (prontas === 0) return null;

  async function cadastrar() {
    setRodando(true);
    setErro(null);
    setTerminou(false);
    setFeitas(0);
    setFalhas(0);
    let depoisDe: string | null = null;
    try {
      do {
        const r = await indexarRostosDoEventoAcao(eventoId, depoisDe);
        if (!r.ok) {
          setErro(r.erro);
          // As que já entraram continuam valendo: atualiza o "x de y fotos com rosto".
          router.refresh();
          return;
        }
        setFeitas((n) => n + r.indexadas);
        setFalhas((n) => n + r.falhas);
        depoisDe = r.proximo;
      } while (depoisDe);
      setTerminou(true);
      router.refresh();
    } catch {
      setErro("A conexão caiu. Clique de novo para continuar de onde parou.");
    } finally {
      setRodando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <p className="flex items-center gap-2 font-medium">
        <ScanFace aria-hidden="true" className="size-5 text-primary" />
        Busca por selfie
      </p>
      {!configurado ? (
        <p className="text-sm text-muted-foreground">
          O reconhecimento facial não está ligado neste servidor (faltam as variáveis
          REKOGNITION_REGIAO, REKOGNITION_ACCESS_KEY_ID e REKOGNITION_SECRET_ACCESS_KEY). Os
          clientes não conseguem buscar pela selfie.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {comRosto} de {prontas} fotos com rosto cadastrado. Fotos sem rosto (paisagem, de
            costas) são normais; se o número estiver baixo, cadastre de novo as que faltam.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="touch" disabled={rodando} onClick={cadastrar}>
              {rodando && (
                <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
              )}
              {rodando ? `Cadastrando… ${feitas} fotos` : "Cadastrar rostos que faltam"}
            </Button>
            {terminou && !rodando && (
              <span role="status" className="text-sm text-primary">
                Pronto: {feitas} {feitas === 1 ? "foto enviada" : "fotos enviadas"} ao
                reconhecimento.
              </span>
            )}
          </div>
          {terminou && !rodando && falhas > 0 && (
            <p role="alert" className="text-sm text-destructive">
              {falhas}{" "}
              {falhas === 1 ? "foto não pôde ser cadastrada" : "fotos não puderam ser cadastradas"}{" "}
              agora. Clique de novo em alguns minutos para tentar só as que faltam.
            </p>
          )}
        </>
      )}
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}
