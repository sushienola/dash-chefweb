import { useEffect, useMemo, useState } from 'react'
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'
import { rpcAll, R, R0, N2, P, kR, brCurto, soma } from '../lib'
import { useDados, Estado, Card, Tabela, Kpi, Aviso, Abas, tooltipStyle } from '../ui'

export default function Cmv({ loja, ini, fim }) {
  const [aba, setAba] = useState('teorico')
  return (
    <>
      <Abas ativa={aba} onChange={setAba} abas={[
        { id: 'teorico', nome: 'CMV teórico (fichas)' },
        { id: 'insumos', nome: 'Consumo de insumos × compras' },
        { id: 'real', nome: 'CMV real (estoque + compras)' },
      ]} />
      {aba === 'teorico' && <Teorico loja={loja} ini={ini} fim={fim} />}
      {aba === 'insumos' && <Insumos loja={loja} ini={ini} fim={fim} />}
      {aba === 'real' && <Real loja={loja} ini={ini} fim={fim} />}
    </>
  )
}

function Teorico({ loja, ini, fim }) {
  const st = useDados(async () => {
    const a = { p_loja: loja, p_ini: ini, p_fim: fim }
    const [dia, rank] = await Promise.all([rpcAll('cmv_teorico_dia', a), rpcAll('itens_ranking', a)])
    return { dia, rank }
  }, [loja, ini, fim])

  const calc = useMemo(() => {
    if (!st.dados) return null
    const { dia, rank } = st.dados
    const fat = soma(dia, 'faturamento'), fatF = soma(dia, 'faturamento_com_ficha'), custo = soma(dia, 'custo_teorico')
    const sem = rank.filter((r) => r.custo_unit == null).sort((a, b) => b.valor - a.valor)
    const pratos = rank.filter((r) => r.custo_unit != null && r.valor > 0)
      .map((r) => ({ ...r, id: r.codigo, cmv: r.custo_total / r.valor, margem: r.valor - r.custo_total }))
    return {
      fat, fatF, custo, cobertura: fat ? fatF / fat : 0,
      dia: dia.map((d) => ({ ...d, pct: d.faturamento_com_ficha ? (d.custo_teorico / d.faturamento_com_ficha) * 100 : null })),
      sem, pratos,
    }
  }, [st.dados])

  return (
    <Estado st={st}>
      {calc && (
        <>
          <Aviso>
            CMV teórico = quanto <b>deveria</b> ter custado o que foi vendido, pelas fichas técnicas (custo atual de cada insumo).
          </Aviso>
          <div className="kpis">
            <Kpi titulo={<>CMV <span className="tag">teórico</span></>} valor={P(calc.fatF ? calc.custo / calc.fatF : null)} />
            <Kpi titulo={<>Custo <span className="tag">teórico</span></>} valor={R0(calc.custo)} />
            <Kpi titulo="Faturamento considerado" valor={R0(calc.fatF)} />
          </div>
          <Card titulo="Custo teórico × faturamento por dia">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={calc.dia}>
                <CartesianGrid vertical={false} stroke="rgba(120,84,40,.10)" />
                <XAxis dataKey="dia" tickFormatter={brCurto} fontSize={11} />
                <YAxis yAxisId="v" tickFormatter={kR} fontSize={11} width={70} />
                <YAxis yAxisId="p" orientation="right" tickFormatter={(v) => v.toFixed(0) + '%'} fontSize={11} width={45} />
                <Tooltip {...tooltipStyle} labelFormatter={brCurto}
                  formatter={(v, n) => (n === 'CMV %' ? (v == null ? '—' : v.toFixed(1) + '%') : R(v))} />
                <Legend />
                <Bar yAxisId="v" dataKey="faturamento_com_ficha" name="Faturamento c/ ficha" fill="#e6d8fb" />
                <Bar yAxisId="v" dataKey="custo_teorico" name="Custo teórico" fill="#e8743b" />
                <Line yAxisId="p" dataKey="pct" name="CMV %" stroke="#8e5bd6" dot={false} strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>
          <Card titulo="Pratos: custo e margem">
            <Tabela ordemInicial={{ k: 'custo_total', asc: false }} colunas={[
              { k: 'produto', t: 'Produto' },
              { k: 'subgrupo', t: 'Subgrupo' },
              { k: 'qtd', t: 'Qtd', num: true, f: N2 },
              { k: 'valor', t: 'Vendido', num: true, f: R0 },
              { k: 'custo_unit', t: 'Custo unit.', num: true, f: R },
              { k: 'custo_total', t: 'Custo total', num: true, f: R0 },
              { k: 'cmv', t: 'CMV %', num: true, f: P },
              { k: 'margem', t: 'Margem', num: true, f: R0 },
            ]} linhas={calc.pratos} max={300} />
          </Card>
          <details className="discreto">
            <summary>outros produtos ({calc.sem.length})</summary>
            <Tabela colunas={[
              { k: 'codigo', t: 'Cód.' },
              { k: 'produto', t: 'Produto' },
              { k: 'subgrupo', t: 'Subgrupo' },
              { k: 'valor', t: 'Vendido', num: true, f: R0 },
            ]} linhas={calc.sem} max={50} />
          </details>
        </>
      )}
    </Estado>
  )
}

