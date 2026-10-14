--[[
Plugin do ClicouAí para o Lightroom Classic: um serviço de publicação. Cada evento do fotógrafo
vira uma coleção em "Serviços de publicação"; arrastar fotos para ela e clicar em Publicar envia
as fotos ao evento no site (docs/arquitetura.md, "Plugin do Lightroom").
]]

return {
  LrSdkVersion = 6.0,
  LrSdkMinimumVersion = 6.0,
  LrToolkitIdentifier = 'com.clicouai.lightroom',
  LrPluginName = 'ClicouAí',
  LrPluginInfoUrl = 'https://www.clicouai.com/painel/lightroom',
  LrExportServiceProvider = {
    title = 'ClicouAí',
    file = 'ServiceProvider.lua',
  },
  VERSION = { major = 1, minor = 0, revision = 0, build = 1 },
}
