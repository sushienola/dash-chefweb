import * as XLSX from 'xlsx'
import { sb, selectAll } from './lib.js'

// ─────────────── leitura ───────────────
export async function lerArquivo(file) {
  const buf = await file.arrayBuffer()
  return XLSX.read(buf, { cellDates: false, dense: true })
}

const linhasDe = (ws) => XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false })
const limpo = (v) => (v == null ? '' : String(v).trim())

function achaCabecalho(rows, nomes, limite = 40) {
  for (let i = 0; i < Math.min(rows.length, limite); i++) {
    const r = (rows[i] || []).map(limpo)
    if (nomes.every((n) => r.includes(n))) {
      const idx = {}
      r.forEach((n, j) => { if (n && !(n in idx)) idx[n] = j })
      return { linha: i, idx }
    }
  }
  return null
}

function lojaDoTopo(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    for (const c of rows[i] || []) {
      const m = /Lojas?\s*:\s*(\d+)/i.exec(limpo(c))
      if (m) return Number(m[1])
    }
  }
  return null
}

function textoTopo(rows, rotulo) {
  const re = new RegExp(rotulo + '\\s*:\\s*(\\S+)', 'i')
  for (let i = 0; i < Math.min(rows.length, 15); i++)
    for (const c of rows[i] || []) { const m = re.exec(limpo(c)); if (m) return m[1] }
  return null
}

export function data(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') {
    // número de série do Excel (dias desde 30/12/1899); a fração é a hora
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v + 1e-7) * 86400000)
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0')
  }
  if (v instanceof Date) return v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0')
  const s = String(v).trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return m[1] + '-' + m[2] + '-' + m[3]
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s)
  if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0')
  return null
}

const n = (v) => {
  if (v == null || v === '') return null
  if (typeof v === 'number') return v
  const s = String(v).trim().replace(/\./g, '').replace(',', '.')
  const x = Number(s)
  return isFinite(x) ? x : null
}
const int = (v) => { const x = n(v); return x == null ? null : Math.round(x) }
const txt = (v) => {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v)
  return String(v).trim()
}

function canalDe(grupo) {
  const g = String(grupo || '').toUpperCase()
  if (g.includes('IFOOD')) return 'iFood'
  if (g.includes('RAPPI')) return 'Rappi'
  if (g.includes('SITE')) return 'Site'
  if (g.includes('LOJA')) return 'Loja'
  return null
}

// ─────────────── envio em lotes ───────────────
async function enviar(tabela, linhas, { upsert, onConflict, ignorar, progresso, rotulo }) {
  const LOTE = 500, PARALELO = 4
  let feitos = 0
  const lotes = []
  for (let i = 0; i < linhas.length; i += LOTE) lotes.push(linhas.slice(i, i + LOTE))
  for (let i = 0; i < lotes.length; i += PARALELO) {
    await Promise.all(lotes.slice(i, i + PARALELO).map(async (lote) => {
      for (let tentativa = 1; ; tentativa++) {
        const q = upsert
          ? sb.from(tabela).upsert(lote, { onConflict, ignoreDuplicates: !!ignorar })
          : sb.from(tabela).insert(lote)
        const { error } = await q
        if (!error) break
        if (tentativa >= 3) throw new Error(tabela + ': ' + error.message)
        await new Promise((r) => setTimeout(r, 1500 * tentativa))
      }
      feitos += lote.length
      if (progresso) progresso(rotulo || tabela, feitos, linhas.length)
    }))
  }
}

async function apagar(tabela, filtro) {
  let q = sb.from(tabela).delete()
  q = filtro(q)
  const { error } = await q
  if (error) throw new Error('Apagar ' + tabela + ': ' + error.message)
}

async function registrar(tipo, arquivo, loja, linhas, detalhes) {
  await sb.from('importacoes').insert({ tipo, arquivo, loja, linhas, detalhes })
}

