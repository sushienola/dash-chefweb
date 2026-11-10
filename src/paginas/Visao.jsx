import { useMemo } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts'
import { rpcAll, R, R0, N, P, kR, br, brCurto, diaSemana, addDays, diffDays, soma, agrupar, COR_CANAL, COR_GRADE, COR_SETOR, FERIADOS, parseIso } from '../lib'
import { useDados, Estado, Kpi, Card, Tabela, tooltipStyle, useCelular } from '../ui'
import VisaoCelular from './VisaoCelular'

const NOME_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const curto = (v) => {
  const n = Number(v) || 0
  if (n >= 1e5) return 'R$' + Math.round(n / 1e3) + 'k'
  if (n >= 1e4) return 'R$' + (n / 1e3).toFixed(1).replace('.', ',') + 'k'
  return 'R$' + Math.round(n).toLocaleString('pt-BR')
}

export default function Visao(props) {
  const cel = useCelular()
  return cel ? <VisaoCelular {...props} /> : <VisaoComputador {...props} />
}

function VisaoComputador({ loja, ini, fim }) {
  const n = diffDays(ini, fim) + 1
  const st = useDados(async () => {
    const a = { p_loja: loja, p_ini: ini, p_fim: fim }
    const ant = { p_loja: loja, p_ini: addDays(ini, -n), p_fim: addDays(ini, -1) }
    const sem = { p_loja: loja, p_ini: addDays(fim, -6), p_fim: fim }
    const [dia, diaAnt, pag, itens, semana, pagSem] = await Promise.all([
      rpcAll('resumo_dia', a), rpcAll('resumo_dia', ant), rpcAll('pagamentos_resumo', a), rpcAll('itens_ranking', a),
      rpcAll('resumo_dia', sem), rpcAll('pagamentos_resumo', sem),
    ])
    return { dia, diaAnt, pag, itens, semana, pagSem }
  }, [loja, ini, fim])

  const calc = useMemo(() => {
    if (!st.dados) return null
    const { dia, diaAnt, pag, itens, semana, pagSem } = st.dados
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

    // últimos 7 dias em colunas
    const dias7 = Array.from({ length: 7 }, (_, i) => addDays(fim, i - 6)).map((d) => {
      const rs = semana.filter((r) => r.dia === d)
      const ps = pagSem.filter((r) => r.dia === d)
      const fat = soma(rs, 'valor_total'), vendas = soma(rs, 'vendas')
      return {
        d, fat, vendas, ticket: vendas ? fat / vendas : 0,
        pessoas: soma(rs.filter((r) => r.canal === 'Loja'), 'pessoas'),
        cartao: soma(ps.filter((p) => p.forma.startsWith('Cartão')), 'valor'),
        apps: soma(ps.filter((p) => ['iFood', 'Rappi', 'Site (Shopfood)'].includes(p.forma)), 'valor'),
      }
    })
    const max7 = Math.max(...dias7.map((d) => d.fat), 1)
    const media7 = soma(dias7, 'fat') / Math.max(dias7.filter((d) => d.fat > 0).length, 1)
    return { atual, anterior, canais, porDia: [...porDia.values()], porCanal, formas, totPag, top: itens.slice(0, 10), dias7, max7, media7 }
  }, [st.dados, fim])

  const d = (a, b) => (b ? a / b - 1 : null)
  const ultimoDia = calc?.dias7[6]

  return (
    <Estado st={st}>
      {calc && (
        <>
          <div className="grade-hero">
            <div className="hero">
              <div>
                <div className="selo"><span>↗ Último dia</span> {br(fim)} · {NOME_DIA[parseIso(fim).getDay()]}</div>
                <h2>Faturamento do <em>dia</em></h2>
              </div>
              <div>
                <div className="grande">{R0(ultimoDia.fat)}</div>
                <p style={{ marginTop: 8 }}>
                  {N(ultimoDia.vendas)} vendas · ticket {R(ultimoDia.ticket)} · média dos 7 dias {R0(calc.media7)}
                </p>
              </div>
            </div>
            <Card titulo="Últimos 7 dias" ico="↗" extra={<span className="tag">média {R0(calc.media7)}</span>}>
              <div className="semana" ref={(el) => { if (el) el.scrollLeft = el.scrollWidth }}>
                {calc.dias7.map((x, i) => (
                  <div key={x.d} className={'col ' + (i === 6 ? 'hoje' : '')}>
                    <div className="topo-col">
                      <div className="valor">{curto(x.fat)}</div>
                      <div className="barra" style={{ height: Math.max(6, (x.fat / calc.max7) * 90) }} />
                    </div>
                    <div className="rot">{diaSemana(x.d)}, {brCurto(x.d)}{FERIADOS[x.d] && <span className="tag laranja" style={{ marginLeft: 6 }}>feriado</span>}</div>
                    <div className="linha"><span>Vendas</span><span>{N(x.vendas)}</span></div>
                    <div className="linha"><span>Pessoas</span><span>{N(x.pessoas)}</span></div>
                    <div className="linha"><span>Ticket</span><span>{curto(x.ticket)}</span></div>
                    <div className="linha"><span>Cartão</span><span>{curto(x.cartao)}</span></div>
                    <div className="linha"><span>Apps</span><span>{curto(x.apps)}</span></div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="kpis">
            <Kpi titulo="Faturamento no período" valor={R0(calc.atual.fat)} delta={d(calc.atual.fat, calc.anterior.fat)} sub="vs período anterior" />
            <Kpi titulo="Vendas / mesas" valor={N(calc.atual.vendas)} delta={d(calc.atual.vendas, calc.anterior.vendas)} />
            <Kpi titulo="Ticket médio" valor={R(calc.atual.ticket)} delta={d(calc.atual.ticket, calc.anterior.ticket)} />
            <Kpi titulo="Pessoas no salão" valor={N(calc.atual.pessoas)} delta={d(calc.atual.pessoas, calc.anterior.pessoas)} />
            <Kpi titulo="Gasto por pessoa" valor={R(calc.atual.porPessoa)} delta={d(calc.atual.porPessoa, calc.anterior.porPessoa)} sub="salão" />
            <Kpi titulo="Serviço (10%)" valor={R0(calc.atual.servico)} sub={calc.atual.dias + ' dias com venda'} />
          </div>

          <Card titulo="Faturamento por dia e canal" ico="▥" extra={<span className="tag">{br(ini)} – {br(fim)}</span>}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={calc.porDia} barCategoryGap="18%">
                <CartesianGrid vertical={false} stroke={COR_GRADE} />
                <XAxis dataKey="dia" tickFormatter={(s) => brCurto(s)} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={kR} fontSize={11} width={70} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(142,91,214,.06)' }} formatter={(v) => R(v)} labelFormatter={(s) => brCurto(s) + ' (' + diaSemana(s) + ')'} />
                <Legend iconType="circle" />
                {calc.canais.map((c, i) => (
                  <Bar key={c} dataKey={c} stackId="a" fill={COR_CANAL[c] || '#a08670'}
                    radius={i === calc.canais.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <div className="grade2">
            <Card titulo="Por canal" ico="◐">
              <Tabela colunas={[
                { k: 'chave', t: 'Canal', f: (v) => <span className="tag" style={{ background: (COR_CANAL[v] || '#a08670') + '33', color: '#2a2118' }}>{v}</span> },
                { k: 'vendas', t: 'Vendas', num: true, f: N },
                { k: 'valor_total', t: 'Faturamento', num: true, f: R0 },
                { k: 'pct', t: '%', num: true, f: P },
              ]} linhas={calc.porCanal.map((c) => ({ ...c, pct: c.valor_total / calc.atual.fat }))} />
            </Card>
            <Card titulo="Formas de pagamento" ico="▭">
              <Tabela colunas={[
                { k: 'chave', t: 'Forma' },
                { k: 'qtd', t: 'Qtd', num: true, f: N },
                { k: 'valor', t: 'Valor', num: true, f: R0 },
                { k: 'pct', t: '%', num: true, f: P },
              ]} linhas={calc.formas.map((c) => ({ ...c, pct: c.valor / calc.totPag }))} />
            </Card>
          </div>

          <Card titulo="Itens mais vendidos" ico="❖">
            <Tabela colunas={[
              { k: 'produto', t: 'Produto', f: (v) => <b style={{ fontWeight: 600 }}>{v}</b> },
              { k: 'subgrupo', t: 'Subgrupo', f: (v) => <span className="muted">{v}</span> },
              { k: 'setor', t: 'Setor', f: (v) => <span className="tag" style={{ background: (COR_SETOR[v] || '#aaa') + '2e', color: '#2a2118' }}>{v}</span> },
              { k: 'qtd', t: 'Qtd', num: true, f: N },
              { k: 'valor', t: 'Valor', num: true, f: R0 },
            ]} linhas={calc.top} />
          </Card>
        </>
      )}
    </Estado>
  )
}
