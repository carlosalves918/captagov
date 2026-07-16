# CaptaGov v3

Plataforma de gestão de convênios e projetos para a administração pública municipal, com interface moderna, dados 100% locais (IndexedDB) e exportação em PDF.

**CaptaGov — Conectando projetos a recursos. Transformando municípios.**

## Recursos

- Painel geral com indicadores em tempo real
- Cadastro completo de convênios e projetos, com validação de CNPJ/CPF (dígito verificador)
- Controle financeiro (extratos, rendimentos, pagamentos)
- Prestação de contas com checklist documental
- Relatórios financeiros em PDF profissional, com resumo executivo (status, % executado, alertas de prazo), gráfico de evolução mensal, sumário com paginação, código de verificação (hash) e QR code de conferência
- Relatório geral consolidado (portfólio de todos os convênios) em PDF
- Módulo de emendas parlamentares
- Geração de documentos preenchidos automaticamente com os dados do convênio (Ofício, Memorando, Justificativa Técnica) — 100% offline, sem IA. Para os documentos que exigem análise técnica (DFD, ETP, Termo de Referência, Projeto Básico, Matriz de Risco, Plano de Ação), a ferramenta entrega um modelo estruturado para preenchimento manual, não um texto pronto.
- Backup e importação de dados (JSON)

## Rodando localmente

```shell
npm install
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000)

## Testes automatizados

As funções puras (formatação, máscaras, cálculo de prazo, validação de CPF/CNPJ) têm testes que rodam com o test runner nativo do Node — não precisa instalar nada além do próprio Node:

```shell
npm test
```

## Deploy na Vercel

1. Importe o repositório em [vercel.com/new](https://vercel.com/new)
2. A Vercel detecta automaticamente o projeto Next.js
3. Clique em "Deploy"

## Tecnologias

| Tecnologia | Versão | Uso |
| :--- | :--- | :--- |
| Next.js | 14.2 | Framework React (shell da aplicação) |
| Dexie.js | 3.2 | IndexedDB (dados locais, tabelas separadas por entidade) |
| jsPDF | 2.5 | Relatórios em PDF |
| jsPDF-autoTable | 3.8 | Tabelas no PDF |
| qrcode | 1.5 | QR code de verificação nos relatórios PDF |

## Arquitetura

A lógica da aplicação roda em `public/js/`, carregada como módulos ES nativos do navegador (`<script type="module">`) — não passa pelo bundler do Next, então não precisa de build step para essa parte:

- `utils.js` — funções puras (formatação, máscaras, validação de CPF/CNPJ, cálculo de prazo). Cobertas por testes em `/test`.
- `db.js` — persistência via Dexie/IndexedDB, com uma tabela por entidade (`convenios`, `emendas`, `meta`) em vez de um único registro-blob. Migra automaticamente dados de versões anteriores.
- `toast.js` — notificações não-bloqueantes (substitui `alert()`).
- `features/justificativa.js` — geração de documentos a partir dos dados do convênio.
- `app.js` — estado da aplicação, ações (CRUD de convênios/emendas/financeiro) e renderização das telas.

## Dados

Todos os dados — inclusive os anexos de documentos — são armazenados no **IndexedDB** do navegador do usuário, em nível local (sem upload para servidor/nuvem). Use a função **Exportar Backup** na sidebar para gerar um arquivo `.json` com todos os dados, e **Importar Backup** para restaurar. Como tudo fica só no navegador, recomendamos fazer backup manual com frequência — limpar o cache do navegador ou trocar de computador apaga os dados locais.

## Próximos passos

- Perfis de acesso / múltiplos usuários (hoje é uso individual, num navegador só)
- Lembrete/rotina de backup automático, para reduzir o risco de perda de dados
- Integração com IA real (Anthropic Claude) para os documentos que hoje geram só um modelo estruturado
- Migração da camada de views para componentes React reais (hoje o `app.js` ainda monta HTML via template string, não via JSX)
- Backend opcional (Supabase) para sincronização em nuvem, mantendo o modo local como padrão
- PWA para instalação como app