// ─────────────── detecção ───────────────
export function detectar(wb) {
  const nomes = wb.SheetNames
  if (['Vendas', 'Itens', 'Pagamentos'].every((s) => nomes.includes(s))) {
    const r = linhasDe(wb.Sheets.Itens)
    if (achaCabecalho(r, ['ChaveItem', 'ChaveVenda'], 3)) return { tipo: 'historico', nome: 'Histórico reorganizado (planilha nova)' }
  }
  const contagens = []
  for (const s of nomes) {
    const rows = linhasDe(wb.Sheets[s])
    if (achaCabecalho(rows, ['CodigoProduto', 'LocalImpressao'])) return { tipo: 'r024', nome: 'R024 — Lista de Produtos', aba: s, loja: lojaDoTopo(rows) }
    if (achaCabecalho(rows, ['Composto', 'Produto', 'Qtd', 'Custo', 'Valor'])) return { tipo: 'r025', nome: 'R025 — Fichas técnicas (compostos)', aba: s, loja: lojaDoTopo(rows) }
    if (achaCabecalho(rows, ['Data', 'Codigo', 'Produto', 'Fornecedor', 'Qtde', 'Valor']))
      return { tipo: 'r016', nome: 'R016 — Compras de produtos', aba: s, loja: lojaDoTopo(rows),
        ini: data(textoTopo(rows, 'Data Inicial')), fim: data(textoTopo(rows, 'Data Final')) }
    const h = achaCabecalho(rows, ['Responsavel', 'Setor', 'Codigo', 'Produto'])
    if (h && 'Valor em Estoque (R$)' in h.idx) {
      const low = s.toLowerCase()
      const datas = rows.slice(h.linha + 1).map((r) => data(r[h.idx.Data])).filter(Boolean).sort()
      contagens.push({ aba: s, loja: low.includes('nola') ? 2 : low.includes('sushi') ? 1 : null, linhas: rows.length - h.linha - 1, de: datas[0], ate: datas[datas.length - 1] })
    }
  }
  if (contagens.length) {
    const de = contagens.map((c) => c.de).filter(Boolean).sort()[0]
    return { tipo: 'contagem', nome: 'Contagem / fechamento de estoque', contagens, referencia: de ? de.slice(0, 7) : '' }
  }
  return { tipo: null, nome: 'Formato não reconhecido' }
}

// ─────────────── importadores ───────────────
export async function importar(wb, det, { loja, referencia, arquivo, progresso, log }) {
  if (det.tipo === 'historico') return importarHistorico(wb, loja, arquivo, progresso, log)
  if (det.tipo === 'r024') return importarR024(wb, det, loja, arquivo, progresso, log)
  if (det.tipo === 'r025') return importarR025(wb, det, loja, arquivo, progresso, log)
  if (det.tipo === 'r016') return importarR016(wb, det, loja, arquivo, progresso, log)
  if (det.tipo === 'contagem') return importarContagem(wb, det, loja, referencia, arquivo, progresso, log)
  throw new Error('Formato não reconhecido')
}

function tabelaPorNome(wb, aba, obrig) {
  const rows = linhasDe(wb.Sheets[aba])
  const h = achaCabecalho(rows, obrig)
  if (!h) throw new Error('Aba ' + aba + ': cabeçalho não encontrado')
  const dados = rows.slice(h.linha + 1)
  // relatórios da TOTVS às vezes têm o título mesclado deslocado 1 coluna para a esquerda do dado
  const amostra = dados.slice(0, 50)
  const cheia = (j) => amostra.filter((r) => r[j] != null && r[j] !== '').length
  const cab = rows[h.linha]
  for (const k in h.idx) {
    const j = h.idx[k]
    if (cheia(j) * 10 < cheia(j + 1) && (cab[j + 1] == null || cab[j + 1] === '')) h.idx[k] = j + 1
  }
  return dados.map((r) => {
    const o = {}
    for (const k in h.idx) o[k] = r[h.idx[k]]
    return o
  })
}

