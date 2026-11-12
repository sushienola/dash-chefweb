import { useMemo, useState } from 'react'
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, CartesianGrid, ReferenceLine, Cell } from 'recharts'
import { rpcAll, R, R0, N, P, diffDays, soma, COR_GRADE } from '../lib'
import { useDados, Estado, Card, Tabela, Kpi, Abas, Aviso } from '../ui'

// Engenharia de cardápio clássica (Kasavana & Smith), calculada dentro de cada seção:
//  popular  = participação na seção >= 70% da participação média (1/n)
//  rentável = margem unitária (preço médio − custo da ficha) >= média ponderada da seção
export const CLASSE = {
  estrela: { nome: 'Destaque', cor: '#3d8f5f', dica: 'vende bem e tem boa margem' },
  burro: { nome: 'Rever custo', cor: '#d9a43a', dica: 'vende bem, margem abaixo da média' },
  enigma: { nome: 'Potencial', cor: '#8e5bd6', dica: 'boa margem, vende pouco' },
  cao: { nome: 'Baixo desempenho', cor: '#c94a3d', dica: 'vende pouco, margem abaixo da média' },
  pop: { nome: 'Vende bem', cor: '#e0c27a', dica: 'sem ficha para medir margem' },
  fraco: { nome: 'Pouca saída', cor: '#d9a3a0', dica: 'sem ficha para medir margem' },
  zero: { nome: 'Sem venda', cor: '#9a8f82', dica: 'nenhuma venda no período' },
}
const Selo = ({ c }) => (c ? <span className="tag" style={{ background: CLASSE[c].cor + '2a', color: '#2a2118' }} title={CLASSE[c].dica}>{CLASSE[c].nome}</span> : null)
const pct1 = (v) => (v * 100).toFixed(1).replace('.', ',') + '%'
const Var = ({ v }) => (v == null || !isFinite(v) ? <span className="muted">—</span> : <span className={'pill ' + (v > 0.05 ? 'up' : v < -0.05 ? 'down' : '')}>{(v > 0 ? '+' : '') + (v * 100).toFixed(0) + '%'}</span>)
const Barra = ({ v, max, cor = '#b99be8' }) => (
  <span style={{ display: 'inline-block', width: 90, height: 8, borderRadius: 4, background: '#f1ebe2', verticalAlign: 'middle' }}>
    <span style={{ display: 'block', width: Math.max(2, (max ? v / max : 0) * 90), height: 8, borderRadius: 4, background: cor }} />
  </span>
)

