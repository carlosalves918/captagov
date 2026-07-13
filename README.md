# CaptaGov — versão híbrida (Next.js + IndexedDB)

Este projeto é o mesmo protótipo CaptaGov, só que reestruturado para
subir no GitHub/Vercel como um app Next.js (React), mantendo os dados
100% no navegador do usuário — sem servidor de banco de dados.

## O que mudou em relação ao arquivo único original

- **Código**: virou um projeto Next.js normal (`pages/`, `styles/`, `public/`).
  A lógica de interface (o script gigante que já existia) foi mantida quase
  intacta em `public/app.js` — só a parte de **persistência** foi trocada.
- **Dados**: antes ficavam em `localStorage` (limite prático de 5–10MB, por
  isso os anexos grandes já estavam dando erro). Agora ficam em
  **IndexedDB** (via [Dexie.js](https://dexie.org)), cujo limite é uma
  fatia do espaço livre em disco — na prática, gigabytes.
- **Migração automática**: se o usuário já tinha dados salvos no
  `localStorage` (formato antigo `captagov_v1` ou `captagov_v2`), o app
  migra tudo para o IndexedDB automaticamente no primeiro carregamento.

## Estrutura

```
captagov/
├── pages/
│   ├── _app.js       # carrega Dexie + public/app.js na ordem certa
│   ├── _document.js  # fontes (Google Fonts)
│   └── index.js      # monta o markup original da tela
├── lib/
│   ├── body.html     # o HTML original (sidebar, abas, formulários…)
│   └── bodyHtml.js    # lê body.html no servidor
├── public/
│   └── app.js         # toda a lógica original, com salvarEstado/
│                       # carregarEstado agora usando IndexedDB
└── styles/
    └── globals.css    # todo o CSS original, sem alterações
```

## Rodando localmente

```bash
npm install
npm run dev
```

Abra http://localhost:3000

## Subindo pro GitHub

```bash
git init
git add .
git commit -m "CaptaGov: versão híbrida com IndexedDB"
git branch -M main
git remote add origin <URL_DO_SEU_REPOSITORIO>
git push -u origin main
```

## Deploy na Vercel

1. Entre em https://vercel.com/new
2. Importe o repositório que você acabou de subir
3. A Vercel detecta automaticamente que é um projeto Next.js — não precisa
   configurar nada, é só clicar em "Deploy"
4. Pronto: cada `git push` na branch principal gera um novo deploy

## Importante: o que isso resolve e o que não resolve

✅ Resolve o limite de espaço (localStorage → IndexedDB)
✅ Resolve o código estar organizado como projeto React, pronto pra evoluir
✅ Continua funcionando sem internet / sem custo de servidor

❌ **Não sincroniza entre dispositivos.** Os dados continuam presos ao
navegador/computador onde foram criados. Se o usuário limpar os dados do
site ou trocar de máquina, ainda é preciso usar exportar/importar. Isso só
se resolve com um backend de verdade (ex.: Supabase) — o que dá pra plugar
depois, sem reescrever a interface, só trocando a "gaveta" de novo.

## Próximo passo natural (quando fizer sentido)

Trocar `public/app.js`'s IndexedDB por chamadas a uma API (ex.: Supabase),
mantendo a mesma interface. Como o front já está em React/Next.js, essa
troca não exige reescrever as telas.
