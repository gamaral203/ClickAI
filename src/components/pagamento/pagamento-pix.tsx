"use client";

import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { Check, Copy, QrCode, ScanLine, Smartphone, Timer } from "lucide-react";

import { Button } from "@/components/ui/button";

/** "54:07" a partir de milissegundos. */
function relogio(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(total / 60);
  const seg = total % 60;
  return `${String(min).padStart(2, "0")}:${String(seg).padStart(2, "0")}`;
}

/** Contagem regressiva até o Pix vencer. Fica vermelha nos últimos 5 minutos. */
function Contagem({ expiraEm }: { expiraEm: string }) {
  const fim = new Date(expiraEm).getTime();
  const [agora, setAgora] = useState<number | null>(null);
  useEffect(() => {
    const atualizar = () => setAgora(Date.now());
    atualizar();
    const id = setInterval(atualizar, 1000);
    return () => clearInterval(id);
  }, []);
  if (agora === null) return null;
  const resta = fim - agora;
  const urgente = resta < 5 * 60 * 1000;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold tabular-nums ${
        resta <= 0
          ? "bg-destructive/10 text-destructive"
          : urgente
            ? "bg-destructive/10 text-destructive"
            : "bg-primary/10 text-primary"
      }`}
    >
      <Timer aria-hidden="true" className="size-4" />
      {resta <= 0 ? "Pix vencido" : `Expira em ${relogio(resta)}`}
    </span>
  );
}

const passos = [
  { icone: Smartphone, texto: "Abra o app do seu banco e escolha pagar com Pix." },
  { icone: ScanLine, texto: "Leia o QR Code ou cole o código copiado." },
  { icone: Check, texto: "Pronto: as fotos são liberadas aqui na hora." },
];

/**
 * Área de pagamento do Pix: contagem regressiva, QR Code numa moldura com a linha de leitura
 * animada, o passo a passo e o "copiar código" (em destaque no celular, onde não dá para ler a
 * própria tela). As animações respeitam o "reduzir movimento" do aparelho.
 */
export function PagamentoPix({
  copiaECola,
  qrCodeBase64,
  expiraEm,
}: {
  copiaECola: string;
  qrCodeBase64: string;
  expiraEm: string;
}) {
  const [copiado, setCopiado] = useState(false);
  const reduzir = useReducedMotion();

  async function copiar() {
    try {
      await navigator.clipboard.writeText(copiaECola);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 3_000);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <motion.div
      initial={reduzir ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="flex flex-col gap-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold">
          <QrCode aria-hidden="true" className="size-5 text-primary" />
          Pague com Pix
        </p>
        <Contagem expiraEm={expiraEm} />
      </div>

      <div className="grid items-center gap-6 sm:grid-cols-[auto_minmax(0,1fr)]">
        {/* QR Code com cantoneiras e a linha de leitura. */}
        <div className="relative order-2 mx-auto size-56 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-border sm:order-none sm:mx-0">
          {[
            "top-1.5 left-1.5 border-t-4 border-l-4 rounded-tl-xl",
            "top-1.5 right-1.5 border-t-4 border-r-4 rounded-tr-xl",
            "bottom-1.5 left-1.5 border-b-4 border-l-4 rounded-bl-xl",
            "bottom-1.5 right-1.5 border-b-4 border-r-4 rounded-br-xl",
          ].map((canto) => (
            <span
              key={canto}
              aria-hidden="true"
              className={`absolute size-7 border-primary ${canto}`}
            />
          ))}
          <Image
            src={`data:image/png;base64,${qrCodeBase64}`}
            alt="QR Code do Pix"
            width={192}
            height={192}
            unoptimized
            className="size-full"
          />
          {!reduzir && (
            <motion.span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-4 h-0.5 rounded-full bg-primary/70 shadow-[0_0_12px_2px] shadow-primary/40"
              initial={{ top: "12%" }}
              animate={{ top: ["12%", "86%", "12%"] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
        </div>

        {/* No celular, o "copiar código" vem antes do QR (não dá para ler a própria tela). */}
        <div className="order-1 flex min-w-0 flex-col gap-4 sm:order-none">
          <ol className="flex flex-col gap-3">
            {passos.map(({ icone: Icone, texto }, i) => (
              <motion.li
                key={texto}
                initial={reduzir ? false : { opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.08, duration: 0.3 }}
                className="flex items-center gap-3 text-sm"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icone aria-hidden="true" className="size-4" />
                </span>
                {texto}
              </motion.li>
            ))}
          </ol>

          <motion.div whileTap={reduzir ? undefined : { scale: 0.97 }} className="w-full sm:w-fit">
            <Button size="touch" onClick={copiar} className="w-full sm:w-auto">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={copiado ? "ok" : "copiar"}
                  initial={reduzir ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduzir ? undefined : { opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-2"
                >
                  {copiado ? (
                    <Check aria-hidden="true" className="size-4" />
                  ) : (
                    <Copy aria-hidden="true" className="size-4" />
                  )}
                  {copiado ? "Código copiado!" : "Copiar código Pix"}
                </motion.span>
              </AnimatePresence>
            </Button>
          </motion.div>
          <p role="status" className="sr-only">
            {copiado ? "Código Pix copiado" : ""}
          </p>

          <details className="group text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Ver o código Pix
            </summary>
            <code className="mt-2 block max-h-24 overflow-y-auto rounded-lg bg-muted p-2 text-xs break-all">
              {copiaECola}
            </code>
          </details>
        </div>
      </div>
    </motion.div>
  );
}
