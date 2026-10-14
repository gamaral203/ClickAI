--[[
Conversa com a API do plugin no ClicouAí (/api/plugin/*, docs/arquitetura.md, "Plugin do
Lightroom"): conta, eventos, envio (URL assinada do R2 + PUT + confirmação) e exclusão. Tudo aqui
roda dentro de uma tarefa assíncrona do Lightroom (LrHttp e LrTasks exigem).
]]

local LrFileUtils = import 'LrFileUtils'
local LrHttp = import 'LrHttp'
local LrPathUtils = import 'LrPathUtils'
local LrTasks = import 'LrTasks'

local Json = require 'Json'

local Api = {}

Api.SERVIDOR_PADRAO = 'https://www.clicouai.com'
--- Versão da API que este plugin entende (a rota /api/plugin/conta devolve a do site).
Api.VERSAO_DA_API = 1
--- Abaixo do envio em partes do site (src/lib/limites-envio.ts, MULTIPART_A_PARTIR_DE).
Api.TAMANHO_MAXIMO = 50 * 1024 * 1024

local function servidor(config)
  local s = config.servidor
  if not s or s == '' then s = Api.SERVIDOR_PADRAO end
  return (s:gsub('/+$', ''))
end

local function cabecalhos(config, json)
  local lista = {
    { field = 'Authorization', value = 'Bearer ' .. (config.chave or '') },
    { field = 'Accept', value = 'application/json' },
  }
  if json then lista[#lista + 1] = { field = 'Content-Type', value = 'application/json' } end
  return lista
end

--- Lê a resposta: devolve (dados, nil) ou (nil, mensagem de erro para o fotógrafo).
local function resposta(corpo, info)
  local status = info and info.status
  if not status then
    return nil, 'Sem resposta do ClicouAí. Confira a internet e tente de novo.'
  end
  local dados = Json.decode(corpo or '')
  if status >= 200 and status < 300 then
    if type(dados) ~= 'table' then return nil, 'Resposta inesperada do ClicouAí.' end
    return dados
  end
  if type(dados) == 'table' and type(dados.erro) == 'string' then return nil, dados.erro, status end
  return nil, string.format('O ClicouAí respondeu %d. Tente de novo em alguns minutos.', status), status
end

local function get(config, caminho)
  local corpo, info = LrHttp.get(servidor(config) .. caminho, cabecalhos(config, false), 60)
  return resposta(corpo, info)
end

local function enviar(config, metodo, caminho, dados, prazo)
  local corpo, info = LrHttp.post(
    servidor(config) .. caminho,
    dados and Json.encode(dados) or '',
    cabecalhos(config, dados ~= nil),
    metodo,
    prazo or 60
  )
  return resposta(corpo, info)
end

-- ------------------------------------------------------------------------------ Conta e eventos

--- Confere a chave: devolve o nome do fotógrafo, ou nil e o erro.
function Api.conta(config)
  local dados, erro = get(config, '/api/plugin/conta')
  if not dados then return nil, erro end
  if (dados.versaoDaApi or 0) > Api.VERSAO_DA_API then
    return nil, 'Há uma versão nova do plugin. Baixe de novo em Painel > Lightroom no ClicouAí.'
  end
  return dados.nome
end

--- Eventos para onde o fotógrafo pode publicar: lista de { id, titulo, inicioEm, url, ... }.
function Api.eventos(config)
  local dados, erro = get(config, '/api/plugin/eventos')
  if not dados then return nil, erro end
  return dados.eventos or {}
end

--- Apaga a foto do evento (exclusão lógica). Foto que já não existe conta como apagada.
function Api.apagarFoto(config, fotoId)
  local dados, erro, status = enviar(config, 'DELETE', '/api/plugin/fotos/' .. fotoId)
  if dados or status == 404 then return true end
  return nil, erro
end

-- ------------------------------------------------------------------------------ Impressão

local MB = 1024 * 1024

--- Trechos [início, fim) que entram na impressão (igual a src/lib/impressao-arquivo.ts).
local function trechos(tamanho)
  if tamanho <= 3 * MB then return { { 0, tamanho } } end
  local meio = math.floor(tamanho / 2) - MB / 2
  return { { 0, MB }, { meio, meio + MB }, { tamanho - MB, tamanho } }
end

local contadorTemporario = 0

local function arquivoTemporario(extensao)
  contadorTemporario = contadorTemporario + 1
  local nome = string.format('clicouai-%d-%d-%d.%s', os.time(), math.random(100000, 999999),
    contadorTemporario, extensao)
  return LrPathUtils.child(LrPathUtils.getStandardFilePath('temp'), nome)
end

--- SHA-256 de um arquivo pela ferramenta do sistema (o Lightroom não tem SHA-256).
local function sha256DoArquivo(caminho)
  local saida = arquivoTemporario('txt')
  local comando
  if WIN_ENV then
    -- No Windows o comando passa pelo cmd: o par de aspas de fora protege as de dentro.
    comando = string.format('"certutil -hashfile "%s" SHA256 > "%s""', caminho, saida)
  else
    comando = string.format('shasum -a 256 "%s" > "%s"', caminho, saida)
  end
  LrTasks.execute(comando)
  local texto = LrFileUtils.readFile(saida) or ''
  LrFileUtils.delete(saida)
  for linha in texto:gmatch('[^\r\n]+') do
    local hex = linha:gsub('%s', ''):lower():match('^(%x+)')
    if hex and #hex >= 64 then return hex:sub(1, 64) end
  end
  return nil
end

--- Impressão do arquivo, no formato que o site confere (64 caracteres hexadecimais).
function Api.impressao(caminho, tamanho)
  local entrada = io.open(caminho, 'rb')
  if not entrada then return nil end
  local temporario = arquivoTemporario('bin')
  local junto = io.open(temporario, 'wb')
  if not junto then
    entrada:close()
    return nil
  end
  junto:write(string.format('clicouai-impressao-v1:%d:', tamanho))
  for _, trecho in ipairs(trechos(tamanho)) do
    entrada:seek('set', trecho[1])
    junto:write(entrada:read(trecho[2] - trecho[1]) or '')
  end
  entrada:close()
  junto:close()
  local hash = sha256DoArquivo(temporario)
  LrFileUtils.delete(temporario)
  return hash
end

-- ------------------------------------------------------------------------------ Envio

local FORMATOS = { jpg = 'jpeg', jpeg = 'jpeg', png = 'png', tif = 'tiff', tiff = 'tiff' }

--- Envia uma foto exportada ao evento. Devolve { fotoId } ou { repetida = true }, ou nil e o
--- erro. Mesmo caminho do painel: URL assinada, PUT direto ao R2 e confirmação.
function Api.enviarFoto(config, eventoId, caminho)
  local tamanho = LrFileUtils.fileAttributes(caminho).fileSize
  if not tamanho or tamanho <= 0 then return nil, 'A exportação não gerou o arquivo.' end
  if tamanho >= Api.TAMANHO_MAXIMO then
    return nil, 'Foto com mais de 50 MB. Exporte em JPEG com qualidade menor ou redimensione.'
  end
  local formato = FORMATOS[(LrPathUtils.extension(caminho) or ''):lower()]
  if not formato then return nil, 'Exporte em JPEG para publicar no ClicouAí.' end
  local hash = Api.impressao(caminho, tamanho)
  if not hash then
    return nil, 'Não foi possível calcular a impressão da foto (certutil ou shasum).'
  end

  -- 1. Registro e URL assinada.
  local inicio, erro = enviar(config, 'POST', '/api/plugin/envios', {
    eventoId = eventoId,
    arquivos = {
      { nome = LrPathUtils.leafName(caminho), tamanhoBytes = tamanho, hash = hash, formato = formato },
    },
  })
  if not inicio then return nil, erro end
  local item = inicio.itens and inicio.itens[1]
  if not item then return nil, 'Resposta inesperada do ClicouAí.' end
  if item.repetida then return { repetida = true, hash = hash } end

  -- 2. O arquivo vai direto ao armazenamento, com o mesmo tipo e tamanho assinados.
  local conteudo = LrFileUtils.readFile(caminho)
  if not conteudo or #conteudo ~= tamanho then return nil, 'Não foi possível ler a foto exportada.' end
  local _, info = LrHttp.post(item.url, conteudo, {
    { field = 'Content-Type', value = item.tipo },
  }, 'PUT', 300, tamanho)
  if not info or not info.status or info.status >= 300 then
    return nil, 'O envio do arquivo falhou' .. (info and info.status and (' (' .. info.status .. ')') or '') .. '.'
  end

  -- 3. Confirmação: prévia com marca d'água, original guardado, rostos.
  local confirmou, erroConfirmacao = enviar(config, 'POST', '/api/plugin/envios/confirmar',
    { fotoId = item.fotoId }, 300)
  if not confirmou then return nil, erroConfirmacao end
  return { fotoId = item.fotoId }
end

--- Endereço da página da foto no site.
function Api.urlDaFoto(config, fotoId)
  return servidor(config) .. '/fotos/' .. fotoId
end

return Api
