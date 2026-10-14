"use client";

import { useState, useTransition } from "react";
import { Check, Copy, KeyRound, Trash2 } from "lucide-react";

import { apagarChaveAcao, gerarChaveAcao } from "@/app/(fotografo)/painel/lightroom/acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ChaveApiDoPainel } from "@/dados/chaves-api";
import { formatarData, formatarDataEHora } from "@/lib/formatar";

/**
 * Chaves de acesso do plugin do Lightroom: gerar (a chave inteira aparece uma vez só, para
 * copiar e colar no plugin), a lista das ativas (só o começo de cada uma) e apagar.
 */
export function ChavesDoLightroom({ chaves }: { chaves: ChaveApiDoPainel[] }) {
  const [nome, setNome] = useState("");
  const [nova, setNova] = useState<string | null>(null);
  const [copiada, setCopiada] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, startGerar] = useTransition();
  const [apagando, startApagar] = useTransition();

  function gerar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    startGerar(async () => {
      const r = await gerarChaveAcao(nome);
      if ("erro" in r) return setErro(r.erro);
      setNova(r.chave);
      setCopiada(false);
      setNome("");
    });
  }

  async function copiar() {
    if (!nova) return;
    try {
      await navigator.clipboard.writeText(nova);
      setCopiada(true);
    } catch {
      setErro("Não foi possível copiar. Selecione a chave e copie à mão.");
    }
  }

  function apagar(chave: ChaveApiDoPainel) {
    if (!confirm(`Apagar a chave "${chave.nome}"? O plugin que usa esta chave para de enviar.`)) {
      return;
    }
    setErro(null);
    startApagar(async () => {
      const r = await apagarChaveAcao(chave.id);
      if (r.erro) setErro(r.erro);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <KeyRound aria-hidden="true" className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Gerar chave de acesso</h2>
        </div>
        <form onSubmit={gerar} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor="nome-da-chave">Nome da chave</Label>
            <Input
              id="nome-da-chave"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Notebook do estúdio"
              maxLength={60}
              required
            />
          </div>
          <Button type="submit" size="touch" disabled={gerando}>
            {gerando ? "Gerando…" : "Gerar chave"}
          </Button>
        </form>

        {nova && (
          <div
            role="status"
            className="flex min-w-0 flex-col gap-2 rounded-lg border border-primary/40 bg-accent/40 p-3"
          >
            <p className="text-sm font-medium">
              Copie a chave agora e cole no plugin. Ela não aparece de novo.
            </p>
            <div className="flex min-w-0 gap-2">
              <Input
                readOnly
                value={nova}
                aria-label="Chave de acesso"
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 font-mono text-xs"
              />
              <Button type="button" variant="outline" onClick={copiar}>
                {copiada ? (
                  <Check aria-hidden="true" className="size-4" />
                ) : (
                  <Copy aria-hidden="true" className="size-4" />
                )}
                {copiada ? "Copiada" : "Copiar"}
              </Button>
            </div>
          </div>
        )}
        {erro && (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        )}
      </section>

      <section className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5">
        <h2 className="text-lg font-semibold">Chaves ativas</h2>
        {chaves.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma chave ainda.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {chaves.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{c.nome}</span>
                  <span className="truncate text-sm text-muted-foreground">
                    <span className="font-mono">{c.prefixo}…</span> · criada em{" "}
                    {formatarData(c.criadaEm)}
                    {c.usadaEm ? ` · último uso ${formatarDataEHora(c.usadaEm)}` : " · nunca usada"}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={apagando}
                  onClick={() => apagar(c)}
                  aria-label={`Apagar a chave ${c.nome}`}
                  title="Apagar"
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