async function importarHistorico(wb, loja, arquivo, progresso, log) {
  const V = tabelaPorNome(wb, 'Vendas', ['ChaveVenda', 'DiaOperacao']).filter((r) => r.ChaveVenda).map((r) => ({
    chave_venda: txt(r.ChaveVenda), loja, dia: data(r.DiaOperacao), canal: txt(r.Canal), status_venda: int(r.StatusVenda),
    status: txt(r.Status), numero_cupom: txt(r.NumeroCupom), numero_nota: txt(r.NumeroNota), modelo_fiscal: txt(r.ModeloFiscal),
    mesa: txt(r.Mesa), qtd_pessoas: n(r.QtdPessoas), operador: txt(r.Operador), garcons: txt(r.Garcons),
    caixa_numero: txt(r.CaixaNumero), caixa_fechamento: txt(r.CaixaFechamento), cliente: txt(r.Cliente),
    valor_itens: n(r.ValorItens) || 0, valor_servico: n(r.ValorServico) || 0, valor_total: n(r.ValorTotal) || 0,
    descontos: n(r.Descontos) || 0, valor_troco: n(r.ValorTroco) || 0, data_integracao: txt(r.DataIntegracao), fonte: txt(r.Fonte),
  }))
  log('Vendas: ' + V.length + ' linhas')
  await enviar('vendas', V, { upsert: true, onConflict: 'chave_venda', ignorar: true, progresso, rotulo: 'Vendas' })

  const P = tabelaPorNome(wb, 'Pagamentos', ['ChavePagto', 'ChaveVenda']).filter((r) => r.ChavePagto).map((r) => ({
    chave_pagto: txt(r.ChavePagto), chave_venda: txt(r.ChaveVenda), loja, dia: data(r.DiaOperacao), status_venda: int(r.StatusVenda),
    descricao: txt(r.Descricao), forma: txt(r.Forma), bandeira: txt(r.Bandeira), maquininha: txt(r.Maquininha),
    valor: n(r.Valor) || 0, fonte: txt(r.Fonte),
  }))
  log('Pagamentos: ' + P.length + ' linhas')
  await enviar('pagamentos', P, { upsert: true, onConflict: 'chave_pagto', ignorar: true, progresso, rotulo: 'Pagamentos' })

  const I = tabelaPorNome(wb, 'Itens', ['ChaveItem', 'ChaveVenda']).filter((r) => r.ChaveItem).map((r) => ({
    chave_item: txt(r.ChaveItem), chave_venda: txt(r.ChaveVenda), loja, dia: data(r.DiaOperacao), canal: txt(r.Canal),
    status_venda: int(r.StatusVenda), codigo_produto: int(r.CodigoProduto), produto: txt(r.Produto), subgrupo: txt(r.SubGrupo),
    quantidade: n(r.Quantidade) || 0, valor_unitario: n(r.ValorUnitario) || 0, desconto: n(r.Desconto) || 0,
    acrescimo: n(r.Acrescimo) || 0, valor_total: n(r.ValorTotal) || 0, hora: txt(r.HoraLancamento), garcom: txt(r.Garcom),
  }))
  log('Itens: ' + I.length + ' linhas')
  await enviar('itens', I, { upsert: true, onConflict: 'chave_item', ignorar: true, progresso, rotulo: 'Itens' })

  if (wb.SheetNames.includes('Produtos')) {
    const PR = tabelaPorNome(wb, 'Produtos', ['CodigoProduto', 'Produto']).filter((r) => int(r.CodigoProduto) != null && limpo(r.Produto)).map((r) => {
      const local = limpo(r.LocalImpressao).replace(/,+$/, '')
      const auto = local.toUpperCase().includes('COZINHA')
      return {
        loja, codigo: int(r.CodigoProduto), produto: txt(r.Produto), grupo: txt(r.Grupo), subgrupo: txt(r.SubGrupo),
        canal: txt(r.Canal), local_impressao: local || null, preco_venda: n(r.PrecoVenda), ativo: limpo(r.AtivoNoCardapio) !== 'NÃO',
        cozinha_auto: auto, cozinha_manual: limpo(r.Cozinha) === 'SIM' && !auto ? true : null,
        observacao: txt(r.Observacao), custo_ficha: n(r.CustoFicha),
      }
    })
    log('Produtos: ' + PR.length)
    await enviar('produtos', PR, { upsert: true, onConflict: 'loja,codigo', progresso, rotulo: 'Produtos' })
  }
  if (wb.SheetNames.includes('Fichas_Tecnicas')) {
    const F = tabelaPorNome(wb, 'Fichas_Tecnicas', ['CodigoComposto', 'CodigoInsumo']).filter((r) => int(r.CodigoComposto) != null).map((r) => ({
      loja, codigo_composto: int(r.CodigoComposto), composto: txt(r.Composto), codigo_insumo: int(r.CodigoInsumo),
      insumo: txt(r.Insumo), qtd: n(r.Qtd), un: txt(r.Un), custo: n(r.Custo), valor: n(r.Valor),
    }))
    await apagar('fichas', (q) => q.eq('loja', loja))
    await enviar('fichas', F, { progresso, rotulo: 'Fichas técnicas' })
  }
  if (wb.SheetNames.includes('Fichas_Insumos')) {
    const FI = tabelaPorNome(wb, 'Fichas_Insumos', ['CodigoProduto', 'CodigoInsumo']).filter((r) => int(r.CodigoProduto) != null).map((r) => ({
      loja, codigo_produto: int(r.CodigoProduto), codigo_insumo: int(r.CodigoInsumo), insumo: txt(r.Insumo),
      qtd_por_unidade: n(r.QtdPorUnidade), un: txt(r.Un), custo_unit: n(r.CustoUnitInsumo), custo_no_prato: n(r.CustoNoPrato),
    }))
    await apagar('fichas_insumos', (q) => q.eq('loja', loja))
    await enviar('fichas_insumos', FI, { upsert: true, onConflict: 'loja,codigo_produto,codigo_insumo', progresso, rotulo: 'Insumos por prato' })
  }
  await registrar('historico', arquivo, loja, V.length + I.length + P.length, `${V.length} vendas, ${I.length} itens, ${P.length} pagamentos`)
  return `${V.length} vendas, ${I.length} itens e ${P.length} pagamentos importados (o que já existia foi mantido).`
}

