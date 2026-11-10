import { lazy, Suspense, useEffect, useState } from 'react'
import { sb, presets, br } from './lib'
import Visao from './paginas/Visao'
import Vendas from './paginas/Vendas'
import Pagamentos from './paginas/Pagamentos'
import Itens from './paginas/Itens'
import Equipe from './paginas/Equipe'
import Cmv from './paginas/Cmv'
import Compras from './paginas/Compras'
import Estoque from './paginas/Estoque'
import Produtos from './paginas/Produtos'
const Importar = lazy(() => import('./paginas/Importar'))

const PAGINAS = [
  { id: 'visao', nome: 'Visão geral', ico: '◎', C: Visao },
  { id: 'vendas', nome: 'Vendas', ico: '▤', C: Vendas },
  { id: 'pagamentos', nome: 'Cartões e pagamentos', ico: '▭', C: Pagamentos },
  { id: 'itens', nome: 'Itens vendidos', ico: '❖', C: Itens },
  { id: 'equipe', nome: 'Garçons e operadores', ico: '☺', C: Equipe },
  { id: 'cmv', nome: 'CMV e insumos', ico: '%', C: Cmv },
  { id: 'compras', nome: 'Compras', ico: '⬇', C: Compras },
  { id: 'estoque', nome: 'Estoque', ico: '▦', C: Estoque, semPeriodo: true },
  { id: 'produtos', nome: 'Produtos e fichas', ico: '☰', C: Produtos, semPeriodo: true },
  { id: 'importar', nome: 'Importar arquivos', ico: '⇪', C: Importar, semPeriodo: true },
]

export default function App() {
  const [sessao, setSessao] = useState(undefined)
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSessao(data.session))
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSessao(s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (sessao === undefined) return <div className="carregando tela">Carregando…</div>
  if (!sessao) return <Login />
  return <Painel email={sessao.user.email} />
}

function Login() {
  const [modo, setModo] = useState('entrar')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [msg, setMsg] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    setOcupado(true); setMsg(null)
    const r = modo === 'entrar'
      ? await sb.auth.signInWithPassword({ email, password: senha })
      : await sb.auth.signUp({ email, password: senha, options: { emailRedirectTo: window.location.origin } })
    setOcupado(false)
    if (r.error) return setMsg({ erro: true, t: traduzir(r.error.message) })
    if (modo === 'criar' && !r.data.session)
      setMsg({ t: 'Conta criada! Confirme pelo link que chegou no seu e-mail e depois entre aqui.' })
  }

  return (
    <div className="login">
      <form onSubmit={enviar} className="login-box">
        <div className="marca">🍣 Dash ChefWeb</div>
        <p className="muted">{modo === 'entrar' ? 'Entre com seu e-mail e senha.' : 'Crie sua senha (mínimo 6 caracteres).'}</p>
        <input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={6} />
        <button className="btn prim" disabled={ocupado}>{ocupado ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}</button>
        {msg && <div className={'aviso ' + (msg.erro ? 'erro' : 'ok')}>{msg.t}</div>}
        <button type="button" className="link" onClick={() => { setModo(modo === 'entrar' ? 'criar' : 'entrar'); setMsg(null) }}>
          {modo === 'entrar' ? 'Primeiro acesso? Criar conta' : 'Já tenho conta'}
        </button>
      </form>
    </div>
  )
}

function traduzir(m) {
  if (/Invalid login/i.test(m)) return 'E-mail ou senha incorretos.'
  if (/Email not confirmed/i.test(m)) return 'Confirme o e-mail pelo link que enviamos antes de entrar.'
  if (/already registered/i.test(m)) return 'Esse e-mail já tem conta. Use "Já tenho conta".'
  return m
}

function Painel({ email }) {
  const [pag, setPag] = useState(() => localStorage.getItem('pag') || 'visao')
  const [lojas, setLojas] = useState([])
  const [loja, setLoja] = useState(() => Number(localStorage.getItem('loja')) || 1)
  const [ultimo, setUltimo] = useState(null)
  const [primeiro, setPrimeiro] = useState(null)
  const [periodo, setPeriodo] = useState(null)
  const [permitido, setPermitido] = useState(null)
  const [menuAberto, setMenuAberto] = useState(false)

  useEffect(() => {
    sb.rpc('is_staff').then(({ data }) => setPermitido(!!data))
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

  if (permitido === false)
    return (
      <div className="login"><div className="login-box">
        <div className="marca">🍣 Dash ChefWeb</div>
        <p>O e-mail <b>{email}</b> ainda não tem acesso à dash.</p>
        <p className="muted">Peça para a administração incluir seu e-mail na lista de usuários permitidos.</p>
        <button className="btn" onClick={() => sb.auth.signOut()}>Sair</button>
      </div></div>
    )

  const P = PAGINAS.find((p) => p.id === pag) || PAGINAS[0]
  const lista = presets(ultimo)

  return (
    <div className="app">
      <aside className={'lateral ' + (menuAberto ? 'aberto' : '')}>
        <div className="marca">🍣 Dash ChefWeb</div>
        <nav>
          {PAGINAS.map((p) => (
            <button key={p.id} className={pag === p.id ? 'on' : ''} onClick={() => { setPag(p.id); setMenuAberto(false) }}>
              <span className="ico">{p.ico}</span>{p.nome}
            </button>
          ))}
        </nav>
        <div className="rodape-lat">
          <div className="muted pequeno">{email}</div>
          <button className="link" onClick={() => sb.auth.signOut()}>Sair</button>
        </div>
      </aside>

      <main>
        <div className="topo">
          <button className="hamb" onClick={() => setMenuAberto(!menuAberto)}>☰</button>
          <h1>{P.nome}</h1>
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
                <input type="date" value={periodo.ini} onChange={(e) => e.target.value && setPeriodo({ ...periodo, id: 'pers', ini: e.target.value })} />
                <span className="muted">até</span>
                <input type="date" value={periodo.fim} onChange={(e) => e.target.value && setPeriodo({ ...periodo, id: 'pers', fim: e.target.value })} />
              </>
            )}
          </div>
        </div>
        {!P.semPeriodo && ultimo && (
          <div className="faixa muted pequeno">
            Dados de vendas de {br(primeiro)} a {br(ultimo)} · dia de operação (o caixa da noite conta para o dia em que abriu)
          </div>
        )}
        {!P.semPeriodo && !ultimo && permitido && (
          <div className="aviso">Ainda não há vendas desta loja no banco. Vá em <b>Importar arquivos</b> para carregar o histórico.</div>
        )}
        <div className="conteudo">
          {(P.semPeriodo || periodo) && (
            <Suspense fallback={<div className="carregando">Carregando…</div>}>
              <P.C key={P.id + loja} loja={loja} ini={periodo?.ini} fim={periodo?.fim} irPara={setPag} />
            </Suspense>
          )}
        </div>
      </main>
    </div>
  )
}
