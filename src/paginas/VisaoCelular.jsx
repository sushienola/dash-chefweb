import { useMemo } from 'react'
import { rpcAll, R0, N, br, brCurto, addDays, diffDays, soma, agrupar, parseIso, iso, COR_SETOR, COR_CANAL, FERIADOS, mediana } from '../lib'
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
    // 1 dia: compara com o mesmo dia da semana anterior; período: com o período anterior de mesmo tamanho
    let volta = 7
    while (n === 1 && FERIADOS[addDays(fim, -volta)] && volta < 35) volta += 7   // pula feriados
    const base = n === 1 ? { p_ini: addDays(fim, -volta), p_fim: addDays(fim, -volta) } : { p_ini: addDays(ini, -n), p_fim: addDays(ini, -1) }
    const f = parseIso(fim)
    const iniMes = iso(new Date(f.getFullYear(), f.getMonth(), 1))
    const iniMesAnt = iso(new Date(f.getFullYear(), f.getMonth() - 1, 1))
    const fimMesAnt = iso(new Date(f.getFullYear(), f.getMonth() - 1, Math.min(f.getDate(), new Date(f.getFullYear(), f.getMonth(), 0).getDate())))
    const [dia, diaAnt, itens, semana, setor, mes, mesAnt] = await Promise.all([
      rpcAll('resumo_dia', a),
      rpcAll('resumo_dia', { p_loja: loja, ...base }),
      rpcAll('itens_ranking', a),
      rpcAll('resumo_dia', { p_loja: loja, p_ini: addDays(fim, -35), p_fim: fim }),
      rpcAll('itens_dia_setor', a),
      rpcAll('resumo_dia', { p_loja: loja, p_ini: iniMes, p_fim: fim }),
      rpcAll('resumo_dia', { p_loja: loja, p_ini: iniMesAnt, p_fim: fimMesAnt }),
    ])
    return { dia, diaAnt, itens, semana, setor, mes, mesAnt, iniMes }
  }, [loja, ini, fim])

  const c = useMemo(() => {
    if (!st.dados) return null
    const { dia, diaAnt, itens, semana, setor, mes, mesAnt, iniMes } = st.dados
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
    const hoje = d14[13]
    // referência: mediana das últimas 4 do mesmo dia da semana, sem feriados e sem dias zerados
    const mesmos = [7, 14, 21, 28, 35].map((k) => addDays(fim, -k))
      .filter((d) => !FERIADOS[d]).map((d) => (sm.get(d) || {}).fat || 0).filter((v) => v > 0).slice(0, 4)
    const referencia = mediana(mesmos), nRef = mesmos.length
    const k = (rows) => {
      const fat = soma(rows, 'valor_total'), vendas = soma(rows, 'vendas')
      const loj = rows.filter((r) => r.canal === 'Loja')
      const pessoas = soma(loj, 'pessoas')
      return { fat, vendas, pessoas, ticket: vendas ? fat / vendas : 0, porPessoa: pessoas ? soma(loj, 'valor_total') / pessoas : 0 }
    }
    const at = k(dia), an = k(diaAnt)
    const mm = porDia(mes)
    const diasMes = [...mm.values()].sort((x, y) => x.dia.localeCompare(y.dia)).map((d) => d.fat)
    const fatMes = soma(mes, 'valor_total'), fatMesAnt = soma(mesAnt, 'valor_total')
    const canais = agrupar(dia, 'canal', ['valor_total']).sort((a, b) => b.valor_total - a.valor_total)
    const setores = ['Cozinha', 'Sushi bar', 'Copa'].map((s) => ({ s, qtd: soma(setor.filter((r) => r.setor === s), 'qtd'), valor: soma(setor.filter((r) => r.setor === s), 'valor') }))
    return {
      hoje, referencia, nRef, d14, at, an, fatMes, fatMesAnt, diasMes, iniMes,
      canais, totCanais: soma(canais, 'valor_total'), setores, top: itens.slice(0, 6),
    }
  }, [st.dados, fim])

  const dDia = parseIso(fim)
  return (
    <Estado st={st}>
      {c && (
        <div className="cel">
          <section className="cel-abre">
            <div className="olho">Último dia · {NOME_DIA[dDia.getDay()]}, {br(fim)}</div>
            <h2 className="cel-titulo">O dia fechou em <em>{R0(c.hoje.fat)}</em></h2>
            <p className="cel-sub">
              {FERIADOS[fim] && <><b>Feriado: {FERIADOS[fim]}.</b>{' '}</>}
              {c.referencia > 0
                ? <><b className={c.hoje.fat >= c.referencia ? 'sobe' : 'desce'}>{fmtPct(pct(c.hoje.fat, c.referencia))}</b> em relação a uma {NOME_DIA[dDia.getDay()]} típica ({R0(c.referencia)}, mediana das últimas {c.nRef}, sem feriados).</>
                : <>{N(c.hoje.vendas)} vendas no dia.</>}
            </p>
          </section>

          <div className="olho cinza" style={{ marginBottom: -12 }}>{n === 1 ? 'No dia' : 'No período · ' + brCurto(ini) + ' a ' + brCurto(fim)}</div>
          <div className="cel-grade">
            {[
              ['Vendas', N(c.at.vendas), pct(c.at.vendas, c.an.vendas)],
              ['Ticket médio', R0(c.at.ticket), pct(c.at.ticket, c.an.ticket)],
              ['Pessoas no salão', N(c.at.pessoas), pct(c.at.pessoas, c.an.pessoas)],
              ['Gasto por pessoa', R0(c.at.porPessoa), pct(c.at.porPessoa, c.an.porPessoa)],
            ].map(([t, v, d]) => (
              <button key={t} className="cel-kpi" onClick={() => irPara('vendas')}>
                <div className="olho cinza">{t}</div>
                <div className="cel-kpi-v">{v}</div>
                {d != null && isFinite(d) && <div className={'cel-mini ' + (d >= 0 ? 'sobe' : 'desce')}><b>{fmtPct(d)}</b> {n === 1 ? 'vs ' + NOME_DIA[dDia.getDay()].slice(0, 3) + ' passada' : 'vs anterior'}</div>}
              </button>
            ))}
          </div>

          <section className="cel-canais">
            <div className="olho cinza">Faturamento por canal</div>
            <div className="cel-barra-canal">
              {c.canais.map((k) => <div key={k.chave} style={{ flex: k.valor_total, background: COR_CANAL[k.chave] || '#a08670' }} />)}
            </div>
            <div className="cel-legenda">
              {c.canais.map((k) => (
                <span key={k.chave}><i style={{ background: COR_CANAL[k.chave] || '#a08670' }} />{k.chave} <b>{Math.round((k.valor_total / (c.totCanais || 1)) * 100)}%</b></span>
              ))}
            </div>
          </section>

          <section className="cel-valor" onClick={() => irPara('vendas')}>
            <div>
              <div className="olho">Mês até agora</div>
              <div className="cel-num">{R0(c.fatMes)}</div>
              <div className="cel-mini">{brCurto(c.iniMes)} a {brCurto(fim)} · <b className={c.fatMes >= c.fatMesAnt ? 'sobe' : 'desce'}>{fmtPct(pct(c.fatMes, c.fatMesAnt))}</b> vs mesmo período do mês passado</div>
            </div>
            <Linha valores={c.diasMes} />
          </section>

          <section>
            <div className="cel-h2"><h3 className="cel-h">Últimos <em>dias</em></h3></div>
            <div className="cel-dias">
              {c.d14.slice(7).reverse().map((d) => (
                <div key={d.dia} className="cel-dia">
                  <div className="cel-barras">
                    <div style={{ height: Math.max(8, (d.fat / Math.max(...c.d14.map((x) => x.fat), 1)) * 100) + '%' }} />
                  </div>
                  <div className="olho">{NOME_DIA[parseIso(d.dia).getDay()].slice(0, 3)} · {brCurto(d.dia)}{FERIADOS[d.dia] ? ' · feriado' : ''}</div>
                  <div className="cel-dia-v">{curto(d.fat)}</div>
                  <div className="cel-mini">{N(d.vendas)} vendas</div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="cel-h2"><h3 className="cel-h">Produção <em>{n === 1 ? 'do dia' : 'no período'}</em></h3></div>
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