export default function Cardapio({ loja, ini, fim }) {
  const [aba, setAba] = useState('secoes')
  const [secao, setSecao] = useState('')
  const [exportando, setExportando] = useState(false)
  const st = useDados(async () => {
    const a = { p_loja: loja, p_ini: ini, p_fim: fim }
    const [itens, fora] = await Promise.all([rpcAll('cardapio_desempenho', a), rpcAll('cardapio_fora', a)])
    return { itens, fora }
  }, [loja, ini, fim])

  const dias = diffDays(ini, fim) + 1

  const calc = useMemo(() => {
    if (!st.dados || !st.dados.itens.length) return null
    const itens = st.dados.itens.map((r) => {
      const qtd = Number(r.qtd), valor = Number(r.valor), custo = r.custo == null ? null : Number(r.custo)
      const qa = Number(r.qtd_ant)
      return {
        id: r.id, secao: r.secao, os: r.ordem_secao, nome: r.nome, preco: r.preco == null ? null : Number(r.preco),
        codigos: r.codigos || [], qtd, valor, custo, qa, va: Number(r.valor_ant), dias: Number(r.dias),
        pm: qtd ? valor / qtd : null,
        margemU: qtd && custo != null ? (valor - custo) / qtd : null,
        margemPct: valor && custo != null ? (valor - custo) / valor : null,
        varQ: qa ? qtd / qa - 1 : qtd ? null : null,
        porDia: qtd / dias,
      }
    })
    // seções
    const secoes = []
    const porSec = new Map()
    itens.forEach((i) => { if (!porSec.has(i.secao)) { porSec.set(i.secao, []); secoes.push(i.secao) } porSec.get(i.secao).push(i) })
    const totValor = soma(itens, 'valor')
    const resumo = secoes.map((s) => {
      const l = porSec.get(s)
      const n = l.length, q = soma(l, 'qtd'), v = soma(l, 'valor')
      // margem média ponderada da seção (só itens com custo)
      const comC = l.filter((i) => i.margemU != null && i.qtd > 0)
      const mMed = soma(comC, 'qtd') ? soma(comC, (i) => i.margemU * i.qtd) / soma(comC, 'qtd') : null
      l.forEach((i) => {
        i.share = q ? i.qtd / q : 0
        i.popIdx = n ? i.share * n : 0                 // 1 = média da seção
        i.popular = i.popIdx >= 0.7
        i.mIdx = i.margemU != null && mMed ? i.margemU / mMed : null
        i.classe = i.qtd === 0 ? 'zero'
          : i.mIdx == null ? (i.popular ? 'pop' : 'fraco')
          : i.popular ? (i.mIdx >= 1 ? 'estrela' : 'burro') : (i.mIdx >= 1 ? 'enigma' : 'cao')
      })
      const qa = soma(l, 'qa'), va = soma(l, 'va')
      const ord = [...l].sort((a, b) => b.qtd - a.qtd)
      return {
        id: s, secao: s, n, qtd: q, valor: v, pct: totValor ? v / totValor : 0, varV: va ? v / va - 1 : null,
        parados: l.filter((i) => i.qtd === 0).length, campeao: ord[0] && ord[0].qtd ? ord[0].nome : '—',
        estrelas: l.filter((i) => i.classe === 'estrela').length, caes: l.filter((i) => i.classe === 'cao').length,
        margem: v && l.every((i) => i.custo != null || !i.qtd) ? (v - soma(l, (i) => i.custo || 0)) / v : null,
      }
    })
    // concentração: quantos itens fazem 80% do faturamento do cardápio
    const ord = [...itens].sort((a, b) => b.valor - a.valor)
    let acc = 0, n80 = 0
    for (const i of ord) { if (acc >= totValor * 0.8) break; acc += i.valor; n80++ }
    const comCusto = itens.filter((i) => i.custo != null)
    const vc = soma(comCusto, 'valor')
    return {
      itens, resumo, totValor, n80,
      totQa: soma(itens, 'va'),
      vendendo: itens.filter((i) => i.qtd > 0).length,
      parados: itens.filter((i) => i.qtd === 0),
      margem: vc ? (vc - soma(comCusto, 'custo')) / vc : null,
      semCusto: itens.filter((i) => i.custo == null && i.qtd > 0).length,
    }
  }, [st.dados, dias])

  async function exportar() {
    setExportando(true)
    try {
      const XLSX = await import('xlsx')
      const linhas = calc.itens.map((i) => ({
        Seção: i.secao, Item: i.nome, 'Preço cardápio': i.preco, 'Preço médio cobrado': i.pm == null ? '' : Math.round(i.pm * 100) / 100,
        Quantidade: i.qtd, 'Por dia': Math.round(i.porDia * 10) / 10, 'Valor (R$)': Math.round(i.valor * 100) / 100,
        '% da seção (qtd)': Math.round(i.share * 1000) / 10, 'Período anterior (qtd)': i.qa,
        'Variação %': i.varQ == null ? '' : Math.round(i.varQ * 1000) / 10,
        'Custo ficha (R$)': i.custo == null ? '' : Math.round(i.custo * 100) / 100,
        'Margem %': i.margemPct == null ? '' : Math.round(i.margemPct * 1000) / 10,
        Classificação: CLASSE[i.classe].nome, 'Códigos TOTVS': i.codigos.join(', '),
      }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), 'Cardápio')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(calc.resumo.map((s) => ({
        Seção: s.secao, Itens: s.n, Quantidade: s.qtd, 'Valor (R$)': Math.round(s.valor), '% do cardápio': Math.round(s.pct * 1000) / 10,
        'Mais pedido': s.campeao, 'Sem venda': s.parados,
      }))), 'Seções')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(st.dados.fora.map((f) => ({
        Código: f.codigo, Produto: f.produto, Subgrupo: f.subgrupo, Quantidade: Number(f.qtd), 'Valor (R$)': Number(f.valor),
      }))), 'Fora do cardápio')
      XLSX.writeFile(wb, `cardapio_${loja === 2 ? 'nola' : 'sushi'}_${ini}_a_${fim}.xlsx`)
    } finally { setExportando(false) }
  }

  if (st.dados && !st.dados.itens.length) {
    return <div className="aviso">O cardápio desta loja ainda não foi cadastrado. Mande as fotos do cardápio que eu ligo cada prato aos códigos da TOTVS.</div>
  }

  return (
    <Estado st={st}>
      {calc && (
        <>
          <div className="kpis">
            <Kpi titulo="Vendido do cardápio" valor={R0(calc.totValor)} delta={calc.totQa ? calc.totValor / calc.totQa - 1 : null} sub="vs período anterior" />
            <Kpi titulo="Pratos vendendo" valor={`${calc.vendendo} de ${calc.itens.length}`} sub={calc.parados.length ? `${calc.parados.length} sem nenhuma venda` : 'todos saíram'} />
            <Kpi titulo="Fazem 80% da venda" valor={`${calc.n80} pratos`} sub={pct1(calc.n80 / calc.itens.length) + ' do cardápio'} />
            <Kpi titulo={<>Margem do cardápio <span className="tag">teórico</span></>} valor={P(calc.margem)} sub="preço − custo da ficha" />
          </div>

          <div className="barra-filtros">
            <Abas ativa={aba} onChange={setAba} abas={[
              { id: 'secoes', nome: 'Por seção' }, { id: 'matriz', nome: 'Matriz' },
              { id: 'parados', nome: 'Pouca saída' }, { id: 'fora', nome: 'Fora do cardápio' },
            ]} />
            {(aba === 'secoes' || aba === 'matriz') && (
              <select value={secao} onChange={(e) => setSecao(e.target.value)}>
                <option value="">Todas as seções</option>
                {calc.resumo.map((s) => <option key={s.secao}>{s.secao}</option>)}
              </select>
            )}
            <button className="btn" onClick={exportar} disabled={exportando}>{exportando ? 'Gerando…' : '⬇ Exportar Excel'}</button>
          </div>

          {aba === 'secoes' && <Secoes calc={calc} secao={secao} setSecao={setSecao} />}
          {aba === 'matriz' && <Matriz calc={calc} secao={secao} />}
          {aba === 'parados' && <Parados calc={calc} dias={dias} />}
          {aba === 'fora' && <Fora fora={st.dados.fora} />}
        </>
      )}
    </Estado>
  )
}

