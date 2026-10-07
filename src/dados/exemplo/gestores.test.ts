import { describe, expect, it } from "vitest";

import { gerarHashSenha, senhaConfere } from "@/lib/senha";

import { lerGestores } from "./gestores";

describe("gestores da variável GESTORES", () => {
  it("cria gestores com id estável e confere a senha pelo hash", () => {
    const hash = gerarHashSenha("senha-de-teste-123");
    const env = JSON.stringify([{ email: " Dev@Exemplo.com ", nome: "Dev", senhaHash: hash }]);
    const [gestor] = lerGestores(env);
    expect(gestor).toMatchObject({ email: "dev@exemplo.com", papel: "admin", nome: "Dev" });
    expect(lerGestores(env)[0].id).toBe(gestor.id);
    expect(senhaConfere("senha-de-teste-123", gestor.senhaHash ?? "")).toBe(true);
  });

  it("ignora variável vazia, JSON quebrado ou senha em texto no lugar do hash", () => {
    expect(lerGestores(undefined)).toEqual([]);
    expect(lerGestores("{nao é json")).toEqual([]);
    expect(
      lerGestores(JSON.stringify([{ email: "a@b.com", nome: "A", senhaHash: "minhasenha" }])),
    ).toEqual([]);
  });
});
