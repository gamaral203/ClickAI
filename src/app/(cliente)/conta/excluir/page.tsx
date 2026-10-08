import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, CircleAlert } from "lucide-react";

import { FormularioExclusao } from "@/components/conta/formulario-exclusao";
import { buttonVariants } from "@/components/ui/button";
import { buscarContaDoFotografo } from "@/dados";
import { formatarPreco } from "@/lib/formatar";
import { contaTemSenha, situacaoDaExclusao, temImpedimento } from "@/servicos/exclusao-conta";
import { SAQUE_MINIMO_CENTAVOS } from "@/servicos/saques";
import { usuarioAtual } from "@/servicos/sessao";

// Exclusão de conta pelo próprio usuário (LGPD). As regras ficam em
// src/servicos/exclusao-conta.ts; aqui, a explicação do que acontece e a confirmação.

export const metadata: Metadata = {
  title: "Excluir conta",
  robots: { index: false, follow: false },
};

export default function PaginaExcluirConta() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

const linkTexto = "font-medium text-primary hover:underline";

async function Conteudo() {
  const usuario = await usuarioAtual();
  if (!usuario) redirect("/entrar?proximo=/conta/excluir");

  const [conta, impedimentos, temSenha] = await Promise.all([
    buscarContaDoFotografo(usuario.id),
    situacaoDaExclusao(usuario),
    contaTemSenha(usuario),
  ]);
  const vendedor = conta !== null;
  const voltar = vendedor ? "/painel/perfil" : "/minhas-compras";

  return (
    <>
      <Link
        href={voltar}
        className="inline-flex h-11 w-fit items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar
      </Link>

      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Excluir minha conta</h1>
        <p className="text-muted-foreground">
          Conta de <strong className="text-foreground">{usuario.email}</strong>.
        </p>
      </header>

      <section className="flex flex-col gap-3 rounded-xl border p-5">
        <h2 className="text-lg font-semibold">O que acontece</h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 leading-relaxed text-muted-foreground [&_strong]:text-foreground">
          <li>
            Seu nome, e-mail, telefone e senha (ou o vínculo com o Google) são apagados e você sai
            em todos os aparelhos. <strong>Não dá para desfazer.</strong>
          </li>
          <li>
            As suas compras deixam de aparecer para você. O registro de cada venda continua
            guardado, sem o seu nome e e-mail, porque a lei fiscal exige.
          </li>
          {vendedor && (
            <>
              <li>
                Seus eventos são arquivados e as suas fotos saem da galeria. Os rostos e números
                cadastrados para a busca são apagados.
              </li>
              <li>
                <strong>Quem já comprou continua baixando</strong> as fotos que pagou.
              </li>
              <li>
                Seu perfil público e a sua loja saem do ar. O CPF/CNPJ fica guardado junto com o
                histórico de saques, pelo prazo que a lei fiscal exige.
              </li>
            </>
          )}
          <li>
            Para usar o ClicouAí de novo, é só criar uma conta nova, mas as compras e vendas antigas
            não voltam para ela.
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Mais detalhes na{" "}
          <Link href="/privacidade" className={linkTexto}>
            política de privacidade
          </Link>
          .
        </p>
      </section>

      {usuario.papel === "admin" ? (
        <Aviso titulo="Contas de gestor não são excluídas por aqui">
          Peça a outro gestor para tirar o seu acesso de gestão; depois, volte a esta página.
        </Aviso>
      ) : temImpedimento(impedimentos) ? (
        <Aviso titulo="Ainda não dá para excluir a conta">
          <ul className="flex list-disc flex-col gap-2 pl-5">
            {impedimentos.saldoSacavel && (
              <li>
                Você tem <strong>{formatarPreco(impedimentos.saldoCentavos)}</strong> em vendas que
                ainda não sacou (disponíveis ou a liberar). Saque tudo em{" "}
                <Link href="/painel/vendas" className={linkTexto}>
                  Financeiro
                </Link>{" "}
                antes de excluir. O que ainda não liberou pode ser antecipado a partir de 1 dia
                depois da venda.
              </li>
            )}
            {impedimentos.saqueProcessando && (
              <li>
                Um saque ainda está <strong>em processamento</strong>. Espere o Pix ser concluído
                (acompanhe em{" "}
                <Link href="/painel/vendas" className={linkTexto}>
                  Financeiro
                </Link>
                ).
              </li>
            )}
            {impedimentos.pedidoPendente && (
              <li>
                Há um pedido <strong>aguardando pagamento</strong>
                {vendedor ? ", seu ou com fotos suas" : ""}. Ele é concluído ou vence em até 1 hora;
                tente de novo depois.
              </li>
            )}
          </ul>
        </Aviso>
      ) : (
        <section className="flex flex-col gap-4 rounded-xl border border-destructive/40 p-5">
          <h2 className="text-lg font-semibold">Confirmar a exclusão</h2>
          {impedimentos.saldoCentavos > 0 && (
            <p className="text-sm text-muted-foreground">
              Você tem {formatarPreco(impedimentos.saldoCentavos)} em vendas, abaixo do mínimo de
              saque por Pix ({formatarPreco(SAQUE_MINIMO_CENTAVOS)} depois da comissão). Ao excluir
              a conta, você abre mão desse valor.
            </p>
          )}
          <FormularioExclusao temSenha={temSenha} email={usuario.email} />
        </section>
      )}

      <Link
        href={voltar}
        className={buttonVariants({ variant: "outline", size: "touch", className: "w-fit" })}
      >
        Manter minha conta
      </Link>
    </>
  );
}

function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section role="status" className="flex gap-3 rounded-xl bg-accent p-5 text-accent-foreground">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="flex flex-col gap-2 leading-relaxed">
        <h2 className="font-semibold">{titulo}</h2>
        <div>{children}</div>
      </div>
    </section>
  );
}
