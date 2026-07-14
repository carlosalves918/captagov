/* ============================================================
 * CAPTAGOV v2 — Geração de documentos (offline, baseada em template)
 * ------------------------------------------------------------
 * O que existia antes: um botão "Documentos por IA" que, ao clicar,
 * só mostrava um alert() dizendo "Em breve: geração real via API de
 * IA. Atualmente simulado." — ou seja, o recurso listado no README
 * não fazia nada.
 *
 * O que isso faz agora: gera de verdade um texto preenchido com os
 * dados reais do convênio selecionado, sem precisar de IA nenhuma —
 * é montagem de template (igual "mala direta"). Pra Ofício,
 * Memorando e Justificativa Técnica isso cobre o caso de uso comum.
 * Pra documentos mais complexos (DFD, ETP, Termo de Referência,
 * Projeto Básico, Matriz de Risco, Plano de Ação/5W2H), que exigem
 * análise e não só preenchimento de campos, entregamos um MODELO
 * estruturado (esqueleto com as seções corretas) pra a pessoa
 * preencher — não fingimos que isso está "gerado" automaticamente.
 * ============================================================ */

import { formatMoeda, parseMoeda, hojeFormatado } from '../utils.js';

// Tipos com preenchimento automático real, a partir dos dados do convênio.
export const TIPOS_COM_AUTOPREENCHIMENTO = ['oficio', 'memorando', 'justificativaTecnica'];

function cabecalhoConvenio(c) {
  const valor = formatMoeda(parseMoeda(c.valor || '0'));
  return { valor };
}

function gerarOficio(c) {
  const { valor } = cabecalhoConvenio(c);
  return `OFÍCIO Nº _____/${new Date().getFullYear()}

${hojeFormatado()}

Ao(À): ${c.orgao || '[órgão/entidade destinatária]'}

Assunto: ${c.tipo === 'projeto' ? 'Projeto' : 'Convênio'} nº ${c.numero || '[número]'} — ${c.programa || '[programa]'}

Prezado(a) Senhor(a),

Dirijo-me a Vossa Senhoria para tratar do ${c.tipo === 'projeto' ? 'projeto' : 'convênio'} nº ${c.numero || '[número]'}, firmado com ${c.conveniente || '[conveniente]'}${c.cnpj ? ' (CNPJ ' + c.cnpj + ')' : ''}, no valor de ${valor}${c.contrapartida ? ', com contrapartida de ' + formatMoeda(parseMoeda(c.contrapartida)) : ''}, cujo objeto é [descrever o objeto].

[Corpo do ofício — inserir o teor da comunicação]

Sem mais para o momento, subscrevo-me,

Atenciosamente,

_________________________________
[Nome do responsável]
[Cargo]`;
}

function gerarMemorando(c) {
  return `MEMORANDO Nº _____/${new Date().getFullYear()}

${hojeFormatado()}

De: [Setor de origem]
Para: [Setor destinatário]

Assunto: ${c.tipo === 'projeto' ? 'Projeto' : 'Convênio'} nº ${c.numero || '[número]'} — ${c.programa || '[programa]'}

Comunicamos que o ${c.tipo === 'projeto' ? 'projeto' : 'convênio'} nº ${c.numero || '[número]'}, referente a "${c.programa || '[programa]'}", firmado com ${c.conveniente || '[conveniente]'}, encontra-se [descrever situação atual: em execução / aguardando prestação de contas / etc.].

Prazo final para prestação de contas: ${c.prazoLimitePC || '[a calcular]'}.

[Detalhamento adicional, se necessário]

Atenciosamente,

_________________________________
[Nome]
[Cargo/Setor]`;
}