function Secoes({ calc, secao, setSecao }) {
  const lista = secao ? calc.resumo.filter((s) => s.secao === secao) : calc.resumo
  const maxV = Math.max(...calc.resumo.map((s) => s.valor))
  return (
    <>
      {!secao && (
        <Card titulo="Seções do cardápio" ico="☰" extra={<span className="muted pequeno">clique para abrir a seção</span>}>
          <Tabela onClick={(s) => setSecao(s.secao)} colunas={[
            { k: 'secao', t: 'Seção', f: (v) => <b style={{ fontWeight: 600 }}>{v}</b> },
            { k: 'valor', t: 'Vendido', num: true, f: R0 },
            { k: 'barra', t: '', w: 100, f: (v, s) => <Barra v={s.valor} max={maxV} /> },
            { k: 'pct', t: '% cardápio', num: true, f: pct1 },
            { k: 'varV', t: 'vs anterior', num: true, f: (v) => <Var v={v} /> },
            { k: 'qtd', t: 'Qtd', num: true, f: N },
            { k: 'campeao', t: 'Mais pedido' },
            { k: 'parados', t: 'Sem venda', num: true, f: (v) => (v ? <span style={{ color: 'var(--verm)' }}>{v}</span> : <span className="muted">0</span>) },
          ]} linhas={calc.resumo} />
        </Card>
      )}
      {lista.map((s) => <SecaoCard key={s.secao} s={s} itens={calc.itens.filter((i) => i.secao === s.secao)} resumido={!secao} abrir={() => setSecao(s.secao)} />)}
      <Legenda />
    </>
  )
}

