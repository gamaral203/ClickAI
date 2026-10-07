import { startTransition, type FormEvent } from "react";

/**
 * Envia o formulário para a ação do `useActionState` sem limpar os campos. Com `<form
 * action>`, o React 19 reinicia o formulário depois de cada envio, e quem errou um campo
 * perderia tudo o que digitou nos outros.
 */
export function enviarSemLimpar(acao: (dados: FormData) => void) {
  return (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    startTransition(() => acao(dados));
  };
}
