import { useMemo } from 'react'
import { rpcAll, R, R0, N, P, soma } from '../lib'
import { useDados, Estado, Card, Tabela, Aviso } from '../ui'

export default function Equipe({ loja, ini, fim }) {
  const st = useDados(async () => {
    const a = { p_loja: loja, p_ini: ini, p_fim: fim }
    const [garcons, operadores] = await Promise.all([rpcAll('garcons_ranking', a), rpcAll('operadores_ranking', a)])
    return { garcons, operadores }
  }, [loja, ini, fim])

  const calc = useMemo(() => {
    if (!st.dados) return null
    const tg = soma(st.dados.garcons, 'valor'), to = soma(st.dados.operadores, 'valor')
    return {
      garcons: st.dados.garcons.map((g) => ({ ...g, chave: g.garcom, pct: g.valor / tg, ticket: g.vendas ? g.valor / g.vendas : 0 })),
      operadores: st.dados.operadores.map((o) => ({ ...o, chave: o.operador, pct: o.valor / to })),
    }
  }, [st.dados])

  return (
    <Estado st={st}>
      {calc && (
        <>
          <Card titulo="Garçons — quem mais vende">
            <Aviso>
              Cada item conta para o garçom que o lançou. Assim, numa mesa atendida por 3 garçons o total <b>não se repete</b>:
              cada um recebe só os itens dele. A coluna "Vendas" conta as mesas em que o garçom lançou ao menos um item.
            </Aviso>
            {calc.garcons.length === 0 ? (
              <div className="vazio">
                Ainda sem dados de garçom neste período. O histórico antigo não tinha essa informação; ela começa a aparecer com o script novo.
                Se continuar vazio depois do script rodar, use o menu <b>🔍 Ver campos que a API manda</b> na planilha e envie o resultado.
              </div>
            ) : (
              <Tabela colunas={[
                { k: 'garcom', t: 'Garçom' },
                { k: 'vendas', t: 'Mesas', num: true, f: N },
                { k: 'itens', t: 'Itens', num: true, f: N },
                { k: 'valor', t: 'Valor dos itens', num: true, f: R0 },
                { k: 'ticket', t: 'Por mesa', num: true, f: R },
                { k: 'pct', t: '%', num: true, f: P },
              ]} linhas={calc.garcons} />
            )}
          </Card>
          <Card titulo="Operadores de caixa (quem fechou a conta)">
            <Aviso>
              Esta lista é de quem <b>fechou</b> a conta no caixa. Quem <b>lançou</b> cada item (o garçom) aparece no quadro acima,
              assim que a TOTVS mandar essa informação pelo sync diário.
            </Aviso>
            <Tabela colunas={[
              { k: 'operador', t: 'Operador' },
              { k: 'vendas', t: 'Vendas fechadas', num: true, f: N },
              { k: 'valor', t: 'Valor', num: true, f: R0 },
              { k: 'pct', t: '%', num: true, f: P },
            ]} linhas={calc.operadores} />
          </Card>
        </>
      )}
    </Estado>
  )
}
