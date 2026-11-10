// ═════════════════════════════════════════════════════════════
//  VENDAS ChefWeb → Supabase (dash nova)
//  Todo dia busca na TOTVS os últimos 3 dias de operação e grava no Supabase:
//    vendas      → 1 linha por venda/mesa (total, serviço, pessoas, operador, garçons)
//    itens       → 1 linha por item vendido (com o garçom que lançou)
//    pagamentos  → 1 linha por pagamento (TODOS os pagamentos da venda)
//  Dia considerado = DIA DE OPERAÇÃO (Caixa.Data): venda às 3h do dia 11 num caixa
//  aberto no dia 10 conta como dia 10.
//
//  CONFIGURAÇÃO (uma vez só):
//   1. Preencha a senha abaixo.
//   2. Menu 🍣 ChefWeb → "📤 Enviar histórico da planilha para a dash" (uma vez só:
//      lê as abas Vendas, Itens, Pagamentos, Produtos, Fichas_Tecnicas e Fichas_Insumos).
//   3. Menu 🍣 ChefWeb → "🔄 Buscar últimos 3 dias" para testar.
//   4. Menu 🍣 ChefWeb → "⚙️ Ativar sync diário automático".
// ═════════════════════════════════════════════════════════════

var CONFIG = {
  urlServidor:   "https://chefweb.chef.totvs.com.br/chefwebapi",
  usuario:       "LARISSA.SUSHILEBLON",
  senha:         "COLOQUE_A_SENHA_AQUI",
  serialLoja:    "96736989",
  chave:         "SerialNumber",
  codigoLoja:    "1",
  composicoes:   true,

  lojaDash:      1,     // 1 = SUSHI LEBLON, 2 = NOLA (número da loja na dash)
  supabaseUrl:   "https://mueekpzpmcehgxqzmotn.supabase.co",
  supabaseChave: "sb_publishable_ghvkqR97r2pZWugR-wXhFw_n-G-85iQ",   // chave pública (pode ficar no código)
  tokenIntegracao: "COLOQUE_O_TOKEN_DE_INTEGRACAO",                                      // senha de integração deste script (não compartilhe)

  horarioInicio: 11,    // janela da operação: 11h do dia...
  horarioCorte:  6,     // ...até 5h59 do dia seguinte
  diasSync:      3,     // a TOTVS só devolve até 3 dias atrás
  horaSync:      8,     // horário do sync automático
};

// ─────────────────────────────────────────────
//  MENU
// ─────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🍣 ChefWeb")
    .addItem("🔄 Buscar últimos 3 dias", "buscarUltimosDias")
    .addItem("📅 Buscar um período", "menuBuscarPeriodo")
    .addSeparator()
    .addItem("⚙️ Ativar sync diário automático", "ativarSyncDiario")
    .addItem("🗑️ Desativar sync diário", "desativarSyncDiario")
    .addSeparator()
    .addItem("📤 Enviar histórico da planilha para a dash", "enviarHistorico")
    .addItem("💰 Buscar contas a pagar agora", "buscarContasPagar")
    .addItem("🔍 Ver campos que a API manda", "verCamposAPI")
    .addToUi();
}

function buscarUltimosDias() {
  try {
    _alerta("✅ Concluído!\n\n" + _buscarUltimos(CONFIG.diasSync).texto);
  } catch (e) {
    _alerta("❌ Erro:\n\n" + e.message);
  }
}

function menuBuscarPeriodo() {
  var ui = SpreadsheetApp.getUi();
  var r1 = ui.prompt("Data inicial da operação (AAAA-MM-DD)\n\nA TOTVS só devolve até 3 dias atrás.", ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var r2 = ui.prompt("Data final da operação (AAAA-MM-DD)", ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  try {
    ui.alert("✅ Concluído!\n\n" + buscarPeriodo(r1.getResponseText().trim(), r2.getResponseText().trim()).texto);
  } catch (e) {
    ui.alert("❌ Erro:\n\n" + e.message);
  }
}

// ─────────────────────────────────────────────
//  SYNC AUTOMÁTICO
// ─────────────────────────────────────────────
function ativarSyncDiario() {
  desativarSyncDiario(true);
  ScriptApp.newTrigger("syncDiarioAutomatico").timeBased().everyDays(1).atHour(CONFIG.horaSync).create();
  _alerta("✅ Sync diário ativado!\n\nTodo dia às " + CONFIG.horaSync + "h ele busca os últimos " +
    CONFIG.diasSync + " dias de operação e grava no Supabase (sem duplicar).");
}

function desativarSyncDiario(silencioso) {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "syncDiarioAutomatico") ScriptApp.deleteTrigger(t);
  });
  if (silencioso !== true) _alerta("🗑️ Sync diário desativado.");
}

