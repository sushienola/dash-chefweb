import { useMemo, useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'
import { rpcAll, R0, N, br, brCurto, diffDays, soma, CORES, COR_SETOR, COR_GRADE, ordenarSetores } from '../lib'
import { useDados, Estado, Card, Tabela, Abas, Aviso, tooltipStyle } from '../ui'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const rotulo = (p, grao) => (grao === 'mes' ? MESES[Number(p.slice(5, 7)) - 1] + '/' + p.slice(2, 4) : grao === 'semana' ? 'sem ' + brCurto(p) : brCurto(p))

export default function Pratos({ loja, ini, fim }) {
  const dias = diffDays(ini, fim) + 1
  const [grao, setGrao] = useState(dias > 120 ? 'mes' : dias > 35 ? 'semana' : 'dia')
  const [metrica, setMetrica] = useState('qtd')
  const [setor, setSetor] = useState('')
  const [sub, setSub] = useState('')
  const [busca, setBusca] = useState('')
  const [escolhidos, setEscolhidos] = useState(null)   // null = top 5 automático
  const [exportando, setExportando] = useState(false)

  const st = useDados(() => rpcAll('pratos_serie', { p_loja: loja, p_ini: ini, p_fim: fim, p_grao: grao }), [loja, ini, fim, grao])

  const calc = useMemo(() => {
    if (!st.dados) return null
    const rows = st.dados
    const periodos = [...new Set(rows.map((r) => r.periodo))].sort()
    const setores = ordenarSetores(rows.map((r) => r.setor))
    const subs = [...new Set(rows.map((r) => r.subgrupo).filter(Boolean))].sort()
    const b = busca.trim().toUpperCase()
    const prod = new Map()
    rows.forEach((r) => {
      if (setor && r.setor !== setor) return
      if (sub && r.subgrupo !== sub) return
      if (b && !String(r.produto).toUpperCase().includes(b) && String(r.codigo) !== b) return
      const o = prod.get(r.codigo) || { id: r.codigo, codigo: r.codigo, produto: r.produto, subgrupo: r.subgrupo, setor: r.setor, qtd: 0, valor: 0, serie: {} }
      o.qtd += Number(r.qtd); o.valor += Number(r.valor)
      const s = o.serie[r.periodo] || { qtd: 0, valor: 0 }
      s.qtd += Number(r.qtd); s.valor += Number(r.valor); o.serie[r.periodo] = s
      prod.set(r.codigo, o)
    })
    // tendência: média da 2ª metade dos períodos contra a 1ª metade
    const meio = Math.floor(periodos.length / 2)
    const lista = [...prod.values()].map((p) => {
      const v = (per) => (p.serie[per] || {})[metrica] || 0
      const a = periodos.slice(0, meio).reduce((x, per) => x + v(per), 0) / Math.max(meio, 1)
      const z = periodos.slice(meio).reduce((x, per) => x + v(per), 0) / Math.max(periodos.length - meio, 1)
      const ult = v(periodos[periodos.length - 1])
      return { ...p, tendencia: a ? z / a - 1 : null, ultimo: ult, media: (metrica === 'qtd' ? p.qtd : p.valor) / Math.max(periodos.length, 1) }
    }).sort((x, y) => y[metrica] - x[metrica])
    const tot = soma(lista, metrica)
    lista.forEach((p) => { p.pct = tot ? p[metrica] / tot : 0 })
    return { periodos, setores, subs, lista }
  }, [st.dados, setor, sub, busca, metrica])

  const noGrafico = useMemo(() => {
    if (!calc) return []
    const ids = escolhidos || calc.lista.slice(0, 5).map((p) => p.codigo)
    return ids.map((id) => calc.lista.find((p) => p.codigo === id)).filter(Boolean).slice(0, 10)
  }, [calc, escolhidos])

  const dadosGrafico = useMemo(() => {
    if (!calc) return []
    return calc.periodos.map((per) => {
      const o = { per }
      noGrafico.forEach((p) => { o[p.produto] = (p.serie[per] || {})[metrica] || 0 })
      return o
    })
  }, [calc, noGrafico, metrica])

  function alternar(p) {
    const atual = escolhidos || noGrafico.map((x) => x.codigo)
    setEscolhidos(atual.includes(p.codigo) ? atual.filter((c) => c !== p.codigo) : [...atual, p.codigo].slice(-10))
  }

  async function exportar() {
    setExportando(true)
    try {
      const XLSX = await import('xlsx')
      const nomeM = metrica === 'qtd' ? 'Quantidade' : 'Valor (R$)'
      const pivot = calc.lista.map((p) => {
        const o = { Código: p.codigo, Produto: p.produto, Subgrupo: p.subgrupo, Setor: p.setor }
        calc.periodos.forEach((per) => { o[rotulo(per, grao)] = Math.round(((p.serie[per] || {})[metrica] || 0) * 100) / 100 })
        o['Total ' + nomeM] = Math.round(p[metrica] * 100) / 100
        o['Tendência %'] = p.tendencia == null ? '' : Math.round(p.tendencia * 1000) / 10
        return o
      })
      const longo = []
      calc.lista.forEach((p) => calc.periodos.forEach((per) => {
        const s = p.serie[per]
        if (s) longo.push({ Período: per, Código: p.codigo, Produto: p.produto, Subgrupo: p.subgrupo, Setor: p.setor, Quantidade: s.qtd, 'Valor (R$)': Math.round(s.valor * 100) / 100 })
      }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pivot), 'Por ' + (grao === 'mes' ? 'mês' : grao))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(longo), 'Dados')
      XLSX.writeFile(wb, `pratos_${loja === 2 ? 'nola' : 'sushi'}_${ini}_a_${fim}.xlsx`)
    } finally {
      setExportando(false)
    }
  }

  const fmt = metrica === 'qtd' ? N : R0
  return (
    <Estado st={st}>
      {calc && (
        <>
          <div className="barra-filtros">
            <Abas ativa={grao} onChange={(g) => setGrao(g)} abas={[{ id: 'dia', nome: 'Por dia' }, { id: 'semana', nome: 'Por semana' }, { id: 'mes', nome: 'Por mês' }]} />
            <Abas ativa={metrica} onChange={setMetrica} abas={[{ id: 'qtd', nome: 'Quantidade' }, { id: 'valor', nome: 'Valor' }]} />
            <button className="btn" onClick={exportar} disabled={exportando || !calc.lista.length}>{exportando ? 'Gerando…' : '⬇ Exportar Excel'}</button>
          </div>
          <div className="barra-filtros">
            <select value={setor} onChange={(e) => setSetor(e.target.value)}>
              <option value="">Todos os setores</option>
              {calc.setores.map((x) => <option key={x}>{x}</option>)}
            </select>
            <select value={sub} onChange={(e) => setSub(e.target.value)}>
              <option value="">Todos os subgrupos</option>
              {calc.subs.map((x) => <option key={x}>{x}</option>)}
            </select>
            <input placeholder="Buscar prato ou código" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>

          <Card titulo={metrica === 'qtd' ? 'Quantidade vendida' : 'Valor vendido'} ico="↗"
            extra={escolhidos ? <button className="link" onClick={() => setEscolhidos(null)}>voltar aos 5 mais vendidos</button> : <span className="muted pequeno">5 mais vendidos · clique nos pratos abaixo para trocar</span>}>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={dadosGrafico}>
                <CartesianGrid vertical={false} stroke={COR_GRADE} />
                <XAxis dataKey="per" tickFormatter={(p) => rotulo(p, grao)} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} width={60} tickLine={false} axisLine={false} tickFormatter={(v) => (metrica === 'qtd' ? v : 'R$' + Math.round(v / 1000) + 'k')} />
                <Tooltip {...tooltipStyle} formatter={(v) => fmt(v)} labelFormatter={(p) => (grao === 'dia' ? br(p) : rotulo(p, grao))} />
                <Legend iconType="circle" />
                {noGrafico.map((p, i) => (
                  <Line key={p.codigo} dataKey={p.produto} stroke={CORES[i % CORES.length]} strokeWidth={2.2} dot={grao !== "dia"} type="monotone" isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card titulo="Pratos" ico="❖" extra={<span className="muted pequeno">{calc.lista.length} pratos · clique para pôr ou tirar do gráfico</span>}>
            <Tabela onClick={alternar} max={600} colunas={[
              { k: 'graf', t: '', w: 24, f: (v, p) => {
                const i = noGrafico.findIndex((x) => x.codigo === p.codigo)
                return <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: i >= 0 ? CORES[i % CORES.length] : 'transparent', border: i >= 0 ? 0 : '1px solid #d8cfc2' }} />
              } },
              { k: 'produto', t: 'Prato', f: (v) => <b style={{ fontWeight: 600 }}>{v}</b> },
              { k: 'setor', t: 'Setor', f: (v) => <span className="tag" style={{ background: (COR_SETOR[v] || '#aaa') + '2e', color: '#2a2118' }}>{v}</span> },
              { k: 'subgrupo', t: 'Subgrupo', f: (v) => <span className="muted">{v}</span> },
              { k: metrica, t: metrica === 'qtd' ? 'Qtd no período' : 'Valor no período', num: true, f: fmt },
              { k: 'pct', t: '%', num: true, f: (v) => (v * 100).toFixed(1).replace('.', ',') + '%' },
              { k: 'media', t: 'Média por ' + (grao === 'mes' ? 'mês' : grao), num: true, f: fmt },
              { k: 'ultimo', t: 'Último ' + (grao === 'mes' ? 'mês' : grao), num: true, f: fmt },
              { k: 'tendencia', t: 'Tendência', num: true, f: (v) => (v == null || !isFinite(v) ? '—' : <span className={'pill ' + (v > 0.05 ? 'up' : v < -0.05 ? 'down' : '')}>{(v > 0 ? '+' : '') + (v * 100).toFixed(0) + '%'}</span>) },
            ]} linhas={calc.lista} />
            <Aviso>Tendência = média da segunda metade do período comparada com a primeira metade.</Aviso>
          </Card>
        </>
      )}
    </Estado>
  )
}