function gerarJustificativaTecnica(c) {
  const { valor } = cabecalhoConvenio(c);
  return `JUSTIFICATIVA TÉCNICA

${c.tipo === 'projeto' ? 'Projeto' : 'Convênio'}: ${c.numero || '[número]'}
Programa/Objeto: ${c.programa || '[programa]'}
${c.orgao ? 'Órgão concedente: ' + c.orgao + '\n' : ''}Conveniente: ${c.conveniente || '[conveniente]'}${c.cnpj ? ' — CNPJ ' + c.cnpj : ''}
Valor: ${valor}${c.contrapartida ? ' (contrapartida: ' + formatMoeda(parseMoeda(c.contrapartida)) + ')' : ''}
Vigência: ${c.dataInicio || '[início]'} a ${c.dataFim || '[fim]'}

1. DA NECESSIDADE
[Descrever a necessidade pública que motiva este ${c.tipo === 'projeto' ? 'projeto' : 'convênio'} — qual carência ou demanda da população/administração está sendo atendida.]

2. DO OBJETO
[Detalhar o que será executado/adquirido/construído com os recursos.]

3. DA ADEQUAÇÃO DO OBJETO À NECESSIDADE
[Explicar por que a solução proposta é adequada para atender a necessidade descrita no item 1.]

4. DOS BENEFÍCIOS ESPERADOS
[Descrever os resultados e impactos esperados para o município/população.]

5. DA ESTIMATIVA DE VALOR
O valor total estimado é de ${valor}${c.contrapartida ? ', com contrapartida municipal de ' + formatMoeda(parseMoeda(c.contrapartida)) : ''}.

${c.municipioProp || '[Município]'}, ${hojeFormatado()}.

_________________________________
[Nome do responsável técnico]
[Cargo]`;
}

const GERADORES = {
  oficio: gerarOficio,
  memorando: gerarMemorando,
  justificativaTecnica: gerarJustificativaTecnica,
};

/** Gera o texto do documento a partir dos dados reais do convênio. Retorna null se o tipo não tem autopreenchimento. */
export function gerarDocumentoAutomatico(tipoId, convenio) {
  const gerador = GERADORES[tipoId];
  if (!gerador || !convenio) return null;
  return gerador(convenio);
}

// Modelos estruturados (esqueleto) para os documentos que exigem análise
// técnica real e não podem ser só preenchidos com os campos do cadastro.
const MODELOS_ESQUELETO = {
  dfd: `DOCUMENTO DE FORMALIZAÇÃO DA DEMANDA (DFD)
Base legal: Lei 14.133/2021, art. 18

1. Setor requisitante
2. Descrição da necessidade
3. Previsão no Plano de Contratações Anual
4. Justificativa da contratação
5. Quantidade estimada
6. Grau de prioridade
7. Data desejada`,
  etp: `ESTUDO TÉCNICO PRELIMINAR (ETP)
Base legal: Lei 14.133/2021, art. 18, §1º

1. Descrição da necessidade
2. Descrição dos requisitos da contratação
3. Levantamento de mercado e justificativa da escolha
4. Estimativa de quantidades
5. Estimativa de valor
6. Descrição da solução como um todo
7. Justificativas para parcelamento ou não da solução
8. Resultados pretendidos
9. Providências a serem adotadas
10. Declaração de viabilidade`,
  tr: `TERMO DE REFERÊNCIA (TR)

1. Objeto
2. Fundamentação da contratação
3. Descrição da solução
4. Requisitos da contratação
5. Modelo de execução do objeto
6. Modelo de gestão do contrato
7. Critérios de medição e pagamento
8. Forma de seleção do fornecedor
9. Estimativa de valor
10. Adequação orçamentária`,
  projetoBasico: `PROJETO BÁSICO

1. Objeto e justificativa
2. Especificações técnicas
3. Memorial descritivo
4. Cronograma físico-financeiro
5. Planilha orçamentária
6. Normas técnicas aplicáveis
7. Condições de execução`,
  matrizRisco: `MATRIZ DE RISCO

Para cada risco identificado, preencher:
| Risco | Probabilidade | Impacto | Responsável (Contratante/Contratada) | Medida de mitigação |
|---|---|---|---|---|
| [Ex: Atraso na entrega de materiais] | | | | |
| [Ex: Variação de preços] | | | | |`,
  planoAcao: `PLANO DE AÇÃO

Análise SWOT
- Forças:
- Fraquezas:
- Oportunidades:
- Ameaças:

Plano 5W2H
| O quê (What) | Por quê (Why) | Quem (Who) | Quando (When) | Onde (Where) | Como (How) | Quanto custa (How much) |
|---|---|---|---|---|---|---|
| | | | | | | |`,
};

export function gerarModeloEsqueleto(tipoId) {
  return MODELOS_ESQUELETO[tipoId] || null;
}
