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
export const TIPOS_COM_AUTOPREENCHIMENTO = ['oficio', 'memorando', 'justificativaTecnica', 'planoTrabalho'];

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

function gerarPlanoTrabalho(c) {
  const valor = formatMoeda(parseMoeda(c.valor || '0'));
  const contrapartida = c.contrapartida ? formatMoeda(parseMoeda(c.contrapartida)) : 'R$ 0,00';
  const valorTotal = formatMoeda(parseMoeda(c.valor || '0') + parseMoeda(c.contrapartida || '0'));
  return `PLANO DE TRABALHO

Dados Cadastrais da Prefeitura

1. DADOS CADASTRAIS DO PROPONENTE
1.1 Órgão/Entidade: ${c.orgao || '[órgão/entidade]'}
1.2 CNPJ: ${c.cnpj || '[CNPJ]'}
1.3 Endereço: ${c.logradouro || '[endereço]'}
1.4 Cidade: ${c.municipioProp || '[cidade]'}
1.5 UF: ${c.uf || '[UF]'}
1.6 CEP: ${c.cep || '[CEP]'}
1.7 Esfera Administrativa: ${c.esfera || 'Municipal'}
1.8 Fone: ${c.telefoneInst || '[telefone]'}
1.9 E-mail: ${c.emailInst || '[e-mail]'}
1.10 Responsável e Cargo: [nome do responsável] — [cargo]
1.11 Nº Emenda: [se houver, informar o número da emenda parlamentar]

Elaboração do Projeto

2. DISCRIMINAÇÃO DO PROJETO
2.1 Título do Projeto: ${c.programa || '[título do projeto]'}

2.2 Período de execução
Início: ${c.dataInicio || '[a partir do recebimento do recurso]'}
Término: ${c.dataFim || '[prazo de vigência]'}

2.3 Objeto do Projeto:
[Descrever, em um parágrafo, a finalidade do projeto — o que será feito e qual benefício trará à população.]

2.4 Justificativa da Proposição:
[Fundamentar a necessidade do projeto: contexto, demanda existente, base legal aplicável e por que a solução proposta é a mais adequada. Geralmente 3 a 5 parágrafos.]

2.5 Metas a serem atingidas:
[Listar cada meta física de forma quantificável — ex.: "Adquirir X unidades de Y", "Ampliar em Z% a capacidade de..."]

2.6 Parâmetros para aferição das metas:
1. [Comprovação documental — notas fiscais, contratos, termos de recebimento]
2. [Registro patrimonial, se aplicável]
3. [Instalação/disponibilização efetiva]
4. [Relatórios de acompanhamento emitidos pelo setor responsável]

2.7 Forma de execução das atividades/projeto e de cumprimento das metas:
[Descrever as fases de execução: planejamento (levantamento técnico, especificações, pesquisa de preços) → contratação (licitação/dispensa, conforme Lei nº 14.133/2021) → fornecimento/execução → recebimento e conferência → incorporação patrimonial (se bens permanentes) → operação/uso.]

3. EXECUÇÃO (CRONOGRAMA)
Tabela: Meta | Etapa | Indicador Físico | Financeiro (Concedente) | Financeiro (Proponente) | Duração | Unidade | Qtde | Custo Unitário | Custo Total | Início | Término
[Preencher uma linha por item/etapa do objeto.]
 Valor total do Projeto: ${valorTotal}

4. DESEMBOLSO
4.1 Valores do Concedente — grade Mês 1 a Mês 12 (Mês 1 = mês de recebimento do recurso)
[Distribuir ${valor} entre os meses previstos de repasse.]

4.2 Valores do Proponente (contrapartida)
[Distribuir ${contrapartida} entre os meses previstos, se houver contrapartida.]

5. CLASSIFICAÇÃO DA DESPESA
Tabela: 5.1 Código da Despesa | 5.2 Especificação | 5.3 Concedente | 5.4 Proponente | 5.5 Total
[Preencher conforme a natureza da despesa — ex.: 4.4.90.52 Equipamentos e Material Permanente.]

6. PLANO DE APLICAÇÃO DOS RECURSOS
O Proponente deverá demonstrar como será aplicado o recurso, de acordo com o art. 53 do Decreto nº 44.474, de 23 de maio de 2017. Os recursos serão depositados e geridos em conta específica isenta de tarifa bancária, aberta em instituição financeira pública determinada pela administração. § 1º Os recursos serão automaticamente aplicados em cadernetas de poupança, fundo de aplicação financeira de curto prazo ou operação de mercado aberto lastreada em títulos da dívida pública, enquanto não empregados na sua finalidade.

Dados da conta bancária: Agência nº ${c.agencia || '[agência]'} — Conta nº ${c.conta || '[conta]'} — Banco: ${c.banco || '[banco]'} — Tipo de conta: Corrente/Poupança.

${c.municipioProp || '[Município]'}, ${hojeFormatado()}.

_________________________________
[Nome do responsável técnico/Secretário(a)]
[Cargo]

_________________________________
[Nome do(a) Prefeito(a)]
Prefeito(a) Municipal`;
}

const GERADORES = {
  oficio: gerarOficio,
  memorando: gerarMemorando,
  justificativaTecnica: gerarJustificativaTecnica,
  planoTrabalho: gerarPlanoTrabalho,
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
