# CaptaGov v2

Plataforma de gestão de convênios e projetos para a administração pública municipal, com interface moderna, dados 100% locais (IndexedDB) e exportação em PDF.

**CaptaGov — Conectando projetos a recursos. Transformando municípios.**

## Recursos

- Painel geral com indicadores em tempo real
- Cadastro completo de convênios e projetos (aba dedicada)
- Controle financeiro (extratos, rendimentos, pagamentos)
- Prestação de contas com checklist documental
- Relatórios financeiros em PDF profissional
- Módulo de emendas parlamentares
- Geração de justificativa técnica offline
- Backup e importação de dados (JSON)

## Rodando localmente

```shell
npm install
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000)

## Deploy na Vercel

1. Importe o repositório em [vercel.com/new](https://vercel.com/new)
2. A Vercel detecta automaticamente o projeto Next.js
3. Clique em "Deploy"

## Tecnologias

| Tecnologia | Versão | Uso |
| :--- | :--- | :--- |
| Next.js | 14.2 | Framework React |
| React | 18.3 | Interface |
| Dexie.js | 3.2 | IndexedDB (dados locais) |
| jsPDF | 2.5 | Relatórios em PDF |
| jsPDF-autoTable | 3.8 | Tabelas no PDF |

## Dados

Todos os dados são armazenados no **IndexedDB** do navegador do usuário (sem servidor). Use a função **Exportar Backup** na sidebar para gerar um arquivo `.json` com todos os dados, e **Importar Backup** para restaurar.

## Próximos passos

- Integração com IA real (Anthropic Claude) para geração de documentos
- Backend opcional (Supabase) para sincronização em nuvem
- PWA para instalação como app
