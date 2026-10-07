/**
 * Marca d'água visual sobre a prévia, só enquanto usamos imagens de exemplo.
 * A proteção real é a prévia já sair do processamento com a marca gravada e em baixa
 * resolução (docs/arquitetura.md e docs/riscos.md); uma camada de CSS não protege nada.
 */
export function MarcaDagua() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-[-50%] flex rotate-[-24deg] flex-wrap content-center justify-center gap-x-16 gap-y-20">
        {Array.from({ length: 48 }, (_, i) => (
          <span
            key={i}
            className="text-2xl font-extrabold tracking-wide text-white/35 select-none [text-shadow:0_1px_2px_rgb(0_0_0/25%)]"
          >
            ClicouAí
          </span>
        ))}
      </div>
    </div>
  );
}
