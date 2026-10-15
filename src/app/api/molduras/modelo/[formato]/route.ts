import { ehFormatoMoldura } from "@/lib/moldura";
import { respostaDaManutencao } from "@/servicos/manutencao";
import { modeloDaMoldura } from "@/servicos/molduras";

// Modelo da moldura do evento para o designer (painel, aba Design): PNG na medida do formato com
// a janela da foto transparente, a faixa sugerida para a arte e a área segura marcadas. Igual
// para todo mundo, sem dado de evento: pode ficar em cache.

export async function GET(
  request: Request,
  { params }: RouteContext<"/api/molduras/modelo/[formato]">,
) {
  // Modo de manutenção (docs/arquitetura.md, "Modo de manutenção"): 503 para quem não é gestor.
  const manutencao = await respostaDaManutencao(request);
  if (manutencao) return manutencao;
  const { formato } = await params;
  if (!ehFormatoMoldura(formato)) return new Response("Modelo não encontrado.", { status: 404 });
  const png = await modeloDaMoldura(formato);
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="modelo-moldura-${formato}.png"`,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
