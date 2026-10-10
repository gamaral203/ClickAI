import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CheckCircle2, Landmark } from "lucide-react";

import { CartaoSeguranca } from "@/components/conta/cartao-seguranca";
import { EscolherAvatar } from "@/components/painel/escolher-avatar";
import { FormularioPerfil } from "@/components/painel/formulario-perfil";
import { VerificacaoDuasEtapas } from "@/components/painel/verificacao-duas-etapas";
import { Button } from "@/components/ui/button";
import { estadoMfa } from "@/dados";
import { avatarDoFotografo } from "@/lib/avatares";
import { formatarCpfCnpj } from "@/lib/documentos";
import { urlPublica } from "@/lib/url-publica";
import { contaTemSenha } from "@/servicos/exclusao-conta";
import { exigirFotografo } from "@/servicos/sessao";

import { confirmarChavePixAcao } from "./acoes";

export const metadata: Metadata = {
  title: "Perfil e recebimento",
  robots: { index: false, follow: false },
};

export default function PaginaPerfil() {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-bold tracking-tight">Perfil e recebimento</h1>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  const { usuario, conta } = await exigirFotografo("/painel/perfil");
  const [temSenha, mfa] = await Promise.all([contaTemSenha(usuario), estadoMfa(usuario.id)]);

  return (
    <>
      <EscolherAvatar
        escolhido={avatarDoFotografo(conta).id}
        foto={conta.fotoPerfil ? urlPublica(conta.fotoPerfil) : null}
      />

      <FormularioPerfil
        inicial={{
          nomePublico: conta.nomePublico,
          slug: conta.slug,
          bio: conta.bio ?? "",
          instagram: conta.redesSociais.instagram ?? "",
          site: conta.redesSociais.site ?? "",
          cpfCnpj: conta.cpfCnpj ? formatarCpfCnpj(conta.cpfCnpj) : "",
        }}
        temSenha={temSenha}
        pedeCodigo={mfa.ativo}
      />

      <section className="flex flex-col gap-3 rounded-xl border p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Landmark aria-hidden="true" className="size-5" />
          Chave Pix para saque
        </h2>
        <p className="text-sm text-muted-foreground">
          As vendas caem na conta do ClicouAí, e você saca pelo painel em Vendas e saques. O saque
          vai por Pix para a chave do seu CPF ou CNPJ; por segurança, não aceitamos outra chave. Sem
          chave confirmada, não dá para publicar eventos.
        </p>
        {conta.chavePix ? (
          <p className="flex items-center gap-2 text-primary">
            <CheckCircle2 aria-hidden="true" className="size-5" />
            Chave confirmada: {formatarCpfCnpj(conta.chavePix)}
          </p>
        ) : conta.cpfCnpj ? (
          <form action={confirmarChavePixAcao} className="flex flex-col gap-2">
            <p className="text-sm">
              Confira se o CPF/CNPJ <strong>{formatarCpfCnpj(conta.cpfCnpj)}</strong> é uma chave
              Pix cadastrada no seu banco.
            </p>
            <Button type="submit" size="touch" className="w-fit">
              Usar meu CPF/CNPJ como chave Pix
            </Button>
          </form>
        ) : (
          <p className="text-sm font-medium">Informe e salve o CPF ou CNPJ acima primeiro.</p>
        )}
      </section>

      <VerificacaoDuasEtapas
        ativa={mfa.ativo}
        ativadaEm={mfa.ativadoEm}
        codigosRestantes={mfa.codigosRestantes}
        temSenha={temSenha}
      />

      <CartaoSeguranca />

      <section className="flex flex-col gap-2 rounded-xl border p-5">
        <h2 className="text-lg font-semibold">Excluir conta</h2>
        <p className="text-sm text-muted-foreground">
          Seus eventos saem do ar e seus dados pessoais são apagados; quem já comprou continua
          baixando. Antes, é preciso sacar todo o saldo.
        </p>
        <Link
          href="/conta/excluir"
          className="-my-2.5 w-fit py-2.5 text-sm font-medium text-primary hover:underline"
        >
          Excluir minha conta
        </Link>
      </section>
    </>
  );
}
