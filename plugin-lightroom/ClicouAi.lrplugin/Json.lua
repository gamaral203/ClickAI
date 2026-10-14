--[[
JSON mínimo para o plugin (o Lightroom não traz um): codifica tabelas, textos, números e
booleanos, e lê as respostas da API do ClicouAí. Uma tabela com a chave [1] vira lista.
]]

local Json = {}

-- ------------------------------------------------------------------------------ Codificar

local escapes = {
  ['"'] = '\\"', ['\\'] = '\\\\', ['\b'] = '\\b', ['\f'] = '\\f',
  ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t',
}

local function codificarTexto(s)
  return '"' .. s:gsub('[%c"\\]', function(c)
    return escapes[c] or string.format('\\u%04x', c:byte())
  end) .. '"'
end

local codificar

local function codificarTabela(t)
  if t[1] ~= nil or next(t) == nil then
    -- Lista (ou tabela vazia, que vai como lista).
    local partes = {}
    for i = 1, #t do partes[i] = codificar(t[i]) end
    if next(t) == nil then return '[]' end
    return '[' .. table.concat(partes, ',') .. ']'
  end
  local partes = {}
  for k, v in pairs(t) do
    partes[#partes + 1] = codificarTexto(tostring(k)) .. ':' .. codificar(v)
  end
  return '{' .. table.concat(partes, ',') .. '}'
end

codificar = function(v)
  local tipo = type(v)
  if tipo == 'string' then return codificarTexto(v) end
  if tipo == 'number' then
    if v == math.floor(v) then return string.format('%d', v) end
    return tostring(v)
  end
  if tipo == 'boolean' then return v and 'true' or 'false' end
  if tipo == 'table' then return codificarTabela(v) end
  return 'null'
end

Json.encode = codificar

-- ------------------------------------------------------------------------------ Ler

local function erro(texto, pos)
  error(string.format('JSON inválido na posição %d: %s', pos, texto), 0)
end

local function pularEspacos(s, pos)
  return s:find('[^ \t\r\n]', pos) or (#s + 1)
end

local ler

local function utf8(codigo)
  if codigo < 0x80 then return string.char(codigo) end
  if codigo < 0x800 then
    return string.char(0xC0 + math.floor(codigo / 0x40), 0x80 + codigo % 0x40)
  end
  return string.char(
    0xE0 + math.floor(codigo / 0x1000),
    0x80 + math.floor(codigo / 0x40) % 0x40,
    0x80 + codigo % 0x40
  )
end

local function lerTexto(s, pos)
  local partes = {}
  local i = pos + 1
  while true do
    local c = s:sub(i, i)
    if c == '' then erro('texto sem fim', i) end
    if c == '"' then return table.concat(partes), i + 1 end
    if c == '\\' then
      local e = s:sub(i + 1, i + 1)
      local simples = { ['"'] = '"', ['\\'] = '\\', ['/'] = '/', b = '\b', f = '\f', n = '\n', r = '\r', t = '\t' }
      if simples[e] then
        partes[#partes + 1] = simples[e]
        i = i + 2
      elseif e == 'u' then
        local hex = s:sub(i + 2, i + 5)
        local codigo = tonumber(hex, 16)
        if not codigo then erro('\\u inválido', i) end
        i = i + 6
        -- Par substituto (caractere fora do plano básico): junta os dois.
        if codigo >= 0xD800 and codigo <= 0xDBFF and s:sub(i, i + 1) == '\\u' then
          local baixo = tonumber(s:sub(i + 2, i + 5), 16)
          if baixo and baixo >= 0xDC00 and baixo <= 0xDFFF then
            codigo = 0x10000 + (codigo - 0xD800) * 0x400 + (baixo - 0xDC00)
            i = i + 6
          end
        end
        if codigo >= 0x10000 then
          partes[#partes + 1] = string.char(
            0xF0 + math.floor(codigo / 0x40000),
            0x80 + math.floor(codigo / 0x1000) % 0x40,
            0x80 + math.floor(codigo / 0x40) % 0x40,
            0x80 + codigo % 0x40
          )
        else
          partes[#partes + 1] = utf8(codigo)
        end
      else
        erro('escape inválido', i)
      end
    else
      partes[#partes + 1] = c
      i = i + 1
    end
  end
end

ler = function(s, pos)
  pos = pularEspacos(s, pos)
  local c = s:sub(pos, pos)
  if c == '{' then
    local obj = {}
    pos = pularEspacos(s, pos + 1)
    if s:sub(pos, pos) == '}' then return obj, pos + 1 end
    while true do
      pos = pularEspacos(s, pos)
      if s:sub(pos, pos) ~= '"' then erro('esperava uma chave', pos) end
      local chave
      chave, pos = lerTexto(s, pos)
      pos = pularEspacos(s, pos)
      if s:sub(pos, pos) ~= ':' then erro('esperava ":"', pos) end
      obj[chave], pos = ler(s, pos + 1)
      pos = pularEspacos(s, pos)
      local fim = s:sub(pos, pos)
      if fim == '}' then return obj, pos + 1 end
      if fim ~= ',' then erro('esperava "," ou "}"', pos) end
      pos = pos + 1
    end
  elseif c == '[' then
    local lista = {}
    pos = pularEspacos(s, pos + 1)
    if s:sub(pos, pos) == ']' then return lista, pos + 1 end
    while true do
      lista[#lista + 1], pos = ler(s, pos)
      pos = pularEspacos(s, pos)
      local fim = s:sub(pos, pos)
      if fim == ']' then return lista, pos + 1 end
      if fim ~= ',' then erro('esperava "," ou "]"', pos) end
      pos = pos + 1
    end
  elseif c == '"' then
    return lerTexto(s, pos)
  elseif s:sub(pos, pos + 3) == 'true' then
    return true, pos + 4
  elseif s:sub(pos, pos + 4) == 'false' then
    return false, pos + 5
  elseif s:sub(pos, pos + 3) == 'null' then
    return nil, pos + 4
  end
  local numero = s:match('^-?%d+%.?%d*[eE]?[-+]?%d*', pos)
  if not numero or numero == '' then erro('valor inesperado', pos) end
  return tonumber(numero), pos + #numero
end

--- Lê um texto JSON; devolve o valor, ou nil e a mensagem de erro.
function Json.decode(s)
  if type(s) ~= 'string' or s == '' then return nil, 'resposta vazia' end
  local ok, valor = pcall(function() return (ler(s, 1)) end)
  if not ok then return nil, valor end
  return valor
end

return Json
