import { useEffect, useMemo, useState } from 'react'
import { rpcAll, selectAll, R0, R, N2, br, soma, agrupar } from '../lib'
import { useDados, Estado, Card, Tabela, Kpi, Aviso, Abas } from '../ui'

export default function Estoque({ loja }) {
  const refs = useDados(() => rpcAll('referencias_contagem', { p_loja: loja }), [loja])
  const [ref, setRef] = useState('')
  const [aba, setAba] = useState('cat')
  const [busca, setBusca] = useState('')
  useEffect(() => { setRef(refs.dados?.[0]?.referencia || '') }, [refs.dados])

  const st = useDados(async () => (ref ? selectAll('contagens', (q) => q.eq('loja', loja).eq('referencia', ref)) : []), [loja, ref])

  const calc = useMemo(() => {
    if (!st.dados) return null
    const b = busca.trim().toUpperCase()
    const rows = st.dados.filter((r) => !b || String(r.produto).toUpperCase().includes(b))
    return {
      tot: soma(rows, 'valor_estoque'),
      cat: agrupar(rows, (r) => r.categoria_cadastro || r.categoria, ['valor_estoque']).sort((a, b) => b.valor_estoque - a.valor_estoque),
      setor: agrupar(rows, 'setor', ['valor_estoque']).sort((a, b) => b.valor_estoque - a.valor_estoque),
      itens: rows.map((r) => ({ ...r, chave: r.id })),
      resp: [...new Set(rows.map((r) => r.responsavel).filter(Boolean))].join(', '),
      datas: [...new Set(rows.map((r) => r.data))].sort().map(br).join(', '),
    }
  }, [st.dados, busca])

  const lista = refs.dados || []
  return (
    <Estado st={refs}>
      {!lista.length ? (
        <Aviso>Nenhuma contagem importada para esta loja. Suba a planilha de contagem em <b>Importar arquivos</b>.</Aviso>
      ) : (
        <>
          <div className="barra-filtros">
            <label>Contagem
              <select value={ref} onChange={(e) => setRef(e.target.value)}>
                {lista.map((r) => <option key={r.referencia} value={r.referencia}>{r.referencia} · {R0(r.valor)} · {r.linhas} itens</option>)}
              </select>
            </label>
            <input placeholder="Buscar produto" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <Estado st={st}>
            {calc && (
              <>
                <div className="kpis">
                  <Kpi titulo="Valor em estoque" valor={R0(calc.tot)} />
                  <Kpi titulo="Itens contados" valor={N2(calc.itens.length)} />
                  <Kpi titulo="Contado em" valor={calc.datas || '—'} sub={calc.resp} />
                </div>
                <Abas ativa={aba} onChange={setAba} abas={[
                  { id: 'cat', nome: 'Por categoria' }, { id: 'setor', nome: 'Por setor' }, { id: 'itens', nome: 'Todos os itens' },
                ]} />
                <Card>
                  {aba === 'cat' && <Tabela colunas={[{ k: 'chave', t: 'Categoria' }, { k: 'valor_estoque', t: 'Valor', num: true, f: R0 }]} linhas={calc.cat} />}
                  {aba === 'setor' && <Tabela colunas={[{ k: 'chave', t: 'Setor' }, { k: 'valor_estoque', t: 'Valor', num: true, f: R0 }]} linhas={calc.setor} />}
                  {aba === 'itens' && (
                    <Tabela ordemInicial={{ k: 'valor_estoque', asc: false }} colunas={[
                      { k: 'setor', t: 'Setor' },
                      { k: 'categoria', t: 'Categoria' },
                      { k: 'codigo', t: 'Cód.' },
                      { k: 'produto', t: 'Produto' },
                      { k: 'qtd_contada', t: 'Qtd', num: true, f: N2 },
                      { k: 'un_cadastro', t: 'Un' },
                      { k: 'custo_un', t: 'Custo un.', num: true, f: R },
                      { k: 'valor_estoque', t: 'Valor', num: true, f: R0 },
                      { k: 'responsavel', t: 'Contado por' },
                    ]} linhas={calc.itens} max={1500} />
                  )}
                </Card>
              </>
            )}
          </Estado>
        </>
      )}
    </Estado>
  )
}
