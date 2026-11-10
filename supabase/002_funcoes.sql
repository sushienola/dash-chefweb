-- ═══════════════ FUNÇÕES DE LEITURA DA DASH ═══════════════
-- Todas respeitam o RLS (security invoker) e só contam vendas concluídas (status 2).

create or replace function public.resumo_dia(p_loja smallint, p_ini date, p_fim date)
returns table (dia date, canal text, vendas bigint, pessoas numeric, valor_total numeric,
               valor_servico numeric, valor_itens numeric, descontos numeric)
language sql stable security invoker set search_path = '' as $$
  select v.dia, coalesce(nullif(v.canal, ''), 'Outro'), count(*), sum(coalesce(v.qtd_pessoas, 0)),
         sum(v.valor_total), sum(v.valor_servico), sum(v.valor_itens), sum(v.descontos)
  from public.vendas v
  where v.loja = p_loja and v.dia between p_ini and p_fim and v.status_venda = 2
  group by 1, 2 order by 1, 2;
$$;

create or replace function public.pagamentos_resumo(p_loja smallint, p_ini date, p_fim date)
returns table (dia date, forma text, bandeira text, maquininha text, qtd bigint, valor numeric)
language sql stable security invoker set search_path = '' as $$
  select p.dia, coalesce(p.forma, 'Outro'), coalesce(nullif(p.bandeira, ''), '—'),
         coalesce(nullif(p.maquininha, ''), '—'), count(*), sum(p.valor)
  from public.pagamentos p
  where p.loja = p_loja and p.dia between p_ini and p_fim and p.status_venda = 2
  group by 1, 2, 3, 4 order by 1;
$$;

create or replace function public.itens_ranking(p_loja smallint, p_ini date, p_fim date)
returns table (codigo integer, produto text, subgrupo text, grupo text, canal text, cozinha boolean,
               qtd numeric, valor numeric, custo_unit numeric, custo_total numeric, dias bigint)
language sql stable security invoker set search_path = '' as $$
  select i.codigo_produto, max(i.produto), max(i.subgrupo), max(pr.grupo), max(i.canal),
         coalesce(bool_or(pr.cozinha_manual), bool_or(pr.cozinha_auto), false),
         sum(i.quantidade), sum(i.valor_total), max(pr.custo_ficha),
         sum(i.quantidade) * max(pr.custo_ficha), count(distinct i.dia)
  from public.itens i
  left join public.produtos pr on pr.loja = i.loja and pr.codigo = i.codigo_produto
  where i.loja = p_loja and i.dia between p_ini and p_fim and i.status_venda = 2
  group by i.codigo_produto order by 8 desc;
$$;

create or replace function public.item_por_dia(p_loja smallint, p_ini date, p_fim date, p_codigo integer)
returns table (dia date, qtd numeric, valor numeric)
language sql stable security invoker set search_path = '' as $$
  select i.dia, sum(i.quantidade), sum(i.valor_total)
  from public.itens i
  where i.loja = p_loja and i.dia between p_ini and p_fim and i.status_venda = 2
    and i.codigo_produto = p_codigo
  group by 1 order by 1;
$$;

create or replace function public.itens_dia_cozinha(p_loja smallint, p_ini date, p_fim date)
returns table (dia date, cozinha boolean, qtd numeric, valor numeric)
language sql stable security invoker set search_path = '' as $$
  select i.dia, coalesce(pr.cozinha_manual, pr.cozinha_auto, false), sum(i.quantidade), sum(i.valor_total)
  from public.itens i
  left join public.produtos pr on pr.loja = i.loja and pr.codigo = i.codigo_produto
  where i.loja = p_loja and i.dia between p_ini and p_fim and i.status_venda = 2
  group by 1, 2 order by 1;
$$;

create or replace function public.itens_por_hora(p_loja smallint, p_ini date, p_fim date)
returns table (hora integer, qtd numeric, valor numeric)
language sql stable security invoker set search_path = '' as $$
  select split_part(i.hora, ':', 1)::int, sum(i.quantidade), sum(i.valor_total)
  from public.itens i
  where i.loja = p_loja and i.dia between p_ini and p_fim and i.status_venda = 2
    and i.hora ~ '^\d{1,2}:'
  group by 1 order by 1;
$$;

create or replace function public.garcons_ranking(p_loja smallint, p_ini date, p_fim date)
returns table (garcom text, vendas bigint, itens numeric, valor numeric)
language sql stable security invoker set search_path = '' as $$
  select i.garcom, count(distinct i.chave_venda), sum(i.quantidade), sum(i.valor_total)
  from public.itens i
  where i.loja = p_loja and i.dia between p_ini and p_fim and i.status_venda = 2
    and coalesce(i.garcom, '') <> ''
  group by 1 order by 4 desc;
$$;

create or replace function public.operadores_ranking(p_loja smallint, p_ini date, p_fim date)
returns table (operador text, vendas bigint, valor numeric)
language sql stable security invoker set search_path = '' as $$
  select coalesce(nullif(v.operador, ''), '—'), count(*), sum(v.valor_total)
  from public.vendas v
  where v.loja = p_loja and v.dia between p_ini and p_fim and v.status_venda = 2
  group by 1 order by 3 desc;
$$;

