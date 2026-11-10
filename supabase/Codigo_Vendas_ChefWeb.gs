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
//   2. Menu 🍣 ChefWeb → "🔑 Configurar chave do Supabase" e cole a chave secreta
//      (Supabase → Project Settings → API Keys → Secret key).
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
    .addItem("🔑 Configurar chave do Supabase", "configurarChave")
    .addItem("🔍 Ver campos que a API manda", "verCamposAPI")
    .addToUi();
}

function configurarChave() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt("Cole a chave SECRETA do Supabase\n(Project Settings → API Keys → Secret keys)", ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var k = r.getResponseText().trim();
  if (!k) return;
  PropertiesService.getScriptProperties().setProperty("SUPABASE_KEY", k);
  ui.alert("✅ Chave salva (fica guardada só neste projeto, fora do código).");
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
  _chaveSupabase(); // falha cedo se não estiver configurada
  var total = _diffDias(dataInicio, dataFim);
  if (total < 0) throw new Error("A data final é antes da inicial.");

  var cont = { vendas: 0, itens: 0, pag: 0 }, linhas = [];
  for (var d = 0; d <= total; d++) {
    var dia = _somarDias(dataInicio, d);
    var r = _montarDia(_chamarAPI(dia), dia);
    _enviarSupabase("vendas", r.vendas, "chave_venda");
    _enviarSupabase("itens", r.itens, "chave_item");
    _enviarSupabase("pagamentos", r.pag, "chave_pagto");
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
function _chaveSupabase() {
  var k = PropertiesService.getScriptProperties().getProperty("SUPABASE_KEY");
  if (!k) throw new Error("Chave do Supabase não configurada. Use o menu 🍣 ChefWeb → 🔑 Configurar chave do Supabase.");
  return k;
}

function _headersSupabase() {
  var k = _chaveSupabase();
  var h = { apikey: k, Prefer: "resolution=merge-duplicates,return=minimal" };
  if (k.indexOf("eyJ") === 0) h.Authorization = "Bearer " + k; // chave antiga (JWT service_role)
  return h;
}

function _enviarSupabase(tabela, linhas, conflito) {
  if (!linhas.length) return;
  var url = CONFIG.supabaseUrl + "/rest/v1/" + tabela + (conflito ? "?on_conflict=" + conflito : "");
  for (var i = 0; i < linhas.length; i += 500) {
    var lote = linhas.slice(i, i + 500);
    var resp = UrlFetchApp.fetch(url, {
      method: "post", contentType: "application/json", muteHttpExceptions: true,
      headers: _headersSupabase(), payload: JSON.stringify(lote),
    });
    var cod = resp.getResponseCode();
    if (cod >= 300) throw new Error("Supabase (" + tabela + ") HTTP " + cod + ": " + resp.getContentText().substring(0, 400));
  }
}

function _registrar(tipo, detalhes, linhas) {
  try {
    var resp = UrlFetchApp.fetch(CONFIG.supabaseUrl + "/rest/v1/importacoes", {
      method: "post", contentType: "application/json", muteHttpExceptions: true, headers: _headersSupabase(),
      payload: JSON.stringify({ tipo: tipo, arquivo: "Apps Script", loja: CONFIG.lojaDash,
        linhas: linhas, detalhes: detalhes, feito_por: "sync automático" }),
    });
    if (resp.getResponseCode() >= 300) Logger.log("Log não gravado: " + resp.getContentText());
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
