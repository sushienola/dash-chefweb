import { useMemo, useState } from 'react'
import { rpcAll, R0, N2, P, soma, agrupar } from '../lib'
import { useDados, Estado, Card, Tabela, Kpi, Abas, Aviso } from '../ui'

export default function Compras({ loja, ini, fim }) {
  const [aba, setAba] = useState('forn')
  const [busca, setBusca] = useState('')
  const st = useDados(() => rpcAll('compras_resumo', { p_loja: loja, p_ini: ini, p_fim: fim }), [loja, ini, fim])

  const calc = useMemo(() => {
    if (!st.dados) return null
    const b = busca.trim().toUpperCase()
    const rows = st.dados.filter((r) => !b || String(r.produto).toUpperCase().includes(b) || String(r.fornecedor).toUpperCase().includes(b))
    const tot = soma(rows, 'valor')
    const forn = agrupar(rows, 'fornecedor', ['valor', 'compras']).map((f) => ({ ...f, pct: f.valor / tot })).sort((a, b) => b.valor - a.valor)
    const prod = new Map()
    rows.forEach((r) => {
      const o = prod.get(r.codigo) || { chave: r.codigo, codigo: r.codigo, produto: r.produto, un: r.un, qtde: 0, valor: 0, fornecedores: new Set() }
      o.qtde += Number(r.qtde); o.valor += Number(r.valor); o.fornecedores.add(r.fornecedor)
      prod.set(r.codigo, o)
    })
    const produtos = [...prod.values()].map((p) => ({ ...p, medio: p.qtde ? p.valor / p.qtde : 0, nforn: p.fornecedores.size, pct: p.valor / tot }))
    return { tot, forn, produtos, n: soma(rows, 'compras') }
  }, [st.dados, busca])

  return (
    <Estado st={st}>
      {calc && (
        <>
          {!st.dados.length && <Aviso>Nenhuma compra importada neste período. Suba o relatório R016 em <b>Importar arquivos</b>.</Aviso>}
          <div className="kpis">
            <Kpi titulo="Total comprado" valor={R0(calc.tot)} />
            <Kpi titulo="Lançamentos" valor={N2(calc.n)} />
            <Kpi titulo="Fornecedores" valor={N2(calc.forn.length)} />
            <Kpi titulo="Produtos" valor={N2(calc.produtos.length)} />
          </div>
          <div className="barra-filtros">
            <Abas ativa={aba} onChange={setAba} abas={[{ id: 'forn', nome: 'Por fornecedor' }, { id: 'prod', nome: 'Por produto' }]} />
            <input placeholder="Buscar produto ou fornecedor" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <Card>
            {aba === 'forn' ? (
              <Tabela colunas={[
                { k: 'chave', t: 'Fornecedor' },
                { k: 'compras', t: 'Lançamentos', num: true, f: N2 },
                { k: 'valor', t: 'Valor', num: true, f: R0 },
                { k: 'pct', t: '%', num: true, f: P },
              ]} linhas={calc.forn} />
            ) : (
              <Tabela colunas={[
                { k: 'codigo', t: 'Cód.' },
                { k: 'produto', t: 'Produto' },
                { k: 'un', t: 'Un' },
                { k: 'qtde', t: 'Qtd', num: true, f: N2 },
                { k: 'valor', t: 'Valor', num: true, f: R0 },
                { k: 'medio', t: 'Preço médio', num: true, f: (v) => 'R$ ' + N2(v) },
                { k: 'nforn', t: 'Fornec.', num: true },
                { k: 'pct', t: '%', num: true, f: P },
              ]} linhas={calc.produtos} />
            )}
          </Card>
        </>
      )}
    </Estado>
  )
}
