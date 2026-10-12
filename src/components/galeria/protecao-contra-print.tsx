"use client";

import { useEffect } from "react";

/** Classe no <html> que desfoca as prévias (src/app/globals.css, `.protegido .imagem-protegida`). */
const CLASSE = "protegido";

/** Quanto tempo as prévias ficam desfocadas depois de um atalho de print. */
const DURACAO_MS = 1500;

/**
 * Desfoca as prévias (as imagens com `imagem-protegida`) quando o navegador dá sinais de que a
 * pessoa vai tirar um print: a tecla PrintScreen, o recorte do Windows (Win+Shift+S) ou do Mac
 * (Cmd+Shift+3/4/5), a janela perdendo o foco (ferramenta de recorte, outra janela), a aba indo
 * para segundo plano e o mouse saindo da página (indo para a barra do navegador). Volta ao normal
 * quando o foco ou o mouse voltam.
 *
 * É fricção contra o caso casual, não bloqueio: o print pelo botão do celular, outro monitor, a
 * câmera ou a gravação de tela passam, e a página nem fica sabendo. A proteção real continua
 * sendo a marca d'água nos pixels e o original só depois do pagamento (docs/riscos.md).
 */
export function ProtecaoContraPrint() {
  useEffect(() => {
    const raiz = document.documentElement;
    let soltar: number | undefined;
    const proteger = () => raiz.classList.add(CLASSE);
    const liberar = () => {
      window.clearTimeout(soltar);
      raiz.classList.remove(CLASSE);
    };
    /** Atalho de print: desfoca agora e libera sozinho daqui a pouco (o foco pode nem mudar). */
    const protegerPorUmMomento = () => {
      proteger();
      window.clearTimeout(soltar);
      soltar = window.setTimeout(() => raiz.classList.remove(CLASSE), DURACAO_MS);
    };

    const aoApertar = (e: KeyboardEvent) => {
      // Win+Shift+S e Cmd+Shift+3/4/5: a tecla Windows e a Command chegam como "Meta".
      if (e.key === "PrintScreen" || (e.shiftKey && e.metaKey)) protegerPorUmMomento();
    };
    const aoSoltar = (e: KeyboardEvent) => {
      if (e.key !== "PrintScreen") return;
      protegerPorUmMomento();
      // O print já foi para a área de transferência: sobrescreve com nada (onde o navegador deixa).
      navigator.clipboard?.writeText("").catch(() => {});
    };
    const aoMudarVisibilidade = () => (document.hidden ? proteger() : liberar());

    document.addEventListener("keydown", aoApertar);
    document.addEventListener("keyup", aoSoltar);
    window.addEventListener("blur", proteger);
    window.addEventListener("focus", liberar);
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    document.addEventListener("mouseleave", proteger);
    document.addEventListener("mouseenter", liberar);
    return () => {
      document.removeEventListener("keydown", aoApertar);
      document.removeEventListener("keyup", aoSoltar);
      window.removeEventListener("blur", proteger);
      window.removeEventListener("focus", liberar);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      document.removeEventListener("mouseleave", proteger);
      document.removeEventListener("mouseenter", liberar);
      liberar();
    };
  }, []);
  return null;
}
