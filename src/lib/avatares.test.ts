import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { AVATARES, avatarDoFotografo, avatarPadrao, avatarValido, urlDoAvatar } from "./avatares";

const ID = "4d7f3a52-9a51-4c1b-8f1e-2b7f0c6e9d10";

describe("catálogo de avatares", () => {
  it("tem 12 avatares com ids únicos, nome e arquivo em public/avatares", () => {
    expect(AVATARES).toHaveLength(12);
    expect(new Set(AVATARES.map((a) => a.id)).size).toBe(12);
    for (const a of AVATARES) {
      expect(a.id).toMatch(/^avatar-\d{2}$/);
      expect(a.nome.length).toBeGreaterThan(5);
      expect(a.url).toBe(`/avatares/${a.id}.svg`);
      expect(fs.existsSync(path.join(process.cwd(), "public", a.url))).toBe(true);
    }
  });

  it("aceita só ids do catálogo", () => {
    expect(avatarValido("avatar-01")).toBe(true);
    expect(avatarValido("avatar-13")).toBe(false);
    expect(avatarValido("../segredo")).toBe(false);
    expect(avatarValido(null)).toBe(false);
  });
});

describe("avatar padrão", () => {
  it("é determinístico pelo id da conta", () => {
    expect(avatarPadrao(ID)).toBe(avatarPadrao(ID));
    expect(AVATARES).toContain(avatarPadrao(ID));
  });

  it("espalha contas diferentes pelo catálogo", () => {
    const usados = new Set(Array.from({ length: 200 }, (_, i) => avatarPadrao(`conta-${i}`).id));
    expect(usados.size).toBeGreaterThan(8);
  });

  it("vale quando não há escolha ou o id saiu do catálogo", () => {
    expect(avatarDoFotografo({ id: ID, avatar: null })).toBe(avatarPadrao(ID));
    expect(avatarDoFotografo({ id: ID, avatar: "avatar-99" })).toBe(avatarPadrao(ID));
    expect(avatarDoFotografo({ id: ID, avatar: "avatar-07" }).id).toBe("avatar-07");
  });
});

describe("urlDoAvatar", () => {
  it("a foto enviada tem prioridade sobre o avatar", () => {
    const foto = "https://exemplo.r2.dev/perfis/x/logo.webp";
    expect(urlDoAvatar({ id: ID, fotoPerfil: foto, avatar: "avatar-03" })).toBe(foto);
  });

  it("sem foto, usa o avatar escolhido; sem escolha, o padrão", () => {
    expect(urlDoAvatar({ id: ID, fotoPerfil: null, avatar: "avatar-03" })).toBe(
      "/avatares/avatar-03.svg",
    );
    expect(urlDoAvatar({ id: ID, fotoPerfil: null, avatar: null })).toBe(avatarPadrao(ID).url);
  });
});
