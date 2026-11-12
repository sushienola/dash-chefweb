import { useMemo, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'
import { selectAll, iso, addDays, R, R0, N, br, brCurto, kR, soma, agrupar, COR_GRADE } from '../lib'
import { useDados, Estado, Card, Tabela, Kpi, Abas, Aviso, tooltipStyle } from '../ui'

export default function ContasPagar({ loja, ini, fim }) {
  const [aba, setAba] = useState('agenda')
  const [busca, setBusca] = useState('')
  const st = useDados(() => selectAll('adm_contas_pagar', (q) => q.eq('loja', loja).order('data_vencimento')), [loja])
  const hoje = iso(new Date())

  const calc = useMemo(() => {
    if (!st.dados) return null
    const b = busca.trim().toUpperCase()
    const todas = st.dados.filter((c) => !c.deletado)
      .filter((c) => !b || [c.credor, c.plano1, c.plano2, c.historico].some((x) => String(x || '').toUpperCase().includes(b)))
      .map((c) => ({ ...c, chave: c.numero_controle, valor: Number(c.valor) || 0, valor_pagamento: Number(c.valor_pagamento) || 0,
        plano: [c.plano1, c.plano2].filter(Boolean).join(' › ') || 'Sem plano de contas' }))
    const aberto = todas.filter((c) => !c.pago)
    const vencidas = aberto.filter((c) => c.data_vencimento && c.data_vencimento < hoje)
    const prox7 = aberto.filter((c) => c.data_vencimento >= hoje && c.data_vencimento <= addDays(hoje, 7))
    const noPeriodo = todas.filter((c) => c.data_vencimento >= ini && c.data_vencimento <= fim)
    const pagasPeriodo = todas.filter((c) => c.pago && c.data_pagamento >= ini && c.data_pagamento <= fim)
    const porDia = new Map()
    noPeriodo.forEach((c) => {
      const o = porDia.get(c.data_vencimento) || { dia: c.data_vencimento, Pago: 0, 'Em aberto': 0 }
      o[c.pago ? 'Pago' : 'Em aberto'] += c.valor
      porDia.set(c.data_vencimento, o)
    })
    return {
      todas, aberto, vencidas, prox7, noPeriodo, pagasPeriodo,
      porDia: [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia)),
      planos: agrupar(noPeriodo, 'plano', ['valor']).sort((a, b) => b.valor - a.valor),
      credores: agrupar(noPeriodo, 'credor', ['valor']).map((x) => ({ ...x, n: noPeriodo.filter((c) => c.credor === x.chave).length })).sort((a, b) => b.valor - a.valor),
    }
  }, [st.dados, busca, ini, fim, hoje])

  const status = (c) => (c.pago ? <span className="tag verde">pago {c.data_pagamento ? brCurto(c.data_pagamento) : ''}</span>
    : c.data_vencimento < hoje ? <span className="tag laranja">vencida</span> : <span className="tag">em aberto</span>)

  return (
    <Estado st={st}>
      {calc && (
        <>
          {!st.dados.length && (
            <Aviso>
              Ainda não há contas a pagar no banco. Na planilha, use <b>🍣 ChefWeb → 💰 Buscar contas a pagar agora</b>.
              Se aparecer erro, é o mesmo problema da API de notas fiscais e precisa ser liberado pela TOTVS.
            </Aviso>
          )}
          <div className="kpis">
            <Kpi titulo="Vencidas em aberto" valor={R0(soma(calc.vencidas, 'valor'))} sub={calc.vencidas.length + ' contas'} />
            <Kpi titulo="Vencem em 7 dias" valor={R0(soma(calc.prox7, 'valor'))} sub={calc.prox7.length + ' contas'} />
            <Kpi titulo="Vencimentos no período" valor={R0(soma(calc.noPeriodo, 'valor'))} sub={calc.noPeriodo.length + ' contas'} />
            <Kpi titulo="Pago no período" valor={R0(soma(calc.pagasPeriodo, 'valor_pagamento'))} sub={calc.pagasPeriodo.length + ' pagamentos'} />
          </div>
          {calc.porDia.length > 0 && (
            <Card titulo="Vencimentos por dia" ico="▥">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={calc.porDia}>
                  <CartesianGrid vertical={false} stroke={COR_GRADE} />
                  <XAxis dataKey="dia" tickFormatter={brCurto} fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={kR} fontSize={11} width={70} tickLine={false} axisLine={false} />
                  <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(142,91,214,.06)' }} formatter={(v) => R(v)} labelFormatter={br} />
                  <Legend iconType="circle" />
                  <Bar dataKey="Pago" stackId="a" fill="#3d8f5f" />
                  <Bar dataKey="Em aberto" stackId="a" fill="#e8743b" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}
          <div className="barra-filtros">
            <Abas ativa={aba} onChange={setAba} abas={[
              { id: 'agenda', nome: 'Em aberto' }, { id: 'periodo', nome: 'Vencimentos no período' },
              { id: 'plano', nome: 'Por plano de contas' }, { id: 'credor', nome: 'Por credor' },
            ]} />
            <input placeholder="Buscar credor, plano ou histórico" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <Card>
            {(aba === 'agenda' || aba === 'periodo') && (
              <Tabela ordemInicial={{ k: 'data_vencimento', asc: true }} colunas={[
                { k: 'data_vencimento', t: 'Vencimento', f: (v) => br(v) },
                { k: 'credor', t: 'Credor' },
                { k: 'plano', t: 'Plano de contas' },
                { k: 'historico', t: 'Histórico' },
                { k: 'valor', t: 'Valor', num: true, f: R },
                { k: 'pago', t: 'Situação', f: (v, c) => status(c) },
              ]} linhas={aba === 'agenda' ? calc.aberto : calc.noPeriodo} max={800}
                rodape={{ data_vencimento: 'Total', valor: R(soma(aba === 'agenda' ? calc.aberto : calc.noPeriodo, 'valor')) }} />
            )}
            {aba === 'plano' && (
              <Tabela colunas={[{ k: 'chave', t: 'Plano de contas' }, { k: 'valor', t: 'Valor no período', num: true, f: R0 }]} linhas={calc.planos} />
            )}
            {aba === 'credor' && (
              <Tabela colunas={[{ k: 'chave', t: 'Credor' }, { k: 'n', t: 'Contas', num: true, f: N }, { k: 'valor', t: 'Valor no período', num: true, f: R0 }]} linhas={calc.credores} />
            )}
          </Card>
        </>
      )}
    </Estado>
  )
}