function syncDiarioAutomatico() {
  try { Logger.log(_sincronizarContasPagar().texto); } catch (e) { Logger.log("Contas a pagar: " + e.message); }
  try {
    Logger.log(_buscarUltimos(CONFIG.diasSync).texto);
  } catch (e) {
    Logger.log("❌ Sync: " + e.message);
    _registrar("api-erro", e.message.substring(0, 500), 0);
    throw e; // faz o Google mandar e-mail de falha
  }
}

function _buscarUltimos(n) {
  var ini = new Date(); ini.setDate(ini.getDate() - n);
  var fim = new Date(); fim.setDate(fim.getDate() - 1);
  return buscarPeriodo(_fmtData(ini), _fmtData(fim));
}

// ─────────────────────────────────────────────
//  BUSCA PRINCIPAL
// ─────────────────────────────────────────────
function buscarPeriodo(dataInicio, dataFim) {
  var total = _diffDias(dataInicio, dataFim);
  if (total < 0) throw new Error("A data final é antes da inicial.");

  var cont = { vendas: 0, itens: 0, pag: 0 }, linhas = [];
  for (var d = 0; d <= total; d++) {
    var dia = _somarDias(dataInicio, d);
    var r = _montarDia(_chamarAPI(dia), dia);
    _enviarSupabase("vendas", r.vendas);
    _enviarSupabase("itens", r.itens);
    _enviarSupabase("pagamentos", r.pag);
    cont.vendas += r.vendas.length; cont.itens += r.itens.length; cont.pag += r.pag.length;
    linhas.push(dia + ": " + r.vendas.length + " vendas, " + r.itens.length + " itens");
    if (d < total) Utilities.sleep(2000);
  }
  _registrar("api", dataInicio + " a " + dataFim, cont.vendas + cont.itens + cont.pag);
  return { texto: linhas.join("\n") + "\n\nEnviado ao Supabase → vendas: " + cont.vendas +
    " | itens: " + cont.itens + " | pagamentos: " + cont.pag };
}

function _chamarAPI(dia) {
  var janela = _janelaPorDia(dia);
  var resp = UrlFetchApp.fetch(CONFIG.urlServidor + "/api/CapaVenda/ListPorDataIntegracaoChefweb", {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    payload: JSON.stringify({
      Token: _gerarToken(), CodigoLoja: CONFIG.codigoLoja, Composicoes: CONFIG.composicoes,
      DataInicialIntegracaoChefweb: janela.inicio, DataFinalIntegracaoChefweb: janela.fim,
      ValidaSaltoNota: false, NotasInutilizadas: false,
    }),
  });
  var json = JSON.parse(resp.getContentText());
  if (!json.Sucesso) throw new Error("API TOTVS erro em " + dia + ": " + resp.getContentText());
  return (json.Vendas || []).filter(function(v) {
    return v.Caixa && v.Caixa.Data && String(v.Caixa.Data).substring(0, 10) === dia;
  });
}

function _gerarToken() {
  var resp = UrlFetchApp.fetch(CONFIG.urlServidor + "/api/Token/GerarToken", {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    payload: JSON.stringify({ Usuario: CONFIG.usuario, Senha: CONFIG.senha,
      NumeroSerialLoja: CONFIG.serialLoja, Chave: CONFIG.chave }),
  });
  var json = JSON.parse(resp.getContentText());
  if (!json.Sucesso) throw new Error("Erro no token TOTVS: " + resp.getContentText());
  return json.Token;
}

