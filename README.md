# Dash ChefWeb — Sushi Leblon / Nola

Painel de vendas, cartões, itens, garçons, CMV, compras e estoque.

- **Site:** React + Vite (publicado na Vercel)
- **Banco:** Supabase (`totvs-dashboard`), com login e acesso só para e-mails autorizados
- **Vendas diárias:** Google Apps Script (`supabase/Codigo_Vendas_ChefWeb.gs`) busca na TOTVS e grava no Supabase
- **Arquivos manuais:** tela *Importar arquivos* (R024 produtos, R025 fichas, R016 compras, fechamento de estoque)

## Publicar na Vercel
1. vercel.com → Add New → Project → importe este repositório.
2. Framework: **Vite** (detectado sozinho). Não precisa configurar variáveis.
3. Deploy.

## Depois do primeiro deploy (Supabase)
- Authentication → URL Configuration → **Site URL** = endereço da Vercel (ex.: `https://dash-chefweb.vercel.app`).
- Para liberar uma pessoa: Table Editor → `usuarios_permitidos` → Insert row com o e-mail dela.
  A pessoa cria a senha em "Primeiro acesso? Criar conta".

## Rodar localmente
```
npm install
npm run dev
```

## Banco
`supabase/*.sql` documenta tabelas, segurança (RLS) e funções de leitura.
As tabelas do projeto anterior (jan–mar/2026) foram preservadas no schema `antigo`.
