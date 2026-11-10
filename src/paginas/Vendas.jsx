import { useMemo } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { rpcAll, R, R0, N, br, diaSemana, soma, kR } from '../lib'
import { useDados, Estado, Card, Tabela, tooltipStyle } from '../ui'

const SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']

export default function Vendas({ loja, ini, fim }) {
  const st = useDados(() => rpcAll('resumo_dia', { p_loja: loja, p_ini: ini, p_fim: fim }), [loja, ini, fim])

  const calc = useMemo(() => {
    if (!st.dados) return null
    const m = new Map()
    st.dados.forEach((r) => {
      const o = m.get(r.dia) || { chave: r.dia, dia: r.dia, vendas: 0, pessoas: 0, fat: 0, servico: 0, descontos: 0, salao: 0, delivery: 0 }
      o.vendas += Number(r.vendas); o.fat += Number(r.valor_total); o.servico += Number(r.valor_servico)
      o.descontos += Number(r.descontos)
      if (r.canal === 'Loja') { o.pessoas += Number(r.pessoas); o.salao += Number(r.valor_total) }
      else o.delivery += Number(r.valor_total)
      m.set(r.dia, o)
    })
    const dias = [...m.values()].map((o) => ({ ...o, ticket: o.vendas ? o.fat / o.vendas : 0, sem: diaSemana(o.dia) }))
    const sem = SEMANA.map((s) => {
      const ds = dias.filter((d) => d.sem === s)
      return { dia: s, media: ds.length ? soma(ds, 'fat') / ds.length : 0, n: ds.length }
    })
    const tot = { vendas: soma(dias, 'vendas'), pessoas: soma(dias, 'pessoas'), fat: soma(dias, 'fat'),
      servico: soma(dias, 'servico'), descontos: soma(dias, 'descontos'), salao: soma(dias, 'salao'), delivery: soma(dias, 'delivery') }
    return { dias, sem, tot }
  }, [st.dados])

  return (
    <Estado st={st}>
      {calc && (
        <>
          <Card titulo="Média de faturamento por dia da semana">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={calc.sem}>
                <CartesianGrid vertical={false} stroke="rgba(120,84,40,.10)" />
                <XAxis dataKey="dia" fontSize={12} />
                <YAxis tickFormatter={kR} fontSize={11} width={70} />
                <Tooltip {...tooltipStyle} formatter={(v) => R(v)} labelFormatter={(s, p) => s + ' · ' + (p?.[0]?.payload?.n || 0) + ' dias'} />
                <Bar dataKey="media" name="Média" fill="#c9b2ef" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card titulo="Dia a dia">
            <Tabela ordemInicial={{ k: 'dia', asc: false }} colunas={[
              { k: 'dia', t: 'Dia', f: (v, l) => br(v) + ' ' + l.sem },
              { k: 'vendas', t: 'Vendas', num: true, f: N },
              { k: 'pessoas', t: 'Pessoas', num: true, f: N },
              { k: 'salao', t: 'Salão', num: true, f: R0 },
              { k: 'delivery', t: 'Delivery/site', num: true, f: R0 },
              { k: 'servico', t: 'Serviço', num: true, f: R0 },
              { k: 'descontos', t: 'Descontos', num: true, f: R0 },
              { k: 'fat', t: 'Faturamento', num: true, f: R0 },
              { k: 'ticket', t: 'Ticket', num: true, f: R },
            ]} linhas={calc.dias} rodape={{
              dia: 'Total', vendas: N(calc.tot.vendas), pessoas: N(calc.tot.pessoas), salao: R0(calc.tot.salao),
              delivery: R0(calc.tot.delivery), servico: R0(calc.tot.servico), descontos: R0(calc.tot.descontos),
              fat: R0(calc.tot.fat), ticket: R(calc.tot.vendas ? calc.tot.fat / calc.tot.vendas : 0),
            }} />
          </Card>
        </>
      )}
    </Estado>
  )
}