// ─────────────────────────────────────────────
//  MONTAGEM DAS LINHAS
// ─────────────────────────────────────────────
function _montarDia(vendas, dia) {
  var out = { vendas: [], itens: [], pag: [] };
  var loja = CONFIG.lojaDash;

  vendas.forEach(function(v) {
    var chaveVenda = String(v.ChaveVenda);
    var caixa = v.Caixa || {}, total = v.TotalizadorVenda || {};
    var status = Number(v.StatusVenda) || null;
    var canal = "", valorItens = 0, descontos = 0, garcons = {};

    (v.Itens || []).forEach(function(item, idx) {
      var prod = item.Produto || {};
      var nomeProd = String(prod.Nome || "").trim();
      if (nomeProd.toUpperCase() === "SERVICO") return;   // serviço fica na venda
      var canalItem = _canal(prod.Grupo);
      if (!canal) canal = canalItem;
      valorItens += Number(item.ValorTotal) || 0;
      descontos  += Number(item.ValorDesconto) || 0;
      var garcom = _garcomDe(item);
      if (garcom) garcons[garcom] = true;
      out.itens.push({
        chave_item: chaveVenda + "_" + idx, chave_venda: chaveVenda, loja: loja, dia: dia,
        canal: canalItem || null, status_venda: status,
        codigo_produto: prod.Codigo ? Number(prod.Codigo) : null, produto: nomeProd || null,
        subgrupo: prod.SubGrupo || null,
        quantidade: Number(item.Quantidade) || 0, valor_unitario: Number(item.ValorUnitario) || 0,
        desconto: Number(item.ValorDesconto) || 0, acrescimo: Number(item.ValorAcrescimo) || 0,
        valor_total: Number(item.ValorTotal) || 0,
        hora: item.DataVenda ? String(item.DataVenda).substring(11, 16) : null,
        garcom: garcom || null,
      });
    });

    var garcomCapa = _garcomDe(v);
    if (garcomCapa) garcons[garcomCapa] = true;

    out.vendas.push({
      chave_venda: chaveVenda, loja: loja, dia: dia, canal: canal || null,
      status_venda: status, status: status === 2 ? "Concluída" : (status === 3 ? "Cancelada" : "Outro"),
      numero_cupom: _txt(v.NumeroCupom), numero_nota: _txt(v.NumeroNota), modelo_fiscal: _txt(v.ModeloFiscal),
      mesa: _txt(_mesa(v)), qtd_pessoas: Number(v.QuantidadePessoas) || null,
      operador: _nome(caixa.Operador) || null, garcons: Object.keys(garcons).join(", ") || null,
      caixa_numero: _txt(caixa.Numero), caixa_fechamento: _txt(caixa.NumeroFechamento),
      cliente: _nome(v.Cliente) || null,
      valor_itens: _r2(valorItens), valor_servico: Number(total.ValorTotalServico) || 0,
      valor_total: Number(total.ValorTotal) || 0, descontos: _r2(descontos),
      valor_troco: Number(total.ValorTroco) || 0, data_integracao: _txt(v.DataIntegracaoChefweb), fonte: "API",
    });

    var troco = Number(total.ValorTroco) || 0;
    (v.Pagamentos || []).forEach(function(p, idx) {
      var cart = p.FormaPagamentoCartao || {};
      var c = _classificarPagto(p.Descricao, cart.TipoCartao);
      var valor = Number(p.ValorRecebido) || 0;
      if (c.forma === "Dinheiro" && troco > 0) { valor = Math.max(0, valor - troco); troco = 0; }
      out.pag.push({
        chave_pagto: chaveVenda + "_" + idx, chave_venda: chaveVenda, loja: loja, dia: dia,
        status_venda: status, descricao: String(p.Descricao || "").trim() || null,
        forma: c.forma, bandeira: c.bandeira || null, maquininha: c.maquininha || null,
        valor: _r2(valor), fonte: "API",
      });
    });
  });
  return out;
}

// ─────────────────────────────────────────────
//  SUPABASE
// ─────────────────────────────────────────────
function _chaveSupabase() { return CONFIG.supabaseChave; }

// envia para o Supabase pela função "ingerir" (protegida pelo token de integração)
function _rpcIngerir(tabela, linhas, modo) {
  var resp = UrlFetchApp.fetch(CONFIG.supabaseUrl + "/rest/v1/rpc/ingerir", _reqIngerir(tabela, linhas, modo));
  if (resp.getResponseCode() >= 300) throw new Error("Supabase (" + tabela + ") HTTP " + resp.getResponseCode() + ": " + resp.getContentText().substring(0, 400));
  return resp;
}