async function importarR024(wb, det, loja, arquivo, progresso, log) {
  const rows = tabelaPorNome(wb, det.aba, ['CodigoProduto', 'LocalImpressao'])
  const vistos = new Set()
  const P = rows.filter((r) => int(r.CodigoProduto) != null && limpo(r.NomeProduto)).map((r) => {
    const local = limpo(r.LocalImpressao).replace(/,+$/, '')
    return {
      loja, codigo: int(r.CodigoProduto), produto: txt(r.NomeProduto), grupo: txt(r.Grupo), subgrupo: txt(r.Subgrupo),
      canal: canalDe(r.Grupo), local_impressao: local || null, preco_venda: n(r.PrecoVenda), ativo: true,
      cozinha_auto: local.toUpperCase().includes('COZINHA'), atualizado_em: new Date().toISOString(),
    }
  }).filter((p) => (vistos.has(p.codigo) ? false : vistos.add(p.codigo)))
  log(P.length + ' produtos encontrados')
  await enviar('produtos', P, { upsert: true, onConflict: 'loja,codigo', progresso, rotulo: 'Produtos' })
  await sb.rpc('recalcular_custos', { p_loja: loja })   // aplica as fichas já importadas aos produtos
  await registrar('r024', arquivo, loja, P.length, '')
  return `${P.length} produtos atualizados. Ajustes manuais de "cozinha" foram mantidos.`
}

// explode as fichas até o ingrediente final, pelo VALOR (que é consistente entre níveis)
export function explodir(fichas) {
  const filhos = new Map(), lote = new Map()
  for (const f of fichas) {
    if (!filhos.has(f.codigo_composto)) filhos.set(f.codigo_composto, [])
    filhos.get(f.codigo_composto).push(f)
    lote.set(f.codigo_composto, (lote.get(f.codigo_composto) || 0) + (f.valor || 0))
  }
  const memo = new Map()
  const rec = (c, pilha) => {
    if (memo.has(c)) return memo.get(c)
    const out = new Map()
    for (const f of filhos.get(c) || []) {
      const v = f.valor || 0
      if (filhos.has(f.codigo_insumo) && !pilha.has(f.codigo_insumo) && lote.get(f.codigo_insumo) > 0) {
        const fator = v / lote.get(f.codigo_insumo)
        const sub = rec(f.codigo_insumo, new Set([...pilha, c]))
        for (const [k, x] of sub) {
          const a = out.get(k) || { ...x, valor: 0 }
          a.valor += fator * x.valor
          out.set(k, a)
        }
      } else {
        const a = out.get(f.codigo_insumo) || { insumo: f.insumo, un: f.un, custo: f.custo, valor: 0 }
        a.valor += v
        out.set(f.codigo_insumo, a)
      }
    }
    memo.set(c, out)
    return out
  }
  const res = []
  for (const c of filhos.keys())
    for (const [k, x] of rec(c, new Set()))
      res.push({ codigo_produto: c, codigo_insumo: k, insumo: x.insumo, un: x.un, custo_unit: x.custo,
        custo_no_prato: +x.valor.toFixed(6), qtd_por_unidade: x.custo ? +(x.valor / x.custo).toFixed(6) : 0 })
  return { res, lote }
}