function SecaoCard({ s, itens, resumido, abrir }) {
  const ord = [...itens].sort((a, b) => b.qtd - a.qtd)
  const max = ord[0] ? ord[0].qtd : 0
  return (
    <Card titulo={s.secao} extra={resumido
      ? <button className="link" onClick={abrir}>ver os {s.n} pratos →</button>
      : <span className="muted pequeno">{R0(s.valor)} · {pct1(s.pct)} do cardápio</span>}>
      <Tabela max={resumido ? 5 : 100} colunas={[
        { k: 'nome', t: 'Prato', f: (v) => <b style={{ fontWeight: 600 }}>{v}</b> },
        { k: 'qtd', t: 'Qtd', num: true, f: (v) => (v ? N(v) : <span style={{ color: 'var(--verm)' }}>0</span>) },
        { k: 'share', t: '% da seção', w: 150, f: (v, i) => <span style={{ whiteSpace: 'nowrap' }}><Barra v={i.qtd} max={max} cor={CLASSE[i.classe].cor} /> <span className="muted pequeno">{pct1(v)}</span></span> },
        { k: 'varQ', t: 'vs anterior', num: true, f: (v) => <Var v={v} /> },
        { k: 'pm', t: 'Preço médio', num: true, f: (v, i) => (v == null ? '—' : <span title={i.preco ? 'cardápio ' + R(i.preco) : ''}>{R(v)}</span>) },
        { k: 'valor', t: 'Vendido', num: true, f: R0 },
        { k: 'margemPct', t: 'Margem', num: true, f: (v) => (v == null ? <span className="muted">—</span> : P(v)) },
        { k: 'classe', t: 'Leitura', f: (v) => <Selo c={v} /> },
      ]} linhas={ord} />
    </Card>
  )
}

function Matriz({ calc, secao }) {
  const pts = calc.itens.filter((i) => (!secao || i.secao === secao) && i.qtd > 0 && i.mIdx != null)
    .map((i) => ({ ...i, x: Math.min(i.popIdx, 4), y: Math.min(Math.max(i.mIdx, 0), 2.5) }))
  const contagem = Object.keys(CLASSE).slice(0, 4).map((c) => ({ c, n: pts.filter((p) => p.classe === c).length }))
  return (
    <>
      <div className="kpis">
        {contagem.map(({ c, n }) => <Kpi key={c} titulo={<><span style={{ color: CLASSE[c].cor }}>●</span> {CLASSE[c].nome}</>} valor={n} sub={CLASSE[c].dica} />)}
      </div>
      <Card titulo="Popularidade × margem" ico="✦" extra={<span className="muted pequeno">cada ponto é um prato, comparado com a média da própria seção</span>}>
        <ResponsiveContainer width="100%" height={420}>
          <ScatterChart margin={{ top: 10, right: 20, bottom: 24, left: 0 }}>
            <CartesianGrid stroke={COR_GRADE} />
            <XAxis type="number" dataKey="x" name="Popularidade" domain={[0, 'auto']} fontSize={11} tickLine={false}
              tickFormatter={(v) => v.toFixed(1) + '×'} label={{ value: 'popularidade (1× = média da seção)', position: 'insideBottom', offset: -12, fontSize: 11, fill: '#8a7a68' }} />
            <YAxis type="number" dataKey="y" name="Margem" domain={[0, 'auto']} fontSize={11} tickLine={false} width={44}
              tickFormatter={(v) => v.toFixed(1) + '×'} />
            <ZAxis type="number" dataKey="valor" range={[40, 420]} />
            <ReferenceLine x={0.7} stroke="#b9ab98" strokeDasharray="4 4" />
            <ReferenceLine y={1} stroke="#b9ab98" strokeDasharray="4 4" />
            <Tooltip cursor={false} content={({ payload }) => {
              const p = payload && payload[0] && payload[0].payload
              if (!p) return null
              return (
                <div style={{ background: '#fffaf2', border: '1px solid rgba(120,84,40,.15)', borderRadius: 14, padding: '8px 12px', fontSize: 12 }}>
                  <b>{p.nome}</b> <span className="muted">· {p.secao}</span><br />
                  {N(p.qtd)} vendidos · {R0(p.valor)}<br />
                  margem {P(p.margemPct)} ({R(p.margemU)} por unidade)<br />
                  <Selo c={p.classe} />
                </div>
              )
            }} />
            <Scatter data={pts} isAnimationActive={false}>
              {pts.map((p) => <Cell key={p.id} fill={CLASSE[p.classe].cor} fillOpacity={0.75} />)}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
        <Aviso>Direita = vende mais que a média da seção; em cima = margem por unidade acima da média. O tamanho do ponto é o valor vendido. Pratos sem custo de ficha não entram na matriz.</Aviso>
      </Card>
      <Card titulo="Pratos por leitura">
        <Tabela colunas={[
          { k: 'classe', t: 'Leitura', f: (v) => <Selo c={v} /> },
          { k: 'nome', t: 'Prato', f: (v) => <b style={{ fontWeight: 600 }}>{v}</b> },
          { k: 'secao', t: 'Seção', f: (v) => <span className="muted">{v}</span> },
          { k: 'qtd', t: 'Qtd', num: true, f: N },
          { k: 'popIdx', t: 'Popularidade', num: true, f: (v) => v.toFixed(1).replace('.', ',') + '×' },
          { k: 'margemU', t: 'Margem/un', num: true, f: R },
          { k: 'margemPct', t: 'Margem', num: true, f: P },
        ]} linhas={[...pts].sort((a, b) => Object.keys(CLASSE).indexOf(a.classe) - Object.keys(CLASSE).indexOf(b.classe) || b.valor - a.valor)} />
      </Card>
    </>
  )
}

