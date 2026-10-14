--[[
Serviço de publicação do ClicouAí. O fotógrafo cola a chave de acesso (Painel > Lightroom no
site); os eventos dele viram coleções publicadas, cada uma ligada a um evento pelo id
(collectionSettings.eventoId). Publicar exporta em JPEG e envia cada foto pela API do plugin;
republicar envia a versão nova e apaga a antiga; tirar a foto da coleção apaga do evento.
]]

local LrApplication = import 'LrApplication'
local LrDialogs = import 'LrDialogs'
local LrTasks = import 'LrTasks'
local LrView = import 'LrView'

local Api = require 'ClicouAiApi'

local provider = {}

provider.supportsIncrementalPublish = 'only'
provider.canExportVideo = false
provider.allowFileFormats = { 'JPEG' }
provider.allowColorSpaces = { 'sRGB' }
provider.hideSections = { 'exportLocation', 'video' }
provider.hidePrintResolution = true
provider.disableRenamePublishedCollection = true
provider.titleForPublishedCollection = 'Evento'
provider.titleForPublishedCollection_standalone = 'Evento'
provider.titleForGoToPublishedCollection = 'Abrir o evento no ClicouAí'
provider.titleForGoToPublishedPhoto = 'Abrir a foto no ClicouAí'

provider.exportPresetFields = {
  { key = 'chave', default = '' },
  { key = 'servidor', default = Api.SERVIDOR_PADRAO },
}

--- As coleções vêm dos eventos do site ("Atualizar eventos"); não se cria evento à mão aqui.
function provider.getCollectionBehaviorInfo()
  return {
    defaultCollectionName = 'Evento',
    defaultCollectionCanBeDeleted = true,
    canAddCollection = false,
    maxCollectionSetDepth = 0,
  }
end

-- ------------------------------------------------------------------------------ Eventos

local function nomeDaColecao(evento)
  local data = (evento.inicioEm or ''):match('^(%d%d%d%d%-%d%d%-%d%d)')
  if data then
    local ano, mes, dia = data:match('(%d+)%-(%d+)%-(%d+)')
    return string.format('%s (%s/%s/%s)', evento.titulo, dia, mes, ano)
  end
  return evento.titulo
end

--- Cria uma coleção para cada evento do site que ainda não tem. Devolve quantas criou.
local function sincronizarEventos(publishService, config)
  local eventos, erro = Api.eventos(config)
  if not eventos then return nil, erro end
  local ligados = {}
  for _, colecao in ipairs(publishService:getChildCollections()) do
    local ajustes = colecao:getCollectionInfoSummary().collectionSettings or {}
    if ajustes.eventoId then ligados[ajustes.eventoId] = true end
  end
  local criadas = 0
  LrApplication.activeCatalog():withWriteAccessDo('ClicouAí: atualizar eventos', function()
    for _, evento in ipairs(eventos) do
      if not ligados[evento.id] then
        local colecao = publishService:createPublishedCollection(nomeDaColecao(evento), nil, true)
        if colecao then
          colecao:setCollectionSettings({ eventoId = evento.id })
          -- "Abrir o evento no ClicouAí" leva à página pública do evento.
          if evento.url then colecao:setRemoteUrl(evento.url) end
          criadas = criadas + 1
        end
      end
    end
  end)
  return criadas
end

--- Logo depois de criar o serviço, já traz os eventos do site como coleções.
function provider.didCreateNewPublishService(publishSettings, info)
  LrTasks.startAsyncTask(function()
    local criadas, erro = sincronizarEventos(info.publishService, publishSettings)
    if not criadas then
      LrDialogs.message('ClicouAí', 'Não foi possível trazer os eventos: ' .. erro, 'warning')
    end
  end)
end

-- ------------------------------------------------------------------------------ Configuração

