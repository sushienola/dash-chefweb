import { useEffect, useMemo, useState } from 'react'

// carrega dados assíncronos com estado de carregando/erro
export function useDados(fn, deps) {
  const [st, setSt] = useState({ carregando: true, erro: null, dados: null })
  useEffect(() => {
    let vivo = true
    setSt((s) => ({ ...s, carregando: true, erro: null }))
    fn()
      .then((dados) => vivo && setSt({ carregando: false, erro: null, dados }))
      .catch((e) => vivo && setSt({ carregando: false, erro: e.message || String(e), dados: null }))
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return st
}

export function Estado({ st, children }) {
  if (st.erro) return <div className="aviso erro">Erro ao carregar: {st.erro}</div>
  if (st.carregando && !st.dados) return <div className="carregando">Carregando…</div>
  return children
}

export function Kpi({ titulo, valor, sub, delta }) {
  return (
    <div className="kpi">
      <div className="kpi-t">{titulo}</div>
      <div className="kpi-v">{valor}</div>
      {(sub || delta != null) && (
        <div className="kpi-s">
          {delta != null && isFinite(delta) && (
            <span className={'pill ' + (delta >= 0 ? 'up' : 'down')}>
              {delta >= 0 ? '+' : '−'}{Math.abs(delta * 100).toFixed(1).replace('.', ',')}%
            </span>
          )}
          {sub && <span> {sub}</span>}
        </div>
      )}
    </div>
  )
}

export function Card({ titulo, ico, extra, children, className = '' }) {
  return (
    <section className={'card ' + className}>
      {(titulo || extra) && (
        <header className="card-h">
          <h3>{ico && <span className="ico-t">{ico}</span>}{titulo}</h3>
          {extra}
        </header>
      )}
      {children}
    </section>
  )
}

export function Aviso({ children, tipo = '' }) {
  return <div className={'aviso ' + tipo}>{children}</div>
}

// tabela ordenável. colunas: [{k, t, f (formatador), num (bool), w}]
export function Tabela({ colunas, linhas, max = 500, ordemInicial, onClick, selecionado, rodape }) {
  const [ordem, setOrdem] = useState(ordemInicial || null)
  const ord = useMemo(() => {
    if (!ordem) return linhas
    const { k, asc } = ordem
    return [...linhas].sort((a, b) => {
      const x = a[k], y = b[k]
      if (typeof x === 'number' || typeof y === 'number') return asc ? (x || 0) - (y || 0) : (y || 0) - (x || 0)
      return asc ? String(x ?? '').localeCompare(String(y ?? '')) : String(y ?? '').localeCompare(String(x ?? ''))
    })
  }, [linhas, ordem])
  return (
    <div className="tabela-w">
      <table className="tabela">
        <thead>
          <tr>
            {colunas.map((c) => (
              <th key={c.k} className={c.num ? 'num' : ''} style={c.w ? { width: c.w } : null}
                onClick={() => setOrdem((o) => ({ k: c.k, asc: o && o.k === c.k ? !o.asc : !c.num }))}>
                {c.t}{ordem && ordem.k === c.k ? (ordem.asc ? ' ↑' : ' ↓') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ord.slice(0, max).map((l, i) => (
            <tr key={l.id ?? l.chave ?? i} onClick={onClick ? () => onClick(l) : null}
              className={(onClick ? 'clic ' : '') + (selecionado != null && selecionado === (l.id ?? l.chave) ? 'sel' : '')}>
              {colunas.map((c) => (
                <td key={c.k} className={c.num ? 'num' : ''}>{c.f ? c.f(l[c.k], l) : l[c.k]}</td>
              ))}
            </tr>
          ))}
          {!ord.length && (
            <tr><td colSpan={colunas.length} className="vazio">Sem dados no período.</td></tr>
          )}
        </tbody>
        {rodape && <tfoot><tr>{colunas.map((c) => <td key={c.k} className={c.num ? 'num' : ''}>{rodape[c.k] ?? ''}</td>)}</tr></tfoot>}
      </table>
      {ord.length > max && <div className="mais">Mostrando {max} de {ord.length} linhas.</div>}
    </div>
  )
}

export function Abas({ abas, ativa, onChange }) {
  return (
    <div className="abas">
      {abas.map((a) => (
        <button key={a.id} className={ativa === a.id ? 'on' : ''} onClick={() => onChange(a.id)}>{a.nome}</button>
      ))}
    </div>
  )
}

export const tooltipStyle = {
  contentStyle: { borderRadius: 14, border: '1px solid rgba(120,84,40,.15)', fontSize: 12, background: '#fffaf2', boxShadow: '0 8px 24px rgba(80,50,10,.10)' },
  labelStyle: { fontWeight: 600 },
}
