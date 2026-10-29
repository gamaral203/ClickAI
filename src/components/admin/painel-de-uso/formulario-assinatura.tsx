"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { Loader2, X } from "lucide-react";

import { salvarAssinaturaAcao, type EstadoAssinatura } from "@/app/(admin)/admin/uso/acoes";
import { Campo, classeSelect, propsDeErro } from "@/components/painel/campos";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { enviarSemLimpar } from "@/lib/formulario";
import {
  CATEGORIAS_ASSINATURA,
  ROTULO_CATEGORIA,
  type CampoAssinatura,
  type CategoriaAssinatura,
  type Ciclo,
  type Moeda,
} from "@/lib/painel-de-uso";

/** Assinatura com os campos já em texto, como o formulário mostra (preparada no servidor). */
export type AssinaturaNoFormulario = {
  id: string;
  nome: string;
  categoria: CategoriaAssinatura;
  plano: string;
  valor: string;
  moeda: Moeda;
  ciclo: Ciclo;
  assinadaEm: string;
  renovaEm: string;
  formaPagamento: string;
  responsavel: string;
  linkPainel: string;
  observacoes: string;
};

const inicial: EstadoAssinatura = {};

/**
 * Criar ou editar uma assinatura. Valores em reais ou dólares na tela (o servidor converte para
 * centavos). Ao salvar, volta para a lista (`voltar`), que já mostra o item atualizado.
 */
