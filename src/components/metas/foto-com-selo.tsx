import Image from "next/image";

import { DOURADO, SeloDeConquista } from "./selo-de-conquista";

/** Foto de perfil com a moldura dourada e o selo da meta, para a prévia na aba Metas. */
export function FotoComSelo({
  nome,
  foto,
  rotulo,
}: {
  nome: string;
  foto: string | null;
  rotulo: string;
}) {
  return (
    <span className="relative mb-8 inline-block">
      <span className="block size-32 rounded-full p-1.5 shadow-lg" style={{ background: DOURADO }}>
        <span className="relative flex size-full items-center justify-center overflow-hidden rounded-full border-2 border-card bg-muted text-4xl font-bold">
          {foto ? (
            <Image src={foto} alt={`Foto de ${nome}`} fill sizes="128px" className="object-cover" />
          ) : (
            nome.trim().charAt(0).toUpperCase()
          )}
        </span>
      </span>
      <span className="absolute -bottom-8 left-1/2 -translate-x-1/2">
        <SeloDeConquista rotulo={rotulo} />
      </span>
    </span>
  );
}
