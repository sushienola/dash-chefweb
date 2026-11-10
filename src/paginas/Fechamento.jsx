import { useMemo, useState } from 'react'
import { sb, rpcAll, iso, R0, R, N, P, soma, agrupar, COR_SETOR, COR_CANAL, FERIADOS, ordenarSetores } from '../lib'
import { useDados, Estado, Card, Tabela, Kpi, Aviso } from '../ui'

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const nomeMes = (m) => { const [y, mm] = m.split('-').map(Number); return MESES[mm - 1] + ' de ' + y }
const limites = (m) => { const [y, mm] = m.split('-').map(Number); return { ini: iso(new Date(y, mm - 1, 1)), fim: iso(new Date(y, mm, 0)) } }
const mesAnterior = (m) => { const [y, mm] = m.split('-').map(Number); const d = new Date(y, mm - 2, 1); return iso(d).slice(0, 7) }
const delta = (a, b) => (b ? a / b - 1 : null)
const Teorico = () => <span className="tag" title="Calculado pelas fichas técnicas (custo atual dos insumos), não pelo estoque real">teórico</span>

function grupoCategoria(c) {
  const s = String(c || '').toUpperCase()
  if (s.startsWith('BEBIDA')) return 'Bebidas'
  if (s.startsWith('ALIMENTO')) return 'Alimentos'
  if (s.startsWith('EMBALAG')) return 'Embalagens'
  if (s.includes('LIMPEZA') || s.includes('OPERACIONAL') || s.includes('HIGIENE')) return 'Operacional e limpeza'
  return 'Outros'
}

async function carregar(loja, mes) {
  const { ini, fim } = limites(mes)
  const ant = limites(mesAnterior(mes))
  const a = { p_loja: loja, p_ini: ini, p_fim: fim }
  const [dia, diaAnt, turno, setor, cmvt, rank, refs, compras] = await Promise.all([
    rpcAll('resumo_dia', a), rpcAll('resumo_dia', { p_loja: loja, p_ini: ant.ini, p_fim: ant.fim }),
    rpcAll('resumo_turno', a), rpcAll('itens_dia_setor', a), rpcAll('cmv_teorico_dia', a), rpcAll('itens_ranking', a),
    rpcAll('referencias_contagem', { p_loja: loja }), rpcAll('compras_resumo', a),
  ])
  const temIni = refs.some((r) => r.referencia === mesAnterior(mes)), temFim = refs.some((r) => r.referencia === mes)
  const cmvReal = temFim ? await rpcAll('cmv_real', { p_loja: loja, p_ref_ini: temIni ? mesAnterior(mes) : '-', p_ref_fim: mes, p_ini: ini, p_fim: fim }) : []
  return { dia, diaAnt, turno, setor, cmvt, rank, temIni, temFim, compras, cmvReal }
}

function montar(d, mes) {
  const k = (rows) => {
    const fat = soma(rows, 'valor_total'), vendas = soma(rows, 'vendas')
    const loj = rows.filter((r) => r.canal === 'Loja'), pessoas = soma(loj, 'pessoas')
    return { fat, vendas, pessoas, ticket: vendas ? fat / vendas : 0, servico: soma(rows, 'valor_servico'),
      porPessoa: pessoas ? soma(loj, 'valor_total') / pessoas : 0, dias: new Set(rows.map((r) => r.dia)).size }
  }
  const at = k(d.dia), an = k(d.diaAnt)
  const canais = agrupar(d.dia, 'canal', ['valor_total']).sort((x, y) => y.valor_total - x.valor_total)
  const turnos = agrupar(d.turno, 'turno', ['valor_total', 'vendas'])
  const setores = ordenarSetores(d.setor.map((r) => r.setor)).map((s) => ({ s, qtd: soma(d.setor.filter((r) => r.setor === s), 'qtd'), valor: soma(d.setor.filter((r) => r.setor === s), 'valor') }))
  const fatItens = soma(d.cmvt, 'faturamento'), fatFicha = soma(d.cmvt, 'faturamento_com_ficha'), custoT = soma(d.cmvt, 'custo_teorico')
  const fatBeb = soma(d.rank.filter((r) => String(r.grupo || '').includes('BEBIDA')), 'valor')
  const fatAli = soma(d.rank, 'valor') - fatBeb
  const grupos = ['Alimentos', 'Bebidas', 'Embalagens', 'Operacional e limpeza', 'Outros'].map((g) => {
    const ls = d.cmvReal.filter((c) => grupoCategoria(c.categoria) === g)
    const cmv = soma(ls, 'cmv'), fat = g === 'Alimentos' ? fatAli : g === 'Bebidas' ? fatBeb : null
    return { chave: g, ei: soma(ls, 'estoque_inicial'), co: soma(ls, 'compras'), ef: soma(ls, 'estoque_final'), cmv, fat, pct: fat ? cmv / fat : null }
  }).filter((g) => g.ei || g.co || g.ef)
  const comprasMes = soma(d.compras, 'valor')
  const { ini, fim } = limites(mes)
  const feriados = Object.keys(FERIADOS).filter((f) => f >= ini && f <= fim).map((f) => FERIADOS[f])
  return {
    mes, at, an, canais, turnos, setores, fatItens, fatFicha, custoT, cmvTeorico: fatFicha ? custoT / fatFicha : null,
    cobertura: fatItens ? fatFicha / fatItens : 0, grupos, cmvRealTot: soma(grupos, 'cmv'), fatAli, fatBeb,
    temIni: d.temIni, temFim: d.temFim, comprasMes, feriados,
  }
}