function _reqIngerir(tabela, linhas, modo) {
  return {
    url: CONFIG.supabaseUrl + "/rest/v1/rpc/ingerir", method: "post", contentType: "application/json",
    muteHttpExceptions: true, headers: { apikey: CONFIG.supabaseChave },
    payload: JSON.stringify({ p_token: CONFIG.tokenIntegracao, p_tabela: tabela, p_linhas: linhas, p_modo: modo || "merge" }),
  };
}

function _enviarSupabase(tabela, linhas) {
  for (var i = 0; i < linhas.length; i += 500) _rpcIngerir(tabela, linhas.slice(i, i + 500), "merge");
}

function _registrar(tipo, detalhes, linhas) {
  try {
    _rpcIngerir("importacoes", [{ tipo: tipo, arquivo: "Apps Script", loja: CONFIG.lojaDash,
      linhas: linhas, detalhes: detalhes, feito_por: "sync automático" }], "merge");
  } catch (e) { Logger.log("Log não gravado: " + e.message); }
}

// ─────────────────────────────────────────────
//  CLASSIFICAÇÕES
// ─────────────────────────────────────────────
function _canal(grupo) {
  var g = String(grupo || "").toUpperCase();
  if (g.indexOf("IFOOD") >= 0) return "iFood";
  if (g.indexOf("RAPPI") >= 0) return "Rappi";
  if (g.indexOf("SITE")  >= 0) return "Site";
  if (g.indexOf("LOJA")  >= 0) return "Loja";
  return "";
}

function _classificarPagto(desc, tipoCartao) {
  var d = String(desc || "").trim().toUpperCase();
  var t = String(tipoCartao || "").trim().toUpperCase().replace("É", "E");
  var maq = (d.indexOf("GETNET") >= 0 || d.indexOf("GET NET") >= 0) ? "Getnet" : (d.indexOf("BRB") >= 0 ? "BRB" : "");
  var r = function(f, b, m) { return { forma: f, bandeira: b || "", maquininha: m || "" }; };
  if (d.indexOf("IFOOD") >= 0)    return r("iFood");
  if (d.indexOf("RAPPI") >= 0)    return r("Rappi");
  if (d.indexOf("SHOPFOOD") >= 0) return r("Site (Shopfood)");
  if (d.indexOf("PIX") >= 0)      return r("PIX", "", maq);
  if (d.indexOf("DINHEIRO") >= 0) return r("Dinheiro");
  if (d.indexOf("CHEQUE") >= 0)   return r("Cheque");
  if (d.indexOf("ASSINADA") >= 0) return r("Conta assinada");
  var band = "";
  [["MAESTRO","Mastercard"],["MASTER","Mastercard"],["VISA","Visa"],["ELO","Elo"],["AMEX","Amex"],["ALELO","Alelo"]]
    .some(function(b) { if (d.indexOf(b[0]) === 0) { band = b[1]; return true; } return false; });
  if (t === "VOUCHER" || band === "Alelo")         return r("Voucher", band, maq);
  if (t === "DEBITO"  || d.indexOf("DEBITO") >= 0)  return r("Cartão Débito", band, maq);
  if (t === "CREDITO" || d.indexOf("CREDITO") >= 0) return r("Cartão Crédito", band, maq);
  return r("Outro", band, maq);
}

// Procura o garçom nos nomes de campo mais comuns da TOTVS.
// Se a coluna de garçom vier vazia na dash, use "🔍 Ver campos que a API manda" e envie o resultado.
function _garcomDe(obj) {
  if (!obj) return "";
  var campos = ["Garcom", "Garçom", "Atendente", "Funcionario", "Vendedor", "Colaborador", "Garcons", "Atendentes"];
  for (var i = 0; i < campos.length; i++) {
    var v = obj[campos[i]];
    if (Array.isArray(v)) v = v.map(_nome).filter(String).join(", ");
    var n = _nome(v);
    if (n) return n;
  }
  return "";
}

function _mesa(v) {
  var m = v.Mesa || v.NumeroMesa || v.Comanda || v.NumeroComanda || "";
  if (m && typeof m === "object") m = m.Numero || m.Codigo || m.Nome || "";
  return m;
}

function _nome(x) {
  if (!x) return "";
  if (typeof x !== "object") return String(x).trim();
  return String(x.Nome || x.Apelido || x.Descricao || "").trim();
}

function _txt(v) { return v === null || v === undefined || v === "" ? null : String(v); }

