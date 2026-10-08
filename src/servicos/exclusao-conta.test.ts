import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

import {
  adicionarItensSimulados,
  buscarContaDoFotografo,
  buscarEventoDoFotografo,
  buscarFotoPublica,
  buscarOriginal,
  buscarPedido,
  buscarUsuario,
  buscarUsuarioParaLogin,
  caixasDosRostos,
  criarContaDeFotografo,
  criarEvento,
  criarUsuario,
  emailDaContaExcluida,
  listarLancamentosDoFotografo,
  listarMensagens,
  listarSaquesDoFotografo,
  mudarStatusDoEvento,
  mudarStatusSaque,
  reservarLancamentosParaSaque,
  salvarRostos,
  versaoDaSessao,
  type Usuario,
} from "@/dados";
import { eventos, fotografos, fotos } from "@/dados/exemplo/dados";
import { omitir } from "@/dados/mapas";
import { gerarHashSenha } from "@/lib/senha";
import {
  excluirConta,
  saldoSacavel,
  situacaoDaExclusao,
  temImpedimento,
} from "@/servicos/exclusao-conta";
import { confirmarPagamento, criarPedido } from "@/servicos/pedidos";

const [lia] = fotografos;
const eventoDaLia = eventos.find((e) => e.slug === "corrida-ibirapuera-10k-2026")!;
const fotosDaLia = fotos.filter(
  (f) =>
    f.eventoId === eventoDaLia.id &&
    f.enviadaPor === lia.id &&
    f.status === "pronta" &&
    f.excluidaEm === null &&
    f.precoCentavos === null,
);

const SENHA = "senha-forte-123";

function emailNovo(prefixo: string) {
  return `${prefixo}-${randomUUID().slice(0, 8)}@exemplo.com`;
}

async function comprar(fotoIds: string[], comprador: { clienteId: string | null; email: string }) {
  const pedido = await criarPedido(fotoIds, {
    clienteId: comprador.clienteId,
    nome: "Maria Compradora",
    email: comprador.email,
    whatsapp: "11999990000",
    aceitaWhatsapp: true,
    metodo: "pix",
  });
  if (!pedido.ok) throw new Error(`Pedido recusado: ${pedido.motivo}`);
  return pedido.pedidoId;
}

/** Fotógrafo novo com um evento publicado e duas fotos prontas. */
async function fotografoComFotos() {
  const usuario = await criarUsuario({
    nome: "Fotógrafa Teste",
    email: emailNovo("fotografa"),
    senhaHash: gerarHashSenha(SENHA),
    papel: "fotografo",
  });
  const conta = await criarContaDeFotografo({
    usuarioId: usuario.id,
    nomePublico: "Fotógrafa Teste",
    slug: `fotografa-${randomUUID().slice(0, 8)}`,
  });
  const evento = await criarEvento(conta.id, {
    ...omitir(eventoDaLia, "id", "fotografoId", "status", "capa"),
    slug: `evento-exclusao-${randomUUID().slice(0, 8)}`,
  });
  expect(await mudarStatusDoEvento(evento.id, conta.id, "rascunho", "publicado")).toBe(true);
  const itens = await adicionarItensSimulados(evento.id, conta.id, [
    { nome: "IMG_1.jpg", tamanhoBytes: 1000 },
    { nome: "IMG_2.jpg", tamanhoBytes: 1000 },
  ]);
  if (!itens) throw new Error("Não criou as fotos");
  return { usuario, conta, evento, itens };
}