function Insumos({ loja, ini, fim }) {
  const [busca, setBusca] = useState('')
  const st = useDados(() => rpcAll('consumo_insumos', { p_loja: loja, p_ini: ini, p_fim: fim }), [loja, ini, fim])
  const linhas = useMemo(() => {
    if (!st.dados) return []
    const b = busca.trim().toUpperCase()
    return st.dados.filter((r) => !b || String(r.insumo).toUpperCase().includes(b))
      .map((r) => ({ ...r, id: r.codigo, dif: r.valor_comprado != null && r.custo_teorico != null ? r.valor_comprado - r.custo_teorico : null }))
  }, [st.dados, busca])
  return (
    <Estado st={st}>
      <Aviso>
        <b>Consumo teórico</b> = vendas × fichas técnicas, quebrado até o ingrediente final, na unidade de compra do insumo.
        <b> Comprado</b> vem dos arquivos de compras (R016) importados. Compras não batem com consumo no mesmo dia
        (estoque); compare períodos de um mês ou mais.
      </Aviso>
      <div className="barra-filtros">
        <input placeholder="Buscar insumo" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <span className="muted pequeno">
          Total teórico {R0(soma(linhas, 'custo_teorico'))} · comprado {R0(soma(linhas, 'valor_comprado'))}
        </span>
      </div>
      <Card>
        <Tabela colunas={[
          { k: 'codigo', t: 'Cód.' },
          { k: 'insumo', t: 'Insumo' },
          { k: 'un', t: 'Un' },
          { k: 'qtd_teorica', t: 'Qtd consumida (teórica)', num: true, f: (v) => (v == null ? '—' : N2(v)) },
          { k: 'custo_teorico', t: 'Custo teórico', num: true, f: (v) => (v == null ? '—' : R0(v)) },
          { k: 'qtd_comprada', t: 'Qtd comprada', num: true, f: (v) => (v == null ? '—' : N2(v)) },
          { k: 'valor_comprado', t: 'Valor comprado', num: true, f: (v) => (v == null ? '—' : R0(v)) },
          { k: 'dif', t: 'Comprado − teórico', num: true, f: (v) => (v == null ? '—' : R0(v)) },
        ]} linhas={linhas} max={400} />
      </Card>
    </Estado>
  )
}

