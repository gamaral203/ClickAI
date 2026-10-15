"use client";

/**
 * Interruptor liga/desliga das configurações do Financeiro. É um botão com role="switch" (o
 * leitor de tela anuncia "ligado"/"desligado"); o rótulo vem de fora por `aria-labelledby`, para
 * o título da configuração ser o nome do controle.
 */
export function InterruptorFinanceiro({
  ligado,
  aoMudar,
  rotuloId,
  descricaoId,
  desabilitado = false,
}: {
  ligado: boolean;
  aoMudar: (novo: boolean) => void;
  rotuloId: string;
  descricaoId?: string;
  desabilitado?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-labelledby={rotuloId}
      aria-describedby={descricaoId}
      disabled={desabilitado}
      onClick={() => aoMudar(!ligado)}
      // Área de toque de 44 px no celular; o trilho visível é menor.
      className="group/interruptor relative inline-flex h-11 w-14 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        aria-hidden="true"
        className={`flex h-7 w-12 items-center rounded-full border-2 border-transparent p-0.5 transition-colors ${
          ligado ? "bg-primary" : "bg-input dark:bg-muted"
        }`}
      >
        <span
          className={`size-5 rounded-full bg-background shadow-sm transition-transform ${
            ligado ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}