// ─────────────────────────────────────────────
//  DIAGNÓSTICO: lista todos os campos que a API manda (aba "_Campos_API")
// ─────────────────────────────────────────────
function verCamposAPI() {
  var ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
  var vendas = _chamarAPI(_fmtData(ontem));
  if (!vendas.length) { _alerta("Nenhuma venda ontem para analisar."); return; }
  var campos = {};
  var andar = function(o, caminho) {
    if (o === null || o === undefined) { if (!(caminho in campos)) campos[caminho] = ""; return; }
    if (Array.isArray(o)) { if (o.length) andar(o[0], caminho + "[]"); else campos[caminho + "[]"] = "(vazio)"; return; }
    if (typeof o === "object") { Object.keys(o).forEach(function(k) { andar(o[k], caminho ? caminho + "." + k : k); }); return; }
    if (!campos[caminho]) campos[caminho] = String(o).substring(0, 80);
  };
  vendas.slice(0, 20).forEach(function(v) { andar(v, ""); });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName("_Campos_API") || ss.insertSheet("_Campos_API");
  aba.clear();
  var linhas = [["Campo", "Exemplo"]].concat(Object.keys(campos).sort().map(function(k) { return [k, campos[k]]; }));
  aba.getRange(1, 1, linhas.length, 2).setValues(linhas);
  _alerta("Pronto! Veja a aba _Campos_API (" + (linhas.length - 1) + " campos).");
}

// ─────────────────────────────────────────────
//  AUXILIARES
// ─────────────────────────────────────────────
function _janelaPorDia(dataStr) {
  var p = dataStr.split("-");
  var ini = new Date(+p[0], +p[1] - 1, +p[2], CONFIG.horarioInicio, 0, 0);
  var fim = new Date(+p[0], +p[1] - 1, +p[2] + 1, CONFIG.horarioCorte, 0, 0);
  fim.setSeconds(fim.getSeconds() - 1);
  return { inicio: _fmtDataHora(ini), fim: _fmtDataHora(fim) };
}
function _fmtData(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function _fmtDataHora(d) {
  return _fmtData(d) + "T" + String(d.getHours()).padStart(2, "0") + ":" +
    String(d.getMinutes()).padStart(2, "0") + ":" + String(d.getSeconds()).padStart(2, "0");
}
function _diffDias(a, b) { return Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000); }
function _somarDias(s, n) { var d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return _fmtData(d); }
function _r2(n) { return Math.round(n * 100) / 100; }
function _alerta(msg) {
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
}


// ═════════════════════════════════════════════════════════════
//  HISTÓRICO: lê as abas desta planilha e envia ao Supabase.
//  Roda em partes (o Google limita cada execução a 6 min) e continua
//  sozinho a cada minuto até terminar. Não duplica: o que já existe é mantido.
// ═════════════════════════════════════════════════════════════
var HIST = [
  { aba: "Vendas", tabela: "vendas", conflito: "chave_venda", chave: "ChaveVenda" },
  { aba: "Pagamentos", tabela: "pagamentos", conflito: "chave_pagto", chave: "ChavePagto" },
  { aba: "Itens", tabela: "itens", conflito: "chave_item", chave: "ChaveItem" },
  { aba: "Produtos", tabela: "produtos", conflito: "loja,codigo", chave: "CodigoProduto", atualizar: true },
  { aba: "Fichas_Tecnicas", tabela: "fichas", chave: "CodigoComposto", apagarAntes: true },
  { aba: "Fichas_Insumos", tabela: "fichas_insumos", conflito: "loja,codigo_produto,codigo_insumo", chave: "CodigoProduto", apagarAntes: true },
];

function enviarHistorico() {
  PropertiesService.getScriptProperties().setProperty("HIST_ESTADO", JSON.stringify({ t: 0, linha: 2, total: 0 }));
  _alerta("📤 Envio do histórico iniciado.\n\nEle roda em partes e continua sozinho a cada minuto.\n" +
    "Acompanhe na dash (tela Importar → Últimas importações) ou em Extensões → Apps Script → Execuções.\n" +
    "Pode fechar a planilha.");
  _continuarHistorico();
}

