import { useMemo, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { selectAll, R, R0, N2, P, kR, br, brCurto, diaSemana, soma, agrupar, COR_GRADE } from '../lib'
import { useDados, Estado, Card, Tabela, Kpi, Abas, Aviso, tooltipStyle } from '../ui'

export default function Compras({ loja, ini, fim }) {
  const [aba, setAba] = useState('dia')
  const [busca, setBusca] = useState('')
  const [dia, setDia] = useState(null)
  const [prod, setProd] = useState(null)
  const st = useDados(() => selectAll('compras', (q) => q.eq('loja', loja).gte('data', ini).lte('data', fim).order('data')), [loja, ini, fim])

  const calc = useMemo(() => {
    if (!st.dados) return null
    const b = busca.trim().toUpperCase()
    const rows = st.dados.filter((r) => !b || String(r.produto).toUpperCase().includes(b) || String(r.fornecedor).toUpperCase().includes(b))
      .map((r) => ({ ...r, valor: Number(r.valor) || 0, qtde: Number(r.qtde) || 0, unit: r.qtde ? Number(r.valor) / Number(r.qtde) : null }))
    const tot = soma(rows, 'valor')

    // por dia
    const pd = new Map()
    rows.forEach((r) => {
      const o = pd.get(r.data) || { chave: r.data, data: r.data, valor: 0, lanc: 0, forn: new Set() }
      o.valor += r.valor; o.lanc++; o.forn.add(r.fornecedor); pd.set(r.data, o)
    })
    const dias = [...pd.values()].map((o) => ({ ...o, nforn: o.forn.size, sem: diaSemana(o.data) }))

    // por fornecedor
    const forn = agrupar(rows, 'fornecedor', ['valor']).map((f) => ({ ...f, lanc: rows.filter((r) => r.fornecedor === f.chave).length, pct: f.valor / tot }))
      .sort((a, b) => b.valor - a.valor)

    // variação de preço por produto (preço unitário = valor ÷ quantidade de cada compra)
    const pp = new Map()
    rows.forEach((r) => {
      if (!r.unit) return
      const o = pp.get(r.codigo) || { chave: r.codigo, codigo: r.codigo, produto: r.produto, un: r.un, compras: [] }
      o.compras.push(r); pp.set(r.codigo, o)
    })
    const precos = [...pp.values()].map((o) => {
      const c = o.compras.sort((a, b) => a.data.localeCompare(b.data))
      const us = c.map((x) => x.unit)
      const qt = soma(c, 'qtde'), vl = soma(c, 'valor')
      const prim = us[0], ult = us[us.length - 1]
      return { ...o, n: c.length, min: Math.min(...us), max: Math.max(...us), medio: qt ? vl / qt : 0, primeiro: prim, ultimo: ult,
        variacao: prim ? ult / prim - 1 : null, amplitude: Math.min(...us) ? Math.max(...us) / Math.min(...us) - 1 : null,
        valor: vl, qtde: qt, nforn: new Set(c.map((x) => x.fornecedor)).size }
    })
    return { rows, tot, dias, forn, precos, n: rows.length }
  }, [st.dados, busca])

  const detDia = calc && dia ? calc.rows.filter((r) => r.data === dia).map((r, i) => ({ ...r, chave: i })) : []
  const detProd = calc && prod ? (calc.precos.find((p) => p.codigo === prod) || {}) : null

  return (
    <Estado st={st}>
      {calc && (
        <>
          {!st.dados.length && <Aviso>Nenhuma compra neste período. Suba o relatório R016 em <b>Importar arquivos</b>.</Aviso>}
          <div className="kpis">
            <Kpi titulo="Total comprado" valor={R0(calc.tot)} />
            <Kpi titulo="Lançamentos" valor={N2(calc.n)} />
            <Kpi titulo="Dias com compra" valor={N2(calc.dias.length)} sub={'média ' + R0(calc.dias.length ? calc.tot / calc.dias.length : 0) + '/dia'} />
            <Kpi titulo="Fornecedores" valor={N2(calc.forn.length)} />
            <Kpi titulo="Produtos com preço subindo" valor={N2(calc.precos.filter((p) => p.variacao > 0.02).length)} sub="mais de 2% no período" />
          </div>
          <div className="barra-filtros">
            <Abas ativa={aba} onChange={setAba} abas={[
              { id: 'dia', nome: 'Histórico diário' }, { id: 'preco', nome: 'Variação de preço' }, { id: 'forn', nome: 'Por fornecedor' },
            ]} />
            <input placeholder="Buscar produto ou fornecedor" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>

          {aba === 'dia' && (
            <>
              <Card titulo="Compras por dia" ico="▥">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={calc.dias} onClick={(e) => e?.activeLabel && setDia(e.activeLabel)}>
                    <CartesianGrid vertical={false} stroke={COR_GRADE} />
                    <XAxis dataKey="data" tickFormatter={brCurto} fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={kR} fontSize={11} width={70} tickLine={false} axisLine={false} />
                    <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(142,91,214,.06)' }} formatter={(v) => R(v)} labelFormatter={(s) => br(s) + ' (' + diaSemana(s) + ')'} />
                    <Bar dataKey="valor" name="Comprado" fill="#c9b2ef" radius={[6, 6, 0, 0]} style={{ cursor: 'pointer' }} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
              {dia && (
                <Card titulo={'Compras de ' + br(dia)} ico="↓" extra={<button className="link" onClick={() => setDia(null)}>fechar</button>}>
                  <Tabela colunas={[
                    { k: 'fornecedor', t: 'Fornecedor' },
                    { k: 'produto', t: 'Produto' },
                    { k: 'qtde', t: 'Qtd', num: true, f: N2 },
                    { k: 'un', t: 'Un' },
                    { k: 'unit', t: 'Preço un.', num: true, f: (v) => (v == null ? '—' : R(v)) },
                    { k: 'valor', t: 'Valor', num: true, f: R },
                  ]} linhas={detDia} rodape={{ fornecedor: 'Total', valor: R(soma(detDia, 'valor')) }} />
                </Card>
              )}
              <Card titulo="Dia a dia" ico="▤" extra={<span className="muted pequeno">clique num dia para ver o que foi comprado</span>}>
                <Tabela ordemInicial={{ k: 'data', asc: false }} onClick={(l) => setDia(l.data)} selecionado={dia} colunas={[
                  { k: 'data', t: 'Dia', f: (v, l) => br(v) + ' ' + l.sem },
                  { k: 'lanc', t: 'Lançamentos', num: true },
                  { k: 'nforn', t: 'Fornecedores', num: true },
                  { k: 'valor', t: 'Valor', num: true, f: R0 },
                ]} linhas={calc.dias} />
              </Card>
            </>
          )}

          {aba === 'preco' && (
            <>
              {detProd && detProd.compras && (
                <Card titulo={'Preço de ' + detProd.produto + ' (' + (detProd.un || '') + ')'} ico="↗" extra={<button className="link" onClick={() => setProd(null)}>fechar</button>}>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={detProd.compras}>
                      <CartesianGrid vertical={false} stroke={COR_GRADE} />
                      <XAxis dataKey="data" tickFormatter={brCurto} fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis tickFormatter={(v) => 'R$ ' + v.toFixed(2).replace('.', ',')} fontSize={11} width={80} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                      <Tooltip {...tooltipStyle} formatter={(v) => R(v)}
                        labelFormatter={(s, p) => br(s) + ' · ' + (p?.[0]?.payload?.fornecedor || '')} />
                      <Line dataKey="unit" name="Preço unitário" stroke="#8e5bd6" strokeWidth={2.5} dot={{ r: 4, fill: '#8e5bd6' }} />
                    </LineChart>
                  </ResponsiveContainer>
                  <Tabela colunas={[
                    { k: 'data', t: 'Dia', f: br },
                    { k: 'fornecedor', t: 'Fornecedor' },
                    { k: 'qtde', t: 'Qtd', num: true, f: N2 },
                    { k: 'unit', t: 'Preço un.', num: true, f: R },
                    { k: 'valor', t: 'Valor', num: true, f: R },
                  ]} linhas={detProd.compras.map((c, i) => ({ ...c, chave: i }))} />
                </Card>
              )}
              <Card titulo="Variação de preço por produto" ico="%" extra={<span className="muted pequeno">clique num produto para ver o histórico</span>}>
                <Aviso>Preço unitário = valor da compra ÷ quantidade, na unidade do relatório. Variação = último preço comparado ao primeiro do período.</Aviso>
                <Tabela ordemInicial={{ k: 'valor', asc: false }} onClick={(l) => setProd(l.codigo)} selecionado={prod} colunas={[
                  { k: 'produto', t: 'Produto' },
                  { k: 'un', t: 'Un' },
                  { k: 'n', t: 'Compras', num: true },
                  { k: 'primeiro', t: 'Primeiro', num: true, f: R },
                  { k: 'ultimo', t: 'Último', num: true, f: R },
                  { k: 'min', t: 'Mín.', num: true, f: R },
                  { k: 'max', t: 'Máx.', num: true, f: R },
                  { k: 'variacao', t: 'Variação', num: true, f: (v) => (v == null ? '—' : <span className={'pill ' + (v > 0.005 ? 'down' : v < -0.005 ? 'up' : '')}>{(v > 0 ? '+' : '') + P(v)}</span>) },
                  { k: 'valor', t: 'Total', num: true, f: R0 },
                  { k: 'nforn', t: 'Fornec.', num: true },
                ]} linhas={calc.precos} />
              </Card>
            </>
          )}

          {aba === 'forn' && (
            <Card>
              <Tabela colunas={[
                { k: 'chave', t: 'Fornecedor' },
                { k: 'lanc', t: 'Lançamentos', num: true },
                { k: 'valor', t: 'Valor', num: true, f: R0 },
                { k: 'pct', t: '%', num: true, f: P },
              ]} linhas={calc.forn} />
            </Card>
          )}
        </>
      )}
    </Estado>
  )
}
