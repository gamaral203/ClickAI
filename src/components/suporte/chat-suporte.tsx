"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, Loader2, MessageCircle, SendHorizontal, X } from "lucide-react";

import {
  carregarChatAcao,
  enviarMensagemSuporteAcao,
  type EstadoChat,
} from "@/app/(fotografo)/painel/suporte-acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { linkWhatsappSuporte } from "@/lib/suporte";

/** De quanto em quanto tempo o chat aberto procura resposta nova. */
const ATUALIZAR_A_CADA_MS = 15_000;

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const passos = [
  { campo: "nome", rotulo: "Nome", tipo: "text", autoComplete: "name" },
  { campo: "email", rotulo: "E-mail", tipo: "email", autoComplete: "email" },
  { campo: "texto", rotulo: "Mensagem", tipo: "textarea", autoComplete: "off" },
] as const;

type Campos = { nome: string; email: string; texto: string };

/**
 * Chat de ajuda do painel: botão flutuante no canto, que abre a conversa com a equipe. Na
 * primeira vez, pede nome, e-mail e a dúvida em 3 passos (já preenchidos com os dados da conta);
 * depois vira um fio de mensagens. A resposta chega aqui, por notificação e por e-mail.
 */
export function ChatSuporte({ novidade: novidadeInicial }: { novidade: boolean }) {
  const reduzir = useReducedMotion();
  // Link da notificação de resposta (/painel?ajuda=1): já abre o chat.
  const parametros = useSearchParams();
  const [aberto, setAberto] = useState(() => parametros.get("ajuda") === "1");
  const [novidade, setNovidade] = useState(novidadeInicial);
  const [estado, setEstado] = useState<EstadoChat | null>(null);
  const [passo, setPasso] = useState(0);
  const [campos, setCampos] = useState<Campos>({ nome: "", email: "", texto: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, startEnvio] = useTransition();
  const fim = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    const novo = await carregarChatAcao().catch(() => null);
    if (!novo) return;
    setEstado(novo);
    setNovidade(false);
    setCampos((c) => ({ ...c, nome: c.nome || novo.nome, email: c.email || novo.email }));
  }, []);

  useEffect(() => {
    if (!aberto) return;
    // A primeira leitura sai logo depois de abrir; depois, a cada 15 segundos.
    const primeira = setTimeout(() => void carregar(), 0);
    const id = setInterval(() => void carregar(), ATUALIZAR_A_CADA_MS);
    return () => {
      clearTimeout(primeira);
      clearInterval(id);
    };
  }, [aberto, carregar]);

  const quantas = estado?.mensagens.length ?? 0;
  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: reduzir ? "auto" : "smooth", block: "end" });
  }, [quantas, aberto, passo, reduzir]);

  function enviar(texto: string) {
    setErro(null);
    startEnvio(async () => {
      const resultado = await enviarMensagemSuporteAcao({ ...campos, texto }).catch(() => ({
        erro: "Não foi possível enviar. Tente de novo.",
      }));
      if ("erro" in resultado) return setErro(resultado.erro);
      setEstado(resultado.estado);
      setCampos((c) => ({ ...c, texto: "" }));
    });
  }

  function avancar() {
    setErro(null);
    const { campo } = passos[passo];
    const valor = campos[campo].trim();
    if (campo === "nome" && valor.length < 2) return setErro("Informe o seu nome.");
    if (campo === "email" && !/^\S+@\S+\.\S+$/.test(valor)) {
      return setErro("Informe um e-mail válido.");
    }
    if (passo < passos.length - 1) return setPasso(passo + 1);
    enviar(campos.texto);
  }

  const conversando = quantas > 0;
  const primeiraDoUsuario = estado?.mensagens.find((m) => m.autor === "usuario");

  return (
    <>
      <AnimatePresence>
        {aberto && (
          <motion.section
            role="dialog"
            aria-label="Ajuda - ClicouAí"
            initial={reduzir ? false : { opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduzir ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            style={{ transformOrigin: "bottom right" }}
            className="fixed right-3 bottom-22 z-50 flex h-[min(440px,calc(100dvh-7rem))] w-[min(400px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl sm:right-5 sm:h-[min(600px,calc(100dvh-7rem))]"
          >
            <header className="flex items-center gap-3 bg-primary px-4 py-2.5 text-primary-foreground sm:px-5 sm:py-4">
              <span className="flex size-9 items-center justify-center rounded-full bg-white/20">
                <MessageCircle aria-hidden="true" className="size-5" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="font-semibold">Ajuda - ClicouAí</p>
                <p className="truncate text-xs text-primary-foreground/80">
                  Respondemos por aqui e avisamos você
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="flex size-9 items-center justify-center rounded-full hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
              >
                <X aria-hidden="true" className="size-5" />
                <span className="sr-only">Fechar o chat</span>
              </button>
            </header>

            <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-muted/30 px-4 py-4">
              <Balao autor="equipe" rotulo="ClicouAí">
                Oi, tudo bem? 👋
                {"\n\n"}
                Informe seu nome e e-mail. Em seguida, descreva com o máximo de detalhes a sua
                dúvida.
              </Balao>

              {estado?.mensagens.map((m) => (
                <div key={m.id} className="contents">
                  <Balao
                    autor={m.autor}
                    rotulo={m.autor === "equipe" ? "Equipe ClicouAí" : undefined}
                    hora={hora(m.criadoEm)}
                  >
                    {m.texto}
                  </Balao>
                  {m === primeiraDoUsuario && (
                    <Balao autor="equipe" rotulo="ClicouAí">
                      Recebemos a sua mensagem! A nossa equipe responde por aqui mesmo, e você
                      recebe uma notificação e um e-mail quando a resposta chegar.
                      {"\n\n"}
                      Se for urgente,{" "}
                      <a
                        href={linkWhatsappSuporte()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-primary underline underline-offset-2"
                      >
                        chame no WhatsApp
                      </a>
                      .
                    </Balao>
                  )}
                </div>
              ))}

              {estado && !conversando && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    avancar();
                  }}
                  className="ml-2 flex flex-col gap-3 rounded-2xl border bg-background p-4 shadow-xs"
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={passo}
                      initial={reduzir ? false : { opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={reduzir ? undefined : { opacity: 0, x: -16 }}
                      transition={{ duration: 0.15 }}
                      className="flex flex-col gap-2"
                    >
                      <CampoDoPasso
                        passo={passo}
                        campos={campos}
                        setCampos={setCampos}
                        aoEnter={avancar}
                      />
                    </motion.div>
                  </AnimatePresence>
                  {erro && (
                    <p role="alert" className="text-sm text-destructive">
                      {erro}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">
                      {passo > 0 && (
                        <button
                          type="button"
                          onClick={() => setPasso(passo - 1)}
                          className="mr-2 font-medium text-foreground hover:underline"
                        >
                          Voltar
                        </button>
                      )}
                      {passo + 1} de {passos.length}
                    </span>
                    <Button
                      type="submit"
                      size="touch"
                      disabled={enviando}
                      className="h-10 rounded-full"
                    >
                      {enviando && <Loader2 aria-hidden="true" className="animate-spin" />}
                      {passo < passos.length - 1 ? "Avançar" : "Enviar"}
                    </Button>
                  </div>
                </form>
              )}

              {!estado && (
                <div className="flex justify-center py-6">
                  <Loader2 aria-label="Carregando" className="size-5 animate-spin text-primary" />
                </div>
              )}
              <div ref={fim} />
            </div>

            {conversando && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (campos.texto.trim()) enviar(campos.texto);
                }}
                className="flex flex-col gap-1 border-t bg-background p-3"
              >
                {erro && (
                  <p role="alert" className="px-1 text-sm text-destructive">
                    {erro}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <Input
                    value={campos.texto}
                    onChange={(e) => setCampos((c) => ({ ...c, texto: e.target.value }))}
                    maxLength={2000}
                    placeholder="Digite uma mensagem"
                    aria-label="Mensagem"
                    className="h-11 rounded-full px-4"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={enviando || !campos.texto.trim()}
                    className="size-11 shrink-0 rounded-full"
                  >
                    {enviando ? (
                      <Loader2 aria-hidden="true" className="animate-spin" />
                    ) : (
                      <SendHorizontal aria-hidden="true" />
                    )}
                    <span className="sr-only">Enviar</span>
                  </Button>
                </div>
              </form>
            )}
          </motion.section>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => setAberto(!aberto)}
        aria-expanded={aberto}
        whileHover={reduzir ? undefined : { scale: 1.06 }}
        whileTap={reduzir ? undefined : { scale: 0.94 }}
        className="fixed right-3 bottom-4 z-50 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background focus-visible:ring-ring/60 focus-visible:outline-none sm:right-5 print:hidden"
      >
        {aberto ? (
          <ChevronDown aria-hidden="true" className="size-7" />
        ) : (
          <MessageCircle aria-hidden="true" className="size-7" />
        )}
        <span className="sr-only">
          {aberto ? "Fechar o chat de ajuda" : "Abrir o chat de ajuda"}
          {novidade && !aberto ? " (resposta nova)" : ""}
        </span>
        {novidade && !aberto && (
          <span
            aria-hidden="true"
            className="absolute top-0 right-0 size-4 rounded-full bg-destructive ring-2 ring-background"
          />
        )}
      </motion.button>
    </>
  );
}

function Balao({
  autor,
  rotulo,
  hora,
  children,
}: {
  autor: "usuario" | "equipe";
  rotulo?: string;
  hora?: string;
  children: React.ReactNode;
}) {
  const meu = autor === "usuario";
  return (
    <div className={`flex flex-col gap-1 ${meu ? "items-end" : "items-start"}`}>
      {rotulo && <span className="px-2 text-xs text-muted-foreground">{rotulo}</span>}
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm break-words whitespace-pre-line ${
          meu
            ? "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md bg-background text-foreground shadow-xs ring-1 ring-border"
        }`}
      >
        {children}
      </div>
      {hora && <span className="px-2 text-[11px] text-muted-foreground">{hora}</span>}
    </div>
  );
}

function CampoDoPasso({
  passo,
  campos,
  setCampos,
  aoEnter,
}: {
  passo: number;
  campos: Campos;
  setCampos: React.Dispatch<React.SetStateAction<Campos>>;
  aoEnter: () => void;
}) {
  const { campo, rotulo, tipo, autoComplete } = passos[passo];
  const id = `chat-${campo}`;
  const mudar = (valor: string) => setCampos((c) => ({ ...c, [campo]: valor }));
  return (
    <>
      <label htmlFor={id} className="text-sm font-semibold">
        {rotulo}
      </label>
      {tipo === "textarea" ? (
        <textarea
          id={id}
          autoFocus
          rows={4}
          maxLength={2000}
          value={campos[campo]}
          onChange={(e) => mudar(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              aoEnter();
            }
          }}
          placeholder="Descreva a sua dúvida com detalhes"
          className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
        />
      ) : (
        <Input
          id={id}
          autoFocus
          type={tipo}
          autoComplete={autoComplete}
          value={campos[campo]}
          onChange={(e) => mudar(e.target.value)}
          maxLength={campo === "nome" ? 100 : 200}
          className="h-11 rounded-xl"
        />
      )}
    </>
  );
}
