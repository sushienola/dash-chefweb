import { useMemo, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'
import { rpcAll, R, R0, N, P, brCurto, soma } from '../lib'
import { useDados, Estado, Card, Tabela, Kpi, tooltipStyle } from '../ui'

export default function Itens({ loja, ini, fim }) {
  const [filtroCoz, setFiltroCoz] = useState('todos')
  const [canal, setCanal] = useState('')
  const [sub, setSub] = useState('')
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState(null)

  const st = useDados(async () => {
    const a = { p_loja: loja, p_ini: ini, p_fim: fim }
    const [rank, hora, coz] = await Promise.all([rpcAll('itens_ranking', a), rpcAll('itens_por_hora', a), rpcAll('itens_dia_cozinha', a)])
    return { rank, hora, coz }
  }, [loja, ini, fim])

  const det = useDados(async () => (sel ? rpcAll('item_por_dia', { p_loja: loja, p_ini: ini, p_fim: fim, p_codigo: sel }) : []), [sel, loja, ini, fim])

  const calc = useMemo(() => {
    if (!st.dados) return null
    const { rank, hora, coz } = st.dados
    const canais = [...new Set(rank.map((r) => r.canal).filter(Boolean))].sort()
    const subs = [...new Set(rank.map((r) => r.subgrupo).filter(Boolean))].sort()
    const b = busca.trim().toUpperCase()
    const f = rank.filter((r) =>
      (filtroCoz === 'todos' || (filtroCoz === 'coz' ? r.cozinha : !r.cozinha)) &&
      (!canal || r.canal === canal) && (!sub || r.subgrupo === sub) &&
      (!b || String(r.produto).toUpperCase().includes(b) || String(r.codigo) === b))
    const tot = soma(f, 'valor')
    const linhas = f.map((r) => ({ ...r, id: r.codigo, pct: r.valor / tot, cmv: r.custo_unit && r.valor ? r.custo_total / r.valor : null }))
    const porDia = new Map()
    coz.forEach((r) => {
      const o = porDia.get(r.dia) || { dia: r.dia, Cozinha: 0, Outros: 0 }
      o[r.cozinha ? 'Cozinha' : 'Outros'] += Number(r.qtd)
      porDia.set(r.dia, o)
    })
    return { canais, subs, linhas, tot, qtd: soma(f, 'qtd'), porDia: [...porDia.values()],
      hora: hora.map((h) => ({ ...h, h: String(h.hora).padStart(2, '0') + 'h' })) }
  }, [st.dados, filtroCoz, canal, sub, busca])

  const nomeSel = calc && sel ? calc.linhas.find((l) => l.codigo === sel)?.produto : ''

  return (
    <Estado st={st}>
      {calc && (
        <>
          <div className="barra-filtros">
            <select value={filtroCoz} onChange={(e) => setFiltroCoz(e.target.value)}>
              <option value="todos">Todos os produtos</option>
              <option value="coz">Só cozinha</option>
              <option value="fora">Fora da cozinha</option>
            </select>
            <select value={canal} onChange={(e) => setCanal(e.target.value)}>
              <option value="">Todos os canais</option>
              {calc.canais.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select value={sub} onChange={(e) => setSub(e.target.value)}>
              <option value="">Todos os subgrupos</option>
              {calc.subs.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input placeholder="Buscar produto ou código" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <div className="kpis">
            <Kpi titulo="Itens vendidos" valor={N(calc.qtd)} />
            <Kpi titulo="Valor dos itens" valor={R0(calc.tot)} sub="sem serviço" />
            <Kpi titulo="Produtos diferentes" valor={N(calc.linhas.length)} />
          </div>
          <div className="grade2">
            <Card titulo="Itens por dia (cozinha × outros)">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={calc.porDia}>
                  <CartesianGrid vertical={false} stroke="rgba(120,84,40,.10)" />
                  <XAxis dataKey="dia" tickFormatter={brCurto} fontSize={11} />
                  <YAxis fontSize={11} width={50} />
                  <Tooltip {...tooltipStyle} formatter={(v) => N(v)} labelFormatter={brCurto} />
                  <Legend />
                  <Bar dataKey="Cozinha" stackId="a" fill="#e8743b" />
                  <Bar dataKey="Outros" stackId="a" fill="#c9b2ef" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <Card titulo="Itens por horário do pedido">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={calc.hora}>
                  <CartesianGrid vertical={false} stroke="rgba(120,84,40,.10)" />
                  <XAxis dataKey="h" fontSize={11} />
                  <YAxis fontSize={11} width={50} />
                  <Tooltip {...tooltipStyle} formatter={(v) => N(v)} />
                  <Bar dataKey="qtd" name="Itens" fill="#c9b2ef" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
          {sel && (
            <Card titulo={'Dia a dia: ' + nomeSel} extra={<button className="link" onClick={() => setSel(null)}>fechar</button>}>
              <Estado st={det}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={det.dados || []}>
                    <CartesianGrid vertical={false} stroke="rgba(120,84,40,.10)" />
                    <XAxis dataKey="dia" tickFormatter={brCurto} fontSize={11} />
                    <YAxis fontSize={11} width={50} />
                    <Tooltip {...tooltipStyle} formatter={(v, n) => (n === 'valor' ? R(v) : N(v))} labelFormatter={brCurto} />
                    <Bar dataKey="qtd" name="Quantidade" fill="#8e5bd6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Estado>
            </Card>
          )}
          <Card titulo="Ranking de produtos" extra={<span className="muted pequeno">clique num produto para ver o dia a dia</span>}>
            <Tabela onClick={(l) => setSel(l.codigo)} selecionado={sel} colunas={[
              { k: 'codigo', t: 'Cód.', w: 60 },
              { k: 'produto', t: 'Produto' },
              { k: 'subgrupo', t: 'Subgrupo' },
              { k: 'canal', t: 'Canal' },
              { k: 'cozinha', t: 'Cozinha', f: (v) => (v ? 'Sim' : '') },
              { k: 'qtd', t: 'Qtd', num: true, f: N },
              { k: 'valor', t: 'Valor', num: true, f: R0 },
              { k: 'pct', t: '% valor', num: true, f: P },
              { k: 'custo_unit', t: 'Custo ficha', num: true, f: (v) => (v == null ? '—' : R(v)) },
              { k: 'cmv', t: 'CMV teórico', num: true, f: P },
            ]} linhas={calc.linhas} max={400} />
          </Card>
        </>
      )}
    </Estado>
  )
}
