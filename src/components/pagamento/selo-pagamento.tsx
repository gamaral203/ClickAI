"use client";

import { motion, useReducedMotion } from "motion/react";
import { Check, Clock } from "lucide-react";

/**
 * Ícone do topo da página do pedido, animado: o relógio pulsa enquanto espera o pagamento e o
 * check "salta" quando confirma. Respeita o "reduzir movimento" do aparelho.
 */
export function SeloPagamento({ pago }: { pago: boolean }) {
  const reduzir = useReducedMotion();
  if (pago) {
    return (
      <span className="relative flex size-14 shrink-0 items-center justify-center">
        {!reduzir && (
          <motion.span
            aria-hidden="true"
            className="absolute inset-0 rounded-full bg-highlight/70"
            initial={{ scale: 0.6, opacity: 0.9 }}
            animate={{ scale: 1.6, opacity: 0 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
        )}
        <motion.span
          className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
          initial={reduzir ? false : { scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 16 }}
        >
          <Check aria-hidden="true" className="size-7" strokeWidth={3} />
        </motion.span>
      </span>
    );
  }
  return (
    <motion.span
      className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
      animate={reduzir ? undefined : { scale: [1, 1.06, 1] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
    >
      <Clock aria-hidden="true" className="size-7" />
    </motion.span>
  );
}
