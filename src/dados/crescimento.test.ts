import { describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

import {
  buscarModelo,
  configDoEvento,
  copiarDescontosDoEvento,
  criarEvento,
  dashboardDoFotografo,
  desempenhoDoFotografo,
  excluirItem,
  excluirModelo,
  hashesDoEvento,
  listarModelos,
  registrarHashes,
  registrarMetrica,
  salvarModeloDoEvento,
} from "@/dados";
import { eventos, faixasDesconto, fotografos, fotos } from "@/dados/exemplo/banco";
import { confirmarPagamento, criarPedido } from "@/servicos/pedidos";

const [lia, pedro] = fotografos;
// Evento publicado da Lia com fotos dela (sem colaborador), para a venda cair toda na conta dela.
const evento = eventos.find(
  (e) =>
    e.fotografoId === lia.id &&
    e.status === "publicado" &&
    e.slug === "corrida-ibirapuera-10k-2026",
)!;
const fotosDaLia = fotos.filter(
  (f) =>
    f.eventoId === evento.id &&
    f.enviadaPor === lia.id &&
    f.status === "pronta" &&
    f.excluidaEm === null &&
    f.precoCentavos === null,
);

describe("métricas, dashboard e desempenho", () => {
  it("só registra métrica de evento publicado e de foto que existe", async () => {
    expect(await registrarMetrica("visita_evento", { eventoId: evento.id })).toBe(true);
    expect(await registrarMetrica("visita_evento", { eventoId: crypto.randomUUID() })).toBe(false);
    expect(await registrarMetrica("carrinho", { fotoId: fotosDaLia[0].id })).toBe(true);
    expect(await registrarMetrica("carrinho", { fotoId: crypto.randomUUID() })).toBe(false);
    // Carrinho e visita de foto precisam da foto, não só do evento.
    expect(await registrarMetrica("carrinho", { eventoId: evento.id })).toBe(false);
  });

  it("conta a venda paga de hoje no dashboard e no desempenho do evento", async () => {
    const antes = await dashboardDoFotografo(lia.id);
    const ids = fotosDaLia.slice(1, 3).map((f) => f.id);
    const pedido = await criarPedido(ids, {
      clienteId: null,
      nome: "Cliente Teste",
      email: "cliente-dashboard@exemplo.com",
      whatsapp: null,
      aceitaWhatsapp: false,
      metodo: "pix",
    });
    expect(pedido.ok).toBe(true);
    if (!pedido.ok) return;
    expect(await confirmarPagamento(pedido.pedidoId)).toBe(true);

    const depois = await dashboardDoFotografo(lia.id);
    expect(depois.hoje.pedidos).toBe(antes.hoje.pedidos + 1);
    expect(depois.mes.pedidos).toBe(antes.mes.pedidos + 1);
    expect(depois.hoje.valorCentavos).toBeGreaterThan(antes.hoje.valorCentavos);
    expect(depois.ticketMedioCentavos).toBeGreaterThan(0);
    expect(depois.conversao).not.toBeNull();

    const { eventos: linhas, fotos: destaque } = await desempenhoDoFotografo(lia.id);
    const linha = linhas.find((l) => l.evento.id === evento.id);
    expect(linha?.pedidos).toBeGreaterThanOrEqual(1);
    expect(linha?.itensVendidos).toBeGreaterThanOrEqual(2);
    expect(linha?.visitas).toBeGreaterThanOrEqual(1);
    expect(linha?.carrinhos).toBeGreaterThanOrEqual(1);
    expect(destaque.some((d) => ids.includes(d.foto.id))).toBe(true);
  });

  it("não mostra eventos de outro fotógrafo no desempenho", async () => {
    const { eventos: linhas } = await desempenhoDoFotografo(pedro.id);
    expect(linhas.some((l) => l.evento.id === evento.id)).toBe(false);
  });
});

describe("modelos e cópia de evento", () => {
  it("salva o modelo sem senha e só o dono vê", async () => {
    const modelo = await salvarModeloDoEvento(evento.id, lia.id, "Corridas SP");
    expect(modelo).not.toBeNull();
    if (!modelo) return;
    expect(modelo.config.visibilidade).not.toBe("senha");
    expect(modelo.config.precoFotoCentavos).toBe(evento.precoFotoCentavos);
    expect((await listarModelos(lia.id)).some((m) => m.id === modelo.id)).toBe(true);
    expect(await buscarModelo(modelo.id, pedro.id)).toBeNull();
    expect(await excluirModelo(modelo.id, pedro.id)).toBe(false);
    expect(await excluirModelo(modelo.id, lia.id)).toBe(true);
  });

  it("não salva modelo de evento de outro fotógrafo", async () => {
    expect(await salvarModeloDoEvento(evento.id, pedro.id, "Alheio")).toBeNull();
  });

  it("copia as faixas de desconto do evento de origem", async () => {
    const origem = eventos.find((e) => faixasDesconto.some((f) => f.eventoId === e.id));
    if (!origem) return;
    const novo = await criarEvento(origem.fotografoId, {
      ...configDoEvento(origem),
      titulo: `${origem.titulo} (cópia)`,
      inicioEm: origem.inicioEm,
      fimEm: origem.fimEm,
      listado: true,
      liberadoEm: null,
      slug: `copia-${crypto.randomUUID()}`,
    });
    expect(await copiarDescontosDoEvento(origem.id, novo.id, origem.fotografoId)).toBe(true);
    const contar = (id: string) => faixasDesconto.filter((f) => f.eventoId === id).length;
    expect(contar(novo.id)).toBe(contar(origem.id));
    const outro = fotografos.find((f) => f.id !== origem.fotografoId)!;
    expect(await copiarDescontosDoEvento(origem.id, novo.id, outro.id)).toBe(false);
  });
});

describe("fotos repetidas", () => {
  it("guarda o hash da foto e esquece quando ela é excluída", async () => {
    const foto = fotosDaLia.at(-1)!;
    const hash = "a".repeat(64);
    await registrarHashes(evento.id, [{ hash, fotoId: foto.id }]);
    expect((await hashesDoEvento(evento.id)).has(hash)).toBe(true);
    expect(await excluirItem(foto.id, lia.id)).toBe(true);
    expect((await hashesDoEvento(evento.id)).has(hash)).toBe(false);
  });
});