function Real({ loja, ini, fim }) {
  const refs = useDados(() => rpcAll('referencias_contagem', { p_loja: loja }), [loja])
  const [refIni, setRefIni] = useState('')
  const [refFim, setRefFim] = useState('')
  useEffect(() => {
    const r = refs.dados || []
    setRefFim(r[0]?.referencia || ''); setRefIni(r[1]?.referencia || '')
  }, [refs.dados])

  const st = useDados(async () => {
    if (!refFim) return null
    const a = { p_loja: loja, p_ini: ini, p_fim: fim }
    const [cat, rank] = await Promise.all([
      rpcAll('cmv_real', { p_loja: loja, p_ref_ini: refIni || '-', p_ref_fim: refFim, p_ini: ini, p_fim: fim }),
      rpcAll('itens_ranking', a),
    ])
    return { cat, rank }
  }, [loja, refIni, refFim, ini, fim])

  const calc = useMemo(() => {
    if (!st.dados) return null
    const { cat, rank } = st.dados
    const grupo = (c) => {
      const s = String(c || '').toUpperCase()
      if (s.startsWith('BEBIDA')) return 'Bebidas'
      if (s.startsWith('ALIMENTO')) return 'Alimentos'
      if (s.startsWith('EMBALAG')) return 'Embalagens'
      if (s.includes('LIMPEZA') || s.includes('OPERACIONAL') || s.includes('HIGIENE')) return 'Operacional e limpeza'
      return 'Outros'
    }
    const linhas = cat.map((c) => ({ ...c, chave: c.categoria, grupo: grupo(c.categoria) }))
    const fatBeb = soma(rank.filter((r) => String(r.grupo || '').includes('BEBIDA')), 'valor')
    const fatAli = soma(rank, 'valor') - fatBeb
    const grupos = ['Alimentos', 'Bebidas', 'Embalagens', 'Operacional e limpeza', 'Outros'].map((g) => {
      const ls = linhas.filter((l) => l.grupo === g)
      const cmv = soma(ls, 'cmv')
      const fat = g === 'Alimentos' ? fatAli : g === 'Bebidas' ? fatBeb : null
      return { chave: g, ei: soma(ls, 'estoque_inicial'), co: soma(ls, 'compras'), ef: soma(ls, 'estoque_final'), cmv, fat, pct: fat ? cmv / fat : null }
    }).filter((g) => g.ei || g.co || g.ef)
    return { linhas, grupos, fatTot: fatAli + fatBeb, cmvTot: soma(linhas, 'cmv') }
  }, [st.dados])

  const lista = refs.dados || []
  return (
    <Estado st={refs}>
      {!lista.length ? (
        <Aviso>Nenhuma contagem de estoque importada para esta loja. Vá em <b>Importar arquivos</b> e suba o fechamento de estoque.</Aviso>
      ) : (
        <>
          <Aviso>
            CMV real = estoque inicial + compras do período − estoque final. Escolha as contagens de início e fim e ajuste
            o período no topo para o mesmo mês das compras (ex.: contagem de set → contagem de out, período = outubro).
          </Aviso>
          <div className="barra-filtros">
            <label>Estoque inicial
              <select value={refIni} onChange={(e) => setRefIni(e.target.value)}>
                <option value="">(sem contagem inicial)</option>
                {lista.map((r) => <option key={r.referencia} value={r.referencia}>{r.referencia} · {R0(r.valor)}</option>)}
              </select>
            </label>
            <label>Estoque final
              <select value={refFim} onChange={(e) => setRefFim(e.target.value)}>
                {lista.map((r) => <option key={r.referencia} value={r.referencia}>{r.referencia} · {R0(r.valor)}</option>)}
              </select>
            </label>
          </div>
          <Estado st={st}>
            {calc && (
              <>
                <div className="kpis">
                  <Kpi titulo="CMV total" valor={R0(calc.cmvTot)} />
                  <Kpi titulo="Faturamento de itens" valor={R0(calc.fatTot)} sub="no período escolhido" />
                  <Kpi titulo="CMV % geral" valor={P(calc.fatTot ? calc.cmvTot / calc.fatTot : null)} />
                </div>
                <Card titulo="Por grupo">
                  <Tabela colunas={[
                    { k: 'chave', t: 'Grupo' },
                    { k: 'ei', t: 'Estoque inicial', num: true, f: R0 },
                    { k: 'co', t: 'Compras', num: true, f: R0 },
                    { k: 'ef', t: 'Estoque final', num: true, f: R0 },
                    { k: 'cmv', t: 'CMV', num: true, f: R0 },
                    { k: 'fat', t: 'Faturamento', num: true, f: (v) => (v == null ? '—' : R0(v)) },
                    { k: 'pct', t: 'CMV %', num: true, f: P },
                  ]} linhas={calc.grupos} />
                </Card>
                <Card titulo="Por categoria">
                  <Tabela colunas={[
                    { k: 'categoria', t: 'Categoria' },
                    { k: 'estoque_inicial', t: 'Estoque inicial', num: true, f: R0 },
                    { k: 'compras', t: 'Compras', num: true, f: R0 },
                    { k: 'estoque_final', t: 'Estoque final', num: true, f: R0 },
                    { k: 'cmv', t: 'CMV', num: true, f: R0 },
                  ]} linhas={calc.linhas} />
                </Card>
              </>
            )}
          </Estado>
        </>
      )}
    </Estado>
  )
}
