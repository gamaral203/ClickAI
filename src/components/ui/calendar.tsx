"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "cn";
import { DayPicker } from "react-day-picker";
import { ptBR } from "react-day-picker/locale";

// Calendário no padrão shadcn sobre o react-day-picker, em português e começando no domingo.
// No celular as células se esticam até a largura do painel (alvo de toque de 44 px ou mais); a
// partir de `sm`, cada dia tem 40 px.

function Calendar({ className, classNames, ...props }: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      locale={ptBR}
      showOutsideDays
      className={cn("relative w-full sm:w-fit", className)}
      classNames={{
        months: "relative flex flex-col",
        month: "flex w-full flex-col gap-3",
        nav: "absolute inset-x-0 top-0 flex items-center justify-between",
        button_previous:
          "inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40 sm:size-10",
        button_next:
          "inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40 sm:size-10",
        month_caption: "flex h-11 items-center justify-center sm:h-10",
        caption_label: "text-base font-semibold first-letter:uppercase",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday:
          "flex-1 pb-1 text-center text-xs font-medium text-muted-foreground uppercase sm:w-10 sm:flex-none",
        week: "mt-1 flex w-full",
        day: "group/dia relative flex-1 p-0.5 text-center sm:w-10 sm:flex-none",
        day_button:
          "relative inline-flex h-11 w-full items-center justify-center rounded-lg text-sm tabular-nums outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 group-data-[selected=true]/dia:bg-primary group-data-[selected=true]/dia:font-semibold group-data-[selected=true]/dia:text-primary-foreground sm:h-10 motion-reduce:transition-none",
        // Hoje: negrito e um ponto embaixo (azul; limão sobre o azul quando hoje está escolhido,
        // onde o contraste é bom). Nunca só a cor para indicar.
        today:
          "font-semibold [&>button]:after:absolute [&>button]:after:bottom-1.5 [&>button]:after:size-1 [&>button]:after:rounded-full [&>button]:after:bg-primary group-data-[selected=true]/dia:[&>button]:after:bg-highlight",
        outside: "text-muted-foreground/60",
        disabled: "pointer-events-none text-muted-foreground/40 line-through",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: classe }) =>
          orientation === "left" ? (
            <ChevronLeft aria-hidden="true" className={cn("size-5", classe)} />
          ) : (
            <ChevronRight aria-hidden="true" className={cn("size-5", classe)} />
          ),
      }}
      {...props}
    />
  );
}

export { Calendar };
