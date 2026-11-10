import { lazy, Suspense, useEffect, useState } from 'react'
import { sb, presets, br } from './lib'
import { useCelular } from './ui'
import Visao from './paginas/Visao'
import Vendas from './paginas/Vendas'
import Pagamentos from './paginas/Pagamentos'
import Itens from './paginas/Itens'
import Equipe from './paginas/Equipe'
import Cmv from './paginas/Cmv'
import Compras from './paginas/Compras'
import ContasPagar from './paginas/ContasPagar'
import Estoque from './paginas/Estoque'
import Produtos from './paginas/Produtos'
const Importar = lazy(() => import('./paginas/Importar'))

const PAGINAS = [
  { id: 'visao', sec: 'Principal', nome: 'Visão geral', ico: '◎', C: Visao, t: 'Visão <em>geral</em>', sub: 'Faturamento, canais e pagamentos num lugar só' },
  { id: 'vendas', sec: 'Principal', nome: 'Vendas', ico: '▤', C: Vendas, t: 'Vendas <em>dia a dia</em>', sub: 'Cada dia de operação, do salão ao delivery' },
  { id: 'pagamentos', sec: 'Principal', nome: 'Cartões e pagamentos', ico: '▭', C: Pagamentos, t: 'Cartões e <em>pagamentos</em>', sub: 'Formas, bandeiras e maquininhas' },
  { id: 'itens', sec: 'Principal', nome: 'Itens vendidos', ico: '❖', C: Itens, t: 'Itens <em>vendidos</em>', sub: 'Ranking, cozinha e horários de pedido' },
  { id: 'equipe', sec: 'Principal', nome: 'Garçons e operadores', ico: '☺', C: Equipe, t: 'Equipe', sub: 'Quem mais vende, sem repetir o valor da mesa' },
  { id: 'cmv', sec: 'Custos', nome: 'CMV e insumos', ico: '%', C: Cmv, t: 'CMV e <em>insumos</em>', sub: 'Quanto custou o que foi vendido' },
  { id: 'compras', sec: 'Custos', nome: 'Compras', ico: '↓', C: Compras, t: 'Compras', sub: 'Por fornecedor e por produto' },
  { id: 'contas', sec: 'Custos', nome: 'Contas a pagar', ico: '$', C: ContasPagar, t: 'Contas a <em>pagar</em>', sub: 'Vencimentos, pagos e em aberto' },
  { id: 'estoque', sec: 'Custos', nome: 'Contagem', ico: '▦', C: Estoque, semPeriodo: true, t: 'Contagem', sub: 'Fechamentos e contagens de estoque' },
  { id: 'produtos', sec: 'Cadastros', nome: 'Produtos e fichas', ico: '☰', C: Produtos, semPeriodo: true, t: 'Produtos e <em>fichas</em>', sub: 'Cardápio, cozinha e custo de cada prato' },
  { id: 'importar', sec: 'Cadastros', nome: 'Importar arquivos', ico: '⇪', C: Importar, semPeriodo: true, t: 'Importar <em>arquivos</em>', sub: 'Relatórios da TOTVS e planilhas de contagem' },
]

export default function App() {
  return <Painel />
}

