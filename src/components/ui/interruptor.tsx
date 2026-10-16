import { cn } from "@/lib/utils";

/**
 * Liga/desliga das opções de ativar (no lugar da caixinha de marcar): desligado, a bolinha fica à
 * esquerda e o trilho cinza; ligado, a bolinha vai para a direita e o trilho fica azul (primary).
 * Por baixo é um checkbox de verdade (`role="switch"`): funciona dentro de formulários (`name`,
 * `defaultChecked`), no modo controlado (`checked`/`onChange`), no teclado (espaço) e com leitor
 * de tela. Use dentro de um <label> com o texto da opção, para o texto também alternar.
 */
export function Interruptor({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type" | "role">) {
  return (
    <span className={cn("relative inline-flex h-6 w-11 shrink-0", className)}>
      <input
        type="checkbox"
        role="switch"
        className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer appearance-none rounded-full outline-none disabled:cursor-not-allowed"
        {...props}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full bg-muted-foreground/30 transition-colors duration-150 peer-checked:bg-primary peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 peer-disabled:opacity-50 motion-reduce:transition-none"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform duration-150 peer-checked:translate-x-5 motion-reduce:transition-none"
      />
    </span>
  );
}
