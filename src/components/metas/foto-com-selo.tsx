import Image from "next/image";

import { DOURADO, SeloDeConquista } from "./selo-de-conquista";

/** Foto de perfil (ou avatar) com a moldura dourada e o selo da meta, para a prévia na aba Metas. */
export function FotoComSelo({
  foto,
  alt,
  rotulo,
}: {
  /** Foto de perfil ou, sem ela, o avatar (`urlDoAvatar`, src/lib/avatares.ts). */
  foto: string;
  alt: string;
  rotulo: string;
}) {
  return (
    <span className="relative mb-8 inline-block">
      <span className="block size-32 rounded-full p-1.5 shadow-lg" style={{ background: DOURADO }}>
        <span className="relative block size-full overflow-hidden rounded-full border-2 border-card bg-muted">
          <Image src={foto} alt={alt} fill sizes="128px" className="object-cover" />
        </span>
      </span>
      <span className="absolute -bottom-8 left-1/2 -translate-x-1/2">
        <SeloDeConquista rotulo={rotulo} />
      </span>
    </span>
  );
}
