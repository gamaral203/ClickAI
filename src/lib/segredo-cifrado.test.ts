import { describe, expect, it } from "vitest";

import { cifrarSegredo, decifrarSegredo } from "./segredo-cifrado";

const FINALIDADE = "google-drive-refresh-token";

describe("segredo cifrado", () => {
  it("cifra e decifra (ida e volta), com IV novo a cada vez", () => {
    const segredo = "1//0abc-DEF_ghi.jkl~token de teste çã";
    const a = cifrarSegredo(segredo, FINALIDADE);
    const b = cifrarSegredo(segredo, FINALIDADE);
    expect(a).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(a).not.toContain(segredo);
    expect(a).not.toBe(b);
    expect(decifrarSegredo(a, FINALIDADE)).toBe(segredo);
    expect(decifrarSegredo(b, FINALIDADE)).toBe(segredo);
  });

  it("não decifra com outra finalidade", () => {
    const cifrado = cifrarSegredo("segredo", FINALIDADE);
    expect(decifrarSegredo(cifrado, "outra-finalidade")).toBeNull();
    expect(decifrarSegredo(cifrado, "")).toBeNull();
  });

  it("recusa texto adulterado, versão desconhecida e formato quebrado", () => {
    const cifrado = cifrarSegredo("segredo", FINALIDADE);
    const [versao, iv, tag, corpo] = cifrado.split(".");
    const trocado = corpo.startsWith("A") ? `B${corpo.slice(1)}` : `A${corpo.slice(1)}`;
    expect(decifrarSegredo([versao, iv, tag, trocado].join("."), FINALIDADE)).toBeNull();
    const outraTag = tag.startsWith("A") ? `B${tag.slice(1)}` : `A${tag.slice(1)}`;
    expect(decifrarSegredo([versao, iv, outraTag, corpo].join("."), FINALIDADE)).toBeNull();
    expect(decifrarSegredo(["v2", iv, tag, corpo].join("."), FINALIDADE)).toBeNull();
    expect(decifrarSegredo(`${cifrado}.extra`, FINALIDADE)).toBeNull();
    expect(decifrarSegredo("lixo", FINALIDADE)).toBeNull();
    expect(decifrarSegredo(null, FINALIDADE)).toBeNull();
  });

  it("recusa a tag truncada (só aceita a tag de 16 bytes)", () => {
    const cifrado = cifrarSegredo("segredo", FINALIDADE);
    const [versao, iv, tag, corpo] = cifrado.split(".");
    const bytes = Buffer.from(tag, "base64url");
    expect(bytes.length).toBe(16);
    for (const tamanho of [4, 8, 12, 15]) {
      const curta = bytes.subarray(0, tamanho).toString("base64url");
      expect(decifrarSegredo([versao, iv, curta, corpo].join("."), FINALIDADE)).toBeNull();
    }
    const longa = Buffer.concat([bytes, Buffer.from([0])]).toString("base64url");
    expect(decifrarSegredo([versao, iv, longa, corpo].join("."), FINALIDADE)).toBeNull();
  });
});