function Parados({ calc, dias }) {
  // menos de 1 por semana, ou caindo mais de 40%
  const lim = Math.max(1, dias / 7)
  const l = calc.itens.filter((i) => i.qtd < lim || (i.varQ != null && i.varQ < -0.4 && i.qa >= 5))
    .sort((a, b) => a.qtd - b.qtd || (a.varQ ?? 0) - (b.varQ ?? 0))
  return (
    <Card titulo="Pratos com pouca saída ou caindo" ico="↘" extra={<span className="muted pequeno">menos de 1 por semana, ou queda maior que 40%</span>}>
      <Tabela colunas={[
        { k: 'nome', t: 'Prato', f: (v) => <b style={{ fontWeight: 600 }}>{v}</b> },
        { k: 'secao', t: 'Seção', f: (v) => <span className="muted">{v}</span> },
        { k: 'qtd', t: 'Qtd', num: true, f: (v) => (v ? N(v) : <span style={{ color: 'var(--verm)' }}>0</span>) },
        { k: 'qa', t: 'Período anterior', num: true, f: N },
        { k: 'varQ', t: 'Variação', num: true, f: (v) => <Var v={v} /> },
        { k: 'preco', t: 'Preço', num: true, f: (v) => (v == null ? '—' : R0(v)) },
        { k: 'codigos', t: '', f: (v) => (v.length ? null : <span className="muted pequeno">sem código ligado</span>) },
      ]} linhas={l} />
      <Aviso>Prato com zero pode estar fora de estoque, ter saído do cardápio ou estar com outro código na TOTVS.</Aviso>
    </Card>
  )
}

function Fora({ fora }) {
  const l = fora.map((f) => ({ id: f.codigo, ...f, qtd: Number(f.qtd), valor: Number(f.valor) }))
  return (
    <Card titulo="Vendido no salão, mas fora do cardápio" ico="✚" extra={<span className="muted pequeno">sugestões, sazonais, executivo e itens antigos</span>}>
      <Tabela colunas={[
        { k: 'produto', t: 'Produto TOTVS', f: (v) => <b style={{ fontWeight: 600 }}>{v}</b> },
        { k: 'subgrupo', t: 'Subgrupo', f: (v) => <span className="muted">{v}</span> },
        { k: 'qtd', t: 'Qtd', num: true, f: N },
        { k: 'valor', t: 'Vendido', num: true, f: R0 },
        { k: 'codigo', t: 'Código', num: true },
      ]} linhas={l} />
      <Aviso>Se algum destes é na verdade um prato do cardápio com outro código, me avise que eu ligo.</Aviso>
    </Card>
  )
}

function Legenda() {
  return (
    <Aviso>
      Leitura comparada com a média da própria seção. Margem teórica, pelo custo da ficha.
    </Aviso>
  )
}