async function importarR025(wb, det, loja, arquivo, progresso, log) {
  const rows = tabelaPorNome(wb, det.aba, ['Composto', 'Produto', 'Qtd', 'Custo', 'Valor'])
  const codKey = Object.keys(rows[0] || {}).find((k) => k.startsWith('C') && k.includes('digo')) || 'Código'
  const F = rows.filter((r) => limpo(r.Composto) && int(r[codKey]) != null).map((r) => {
    const s = limpo(r.Composto), i = s.indexOf(' - ')
    return {
      loja, codigo_composto: int(i > 0 ? s.slice(0, i) : s), composto: i > 0 ? s.slice(i + 3) : s,
      codigo_insumo: int(r[codKey]), insumo: txt(r.Produto), qtd: n(r.Qtd), un: txt(r.Un), custo: n(r.Custo), valor: n(r.Valor),
    }
  }).filter((f) => f.codigo_composto != null)
  log(F.length + ' linhas de ficha')
  const { res, lote } = explodir(F)
  await apagar('fichas', (q) => q.eq('loja', loja))
  await enviar('fichas', F, { progresso, rotulo: 'Fichas técnicas' })
  await apagar('fichas_insumos', (q) => q.eq('loja', loja))
  await enviar('fichas_insumos', res.map((r) => ({ ...r, loja })), { upsert: true, onConflict: 'loja,codigo_produto,codigo_insumo', progresso, rotulo: 'Insumos por prato' })

  const prods = await selectAll('produtos', (q) => q.eq('loja', loja))
  const custos = prods.map((p) => ({ loja, codigo: p.codigo, custo_ficha: lote.has(p.codigo) ? +lote.get(p.codigo).toFixed(4) : null }))
  await enviar('produtos', custos, { upsert: true, onConflict: 'loja,codigo', progresso, rotulo: 'Custo dos produtos' })
  await sb.rpc('recalcular_custos', { p_loja: loja })
  await registrar('r025', arquivo, loja, F.length, lote.size + ' compostos')
  return `${lote.size} fichas importadas e custo atualizado em ${custos.filter((c) => c.custo_ficha != null).length} produtos.`
}

async function importarR016(wb, det, loja, arquivo, progresso, log) {
  const rows = tabelaPorNome(wb, det.aba, ['Data', 'Codigo', 'Produto', 'Fornecedor', 'Qtde', 'Valor'])
  const C = rows.filter((r) => int(r.Codigo) != null && data(r.Data)).map((r) => ({
    loja, data: data(r.Data), codigo: int(r.Codigo), produto: txt(r.Produto), fornecedor: txt(r.Fornecedor),
    qtde: n(r.Qtde), un: txt(r.Un), valor: n(r.Valor), arquivo,
  }))
  if (!C.length) throw new Error('Nenhuma compra encontrada no arquivo')
  const datas = C.map((c) => c.data).sort()
  const ini = det.ini || datas[0], fim = det.fim || datas[datas.length - 1]
  log(`${C.length} compras de ${ini} a ${fim}`)
  await apagar('compras', (q) => q.eq('loja', loja).gte('data', ini).lte('data', fim))
  await enviar('compras', C, { progresso, rotulo: 'Compras' })
  await registrar('r016', arquivo, loja, C.length, ini + ' a ' + fim)
  return `${C.length} compras importadas (${ini} a ${fim}). Compras antigas desse período foram substituídas.`
}

async function importarContagem(wb, det, lojaPadrao, referencia, arquivo, progresso, log) {
  if (!/^\d{4}-\d{2}$/.test(referencia || '')) throw new Error('Informe o mês de referência no formato AAAA-MM')
  const msgs = []
  for (const c of det.contagens) {
    const loja = c.loja || lojaPadrao
    const rows = tabelaPorNome(wb, c.aba, ['Responsavel', 'Setor', 'Codigo', 'Produto'])
    const L = rows.filter((r) => limpo(r.Produto) && data(r.Data)).map((r) => ({
      loja, referencia, data: data(r.Data), enviado_em: limpo(r.EnviadoEm) || null, responsavel: txt(r.Responsavel),
      setor: txt(r.Setor), categoria: txt(r.Categoria), codigo: int(r.Codigo), produto: txt(r.Produto), unidade: txt(r.Unidade),
      qtd_contada: n(r['Qtd Contada (I+J)'] ?? r.qtd), un_cadastro: txt(r['Un Cadastro']),
      custo_un: n(r['Custo por Un Cadastro (R$)']), valor_estoque: n(r['Valor em Estoque (R$)']) || 0,
      categoria_cadastro: txt(r['Categoria (Cadastro)']), arquivo,
    }))
    log(`${c.aba}: ${L.length} itens → loja ${loja}`)
    await apagar('contagens', (q) => q.eq('loja', loja).eq('referencia', referencia))
    await enviar('contagens', L, { progresso, rotulo: 'Contagem ' + c.aba })
    await registrar('contagem', arquivo, loja, L.length, referencia + ' · ' + c.aba)
    msgs.push(`${c.aba}: ${L.length} itens`)
  }
  return `Contagem ${referencia} importada (${msgs.join('; ')}). Uma contagem anterior com a mesma referência foi substituída.`
}
