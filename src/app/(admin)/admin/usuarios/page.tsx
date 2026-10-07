import type { Metadata } from "next";
import { Suspense } from "react";

import { FormularioPapel } from "@/components/admin/formulario-papel";
import { Celula, ROTULO_PAPEL, Tabela } from "@/components/admin/tabela";
import { listarUsuariosDoAdmin, type Papel } from "@/dados";
import { formatarData } from "@/lib/formatar";
import { exigirEquipe } from "@/servicos/sessao";

export const metadata: Metadata = { title: "Usuários", robots: { index: false, follow: false } };

const ORDEM: Papel[] = ["admin", "atendente", "fotografo", "cliente"];

export default function PaginaUsuarios() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Usuários</h1>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  const eu = await exigirEquipe("/admin/usuarios");
  const usuarios = await listarUsuariosDoAdmin();
  const gestor = eu.papel === "admin";
  const contagem = ORDEM.map((papel) => ({
    papel,
    total: usuarios.filter((u) => u.papel === papel).length,
  }));

  return (
    <>
      <ul className="flex flex-wrap gap-2">
        {contagem.map(({ papel, total }) => (
          <li key={papel} className="rounded-full border px-3 py-1 text-sm">
            {ROTULO_PAPEL[papel]}: <strong className="tabular-nums">{total}</strong>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        {gestor
          ? "Você pode mudar o papel de qualquer pessoa, menos o seu. Quem vira vendedor ganha o perfil de fotógrafo. Para um gestor entrar já como gestor pelo Google, coloque o e-mail em ADMIN_EMAILS."
          : "Atendentes veem os usuários, mas só gestores mudam papéis."}
      </p>
      <Tabela
        colunas={[
          { rotulo: "Usuário" },
          { rotulo: "Acesso" },
          { rotulo: "Desde" },
          { rotulo: "Papel" },
        ]}
        vazio="Nenhum usuário ainda."
      >
        {usuarios.map((u) => (
          <tr key={u.id}>
            <Celula>
              <span className="flex flex-col">
                <span className="font-medium">{u.nome}</span>
                <span className="text-xs text-muted-foreground">
                  {u.email}
                  {!u.emailConfirmado && " · e-mail não confirmado"}
                </span>
              </span>
            </Celula>
            <Celula>
              {[u.temGoogle && "Google", u.temSenha && "Senha"].filter(Boolean).join(" e ") || "—"}
            </Celula>
            <Celula>
              <span className="whitespace-nowrap">{formatarData(u.criadoEm)}</span>
            </Celula>
            <Celula>
              {gestor && u.id !== eu.id ? (
                <FormularioPapel usuarioId={u.id} papel={u.papel} />
              ) : (
                ROTULO_PAPEL[u.papel]
              )}
            </Celula>
          </tr>
        ))}
      </Tabela>
    </>
  );
}
