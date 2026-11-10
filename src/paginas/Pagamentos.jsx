import { useMemo, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts'
import { rpcAll, R, R0, N, P, kR, brCurto, soma, agrupar, CORES } from '../lib'
import { useDados, Estado, Card, Tabela, Kpi, Aviso, Abas, tooltipStyle } from '../ui'

export default function Pagamentos({ loja, ini, fim }) {
  const [visao, setVisao] = useState('forma')
  const st = useDados(() => rpcAll('pagamentos_resumo', { p_loja: loja, p_ini: ini, p_fim: fim }), [loja, ini, fim])

  const calc = useMemo(() => {
    if (!st.dados) return null
    const rows = st.dados
    const tot = soma(rows, 'valor')
    const cartoes = rows.filter((r) => r.forma.startsWith('Cartão'))
    const chaveDe = (r) => (visao === 'forma' ? r.forma : visao === 'bandeira' ? (r.forma.startsWith('Cartão') ? r.bandeira : null)
      : visao === 'maquininha' ? (r.forma.startsWith('Cartão') || r.forma === 'PIX' ? r.maquininha : null)
        : (r.forma.startsWith('Cartão') ? r.bandeira + ' · ' + r.forma.replace('Cartão ', '') : null))
    const base = rows.map((r) => ({ ...r, k: chaveDe(r) })).filter((r) => r.k)
    const tabela = agrupar(base, 'k', ['valor', 'qtd']).sort((a, b) => b.valor - a.valor)
    const totTab = soma(tabela, 'valor')
    const top = tabela.slice(0, 8).map((t) => t.chave)
    const m = new Map()
    base.forEach((r) => {
      const o = m.get(r.dia) || { dia: r.dia }
      const k = top.includes(r.k) ? r.k : 'Outros'
      o[k] = (o[k] || 0) + Number(r.valor)
      m.set(r.dia, o)
    })
    const series = [...top, ...(tabela.length > 8 ? ['Outros'] : [])]
    return {
      tot, totCartao: soma(cartoes, 'valor'),
      credito: soma(cartoes.filter((r) => r.forma === 'Cartão Crédito'), 'valor'),
      debito: soma(cartoes.filter((r) => r.forma === 'Cartão Débito'), 'valor'),
      pix: soma(rows.filter((r) => r.forma === 'PIX'), 'valor'),
      apps: soma(rows.filter((r) => ['iFood', 'Rappi', 'Site (Shopfood)'].includes(r.forma)), 'valor'),
      tabela: tabela.map((t) => ({ ...t, pct: t.valor / totTab, medio: t.qtd ? t.valor / t.qtd : 0 })),
      porDia: [...m.values()], series,
    }
  }, [st.dados, visao])

  return (
    <Estado st={st}>
      {calc && (
        <>
          <Aviso>No histórico importado da planilha antiga só existe o <b>1º pagamento</b> de cada venda. A partir do script novo entram todos.</Aviso>
          <div className="kpis">
            <Kpi titulo="Total recebido" valor={R0(calc.tot)} />
            <Kpi titulo="Cartão de crédito" valor={R0(calc.credito)} sub={P(calc.credito / calc.tot)} />
            <Kpi titulo="Cartão de débito" valor={R0(calc.debito)} sub={P(calc.debito / calc.tot)} />
            <Kpi titulo="PIX" valor={R0(calc.pix)} sub={P(calc.pix / calc.tot)} />
            <Kpi titulo="iFood / Rappi / Site" valor={R0(calc.apps)} sub={P(calc.apps / calc.tot)} />
          </div>
          <Abas ativa={visao} onChange={setVisao} abas={[
            { id: 'forma', nome: 'Por forma' }, { id: 'bandeira', nome: 'Por bandeira' },
            { id: 'bandtipo', nome: 'Bandeira × crédito/débito' }, { id: 'maquininha', nome: 'Por maquininha' },
          ]} />
          <Card titulo="Recebido por dia">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={calc.porDia}>
                <CartesianGrid vertical={false} stroke="#eef0f4" />
                <XAxis dataKey="dia" tickFormatter={brCurto} fontSize={11} />
                <YAxis tickFormatter={kR} fontSize={11} width={70} />
                <Tooltip {...tooltipStyle} formatter={(v) => R(v)} labelFormatter={brCurto} />
                <Legend />
                {calc.series.map((s, i) => <Bar key={s} dataKey={s} stackId="a" fill={CORES[i % CORES.length]} />)}
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card titulo="Resumo">
            <Tabela colunas={[
              { k: 'chave', t: 'Item' },
              { k: 'qtd', t: 'Transações', num: true, f: N },
              { k: 'valor', t: 'Valor', num: true, f: R0 },
              { k: 'medio', t: 'Valor médio', num: true, f: R },
              { k: 'pct', t: '%', num: true, f: P },
            ]} linhas={calc.tabela} />
          </Card>
        </>
      )}
    </Estado>
  )
}