export function FormularioAssinatura({
  assinatura,
  voltar,
  hoje,
}: {
  assinatura?: AssinaturaNoFormulario;
  voltar: string;
  /** Hoje em Brasília (AAAA-MM-DD): data de assinatura padrão de uma nova. */
  hoje: string;
}) {
  const router = useRouter();
  const [estado, acao, salvando] = useActionState(salvarAssinaturaAcao, inicial);
  const erros = estado.erros ?? {};
  const prefixo = assinatura?.id ?? "nova";
  const campo = (nome: CampoAssinatura) => ({
    ...propsDeErro(`${prefixo}-${nome}`, erros[nome]),
    name: nome,
  });

  useEffect(() => {
    if (estado.ok) {
      router.replace(voltar, { scroll: false });
      router.refresh();
    }
  }, [estado.ok, router, voltar]);

  return (
    <form
      onSubmit={enviarSemLimpar(acao)}
      noValidate
      className="flex flex-col gap-5 rounded-xl border bg-card p-4 sm:p-6"
      aria-labelledby={`${prefixo}-titulo`}
    >
      {assinatura && <input type="hidden" name="assinaturaId" value={assinatura.id} />}
      <div className="flex items-center justify-between gap-3">
        <h3 id={`${prefixo}-titulo`} className="text-lg font-semibold">
          {assinatura ? `Editar ${assinatura.nome}` : "Nova assinatura"}
        </h3>
        <Link
          href={voltar}
          scroll={false}
          aria-label="Fechar o formulário"
          className={buttonVariants({ variant: "ghost", size: "icon-lg" })}
        >
          <X aria-hidden="true" />
        </Link>
      </div>
      {erros.geral && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {erros.geral}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Serviço" id={`${prefixo}-nome`} erro={erros.nome}>
          <Input
            {...campo("nome")}
            defaultValue={assinatura?.nome}
            maxLength={80}
            placeholder="Ex.: Vercel"
            autoComplete="off"
            className="h-11"
          />
        </Campo>
        <Campo rotulo="Plano" id={`${prefixo}-plano`} erro={erros.plano}>
          <Input
            {...campo("plano")}
            defaultValue={assinatura?.plano}
            maxLength={80}
            placeholder="Ex.: Pro"
            autoComplete="off"
            className="h-11"
          />
        </Campo>
        <Campo rotulo="Categoria" id={`${prefixo}-categoria`} erro={erros.categoria}>
          <select
            {...campo("categoria")}
            defaultValue={assinatura?.categoria ?? "hospedagem"}
            className={classeSelect}
          >
            {CATEGORIAS_ASSINATURA.map((c) => (
              <option key={c} value={c}>
                {ROTULO_CATEGORIA[c]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo
          rotulo="Ciclo de cobrança"
          id={`${prefixo}-ciclo`}
          erro={erros.ciclo}
          ajuda="Por uso: informe o valor estimado por mês (o gasto real vai no histórico). Avulsa: despesa única."
        >
          <select
            {...campo("ciclo")}
            defaultValue={assinatura?.ciclo ?? "mensal"}
            className={classeSelect}
          >
            <option value="mensal">Mensal</option>
            <option value="anual">Anual</option>
            <option value="uso">Por uso (estimado por mês)</option>
            <option value="avulsa">Avulsa (sem recorrência)</option>
          </select>
        </Campo>
        <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
          <Campo rotulo="Moeda" id={`${prefixo}-moeda`} erro={erros.moeda}>
            <select
              {...campo("moeda")}
              defaultValue={assinatura?.moeda ?? "BRL"}
              className={classeSelect}
            >
              <option value="BRL">R$</option>
              <option value="USD">US$</option>
            </select>
          </Campo>
          <Campo rotulo="Valor" id={`${prefixo}-valor`} erro={erros.valor}>
            <Input
              {...campo("valor")}
              defaultValue={assinatura?.valor}
              inputMode="decimal"
              placeholder="20,00"
              autoComplete="off"
              className="h-11 tabular-nums"
            />
          </Campo>
        </div>
        <Campo
          rotulo="Forma de pagamento"
          id={`${prefixo}-formaPagamento`}
          erro={erros.formaPagamento}
          ajuda="Só a bandeira e o final do cartão. Nunca o número completo."
        >
          <Input
            {...campo("formaPagamento")}
            defaultValue={assinatura?.formaPagamento}
            maxLength={60}
            placeholder="Ex.: Mastercard final 9292"
            autoComplete="off"
            className="h-11"
          />
        </Campo>
        <Campo rotulo="Assinada em" id={`${prefixo}-assinadaEm`} erro={erros.assinadaEm}>
          <Input
            {...campo("assinadaEm")}
            type="date"
            defaultValue={assinatura?.assinadaEm ?? hoje}
            className="h-11"
          />
        </Campo>
        <Campo
          rotulo="Renova em"
          id={`${prefixo}-renovaEm`}
          erro={erros.renovaEm}
          ajuda="A gestão recebe um e-mail 7 dias e 1 dia antes. Deixe em branco se não renova."
        >
          <Input
            {...campo("renovaEm")}
            type="date"
            defaultValue={assinatura?.renovaEm}
            className="h-11"
          />
        </Campo>
        <Campo rotulo="Responsável" id={`${prefixo}-responsavel`} erro={erros.responsavel}>
          <Input
            {...campo("responsavel")}
            defaultValue={assinatura?.responsavel}
            maxLength={60}
            placeholder="Quem cuida da conta"
            autoComplete="off"
            className="h-11"
          />
        </Campo>
        <Campo
          rotulo="Link do painel do serviço"
          id={`${prefixo}-linkPainel`}
          erro={erros.linkPainel}
        >
          <Input
            {...campo("linkPainel")}
            type="url"
            defaultValue={assinatura?.linkPainel}
            maxLength={300}
            placeholder="https://"
            autoComplete="off"
            className="h-11"
          />
        </Campo>
      </div>
      <Campo rotulo="Observações" id={`${prefixo}-observacoes`} erro={erros.observacoes}>
        <textarea
          {...campo("observacoes")}
          defaultValue={assinatura?.observacoes}
          maxLength={500}
          rows={3}
          className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm"
        />
      </Campo>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="touch" disabled={salvando}>
          {salvando && <Loader2 aria-hidden="true" className="animate-spin" />}
          {assinatura ? "Salvar alterações" : "Cadastrar assinatura"}
        </Button>
        <Link
          href={voltar}
          scroll={false}
          className={buttonVariants({ variant: "outline", size: "touch" })}
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