export default function Fechamento({ loja }) {
  const hoje = new Date()
  const padrao = iso(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)).slice(0, 7)
  const [mes, setMes] = useState(padrao)
  const [versao, setVersao] = useState(0)
  const [msg, setMsg] = useState(null)
  const meses = useMemo(() => Array.from({ length: 12 }, (_, i) => iso(new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)).slice(0, 7)), []) // eslint-disable-line react-hooks/exhaustive-deps

  const st = useDados(() => carregar(loja, mes), [loja, mes])
  const salvos = useDados(async () => {
    const { data, error } = await sb.from('fechamentos').select('id, mes, gravado_em, dados').eq('loja', loja).order('gravado_em', { ascending: false }).limit(24)
    if (error) throw error
    return data
  }, [loja, versao])

  const f = useMemo(() => (st.dados ? montar(st.dados, mes) : null), [st.dados, mes])
  const jaGravado = (salvos.dados || []).find((s) => s.mes === mes)
  const { fim } = limites(mes)
  const mesFechado = fim < iso(hoje)

  async function gravar() {
    setMsg(null)
    const { error } = await sb.from('fechamentos').insert({ loja, mes, dados: f })
    if (error) setMsg({ erro: true, t: 'Erro ao gravar: ' + error.message })
    else { setMsg({ t: 'Fechamento de ' + nomeMes(mes) + ' gravado.' }); setVersao((v) => v + 1) }
  }

  return (
    <>
      <div className="barra-filtros fech-acoes">
        <label>Mês
          <select value={mes} onChange={(e) => setMes(e.target.value)}>
            {meses.map((m) => <option key={m} value={m}>{nomeMes(m)}</option>)}
          </select>
        </label>
        <button className="btn prim" onClick={gravar} disabled={!f}>{jaGravado ? 'Gravar de novo' : 'Gravar fechamento'}</button>
        <button className="btn" onClick={() => window.print()}>Imprimir / PDF</button>
        {jaGravado && <span className="tag verde">gravado em {new Date(jaGravado.gravado_em).toLocaleDateString('pt-BR')}</span>}
      </div>
      {msg && <Aviso tipo={msg.erro ? 'erro' : 'ok'}>{msg.t}</Aviso>}
      {!mesFechado && <Aviso>{nomeMes(mes)} ainda não terminou: os números são parciais.</Aviso>}

      <Estado st={st}>
        {f && (
          <div className="fechamento">
            <div className="fech-cab">
              <div className="sobre">Fechamento</div>
              <h2 className="serif">{nomeMes(mes).replace(/^./, (c) => c.toUpperCase())}</h2>
              {f.feriados.length > 0 && <p className="muted pequeno">Feriados no mês: {f.feriados.join(', ')}</p>}
            </div>

            <Card titulo="Vendas" ico="▤">
              <div className="kpis">
                <Kpi titulo="Faturamento" valor={R0(f.at.fat)} delta={delta(f.at.fat, f.an.fat)} sub="vs mês anterior" />
                <Kpi titulo="Vendas / mesas" valor={N(f.at.vendas)} delta={delta(f.at.vendas, f.an.vendas)} />
                <Kpi titulo="Ticket médio" valor={R(f.at.ticket)} delta={delta(f.at.ticket, f.an.ticket)} />
                <Kpi titulo="Pessoas no salão" valor={N(f.at.pessoas)} delta={delta(f.at.pessoas, f.an.pessoas)} />
                <Kpi titulo="Gasto por pessoa" valor={R(f.at.porPessoa)} delta={delta(f.at.porPessoa, f.an.porPessoa)} />
                <Kpi titulo="Serviço (10%)" valor={R0(f.at.servico)} sub={f.at.dias + ' dias com venda'} />
              </div>
              <div className="grade2" style={{ marginTop: 14 }}>
                <Tabela colunas={[
                  { k: 'chave', t: 'Canal', f: (v) => <span className="tag" style={{ background: (COR_CANAL[v] || '#a08670') + '33', color: '#2a2118' }}>{v}</span> },
                  { k: 'valor_total', t: 'Faturamento', num: true, f: R0 },
                  { k: 'pct', t: '%', num: true, f: P },
                ]} linhas={f.canais.map((c) => ({ ...c, pct: c.valor_total / f.at.fat }))} />
                <Tabela colunas={[
                  { k: 'chave', t: 'Turno' },
                  { k: 'vendas', t: 'Vendas', num: true, f: N },
                  { k: 'valor_total', t: 'Faturamento', num: true, f: R0 },
                  { k: 'pct', t: '%', num: true, f: P },
                ]} linhas={f.turnos.map((c) => ({ ...c, pct: c.valor_total / f.at.fat }))} />
              </div>
            </Card>

            <Card titulo="Produção por setor" ico="❖">
              <Tabela colunas={[
                { k: 's', t: 'Setor', f: (v) => <span className="tag" style={{ background: COR_SETOR[v] + '2e', color: '#2a2118' }}>{v}</span> },
                { k: 'qtd', t: 'Itens', num: true, f: N },
                { k: 'valor', t: 'Vendido', num: true, f: R0 },
                { k: 'pct', t: '%', num: true, f: P },
              ]} linhas={f.setores.map((s) => ({ ...s, chave: s.s, pct: s.valor / (soma(f.setores, 'valor') || 1) }))} />
            </Card>

            <Card titulo={<>CMV pelas fichas <Teorico /></>} ico="%">
              <div className="kpis">
                <Kpi titulo="CMV teórico" valor={P(f.cmvTeorico)} sub="sobre itens com ficha" />
                <Kpi titulo="Custo teórico" valor={R0(f.custoT)} />
                <Kpi titulo="Cobertura das fichas" valor={P(f.cobertura)} sub="do faturamento de itens" />
              </div>
            </Card>

            <Card titulo="CMV real (estoque + compras)" ico="▦">
              {!f.temFim ? (
                <Aviso>Falta a <b>contagem de {nomeMes(mes)}</b> para calcular o CMV real. Suba a planilha de contagem em Importar arquivos.</Aviso>
              ) : (
                <>
                  {!f.temIni && <Aviso>Sem a contagem de {nomeMes(mesAnterior(mes))}: o estoque inicial foi considerado zero.</Aviso>}
                  {!f.comprasMes && <Aviso>Nenhuma compra importada em {nomeMes(mes)}. Suba o R016 em Importar arquivos.</Aviso>}
                  <div className="kpis">
                    <Kpi titulo="CMV real" valor={R0(f.cmvRealTot)} />
                    <Kpi titulo="CMV % geral" valor={P((f.fatAli + f.fatBeb) ? f.cmvRealTot / (f.fatAli + f.fatBeb) : null)} sub="sobre faturamento de itens" />
                    <Kpi titulo="Compras do mês" valor={R0(f.comprasMes)} />
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <Tabela colunas={[
                      { k: 'chave', t: 'Grupo' },
                      { k: 'ei', t: 'Estoque inicial', num: true, f: R0 },
                      { k: 'co', t: 'Compras', num: true, f: R0 },
                      { k: 'ef', t: 'Estoque final', num: true, f: R0 },
                      { k: 'cmv', t: 'CMV', num: true, f: R0 },
                      { k: 'fat', t: 'Faturamento', num: true, f: (v) => (v == null ? '—' : R0(v)) },
                      { k: 'pct', t: 'CMV %', num: true, f: P },
                    ]} linhas={f.grupos} />
                  </div>
                </>
              )}
            </Card>
          </div>
        )}
      </Estado>

      <Card titulo="Fechamentos gravados" ico="↺">
        <Estado st={salvos}>
          <Tabela onClick={(l) => setMes(l.mes)} colunas={[
            { k: 'mes', t: 'Mês', f: nomeMes },
            { k: 'gravado_em', t: 'Gravado em', f: (v) => new Date(v).toLocaleString('pt-BR') },
            { k: 'fat', t: 'Faturamento', num: true, f: R0 },
            { k: 'cmvt', t: <>CMV <Teorico /></>, num: true, f: P },
            { k: 'cmvr', t: 'CMV real', num: true, f: (v) => (v ? R0(v) : '—') },
          ]} linhas={(salvos.dados || []).map((s) => ({ ...s, chave: s.id, fat: s.dados?.at?.fat, cmvt: s.dados?.cmvTeorico, cmvr: s.dados?.cmvRealTot }))} />
        </Estado>
      </Card>
    </>
  )
}
