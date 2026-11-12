import { useMemo, useState } from 'react'
import { sb, selectAll, R, P } from '../lib'
import { useDados, Estado, Card, Tabela, Kpi, Aviso } from '../ui'

const OCULTO_AUTO = /(^LC( |$)|SERVI[CÇ]O|ROLHA|TAXA)/

export default function Produtos({ loja }) {
  const [versao, setVersao] = useState(0)
  const [filtro, setFiltro] = useState('todos')
  const [busca, setBusca] = useState('')
  const [salvando, setSalvando] = useState(null)
  const st = useDados(() => selectAll('produtos', (q) => q.eq('loja', loja).order('produto')), [loja, versao])

  const calc = useMemo(() => {
    if (!st.dados) return null
    const b = busca.trim().toUpperCase()
    const todos = st.dados.map((p) => ({
      ...p, id: p.codigo, coz: p.cozinha_manual ?? p.cozinha_auto,
      ocultoAuto: OCULTO_AUTO.test(String(p.produto || '').toUpperCase()),
      oculto: p.ocultar ?? OCULTO_AUTO.test(String(p.produto || '').toUpperCase()),
      cmv: p.custo_ficha != null && p.preco_venda >= 1 ? p.custo_ficha / p.preco_venda : null,
    }))
    const f = todos.filter((p) =>
      (filtro === 'todos' || (filtro === 'coz' && p.coz) || (filtro === 'semficha' && p.custo_ficha == null && p.ativo) ||
        (filtro === 'conferir' && p.observacao) || (filtro === 'manual' && p.cozinha_manual != null) || (filtro === 'oculto' && p.oculto)) &&
      (!b || String(p.produto).toUpperCase().includes(b) || String(p.codigo) === b))
    return { todos, f }
  }, [st.dados, filtro, busca])

  async function esconder(p) {
    setSalvando(p.codigo)
    const novo = !p.oculto
    const { error } = await sb.from('produtos').update({ ocultar: novo === p.ocultoAuto ? null : novo }).eq('loja', loja).eq('codigo', p.codigo)
    setSalvando(null)
    if (error) alert('Erro ao salvar: ' + error.message)
    else setVersao((v) => v + 1)
  }

  async function alternar(p) {
    setSalvando(p.codigo)
    const novo = !p.coz
    // se voltar ao que o ChefWeb diz, limpa o ajuste manual
    const manual = novo === p.cozinha_auto ? null : novo
    const { error } = await sb.from('produtos').update({ cozinha_manual: manual, observacao: null }).eq('loja', loja).eq('codigo', p.codigo)
    setSalvando(null)
    if (error) alert('Erro ao salvar: ' + error.message)
    else setVersao((v) => v + 1)
  }

  return (
    <Estado st={st}>
      {calc && (
        <>
          {!calc.todos.length && <Aviso>Nenhum produto cadastrado. Suba a Lista de Produtos (R024) em <b>Importar arquivos</b>.</Aviso>}
          <Aviso>
            <b>Cozinha</b> vem do local de impressão no ChefWeb (imprime na COZINHA = é da cozinha). Clique em Sim/Não para ajustar
            um produto; o ajuste fica salvo mesmo quando você importar a lista de novo.
          </Aviso>
          <div className="kpis">
            <Kpi titulo="Produtos" valor={calc.todos.length} />
            <Kpi titulo="Da cozinha" valor={calc.todos.filter((p) => p.coz).length} />
            <Kpi titulo="Para conferir" valor={calc.todos.filter((p) => p.observacao).length} />
          </div>
          <div className="barra-filtros">
            <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="coz">Só cozinha</option>
              <option value="semficha">Sem custo cadastrado</option>
              <option value="conferir">Para conferir</option>
              <option value="manual">Ajustados manualmente</option>
              <option value="oculto">Escondidos das análises</option>
            </select>
            <input placeholder="Buscar produto ou código" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <Card>
            <Tabela max={2000} colunas={[
              { k: 'codigo', t: 'Cód.', w: 60 },
              { k: 'produto', t: 'Produto' },
              { k: 'grupo', t: 'Grupo' },
              { k: 'subgrupo', t: 'Subgrupo' },
              { k: 'local_impressao', t: 'Imprime em' },
              { k: 'coz', t: 'Cozinha', f: (v, p) => (
                <button className={'chip ' + (v ? 'on' : '')} disabled={salvando === p.codigo} onClick={() => alternar(p)}>
                  {v ? 'Sim' : 'Não'}{p.cozinha_manual != null ? ' ✎' : ''}
                </button>) },
              { k: 'oculto', t: 'Nas análises', f: (v, p) => (
                <button className={'chip ' + (v ? '' : 'on')} disabled={salvando === p.codigo} onClick={() => esconder(p)} title="Itens escondidos continuam no faturamento, só saem das análises de pratos">
                  {v ? 'Escondido' : 'Aparece'}{p.ocultar != null ? ' ✎' : ''}
                </button>) },
              { k: 'preco_venda', t: 'Preço', num: true, f: (v) => (v == null ? '—' : R(v)) },
              { k: 'custo_ficha', t: 'Custo ficha', num: true, f: (v) => (v == null ? '—' : R(v)) },
              { k: 'cmv', t: 'CMV', num: true, f: P },
              { k: 'observacao', t: 'Obs.' },
            ]} linhas={calc.f} />
          </Card>
        </>
      )}
    </Estado>
  )
}