function _continuarHistorico() {
  var props = PropertiesService.getScriptProperties();
  var est = JSON.parse(props.getProperty("HIST_ESTADO") || "null");
  _apagarGatilho("_continuarHistorico");
  if (!est) return;
  var inicio = Date.now(), ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(props.getProperty("PLANILHA_ID"));
  props.setProperty("PLANILHA_ID", ss.getId());
  var tz = ss.getSpreadsheetTimeZone();

  while (est.t < HIST.length) {
    var def = HIST[est.t];
    var aba = ss.getSheetByName(def.aba);
    if (!aba) { est.t++; est.linha = 2; continue; }
    var cab = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0].map(String);
    var ultima = aba.getLastRow();

    if (est.linha === 2 && def.apagarAntes) _apagarSupabase(def.tabela);

    while (est.linha <= ultima) {
      if (Date.now() - inicio > 4.5 * 60 * 1000) {   // perto do limite: agenda a continuação
        props.setProperty("HIST_ESTADO", JSON.stringify(est));
        ScriptApp.newTrigger("_continuarHistorico").timeBased().after(60 * 1000).create();
        Logger.log("Pausa em " + def.aba + " linha " + est.linha + " — continua em 1 min");
        return;
      }
      var n = Math.min(5000, ultima - est.linha + 1);
      var valores = aba.getRange(est.linha, 1, n, cab.length).getValues();
      var objs = [];
      valores.forEach(function(r) {
        var o = {};
        cab.forEach(function(c, j) { o[c] = r[j]; });
        if (o[def.chave] === "" || o[def.chave] === null) return;
        var m = _mapearHist(def.aba, o, tz);
        if (m) objs.push(m);
      });
      _enviarLotes(def.tabela, objs, def.conflito, def.atualizar ? "merge-duplicates" : "ignore-duplicates");
      est.total += objs.length;
      est.linha += n;
      props.setProperty("HIST_ESTADO", JSON.stringify(est));
    }
    _registrar("historico", def.aba + ": até a linha " + ultima, est.total);
    est.t++; est.linha = 2;
    props.setProperty("HIST_ESTADO", JSON.stringify(est));
  }
  props.deleteProperty("HIST_ESTADO");
  _registrar("historico", "Histórico completo enviado", est.total);
  Logger.log("✅ Histórico enviado: " + est.total + " linhas");
}

// envia vários lotes em paralelo
function _enviarLotes(tabela, linhas, conflito, resolucao) {
  if (!linhas.length) return;
  var modo = resolucao === "ignore-duplicates" ? "ignorar" : "merge";
  var reqs = [];
  for (var i = 0; i < linhas.length; i += 1000) reqs.push(_reqIngerir(tabela, linhas.slice(i, i + 1000), modo));
  for (var k = 0; k < reqs.length; k += 5) {
    var grupo = reqs.slice(k, k + 5);
    UrlFetchApp.fetchAll(grupo).forEach(function(r, j) {
      if (r.getResponseCode() >= 300) {
        var r2 = UrlFetchApp.fetch(grupo[j].url, grupo[j]);   // tenta de novo uma vez
        if (r2.getResponseCode() >= 300) throw new Error("Supabase (" + tabela + ") HTTP " + r2.getResponseCode() + ": " + r2.getContentText().substring(0, 300));
      }
    });
  }
}

function _apagarSupabase(tabela) {
  var resp = UrlFetchApp.fetch(CONFIG.supabaseUrl + "/rest/v1/rpc/ingerir", _reqIngerir(tabela, { loja: CONFIG.lojaDash }, "apagar"));
  if (resp.getResponseCode() >= 300) throw new Error("Apagar " + tabela + ": " + resp.getContentText().substring(0, 300));
}

function _apagarGatilho(nome) {
  ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === nome) ScriptApp.deleteTrigger(t); });
}

