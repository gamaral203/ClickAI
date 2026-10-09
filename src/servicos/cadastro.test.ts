import { afterEach, describe, expect, it, vi } from "vitest";

// Fora de uma requisição do Next: cookies e cabeçalhos de mentira, IP fixo.
const cookiesGravados = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "198.51.100.23" }),
  cookies: async () => ({
    get: (nome: string) =>
      cookiesGravados.has(nome) ? { name: nome, value: cookiesGravados.get(nome) } : undefined,
    set: (nome: string, valor: string) => void cookiesGravados.set(nome, valor),
    delete: (nome: string) => void cookiesGravados.delete(nome),
  }),
}));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

import { cadastrarAcao } from "@/app/(cliente)/conta/acoes";
import { buscarContaDoFotografo, buscarUsuario, criarUsuario, type Papel } from "@/dados";
import { papelEscolhido } from "@/lib/cadastro";

import { podeEnviarConfirmacao } from "./confirmacao-email";
import { limiteAtingido } from "./limites";
import { cadastrar, comecarAVender } from "./sessao";

afterEach(() => vi.unstubAllEnvs());

function formulario(campos: Record<string, string>) {
  const dados = new FormData();
  for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor);
  return dados;
}

describe("tipo de conta no formulário de cadastro", () => {
  it("mantém o tipo escolhido e só cai no padrão com valor inválido", () => {
    expect(papelEscolhido("fotografo", "cliente")).toBe("fotografo");
    expect(papelEscolhido("cliente", "fotografo")).toBe("cliente");
    expect(papelEscolhido(undefined, "fotografo")).toBe("fotografo");
    expect(papelEscolhido("admin", "cliente")).toBe("cliente");
  });

  it("depois de um erro, a ação devolve o tipo escolhido (fotógrafo não vira comprador)", async () => {
    const estado = await cadastrarAcao(
      {},
      formulario({ nome: "Ana Foto", email: "ana@teste.com", senha: "123", papel: "fotografo" }),
    );
    expect(estado.erros?.senha).toMatch(/8 caracteres/);
    expect(estado.valores).toEqual({
      nome: "Ana Foto",
      email: "ana@teste.com",
      papel: "fotografo",
    });
    expect(JSON.stringify(estado)).not.toContain('"123"');
  });
});

describe("cadastro com senha", () => {
  it("dois envios do mesmo formulário ao mesmo tempo criam uma conta só, sem erro", async () => {
    const email = `duplo-${crypto.randomUUID()}@teste.com`;
    const dados = {
      nome: "Duplo Clique",
      email,
      senha: "senha-segura-1",
      papel: "fotografo" as const,
    };
    const resultados = await Promise.all([cadastrar(dados), cadastrar(dados), cadastrar(dados)]);
    const criados = resultados.filter((r) => r.ok);
    expect(criados).toHaveLength(1);
    expect(resultados.filter((r) => !r.ok).every((r) => !r.ok && r.motivo === "email_em_uso")).toBe(
      true,
    );
    const usuario = criados[0].ok ? criados[0].usuario : null;
    expect(await buscarContaDoFotografo(usuario!.id)).not.toBeNull();
  });

  it("e-mail com maiúsculas conta como o mesmo e-mail", async () => {
    const email = `caixa-${crypto.randomUUID()}@teste.com`;
    const dados = { nome: "Caixa Alta", senha: "senha-segura-1", papel: "cliente" as const };
    expect((await cadastrar({ ...dados, email })).ok).toBe(true);
    expect(await cadastrar({ ...dados, email: email.toUpperCase() })).toEqual({
      ok: false,
      motivo: "email_em_uso",
    });
  });
});

describe("cliente que quer vender", () => {
  async function novo(papel: Papel) {
    return criarUsuario({
      nome: "Pessoa Que Vende",
      email: `${crypto.randomUUID()}@teste.com`,
      senhaHash: null,
      papel,
    });
  }

  it("cliente vira fotógrafo com perfil de vendedor, uma vez só", async () => {
    const cliente = await novo("cliente");
    const [a, b] = await Promise.all([comecarAVender(cliente), comecarAVender(cliente)]);
    expect(a && b).toBe(true);
    expect((await buscarUsuario(cliente.id))?.papel).toBe("fotografo");
    const conta = await buscarContaDoFotografo(cliente.id);
    expect(conta?.nomePublico).toBe("Pessoa Que Vende");
    expect(conta?.cpfCnpj || null).toBeNull();
  });

  it("gestor e fotógrafo não mudam de papel", async () => {
    const gestor = await novo("admin");
    expect(await comecarAVender(gestor)).toBe(true);
    expect((await buscarUsuario(gestor.id))?.papel).toBe("admin");
    const fotografo = await novo("fotografo");
    expect(await comecarAVender(fotografo)).toBe(true);
    expect((await buscarUsuario(fotografo.id))?.papel).toBe("fotografo");
  });
});

describe("confirmação de e-mail sem o Resend", () => {
  it("na produção sem Resend, não oferece o botão; com Resend ou fora da produção, oferece", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_REMETENTE", "");
    expect(podeEnviarConfirmacao()).toBe(false);
    vi.stubEnv("RESEND_API_KEY", "re_teste");
    vi.stubEnv("EMAIL_REMETENTE", "ClicouAí <oi@exemplo.com>");
    expect(podeEnviarConfirmacao()).toBe(true);
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(podeEnviarConfirmacao()).toBe(true);
  });
});

describe("limite de cadastros por IP", () => {
  it("aguenta 20 cadastros por hora do mesmo IP (CGNAT, Wi-Fi do evento) e segura o 21º", async () => {
    const ip = `203.0.113.${Math.floor(Math.random() * 250)}`;
    for (let i = 0; i < 20; i++) expect(await limiteAtingido("cadastro_ip", ip)).toBe(false);
    expect(await limiteAtingido("cadastro_ip", ip)).toBe(true);
  });

  it("reenvio do e-mail de confirmação tem contagem própria e não gasta a do cadastro", async () => {
    const ip = `192.0.2.${Math.floor(Math.random() * 250)}`;
    for (let i = 0; i < 10; i++) {
      expect(await limiteAtingido("email_confirmacao_ip", ip)).toBe(false);
    }
    expect(await limiteAtingido("email_confirmacao_ip", ip)).toBe(true);
    expect(await limiteAtingido("cadastro_ip", ip)).toBe(false);
  });
});
