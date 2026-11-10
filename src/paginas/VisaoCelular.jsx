import { useMemo } from 'react'
import { rpcAll, R0, N, br, brCurto, addDays, diffDays, soma, agrupar, parseIso, COR_SETOR } from '../lib'
import { useDados, Estado } from '../ui'

const NOME_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const curto = (v) => {
  const n = Number(v) || 0
  if (n >= 1e6) return 'R$ ' + (n / 1e6).toFixed(2).replace('.', ',') + ' mi'
  if (n >= 1e4) return 'R$ ' + (n / 1e3).toFixed(1).replace('.', ',') + ' mil'
  return 'R$ ' + Math.round(n).toLocaleString('pt-BR')
}
const pct = (a, b) => (b ? a / b - 1 : null)
const fmtPct = (v) => (v == null || !isFinite(v) ? '' : (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(0) + '%')

// linha suave estilo "sparkline"
function Linha({ valores, cor = '#e8743b', w = 120, h = 44 }) {
  if (!valores.length) return null
  const max = Math.max(...valores), min = Math.min(...valores)
  const pts = valores.map((v, i) => [(i / Math.max(valores.length - 1, 1)) * w, h - 4 - ((v - min) / (max - min || 1)) * (h - 8)])
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], cx = (x0 + x1) / 2
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`
  }
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="spark">
      <defs><linearGradient id="gl" x1="0" x2="1"><stop offset="0" stopColor="#f6c35a" /><stop offset="1" stopColor={cor} /></linearGradient></defs>
      <path d={d} fill="none" stroke="url(#gl)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

export default function VisaoCelular({ loja, ini, fim, irPara }) {
  const n = diffDays(ini, fim) + 1
  const st = useDados(async () => {
    const a = { p_loja: loja, p_ini: ini, p_fim: fim }
    const [dia, diaAnt, itens, semana, setor] = await Promise.all([
      rpcAll('resumo_dia', a),
      rpcAll('resumo_dia', { p_loja: loja, p_ini: addDays(ini, -n), p_fim: addDays(ini, -1) }),
      rpcAll('itens_ranking', a),
      rpcAll('resumo_dia', { p_loja: loja, p_ini: addDays(fim, -13), p_fim: fim }),
      rpcAll('itens_dia_setor', { p_loja: loja, p_ini: fim, p_fim: fim }),
    ])
    return { dia, diaAnt, itens, semana, setor }
  }, [loja, ini, fim])

  const c = useMemo(() => {
    if (!st.dados) return null
    const { dia, diaAnt, itens, semana, setor } = st.dados
    const porDia = (rows) => {
      const m = new Map()
      rows.forEach((r) => {
        const o = m.get(r.dia) || { dia: r.dia, fat: 0, vendas: 0, pessoas: 0 }
        o.fat += Number(r.valor_total); o.vendas += Number(r.vendas)
        if (r.canal === 'Loja') o.pessoas += Number(r.pessoas)
        m.set(r.dia, o)
      })
      return m
    }
    const sm = porDia(semana)
    const d14 = Array.from({ length: 14 }, (_, i) => addDays(fim, i - 13)).map((d) => sm.get(d) || { dia: d, fat: 0, vendas: 0, pessoas: 0 })
    const hoje = d14[13], semanaPassada = d14[6]
    const fat = soma(dia, 'valor_total'), fatAnt = soma(diaAnt, 'valor_total')
    const vendas = soma(dia, 'vendas'), vendasAnt = soma(diaAnt, 'vendas')
    const pessoas = soma(dia.filter((r) => r.canal === 'Loja'), 'pessoas')
    const canais = agrupar(dia, 'canal', ['valor_total']).sort((a, b) => b.valor_total - a.valor_total)
    const setores = ['Cozinha', 'Sushi bar', 'Copa'].map((s) => ({ s, qtd: soma(setor.filter((r) => r.setor === s), 'qtd'), valor: soma(setor.filter((r) => r.setor === s), 'valor') }))
    return {
      hoje, semanaPassada, d14, fat, fatAnt, vendas, vendasAnt, pessoas, ticket: vendas ? fat / vendas : 0,
      canais, setores, top: itens.slice(0, 6),
    }
  }, [st.dados, fim])

  const dDia = parseIso(fim)
  return (
    <Estado st={st}>
      {c && (
        <div className="cel">
          <section className="cel-abre">
            <div className="olho">{NOME_DIA[dDia.getDay()]} · {br(fim)}</div>
            <h2 className="cel-titulo">O dia fechou em <em>{R0(c.hoje.fat)}</em></h2>
            <p className="cel-sub">
              {N(c.hoje.vendas)} vendas, {N(c.hoje.pessoas)} pessoas no salão.{' '}
              {c.semanaPassada.fat > 0 && <>Na {NOME_DIA[dDia.getDay()]} passada foram {R0(c.semanaPassada.fat)} ({fmtPct(pct(c.hoje.fat, c.semanaPassada.fat))}).</>}
            </p>
          </section>

          <section className="cel-valor">
            <div>
              <div className="olho">Faturamento no período</div>
              <div className="cel-num">{R0(c.fat)}</div>
              <div className="cel-mini">{brCurto(ini)} a {brCurto(fim)} · <b className={c.fat >= c.fatAnt ? 'sobe' : 'desce'}>{fmtPct(pct(c.fat, c.fatAnt))}</b> vs anterior</div>
            </div>
            <Linha valores={c.d14.map((d) => d.fat)} />
          </section>

          <section className="cel-lista">
            <h3 className="cel-h">Em <em>números</em></h3>
            <button onClick={() => irPara('vendas')}>Vendas no período<sup>{N(c.vendas)}</sup></button>
            <button onClick={() => irPara('vendas')}>Ticket médio<sup>{R0(c.ticket)}</sup></button>
            <button onClick={() => irPara('vendas')}>Pessoas no salão<sup>{N(c.pessoas)}</sup></button>
            {c.canais.map((k) => (
              <button key={k.chave} onClick={() => irPara('vendas')}>{k.chave}<sup>{curto(k.valor_total)}</sup></button>
            ))}
          </section>

          <section>
            <div className="cel-h2"><h3 className="cel-h">Últimos <em>dias</em></h3></div>
            <div className="cel-dias">
              {c.d14.slice(7).reverse().map((d) => (
                <div key={d.dia} className="cel-dia">
                  <div className="cel-barras">
                    <div style={{ height: Math.max(8, (d.fat / Math.max(...c.d14.map((x) => x.fat), 1)) * 100) + '%' }} />
                  </div>
                  <div className="olho">{NOME_DIA[parseIso(d.dia).getDay()].slice(0, 3)} · {brCurto(d.dia)}</div>
                  <div className="cel-dia-v">{curto(d.fat)}</div>
                  <div className="cel-mini">{N(d.vendas)} vendas</div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="cel-h2"><h3 className="cel-h">Produção do <em>dia</em></h3></div>
            <div className="cel-setores">
              {c.setores.map((s) => (
                <div key={s.s} className="cel-setor" style={{ '--cor': COR_SETOR[s.s] }}>
                  <div className="olho">{s.s}</div>
                  <div className="cel-dia-v">{N(s.qtd)}</div>
                  <div className="cel-mini">itens<br />{curto(s.valor)}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="cel-noticias">
            <div className="cel-h2">
              <h3 className="cel-h">Mais <em>vendidos</em></h3>
              <button className="link" onClick={() => irPara('itens')}>ver todos</button>
            </div>
            {c.top.map((it, i) => (
              <div key={it.codigo} className="cel-noticia" onClick={() => irPara('itens')}>
                <div>
                  <div className="olho" style={{ color: COR_SETOR[it.setor] }}>{it.setor}</div>
                  <div className="cel-noticia-t">{it.produto.toLowerCase()}</div>
                  <div className="cel-mini">{N(it.qtd)} unidades · {curto(it.valor)}</div>
                </div>
                <div className="cel-thumb" style={{ '--cor': COR_SETOR[it.setor] }}>{i + 1}</div>
              </div>
            ))}
          </section>
        </div>
      )}
    </Estado>
  )
}