-- CMV teórico por dia: custo das fichas × quantidade vendida
create or replace function public.cmv_teorico_dia(p_loja smallint, p_ini date, p_fim date)
returns table (dia date, faturamento numeric, faturamento_com_ficha numeric, custo_teorico numeric)
language sql stable security invoker set search_path = '' as $$
  select i.dia, sum(i.valor_total),
         sum(case when pr.custo_ficha is not null then i.valor_total else 0 end),
         sum(i.quantidade * coalesce(pr.custo_ficha, 0))
  from public.itens i
  left join public.produtos pr on pr.loja = i.loja and pr.codigo = i.codigo_produto
  where i.loja = p_loja and i.dia between p_ini and p_fim and i.status_venda = 2
  group by 1 order by 1;
$$;

-- consumo teórico de insumos (fichas × vendas) comparado com o que foi comprado
create or replace function public.consumo_insumos(p_loja smallint, p_ini date, p_fim date)
returns table (codigo integer, insumo text, un text, qtd_teorica numeric, custo_teorico numeric,
               qtd_comprada numeric, valor_comprado numeric)
language sql stable security invoker set search_path = '' as $$
  with vend as (
    select i.codigo_produto, sum(i.quantidade) q
    from public.itens i
    where i.loja = p_loja and i.dia between p_ini and p_fim and i.status_venda = 2
    group by 1
  ), teor as (
    select fi.codigo_insumo, max(fi.insumo) insumo, max(fi.un) un,
           sum(v.q * fi.qtd_por_unidade) qtd, sum(v.q * fi.custo_no_prato) custo
    from vend v join public.fichas_insumos fi on fi.loja = p_loja and fi.codigo_produto = v.codigo_produto
    group by 1
  ), comp as (
    select c.codigo, max(c.produto) produto, max(c.un) un, sum(c.qtde) qtd, sum(c.valor) valor
    from public.compras c where c.loja = p_loja and c.data between p_ini and p_fim
    group by 1
  )
  select coalesce(t.codigo_insumo, c.codigo), coalesce(t.insumo, c.produto), coalesce(t.un, c.un),
         t.qtd, t.custo, c.qtd, c.valor
  from teor t full join comp c on c.codigo = t.codigo_insumo
  order by coalesce(t.custo, 0) + coalesce(c.valor, 0) desc;
$$;

-- CMV real: estoque inicial + compras − estoque final, por categoria
create or replace function public.cmv_real(p_loja smallint, p_ref_ini text, p_ref_fim text, p_ini date, p_fim date)
returns table (categoria text, estoque_inicial numeric, compras numeric, estoque_final numeric, cmv numeric)
language sql stable security invoker set search_path = '' as $$
  with cat as (   -- categoria de cada insumo, pela contagem mais recente
    select distinct on (c.codigo) c.codigo, coalesce(nullif(c.categoria_cadastro, ''), c.categoria) categoria
    from public.contagens c where c.loja = p_loja and c.codigo is not null
    order by c.codigo, c.data desc
  ), ei as (
    select coalesce(nullif(c.categoria_cadastro, ''), c.categoria) categoria, sum(c.valor_estoque) v
    from public.contagens c where c.loja = p_loja and c.referencia = p_ref_ini group by 1
  ), ef as (
    select coalesce(nullif(c.categoria_cadastro, ''), c.categoria) categoria, sum(c.valor_estoque) v
    from public.contagens c where c.loja = p_loja and c.referencia = p_ref_fim group by 1
  ), co as (
    select coalesce(cat.categoria, 'SEM CATEGORIA') categoria, sum(c.valor) v
    from public.compras c left join cat on cat.codigo = c.codigo
    where c.loja = p_loja and c.data between p_ini and p_fim group by 1
  ), todas as (
    select categoria from ei union select categoria from ef union select categoria from co
  )
  select t.categoria, coalesce(ei.v, 0), coalesce(co.v, 0), coalesce(ef.v, 0),
         coalesce(ei.v, 0) + coalesce(co.v, 0) - coalesce(ef.v, 0)
  from todas t
  left join ei on ei.categoria = t.categoria
  left join ef on ef.categoria = t.categoria
  left join co on co.categoria = t.categoria
  order by 5 desc;
$$;

create or replace function public.referencias_contagem(p_loja smallint)
returns table (referencia text, linhas bigint, valor numeric, de date, ate date)
language sql stable security invoker set search_path = '' as $$
  select c.referencia, count(*), sum(c.valor_estoque), min(c.data), max(c.data)
  from public.contagens c where c.loja = p_loja group by 1 order by 1 desc;
$$;

create or replace function public.compras_resumo(p_loja smallint, p_ini date, p_fim date)
returns table (fornecedor text, codigo integer, produto text, un text, qtde numeric, valor numeric, compras bigint)
language sql stable security invoker set search_path = '' as $$
  select c.fornecedor, c.codigo, max(c.produto), max(c.un), sum(c.qtde), sum(c.valor), count(*)
  from public.compras c
  where c.loja = p_loja and c.data between p_ini and p_fim
  group by 1, 2 order by 6 desc;
$$;

-- período com dados (para a dash abrir no último dia disponível)
create or replace function public.periodo_dados(p_loja smallint)
returns table (primeiro date, ultimo date)
language sql stable security invoker set search_path = '' as $$
  select min(dia), max(dia) from public.vendas where loja = p_loja;
$$;

-- só usuários logados chamam as funções
do $$
declare f text;
begin
  foreach f in array array['resumo_dia','pagamentos_resumo','itens_ranking','item_por_dia','itens_dia_cozinha',
    'itens_por_hora','garcons_ranking','operadores_ranking','cmv_teorico_dia','consumo_insumos','cmv_real',
    'referencias_contagem','compras_resumo','periodo_dados'] loop
    execute format('revoke execute on function public.%I from public, anon', f);
    execute format('grant execute on function public.%I to authenticated', f);
  end loop;
end $$;
revoke execute on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;