function _mapearHist(aba, o, tz) {
  var L = CONFIG.lojaDash;
  var dia = function(v) {
    if (v instanceof Date) return Utilities.formatDate(v, tz, "yyyy-MM-dd");
    var s = String(v || "").trim();
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return m[1] + "-" + m[2] + "-" + m[3];
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s); if (m) return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
    return null;
  };
  var hora = function(v) {
    if (v instanceof Date) return Utilities.formatDate(v, tz, "HH:mm");
    var s = String(v || "").trim(); return s || null;
  };
  var num = function(v) { if (v === "" || v === null) return null; var x = Number(v); return isNaN(x) ? null : x; };
  var z = function(v) { return num(v) || 0; };
  var int = function(v) { var x = num(v); return x === null ? null : Math.round(x); };
  var t = function(v) { if (v === "" || v === null || v === undefined) return null; return String(v).trim() || null; };

  if (aba === "Vendas") return {
    chave_venda: t(o.ChaveVenda), loja: L, dia: dia(o.DiaOperacao), canal: t(o.Canal), status_venda: int(o.StatusVenda),
    status: t(o.Status), numero_cupom: t(o.NumeroCupom), numero_nota: t(o.NumeroNota), modelo_fiscal: t(o.ModeloFiscal),
    mesa: t(o.Mesa), qtd_pessoas: num(o.QtdPessoas), operador: t(o.Operador), garcons: t(o.Garcons),
    caixa_numero: t(o.CaixaNumero), caixa_fechamento: t(o.CaixaFechamento), cliente: t(o.Cliente),
    valor_itens: z(o.ValorItens), valor_servico: z(o.ValorServico), valor_total: z(o.ValorTotal),
    descontos: z(o.Descontos), valor_troco: z(o.ValorTroco), data_integracao: t(o.DataIntegracao), fonte: t(o.Fonte) };
  if (aba === "Pagamentos") return {
    chave_pagto: t(o.ChavePagto), chave_venda: t(o.ChaveVenda), loja: L, dia: dia(o.DiaOperacao), status_venda: int(o.StatusVenda),
    descricao: t(o.Descricao), forma: t(o.Forma), bandeira: t(o.Bandeira), maquininha: t(o.Maquininha),
    valor: z(o.Valor), fonte: t(o.Fonte) };
  if (aba === "Itens") return {
    chave_item: t(o.ChaveItem), chave_venda: t(o.ChaveVenda), loja: L, dia: dia(o.DiaOperacao), canal: t(o.Canal),
    status_venda: int(o.StatusVenda), codigo_produto: int(o.CodigoProduto), produto: t(o.Produto), subgrupo: t(o.SubGrupo),
    quantidade: z(o.Quantidade), valor_unitario: z(o.ValorUnitario), desconto: z(o.Desconto), acrescimo: z(o.Acrescimo),
    valor_total: z(o.ValorTotal), hora: hora(o.HoraLancamento), garcom: t(o.Garcom) };
  if (aba === "Produtos") {
    if (!t(o.Produto)) return null;
    var local = String(o.LocalImpressao || "").replace(/,+$/, "").trim();
    var auto = local.toUpperCase().indexOf("COZINHA") >= 0;
    return { loja: L, codigo: int(o.CodigoProduto), produto: t(o.Produto), grupo: t(o.Grupo), subgrupo: t(o.SubGrupo),
      canal: t(o.Canal), local_impressao: local || null, preco_venda: num(o.PrecoVenda),
      ativo: String(o.AtivoNoCardapio).trim() !== "NÃO", cozinha_auto: auto,
      cozinha_manual: (String(o.Cozinha).trim() === "SIM" && !auto) ? true : null,
      observacao: t(o.Observacao), custo_ficha: num(o.CustoFicha) };
  }
  if (aba === "Fichas_Tecnicas") return {
    loja: L, codigo_composto: int(o.CodigoComposto), composto: t(o.Composto), codigo_insumo: int(o.CodigoInsumo),
    insumo: t(o.Insumo), qtd: num(o.Qtd), un: t(o.Un), custo: num(o.Custo), valor: num(o.Valor) };
  if (aba === "Fichas_Insumos") return {
    loja: L, codigo_produto: int(o.CodigoProduto), codigo_insumo: int(o.CodigoInsumo), insumo: t(o.Insumo),
    qtd_por_unidade: num(o.QtdPorUnidade), un: t(o.Un), custo_unit: num(o.CustoUnitInsumo), custo_no_prato: num(o.CustoNoPrato) };
  return null;
}


// ═════════════════════════════════════════════════════════════
//  CONTAS A PAGAR (TOTVS /api/Financeiro/ListContasPagar)
//  Busca de 120 dias atrás até 120 dias à frente, em blocos de 30 dias,
//  e atualiza no Supabase (pagas, em aberto, vencimentos).
// ═════════════════════════════════════════════════════════════
function buscarContasPagar() {
  try {
    _alerta("✅ Contas a pagar\n\n" + _sincronizarContasPagar().texto);
  } catch (e) {
    _alerta("❌ Contas a pagar — a TOTVS respondeu com erro:\n\n" + e.message);
  }
}

