import { createClient } from '@supabase/supabase-js'

// A chave "publishable" pode ficar no site: quem protege os dados é o login + RLS do banco.
const URL = (import.meta.env || {}).VITE_SUPABASE_URL || 'https://mueekpzpmcehgxqzmotn.supabase.co'
const KEY = (import.meta.env || {}).VITE_SUPABASE_KEY || 'sb_publishable_ghvkqR97r2pZWugR-wXhFw_n-G-85iQ'
export const sb = createClient(URL, KEY)

// ── busca paginada (o Supabase devolve no máximo 1000 linhas por vez) ──
export async function rpcAll(fn, args) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.rpc(fn, args).range(from, from + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) return out
  }
}

export async function selectAll(table, build) {
  const out = []
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select('*')
    if (build) q = build(q)
    const { data, error } = await q.range(from, from + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) return out
  }
}

// ── formatação ──
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const brl0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const num2 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
export const R = (v) => brl.format(Number(v) || 0)
export const R0 = (v) => brl0.format(Number(v) || 0)
export const N = (v) => num.format(Number(v) || 0)
export const N2 = (v) => num2.format(Number(v) || 0)
export const P = (v) => (v == null || !isFinite(v) ? '—' : (v * 100).toFixed(1).replace('.', ',') + '%')
export const kR = (v) => {
  const n = Number(v) || 0
  if (Math.abs(n) >= 1e6) return 'R$ ' + (n / 1e6).toFixed(1).replace('.', ',') + ' mi'
  if (Math.abs(n) >= 1e3) return 'R$ ' + Math.round(n / 1e3) + ' mil'
  return 'R$ ' + Math.round(n)
}

// ── datas (sempre texto AAAA-MM-DD, sem fuso) ──
export const iso = (d) =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
export const parseIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
export const addDays = (s, n) => { const d = parseIso(s); d.setDate(d.getDate() + n); return iso(d) }
export const diffDays = (a, b) => Math.round((parseIso(b) - parseIso(a)) / 86400000)
export const br = (s) => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '')
export const brCurto = (s) => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '')
const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export const diaSemana = (s) => SEM[parseIso(s).getDay()]

export function presets(ultimo) {
  const u = ultimo || iso(new Date(Date.now() - 86400000))
  const d = parseIso(u)
  const iniMes = iso(new Date(d.getFullYear(), d.getMonth(), 1))
  const iniMesAnt = iso(new Date(d.getFullYear(), d.getMonth() - 1, 1))
  const fimMesAnt = iso(new Date(d.getFullYear(), d.getMonth(), 0))
  return [
    { id: 'dia', nome: 'Último dia', ini: u, fim: u },
    { id: '7d', nome: '7 dias', ini: addDays(u, -6), fim: u },
    { id: '30d', nome: '30 dias', ini: addDays(u, -29), fim: u },
    { id: 'mes', nome: 'Mês atual', ini: iniMes, fim: u },
    { id: 'mesant', nome: 'Mês anterior', ini: iniMesAnt, fim: fimMesAnt },
    { id: '90d', nome: '90 dias', ini: addDays(u, -89), fim: u },
  ]
}

// soma genérica
export const soma = (arr, f) => arr.reduce((s, x) => s + (Number(typeof f === 'function' ? f(x) : x[f]) || 0), 0)

export function agrupar(arr, chave, campos) {
  const m = new Map()
  for (const x of arr) {
    const k = typeof chave === 'function' ? chave(x) : x[chave]
    let g = m.get(k)
    if (!g) { g = { chave: k }; campos.forEach((c) => (g[c] = 0)); m.set(k, g) }
    campos.forEach((c) => (g[c] += Number(x[c]) || 0))
  }
  return [...m.values()]
}

export const CORES = ['#8e5bd6', '#e8743b', '#3d8f5f', '#d9a43a', '#c06c9b', '#5b7fc7', '#b7a3e6', '#a08670', '#c94a3d', '#7aa15a']
export const COR_CANAL = { Loja: '#b99be8', iFood: '#e8743b', Site: '#3d8f5f', Rappi: '#d9a43a', 'Rappi + 99': '#d9a43a', Outro: '#a08670' }
export const COR_SETOR = { Cozinha: '#e8743b', 'Sushi bar': '#b99be8', Copa: '#3d8f5f' }
export const COR_TURNO = { 'Almoço': '#f0b860', Jantar: '#8e5bd6', 'Sem horário': '#cbbfae' }
export const COR_GRADE = 'rgba(120, 84, 40, 0.10)'
