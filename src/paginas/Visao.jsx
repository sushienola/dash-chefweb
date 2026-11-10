import { useMemo } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts'
import { rpcAll, R, R0, N, P, kR, brCurto, diaSemana, addDays, diffDays, soma, agrupar, COR_CANAL } from '../lib'
import { useDados, Estado, Kpi, Card, Tabela, tooltipStyle } from '../ui'

export default function Visao({ loja, ini, fim }) {
  const n = diffDays(ini, fim) + 1
  const st = useDados(async () => {
    const a = { p_loja: loja, p_ini: ini, p_fim: fim }
    const ant = { p_loja: loja, p_ini: addDays(ini, -n), p_fim: addDays(ini, -1) }
    const [dia, diaAnt, pag, itens] = await Promise.all([
      rpcAll('resumo_dia', a), rpcAll('resumo_dia', ant), rpcAll('pagamentos_resumo', a), rpcAll('itens_ranking', a),
    ])
    return { dia, diaAnt, pag, itens }
  }, [loja, ini, fim])

  const calc = useMemo(() => {
    if (!st.dados) return null
    const { dia, diaAnt, pag, itens } = st.dados
    const k = (rows) => {
      const fat = soma(rows, 'valor_total'), vendas = soma(rows, 'vendas')
      const loj = rows.filter((r) => r.canal === 'Loja')
      const pessoas = soma(loj, 'pessoas'), fatLoja = soma(loj, 'valor_total')
      return { fat, vendas, ticket: vendas ? fat / vendas : 0, pessoas, porPessoa: pessoas ? fatLoja / pessoas : 0,
        servico: soma(rows, 'valor_servico'), dias: new Set(rows.map((r) => r.dia)).size }
    }
    const atual = k(dia), anterior = k(diaAnt)
    const canais = [...new Set(dia.map((r) => r.canal))]
    const porDia = new Map()
    dia.forEach((r) => {
      const o = porDia.get(r.dia) || { dia: r.dia }
      o[r.canal] = (o[r.canal] || 0) + Number(r.valor_total)
      porDia.set(r.dia, o)
    })
    const porCanal = agrupar(dia, 'canal', ['valor_total', 'vendas']).sort((a, b) => b.valor_total - a.valor_total)
    const formas = agrupar(pag, 'forma', ['valor', 'qtd']).sort((a, b) => b.valor - a.valor)
    const totPag = soma(formas, 'valor')
    return { atual, anterior, canais, porDia: [...porDia.values()], porCanal, formas, totPag, top: itens.slice(0, 12) }
  }, [st.dados])

  const d = (a, b) => (b ? a / b - 1 : null)

  return (
    <Estado st={st}>
      {calc && (
        <>
          <div className="kpis">
            <Kpi titulo="Faturamento" valor={R0(calc.atual.fat)} delta={d(calc.atual.fat, calc.anterior.fat)} sub="vs período anterior" />
            <Kpi titulo="Vendas / mesas" valor={N(calc.atual.vendas)} delta={d(calc.atual.vendas, calc.anterior.vendas)} />
            <Kpi titulo="Ticket médio" valor={R(calc.atual.ticket)} delta={d(calc.atual.ticket, calc.anterior.ticket)} />
            <Kpi titulo="Pessoas (salão)" valor={N(calc.atual.pessoas)} delta={d(calc.atual.pessoas, calc.anterior.pessoas)} />
            <Kpi titulo="Gasto por pessoa (salão)" valor={R(calc.atual.porPessoa)} delta={d(calc.atual.porPessoa, calc.anterior.porPessoa)} />
            <Kpi titulo="Serviço (10%)" valor={R0(calc.atual.servico)} sub={calc.atual.dias + ' dias com venda'} />
          </div>

          <Card titulo="Faturamento por dia e canal">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={calc.porDia}>
                <CartesianGrid vertical={false} stroke="#eef0f4" />
                <XAxis dataKey="dia" tickFormatter={(s) => brCurto(s)} fontSize={11} />
                <YAxis tickFormatter={kR} fontSize={11} width={70} />
                <Tooltip {...tooltipStyle} formatter={(v) => R(v)} labelFormatter={(s) => brCurto(s) + ' (' + diaSemana(s) + ')'} />
                <Legend />
                {calc.canais.map((c) => <Bar key={c} dataKey={c} stackId="a" fill={COR_CANAL[c] || '#888'} />)}
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <div className="grade2">
            <Card titulo="Por canal">
              <Tabela colunas={[
                { k: 'chave', t: 'Canal' },
                { k: 'vendas', t: 'Vendas', num: true, f: N },
                { k: 'valor_total', t: 'Faturamento', num: true, f: R0 },
                { k: 'pct', t: '%', num: true, f: P },
              ]} linhas={calc.porCanal.map((c) => ({ ...c, pct: c.valor_total / calc.atual.fat }))} />
            </Card>
            <Card titulo="Formas de pagamento">
              <Tabela colunas={[
                { k: 'chave', t: 'Forma' },
                { k: 'qtd', t: 'Qtd', num: true, f: N },
                { k: 'valor', t: 'Valor', num: true, f: R0 },
                { k: 'pct', t: '%', num: true, f: P },
              ]} linhas={calc.formas.map((c) => ({ ...c, pct: c.valor / calc.totPag }))} />
            </Card>
          </div>

          <Card titulo="Itens mais vendidos (por valor)">
            <Tabela colunas={[
              { k: 'produto', t: 'Produto' },
              { k: 'subgrupo', t: 'Subgrupo' },
              { k: 'cozinha', t: 'Cozinha', f: (v) => (v ? 'Sim' : '') },
              { k: 'qtd', t: 'Qtd', num: true, f: N },
              { k: 'valor', t: 'Valor', num: true, f: R0 },
            ]} linhas={calc.top} />
          </Card>
        </>
      )}
    </Estado>
  )
}