describe("exclusão de conta", () => {
  it("saldo que nunca chegaria ao mínimo do Pix não segura a exclusão", () => {
    // R$ 1,11 com 10% de comissão: R$ 1,00 líquido, dá para sacar.
    expect(saldoSacavel(111, 10)).toBe(true);
    expect(saldoSacavel(110, 10)).toBe(false);
    expect(saldoSacavel(0, 10)).toBe(false);
  });

  it("anonimiza o cliente, mantém o pedido pago e derruba a sessão", async () => {
    const email = emailNovo("cliente");
    const cliente = await criarUsuario({
      nome: "Maria Compradora",
      email,
      senhaHash: gerarHashSenha(SENHA),
      papel: "cliente",
    });
    const pedidoId = await comprar([fotosDaLia[0].id], { clienteId: cliente.id, email });
    expect(await confirmarPagamento(pedidoId)).toBe(true);
    expect(await versaoDaSessao(cliente.id)).not.toBeNull();

    expect(await excluirConta(cliente, { senha: "errada-123" })).toEqual({
      ok: false,
      motivo: "senha",
    });
    expect(await excluirConta(cliente, { senha: SENHA })).toEqual({ ok: true });

    // A sessão (cookie assinado com a versão) deixa de valer, e o e-mail não entra mais.
    expect(await versaoDaSessao(cliente.id)).toBeNull();
    expect(await buscarUsuarioParaLogin(email)).toBeNull();
    const depois = await buscarUsuario(cliente.id);
    expect(depois?.nome).toBe("Conta excluída");
    expect(depois?.email).toBe(emailDaContaExcluida(cliente.id));
    expect(depois?.telefone).toBeNull();

    // O pedido pago continua (registro fiscal), sem os dados pessoais.
    const pedido = await buscarPedido(pedidoId);
    expect(pedido?.pedido.status).toBe("pago");
    expect(pedido?.pedido.totalCentavos).toBeGreaterThan(0);
    expect(pedido?.itens).toHaveLength(1);
    expect(pedido?.pedido.nomeComprador).toBe("Conta excluída");
    expect(pedido?.pedido.emailComprador).toBe(emailDaContaExcluida(cliente.id));
    expect(pedido?.pedido.whatsapp).toBeNull();
    // Nenhuma mensagem guardada continua com o e-mail ou o WhatsApp dela.
    const mensagens = await listarMensagens(1000);
    expect(mensagens.some((m) => m.para === email || m.para.includes("11999990000"))).toBe(false);

    // Excluir de novo não faz nada.
    expect((await excluirConta(cliente, { senha: SENHA })).ok).toBe(false);
  });

  it("não exclui com pedido aguardando pagamento", async () => {
    const email = emailNovo("pendente");
    const cliente = await criarUsuario({
      nome: "Cliente Pendente",
      email,
      senhaHash: gerarHashSenha(SENHA),
      papel: "cliente",
    });
    await comprar([fotosDaLia[1].id], { clienteId: cliente.id, email });
    const resultado = await excluirConta(cliente, { senha: SENHA });
    expect(resultado).toMatchObject({ ok: false, motivo: "impedimento" });
    expect(await versaoDaSessao(cliente.id)).not.toBeNull();
  });

  it("quem entra só com o Google confirma digitando o e-mail", async () => {
    const email = emailNovo("google");
    const usuario = await criarUsuario({
      nome: "Pessoa Google",
      email,
      senhaHash: null,
      papel: "cliente",
      googleId: `google-${randomUUID()}`,
      emailConfirmado: true,
    });
    expect(await excluirConta(usuario, { email: "outro@exemplo.com" })).toEqual({
      ok: false,
      motivo: "confirmacao",
    });
    expect(await excluirConta(usuario, { email: email.toUpperCase() })).toEqual({ ok: true });
    expect(await versaoDaSessao(usuario.id)).toBeNull();
  });

  it("gestor não se exclui por aqui", async () => {
    const gestor: Usuario = await criarUsuario({
      nome: "Gestor Teste",
      email: emailNovo("gestor"),
      senhaHash: gerarHashSenha(SENHA),
      papel: "admin",
    });
    expect(await excluirConta(gestor, { senha: SENHA })).toEqual({ ok: false, motivo: "gestor" });
  });

  it("fotógrafo com saldo ou saque em processamento não exclui; depois de sacar, exclui", async () => {
    const { usuario, conta, evento, itens } = await fotografoComFotos();
    const [vendida, naoVendida] = itens;
    const rostoId = `rosto-${randomUUID()}`;
    const caixa = { esquerda: 0.1, topo: 0.1, largura: 0.2, altura: 0.2 };
    await salvarRostos(naoVendida.id, [{ rostoId, caixa }]);
    expect(await caixasDosRostos([rostoId])).toEqual({ [naoVendida.id]: caixa });
    const pedidoId = await comprar([vendida.id], {
      clienteId: null,
      email: emailNovo("comprador"),
    });

    // Pedido pendente com foto dele segura a exclusão.
    expect((await situacaoDaExclusao(usuario)).pedidoPendente).toBe(true);
    expect(await confirmarPagamento(pedidoId)).toBe(true);

    // Saldo a receber: não exclui.
    const comSaldo = await situacaoDaExclusao(usuario);
    expect(comSaldo.saldoCentavos).toBeGreaterThan(0);
    expect(comSaldo.pedidoPendente).toBe(false);
    expect(await excluirConta(usuario, { senha: SENHA })).toMatchObject({
      ok: false,
      motivo: "impedimento",
    });

    // Saque em processamento: o saldo zera, mas ainda não exclui.
    const lancamentos = await listarLancamentosDoFotografo(conta.id);
    const bruto = lancamentos.reduce((s, l) => s + l.valorCentavos, 0);
    const saqueId = randomUUID();
    expect(
      await reservarLancamentosParaSaque(
        {
          id: saqueId,
          fotografoId: conta.id,
          antecipado: true,
          brutoCentavos: bruto,
          taxaCentavos: 0,
          liquidoCentavos: bruto,
          chavePix: "00000000000",
          gatewayId: null,
          status: "processando",
          criadoEm: new Date().toISOString(),
          pagoEm: null,
        },
        lancamentos.map((l) => l.id),
      ),
    ).toBe(true);
    const processando = await situacaoDaExclusao(usuario);
    expect(processando.saldoCentavos).toBe(0);
    expect(processando.saqueProcessando).toBe(true);
    expect(temImpedimento(processando)).toBe(true);

    // Saque pago: pode excluir.
    expect(
      await mudarStatusSaque(saqueId, "processando", "pago", {
        pagoEm: new Date().toISOString(),
      }),
    ).toBe(true);
    expect(await excluirConta(usuario, { senha: SENHA })).toEqual({ ok: true });
    expect(await versaoDaSessao(usuario.id)).toBeNull();

    // Fotos saem da galeria (exclusão lógica), mas quem comprou continua baixando.
    expect(await buscarFotoPublica(vendida.id)).toBeNull();
    expect(await buscarFotoPublica(naoVendida.id)).toBeNull();
    expect(await buscarOriginal(vendida.id)).not.toBeNull();
    expect((await buscarPedido(pedidoId))?.pedido.status).toBe("pago");
    // Os rostos cadastrados para a busca saem junto.
    expect(await caixasDosRostos([rostoId])).toEqual({});

    // Evento arquivado; lançamentos e saque continuam (registro fiscal).
    expect((await buscarEventoDoFotografo(evento.id, conta.id))?.status).toBe("arquivado");
    expect(await listarLancamentosDoFotografo(conta.id)).toHaveLength(lancamentos.length);
    expect(await listarSaquesDoFotografo(conta.id)).toHaveLength(1);

    // Perfil público apagado; o CPF/CNPJ fica com o histórico de saques.
    const depois = await buscarContaDoFotografo(usuario.id);
    expect(depois?.nomePublico).toBe("Fotógrafo removido");
    expect(depois?.bio).toBeNull();
    expect(depois?.chavePix).toBeNull();
    expect(depois?.slug).not.toBe(conta.slug);
  });
});