function _sincronizarContasPagar() {
  var hoje = new Date();
  var ini = new Date(hoje); ini.setDate(ini.getDate() - 120);
  var fim = new Date(hoje); fim.setDate(fim.getDate() + 120);
  var total = 0, vistos = {};
  for (var d = new Date(ini); d <= fim; d.setDate(d.getDate() + 30)) {
    var a = _fmtData(d);
    var b = new Date(d); b.setDate(b.getDate() + 29); if (b > fim) b = fim;
    var lista = _contasPagarAPI(a, _fmtData(b));
    var linhas = [];
    lista.forEach(function(c) {
      if (c.NumeroControle === null || c.NumeroControle === undefined || vistos[c.NumeroControle]) return;
      vistos[c.NumeroControle] = true;
      linhas.push(_mapearContaPagar(c));
    });
    for (var i = 0; i < linhas.length; i += 500) {
      var resp = UrlFetchApp.fetch(CONFIG.supabaseUrl + "/rest/v1/rpc/ingerir_contas_pagar", {
        method: "post", contentType: "application/json", muteHttpExceptions: true, headers: { apikey: CONFIG.supabaseChave },
        payload: JSON.stringify({ p_token: CONFIG.tokenIntegracao, p_linhas: linhas.slice(i, i + 500) }),
      });
      if (resp.getResponseCode() >= 300) throw new Error("Supabase (contas a pagar): " + resp.getContentText().substring(0, 300));
    }
    total += linhas.length;
    Utilities.sleep(1500);
  }
  _registrar("contas-pagar", _fmtData(ini) + " a " + _fmtData(fim), total);
  return { texto: total + " contas atualizadas (" + _fmtData(ini) + " a " + _fmtData(fim) + ")." };
}

function _contasPagarAPI(ini, fim) {
  var url = CONFIG.urlServidor + "/api/Financeiro/ListContasPagar" +
    "?requisicao.token="       + encodeURIComponent(_gerarToken()) +
    "&requisicao.codigoLoja="  + encodeURIComponent(CONFIG.codigoLoja) +
    "&requisicao.dataInicial=" + encodeURIComponent(ini + "T00:00:00") +
    "&requisicao.dataFinal="   + encodeURIComponent(fim + "T23:59:59");
  var resp = UrlFetchApp.fetch(url, { method: "get", muteHttpExceptions: true });
  var txt = resp.getContentText(), json;
  try { json = JSON.parse(txt); } catch (e) { throw new Error("HTTP " + resp.getResponseCode() + ": " + txt.substring(0, 200)); }
  if (!json.Sucesso) {
    var msg = (json.Erros && json.Erros[0]) ? json.Erros[0].DescricaoErro : txt.substring(0, 200);
    throw new Error(ini + " a " + fim + ": " + msg);
  }
  return json.ContasPagar || [];
}

function _mapearContaPagar(c) {
  var d = function(v) { return v ? String(v).substring(0, 10) : null; };
  var t = function(v) { return v === null || v === undefined || v === "" ? null : String(v).trim() || null; };
  var b = function(v) { return v === null || v === undefined ? null : !!v; };
  var n = function(v) { var x = Number(v); return v === null || v === undefined || isNaN(x) ? null : x; };
  return {
    loja: CONFIG.lojaDash, numero_controle: Number(c.NumeroControle), credor: t(c.Credor), cnpj: t(c.CNPJ),
    valor: n(c.Valor), plano1: t(c.PlanoContas1), plano2: t(c.PlanoContas2), historico: t(c.Historico1),
    pago: b(c.Pago), data_pagamento: d(c.DataPagamento), valor_pagamento: n(c.ValorPagamento), banco_pagamento: t(c.BancoPagamento),
    data_vencimento: d(c.DataVencimento), data_emissao: d(c.DataEmissao), data_competencia: d(c.DataCompetencia),
    data_registro: t(c.DataRegistro), data_atualizacao: t(c.DataAtualizacao), operador: t(c.Operador),
    codigo_barras: t(c.CodigoBarras), compra: b(c.Compra), investimento: b(c.Investimento), frete: b(c.Frete),
    deletado: b(c.Deletado),
  };
}
