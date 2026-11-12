import { useState } from 'react'
import { sb } from '../lib'
import { lerArquivo, detectar, importar } from '../importadores'
import { useDados, Estado, Card, Tabela, Aviso } from '../ui'

const TIPOS = [
  ['Histórico reorganizado', 'O arquivo Historico_Reorganizado.xlsx (vendas, itens, pagamentos, produtos e fichas). Só precisa subir uma vez.'],
  ['R024 — Lista de Produtos', 'Atualiza o cardápio e quem é da cozinha (pelo local de impressão).'],
  ['R025 — Produtos Compostos', 'Atualiza as fichas técnicas e o custo de cada prato.'],
  ['R016 — Compras de Produtos', 'Compras do período. Se subir o mesmo período de novo, ele substitui.'],
  ['Fechamento de estoque', 'Planilha de contagem (abas "contagem sushi" / "contagem nola"). Substitui a contagem do mesmo mês.'],
]

export default function Importar({ loja }) {
  const [arq, setArq] = useState(null)
  const [wb, setWb] = useState(null)
  const [det, setDet] = useState(null)
  const [lojaImp, setLojaImp] = useState(loja)
  const [ref, setRef] = useState('')
  const [lendo, setLendo] = useState(false)
  const [rodando, setRodando] = useState(false)
  const [prog, setProg] = useState(null)
  const [logs, setLogs] = useState([])
  const [res, setRes] = useState(null)
  const [versao, setVersao] = useState(0)

  const hist = useDados(async () => {
    const { data, error } = await sb.from('adm_importacoes').select('*').order('feito_em', { ascending: false }).limit(30)
    if (error) throw error
    return data
  }, [versao])

  async function escolher(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setArq(f); setDet(null); setRes(null); setLogs([]); setProg(null); setLendo(true)
    try {
      const w = await lerArquivo(f)
      const d = detectar(w)
      setWb(w); setDet(d)
      if (d.loja) setLojaImp(d.loja)
      if (d.referencia) setRef(d.referencia)
    } catch (err) {
      setRes({ erro: true, t: 'Não consegui ler o arquivo: ' + err.message })
    }
    setLendo(false)
  }

  async function rodar() {
    setRodando(true); setRes(null); setLogs([])
    try {
      const t = await importar(wb, det, {
        loja: Number(lojaImp), referencia: ref, arquivo: arq.name,
        progresso: (rotulo, feitos, total) => setProg({ rotulo, feitos, total }),
        log: (m) => setLogs((l) => [...l, m]),
      })
      setRes({ t })
    } catch (err) {
      setRes({ erro: true, t: err.message })
    }
    setRodando(false); setVersao((v) => v + 1)
  }

  return (
    <>
      <Card titulo="Subir arquivo" ico="⇪">
        <label className="arquivo">
          <input type="file" accept=".xlsx,.xls" onChange={escolher} disabled={rodando} />
          <span className="serif" style={{ fontSize: 26 }}>{arq ? arq.name : <>Escolher <em>arquivo</em></>}</span>
          <span className="muted">Relatório da TOTVS ou planilha de contagem (.xlsx). O tipo é reconhecido sozinho.</span>
        </label>
        {lendo && <div className="carregando">Lendo o arquivo… (arquivos grandes podem levar alguns segundos)</div>}
        {det && (
          <div className="det">
            {det.tipo ? (
              <>
                <div><b>Reconhecido:</b> {det.nome}</div>
                {det.tipo === 'r016' && det.ini && <div className="muted">Período: {det.ini} a {det.fim}</div>}
                {det.tipo === 'contagem' && (
                  <div className="muted">
                    {det.contagens.map((c) => <div key={c.aba}>Aba "{c.aba}": {c.linhas} linhas, de {c.de} a {c.ate} → {c.loja ? (c.loja === 1 ? 'SUSHI LEBLON' : 'NOLA') : 'loja escolhida abaixo'}</div>)}
                  </div>
                )}
                <div className="barra-filtros">
                  {!(det.tipo === 'contagem' && det.contagens.every((c) => c.loja)) && (
                    <label>Loja
                      <select value={lojaImp} onChange={(e) => setLojaImp(e.target.value)} disabled={rodando}>
                        <option value={1}>SUSHI LEBLON</option>
                        <option value={2}>NOLA</option>
                      </select>
                    </label>
                  )}
                  {det.tipo === 'contagem' && (
                    <label>Mês de referência (AAAA-MM)
                      <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="2026-10" disabled={rodando} style={{ width: 110 }} />
                    </label>
                  )}
                  <button className="btn prim" onClick={rodar} disabled={rodando}>{rodando ? 'Importando…' : 'Importar'}</button>
                </div>
              </>
            ) : <Aviso tipo="erro">Não reconheci esse arquivo. Confira se é um dos tipos da lista abaixo.</Aviso>}
          </div>
        )}
        {prog && (
          <div className="prog">
            <div className="prog-t">{prog.rotulo}: {prog.feitos.toLocaleString('pt-BR')} de {prog.total.toLocaleString('pt-BR')}</div>
            <div className="prog-b"><div style={{ width: (100 * prog.feitos / Math.max(prog.total, 1)) + '%' }} /></div>
          </div>
        )}
        {logs.length > 0 && <div className="logs">{logs.map((l, i) => <div key={i}>{l}</div>)}</div>}
        {res && <Aviso tipo={res.erro ? 'erro' : 'ok'}>{res.t}</Aviso>}
        {rodando && <Aviso>Não feche esta página até terminar.</Aviso>}
      </Card>

      <Card titulo="Arquivos aceitos" ico="☰">
        <ul className="lista-tipos">{TIPOS.map(([t, d]) => <li key={t}><b>{t}</b> — {d}</li>)}</ul>
      </Card>

      <Card titulo="Últimas importações" ico="↺">
        <Estado st={hist}>
          <Tabela colunas={[
            { k: 'feito_em', t: 'Quando', f: (v) => new Date(v).toLocaleString('pt-BR') },
            { k: 'tipo', t: 'Tipo' },
            { k: 'arquivo', t: 'Arquivo' },
            { k: 'loja', t: 'Loja', f: (v) => (v === 2 ? 'NOLA' : v === 1 ? 'SUSHI LEBLON' : '') },
            { k: 'linhas', t: 'Linhas', num: true },
            { k: 'detalhes', t: 'Detalhes' },
            { k: 'feito_por', t: 'Por' },
          ]} linhas={hist.dados || []} />
        </Estado>
      </Card>
    </>
  )
}