function Painel() {
  const [pag, setPag] = useState(() => localStorage.getItem('pag') || 'visao')
  const [lojas, setLojas] = useState([])
  const [loja, setLoja] = useState(() => Number(localStorage.getItem('loja')) || 1)
  const [ultimo, setUltimo] = useState(undefined)
  const [primeiro, setPrimeiro] = useState(null)
  const [periodo, setPeriodo] = useState(null)
  const [menuAberto, setMenuAberto] = useState(false)
  const cel = useCelular()

  useEffect(() => {
    sb.from('lojas').select('*').order('id').then(({ data }) => setLojas(data || []))
  }, [])

  useEffect(() => {
    try { localStorage.setItem('loja', loja); localStorage.setItem('pag', pag) } catch { /* sem storage */ }
  }, [loja, pag])

  useEffect(() => {
    sb.rpc('periodo_dados', { p_loja: loja }).then(({ data }) => {
      const r = (data && data[0]) || {}
      setUltimo(r.ultimo || null); setPrimeiro(r.primeiro || null)
      const p = presets(r.ultimo).find((x) => x.id === '30d')
      setPeriodo({ id: '30d', ini: p.ini, fim: p.fim })
    })
  }, [loja])

  const P = PAGINAS.find((p) => p.id === pag) || PAGINAS[0]
  const lista = presets(ultimo)

  return (
    <div className="app">
      <aside className={'lateral ' + (menuAberto ? 'aberto' : '')}>
        <div className="marca"><img className="logo" src="/favicon.svg" alt="" />Dash ChefWeb</div>
        <nav>
          {['Principal', 'Custos', 'Cadastros'].map((sec) => (
            <div key={sec} style={{ display: 'contents' }}>
              <div className="nav-sec">{sec}</div>
              {PAGINAS.filter((p) => p.sec === sec).map((p) => (
                <button key={p.id} className={pag === p.id ? 'on' : ''} onClick={() => { setPag(p.id); setMenuAberto(false) }}>
                  <span className="ico">{p.ico}</span>{p.nome}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="usuario">
          <div className="avatar">{((lojas.find((l) => l.id === loja) || {}).nome || '··').slice(0, 2)}</div>
          <div className="info">
            <div style={{ fontWeight: 600, fontSize: 13 }}>{(lojas.find((l) => l.id === loja) || {}).nome || ''}</div>
            <div className="muted pequeno">Dash ChefWeb</div>
          </div>
        </div>
      </aside>

      <main>
        <div className={'topo' + (cel && pag === 'visao' ? ' topo-cel-inicio' : '')}>
          <button className="hamb" onClick={() => setMenuAberto(!menuAberto)}>☰</button>
          <div className="titulo">
            <div className="sobre">
              {(lojas.find((l) => l.id === loja) || {}).nome || ''}
              {!P.semPeriodo && periodo ? ' · ' + ((lista.find((x) => x.id === periodo.id) || {}).nome || 'personalizado') : ''}
            </div>
            <h1 dangerouslySetInnerHTML={{ __html: P.t }} />
            <p>{P.sub}</p>
          </div>
          <div className="filtros">
            <select value={loja} onChange={(e) => setLoja(Number(e.target.value))}>
              {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
            {!P.semPeriodo && periodo && (
              <>
                <select value={periodo.id} onChange={(e) => {
                  const p = lista.find((x) => x.id === e.target.value)
                  setPeriodo(p ? { id: p.id, ini: p.ini, fim: p.fim } : { ...periodo, id: 'pers' })
                }}>
                  {lista.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  <option value="pers">Personalizado</option>
                </select>
                {(!cel || periodo.id === 'pers') && <>
                <input type="date" value={periodo.ini} onChange={(e) => e.target.value && setPeriodo({ ...periodo, id: 'pers', ini: e.target.value })} />
                <span className="muted">até</span>
                <input type="date" value={periodo.fim} onChange={(e) => e.target.value && setPeriodo({ ...periodo, id: 'pers', fim: e.target.value })} />
                </>}
              </>
            )}
          </div>
        </div>
        {!P.semPeriodo && ultimo && !cel && (
          <div className="faixa muted pequeno">
            Dados de vendas de {br(primeiro)} a {br(ultimo)} · dia de operação (o caixa da noite conta para o dia em que abriu)
          </div>
        )}
        {!P.semPeriodo && ultimo === null && (
          <div className="hero" style={{ minHeight: 0, marginTop: 12 }}>
            <div className="selo"><span>Primeiro passo</span></div>
            <h2>Ainda não há <em>vendas</em> desta loja</h2>
            <p>O banco está vazio. Suba o arquivo Historico_Reorganizado.xlsx para carregar março a novembro.</p>
            <div style={{ marginTop: 16 }}><button className="btn prim" onClick={() => setPag('importar')}>Ir para Importar arquivos →</button></div>
          </div>
        )}
        <div className="conteudo">
          {(P.semPeriodo || (periodo && ultimo)) && (
            <Suspense fallback={<div className="carregando">Carregando…</div>}>
              <P.C key={P.id + loja} loja={loja} ini={periodo?.ini} fim={periodo?.fim} irPara={setPag} />
            </Suspense>
          )}
        </div>
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={(t.id === 'mais' ? menuAberto : pag === t.id && !menuAberto) ? 'on' : ''}
            onClick={() => (t.id === 'mais' ? setMenuAberto(!menuAberto) : (setPag(t.id), setMenuAberto(false)))}>
            {t.svg}
            <span>{t.nome}</span>
          </button>
        ))}
      </nav>
      {menuAberto && <div className="veu" onClick={() => setMenuAberto(false)} />}
    </div>
  )
}

const ic = (d) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
)
const TABS = [
  { id: 'visao', nome: 'Início', svg: ic(<path d="M3 17l5-5 4 3 8-8M15 7h5v5" />) },
  { id: 'vendas', nome: 'Vendas', svg: ic(<><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="4" y="14" width="6" height="6" rx="1.5" /><rect x="14" y="14" width="6" height="6" rx="1.5" /></>) },
  { id: 'itens', nome: 'Itens', svg: ic(<><path d="M7 3h7l4 4v14H7z" /><path d="M10 12h5M10 16h5M10 8h2" /></>) },
  { id: 'cmv', nome: 'CMV', svg: ic(<><circle cx="7" cy="7" r="2.5" /><circle cx="17" cy="17" r="2.5" /><path d="M19 5L5 19" /></>) },
  { id: 'mais', nome: 'Mais', svg: ic(<><path d="M4 7h16M4 12h16M4 17h10" /></>) },
]
