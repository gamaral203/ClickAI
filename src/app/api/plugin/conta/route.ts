import { comChave, resposta, VERSAO_DA_API } from "../comum";

// Plugin do Lightroom: confere a chave colada pelo fotógrafo e devolve o nome dele, para o
// plugin mostrar "Conectado como ..." na configuração.

export async function GET(request: Request) {
  return comChave(request, async (dono) =>
    resposta({ nome: dono.nome, versaoDaApi: VERSAO_DA_API }),
  );
}