function provider.sectionsForTopOfDialog(f, propertyTable)
  local bind = LrView.bind
  propertyTable.situacao = propertyTable.situacao
    or (propertyTable.chave ~= '' and 'Clique em "Verificar" para conferir a chave.'
      or 'Cole a chave gerada em Painel > Lightroom no site do ClicouAí.')

  local function verificar()
    LrTasks.startAsyncTask(function()
      propertyTable.situacao = 'Conferindo…'
      local nome, erro = Api.conta(propertyTable)
      if not nome then
        propertyTable.situacao = erro
        return
      end
      local texto = 'Conectado como ' .. nome .. '.'
      local servico = propertyTable.LR_publishService
      if servico then
        local criadas, erroEventos = sincronizarEventos(servico, propertyTable)
        if criadas then
          texto = texto .. (criadas > 0
            and string.format(' %d evento(s) novo(s) em "Serviços de publicação".', criadas)
            or ' Eventos em dia.')
        else
          texto = texto .. ' ' .. erroEventos
        end
      else
        texto = texto .. ' Salve para trazer os eventos.'
      end
      propertyTable.situacao = texto
    end)
  end

  return {
    {
      title = 'ClicouAí',
      synopsis = bind 'situacao',
      f:row {
        f:static_text { title = 'Chave de acesso:', width_in_chars = 14 },
        f:password_field {
          value = bind 'chave',
          width_in_chars = 40,
          immediate = true,
        },
      },
      f:row {
        f:static_text { title = '', width_in_chars = 14 },
        f:push_button { title = 'Verificar e atualizar eventos', action = verificar },
      },
      f:row {
        f:static_text { title = '', width_in_chars = 14 },
        f:static_text {
          title = bind 'situacao',
          width_in_chars = 50,
          height_in_lines = 2,
        },
      },
      f:row {
        f:static_text {
          title = 'Os eventos são criados no site. Depois de criar um evento novo, volte aqui e '
            .. 'clique em "Verificar e atualizar eventos".',
          width_in_chars = 66,
          height_in_lines = 2,
        },
      },
    },
  }
end

-- ------------------------------------------------------------------------------ Publicar

function provider.processRenderedPhotos(functionContext, exportContext)
  local config = exportContext.propertyTable
  local sessao = exportContext.exportSession
  local colecao = exportContext.publishedCollection
  local ajustes = colecao and colecao:getCollectionInfoSummary().collectionSettings or {}
  local eventoId = ajustes.eventoId
  local total = sessao:countRenditions()
  local progresso = exportContext:configureProgress {
    title = total > 1 and string.format('Publicando %d fotos no ClicouAí', total)
      or 'Publicando 1 foto no ClicouAí',
  }

  if not eventoId then
    for _, rendition in sessao:renditions() do
      rendition:uploadFailed('Esta coleção não está ligada a um evento do ClicouAí.')
    end
    return
  end

  local feitas = 0
  for _, rendition in sessao:renditions { stopIfCanceled = true } do
    progresso:setPortionComplete(feitas, total)
    local ok, caminho = rendition:waitForRender()
    if ok then
      local resultado, erro = Api.enviarFoto(config, eventoId, caminho)
      if not resultado then
        rendition:uploadFailed(erro)
      else
        local anterior = rendition.publishedPhotoId
        if resultado.fotoId then
          rendition:recordPublishedPhotoId(resultado.fotoId)
          rendition:recordPublishedPhotoUrl(Api.urlDaFoto(config, resultado.fotoId))
          -- Republicada: a versão antiga sai do evento (quem já comprou continua baixando).
          if anterior and anterior ~= resultado.fotoId and not anterior:match('^repetida%-') then
            Api.apagarFoto(config, anterior)
          end
        else
          -- A mesma foto já está no evento: fica marcada como publicada, sem enviar de novo.
          rendition:recordPublishedPhotoId(anterior or ('repetida-' .. resultado.hash))
        end
      end
    else
      rendition:uploadFailed(caminho)
    end
    feitas = feitas + 1
  end
  progresso:done()
end

--- Fotos tiradas da coleção: saem do evento no site.
function provider.deletePhotosFromPublishedCollection(publishSettings, arrayOfPhotoIds, deletedCallback)
  for _, fotoId in ipairs(arrayOfPhotoIds) do
    if fotoId:match('^repetida%-') then
      deletedCallback(fotoId)
    else
      local ok, erro = Api.apagarFoto(publishSettings, fotoId)
      if ok then
        deletedCallback(fotoId)
      else
        LrDialogs.message('ClicouAí', 'Não foi possível apagar uma foto do evento: ' .. erro, 'warning')
        return
      end
    end
  end
end

return provider
