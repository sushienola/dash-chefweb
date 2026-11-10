import { useMemo } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'
import { rpcAll, R, R0, N, P, br, diaSemana, soma, kR, COR_TURNO, COR_GRADE, FERIADOS } from '../lib'
import { useDados, Estado, Card, Tabela, Kpi, Aviso, tooltipStyle } from '../ui'

const SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']

export default function Vendas({ loja, ini, fim }) {
  const st = useDados(async () => {
    const a = { p_loja: loja, p_ini: ini, p_fim: fim }
    const [canal, turno] = await Promise.all([rpcAll('resumo_dia', a), rpcAll('resumo_turno', a)])
    return { canal, turno }
  }, [loja, ini, fim])

  const calc = useMemo(() => {
    if (!st.dados) return null
    const m = new Map()
    const novo = (d) => ({ chave: d, dia: d, vendas: 0, pessoas: 0, fat: 0, servico: 0, descontos: 0, salao: 0, delivery: 0, almoco: 0, jantar: 0, vAlmoco: 0, vJantar: 0 })
    st.dados.canal.forEach((r) => {
      const o = m.get(r.dia) || novo(r.dia)
      o.vendas += Number(r.vendas); o.fat += Number(r.valor_total); o.servico += Number(r.valor_servico)
      o.descontos += Number(r.descontos)
      if (r.canal === 'Loja') { o.pessoas += Number(r.pessoas); o.salao += Number(r.valor_total) }
      else o.delivery += Number(r.valor_total)
      m.set(r.dia, o)
    })
    st.dados.turno.forEach((r) => {
      const o = m.get(r.dia) || novo(r.dia)
      if (r.turno === 'Almoço') { o.almoco += Number(r.valor_total); o.vAlmoco += Number(r.vendas) }
      else { o.jantar += Number(r.valor_total); o.vJantar += Number(r.vendas) }
      m.set(r.dia, o)
    })
    const dias = [...m.values()].map((o) => ({ ...o, ticket: o.vendas ? o.fat / o.vendas : 0, sem: diaSemana(o.dia) }))
    const sem = SEMANA.map((s) => {
      const ds = dias.filter((d) => d.sem === s && !FERIADOS[d.dia])
      const k = ds.length || 1
      return { dia: s, 'Almoço': soma(ds, 'almoco') / k, Jantar: soma(ds, 'jantar') / k, n: ds.length }
    })
    const tot = {
      vendas: soma(dias, 'vendas'), pessoas: soma(dias, 'pessoas'), fat: soma(dias, 'fat'), servico: soma(dias, 'servico'),
      descontos: soma(dias, 'descontos'), salao: soma(dias, 'salao'), delivery: soma(dias, 'delivery'),
      almoco: soma(dias, 'almoco'), jantar: soma(dias, 'jantar'), vAlmoco: soma(dias, 'vAlmoco'), vJantar: soma(dias, 'vJantar'),
    }
    return { dias, sem, tot }
  }, [st.dados])

  return (
    <Estado st={st}>
      {calc && (
        <>
          <div className="kpis">
            <Kpi titulo="Almoço" valor={R0(calc.tot.almoco)} sub={P(calc.tot.almoco / calc.tot.fat) + ' · ' + N(calc.tot.vAlmoco) + ' vendas'} />
            <Kpi titulo="Jantar" valor={R0(calc.tot.jantar)} sub={P(calc.tot.jantar / calc.tot.fat) + ' · ' + N(calc.tot.vJantar) + ' vendas'} />
            <Kpi titulo="Ticket almoço" valor={R(calc.tot.vAlmoco ? calc.tot.almoco / calc.tot.vAlmoco : 0)} />
            <Kpi titulo="Ticket jantar" valor={R(calc.tot.vJantar ? calc.tot.jantar / calc.tot.vJantar : 0)} />
          </div>
          <Card titulo="Média por dia da semana · almoço × jantar" ico="◑">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={calc.sem} barCategoryGap="22%">
                <CartesianGrid vertical={false} stroke={COR_GRADE} />
                <XAxis dataKey="dia" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={kR} fontSize={11} width={70} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(142,91,214,.06)' }} formatter={(v) => R(v)}
                  labelFormatter={(s, p) => s + ' · média de ' + (p?.[0]?.payload?.n || 0) + ' dias (sem feriados)'} />
                <Legend iconType="circle" />
                <Bar dataKey="Almoço" stackId="a" fill={COR_TURNO['Almoço']} />
                <Bar dataKey="Jantar" stackId="a" fill={COR_TURNO.Jantar} radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <Aviso>
              Almoço = mesas cujo primeiro item foi lançado antes das 17h; jantar = a partir das 17h (pedidos de madrugada contam no jantar).
              A TOTVS não informa o horário de fechamento, então usamos o horário do primeiro pedido.
            </Aviso>
          </Card>
          <Card titulo="Dia a dia" ico="▤">
            <Tabela ordemInicial={{ k: 'dia', asc: false }} colunas={[
              { k: 'dia', t: 'Dia', f: (v, l) => <>{br(v) + ' ' + l.sem}{FERIADOS[v] && <span className="tag laranja" style={{ marginLeft: 6 }} title={FERIADOS[v]}>feriado</span>}</> },
              { k: 'vendas', t: 'Vendas', num: true, f: N },
              { k: 'pessoas', t: 'Pessoas', num: true, f: N },
              { k: 'almoco', t: 'Almoço', num: true, f: R0 },
              { k: 'jantar', t: 'Jantar', num: true, f: R0 },
              { k: 'salao', t: 'Salão', num: true, f: R0 },
              { k: 'delivery', t: 'Delivery/site', num: true, f: R0 },
              { k: 'servico', t: 'Serviço', num: true, f: R0 },
              { k: 'fat', t: 'Faturamento', num: true, f: R0 },
              { k: 'ticket', t: 'Ticket', num: true, f: R },
            ]} linhas={calc.dias} rodape={{
              dia: 'Total', vendas: N(calc.tot.vendas), pessoas: N(calc.tot.pessoas), almoco: R0(calc.tot.almoco),
              jantar: R0(calc.tot.jantar), salao: R0(calc.tot.salao), delivery: R0(calc.tot.delivery),
              servico: R0(calc.tot.servico), fat: R0(calc.tot.fat), ticket: R(calc.tot.vendas ? calc.tot.fat / calc.tot.vendas : 0),
            }} />
          </Card>
        </>
      )}
    </Estado>
  )
}
