// Leitura mínima do EXIF de um JPEG: só a data e hora em que a foto foi tirada
// (DateTimeOriginal), para o filtro por horário e a ordem "por captura" da galeria. O EXIF
// chega pelo Sharp (metadata().exif) e não é guardado: as prévias saem sem metadados.

const FUSO_PADRAO = "-03:00"; // Brasília; o EXIF só traz o fuso quando a câmera grava OffsetTime.

/** Data de captura da foto, ou `null` se o EXIF não tiver ou estiver corrompido. */
export function dataDeCaptura(exif: Buffer | undefined): Date | null {
  if (!exif) return null;
  try {
    const base = exif.subarray(0, 6).toString("latin1") === "Exif\0\0" ? 6 : 0;
    const ordem = exif.subarray(base, base + 2).toString("latin1");
    if (ordem !== "II" && ordem !== "MM") return null;
    const le = ordem === "II";
    const u16 = (p: number) => (le ? exif.readUInt16LE(base + p) : exif.readUInt16BE(base + p));
    const u32 = (p: number) => (le ? exif.readUInt32LE(base + p) : exif.readUInt32BE(base + p));

    /** Entradas de um IFD: tag → posição (relativa ao TIFF) do valor e quantidade. */
    const lerIfd = (inicio: number) => {
      const entradas = new Map<number, { valor: number; quantidade: number }>();
      const total = u16(inicio);
      for (let i = 0; i < total; i++) {
        const p = inicio + 2 + i * 12;
        const quantidade = u32(p + 4);
        // Valores de até 4 bytes ficam na própria entrada; maiores, no endereço indicado.
        entradas.set(u16(p), { valor: quantidade <= 4 ? p + 8 : u32(p + 8), quantidade });
      }
      return entradas;
    };
    const texto = (e: { valor: number; quantidade: number } | undefined) =>
      e
        ? exif
            .subarray(base + e.valor, base + e.valor + e.quantidade)
            .toString("latin1")
            .replace(/\0+$/, "")
        : null;

    const ifd0 = lerIfd(u32(4));
    const ponteiro = ifd0.get(0x8769);
    if (!ponteiro) return null;
    const ifdExif = lerIfd(u32(ponteiro.valor));

    const data = texto(ifdExif.get(0x9003));
    const m = data?.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
    if (!m) return null;
    const fuso = texto(ifdExif.get(0x9011));
    const offset = fuso && /^[+-]\d{2}:\d{2}$/.test(fuso) ? fuso : FUSO_PADRAO;
    const resultado = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${offset}`);
    const ano = resultado.getUTCFullYear();
    return Number.isNaN(resultado.getTime()) || ano < 1990 || ano > 2100 ? null : resultado;
  } catch {
    return null;
  }
}
