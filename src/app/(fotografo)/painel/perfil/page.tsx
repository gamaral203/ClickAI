import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckCircle2, Landmark } from "lucide-react";

import { FormularioPerfil } from "@/components/painel/formulario-perfil";
import { Button } from "@/components/ui/button";
import { formatarCpfCnpj } from "@/lib/documentos";
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
  const { conta } = await exigirFotografo("/painel/perfil");

  return (
    <>
      <FormularioPerfil
        inicial={{
          nomePublico: conta.nomePublico,
          slug: conta.slug,
          bio: conta.bio ?? "",
          instagram: conta.redesSociais.instagram ?? "",
          site: conta.redesSociais.site ?? "",
          cpfCnpj: conta.cpfCnpj ? formatarCpfCnpj(conta.cpfCnpj) : "",
        }}
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
    </>
  );
}
