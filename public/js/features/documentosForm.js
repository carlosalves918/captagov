/* ============================================================
 * CAPTAGOV — Formulários de preenchimento por tipo de documento
 * ------------------------------------------------------------
 * Antes: clicar num tipo de documento gerava um texto cheio de
 * "[Descrever aqui...]" pra pessoa editar direto num textarea.
 *
 * Agora: cada tipo tem um formulário próprio, com três tipos de
 * campo:
 *   - 'auto'     → preenchido sozinho com dados do convênio (a
 *                  pessoa pode ajustar se quiser)
 *   - 'texto' / 'textarea' → campo livre, a pessoa escreve
 *   - 'select'   → lista de opções pré-definidas (dropdown)
 *   - 'lista'    → tabela de linhas repetíveis (ex: Matriz de
 *                  Risco, 5W2H), cada coluna com seu próprio tipo
 *
 * O texto final do documento só é montado depois que o formulário
 * é preenchido — ver montarDocumentoFinal().
 * ============================================================ */

import { formatMoeda, parseMoeda, hojeFormatado } from '../utils.js';

// ---------- Helpers de contexto (dados que já existem no convênio) ----------

function ctxBase(c) {
  const valor = formatMoeda(parseMoeda(c?.valor || '0'));
  const contrapartida = c?.contrapartida ? formatMoeda(parseMoeda(c.contrapartida)) : null;
  const tipoLabel = c?.tipo === 'projeto' ? 'Projeto' : 'Convênio';
  return { valor, contrapartida, tipoLabel };
}

function linhaAssinaturaResponsavel(rt) {
  if (!rt) return '';
  return `${rt.nome}${rt.cargo ? ' — ' + rt.cargo : (rt.conselho && rt.numeroRegistro ? ' — ' + rt.conselho + ' ' + rt.numeroRegistro : '')}`;
}

// ---------- Definição dos campos de cada tipo de documento ----------
// auto(c, rt, usuario) -> valor inicial sugerido para campos tipo 'auto'.

export const CAMPOS_DOC = {
  oficio: [
    { id: 'destinatario', label: 'Ao(À) — destinatário', tipo: 'auto', auto: (c) => c.orgao || '' },
    { id: 'numeroOficio', label: 'Número do Ofício', tipo: 'auto', auto: () => `_____/${new Date().getFullYear()}` },
    { id: 'assunto', label: 'Assunto', tipo: 'auto', auto: (c) => `${ctxBase(c).tipoLabel} nº ${c.numero || '[número]'} — ${c.programa || '[programa]'}` },
    { id: 'corpo', label: 'Corpo do ofício (mensagem principal)', tipo: 'textarea', obrigatorio: true, placeholder: 'Descreva o teor da comunicação...' },
    { id: 'fecho', label: 'Fecho', tipo: 'select', opcoes: ['Atenciosamente', 'Respeitosamente', 'Cordialmente'] },
  ],

  memorando: [
    { id: 'setorOrigem', label: 'De (setor de origem)', tipo: 'texto' },
    { id: 'setorDestino', label: 'Para (setor destinatário)', tipo: 'texto' },
    { id: 'assunto', label: 'Assunto', tipo: 'auto', auto: (c) => `${ctxBase(c).tipoLabel} nº ${c.numero || '[número]'} — ${c.programa || '[programa]'}` },
    { id: 'situacaoAtual', label: 'Situação atual', tipo: 'select', opcoes: ['Em execução', 'Aguardando prestação de contas', 'Em fase de contratação', 'Concluído', 'Suspenso'] },
    { id: 'detalhamento', label: 'Detalhamento adicional', tipo: 'textarea', obrigatorio: false, placeholder: 'Se necessário, complemente a comunicação...' },
  ],

  justificativaTecnica: [
    { id: 'necessidade', label: '1. Da necessidade', tipo: 'textarea', obrigatorio: true, placeholder: 'Qual carência/demanda da população ou administração está sendo atendida?' },
    { id: 'objeto', label: '2. Do objeto', tipo: 'textarea', obrigatorio: true, placeholder: 'O que será executado, adquirido ou construído com os recursos?' },
    { id: 'adequacao', label: '3. Da adequação do objeto à necessidade', tipo: 'textarea', placeholder: 'Por que a solução proposta é a mais adequada?' },
    { id: 'beneficios', label: '4. Dos benefícios esperados', tipo: 'textarea', placeholder: 'Resultados e impactos esperados para o município/população.' },
  ],

  dfd: [
    { id: 'setorRequisitante', label: 'Setor requisitante', tipo: 'texto' },
    { id: 'descricaoNecessidade', label: 'Descrição da necessidade', tipo: 'textarea' },
    { id: 'previstoPCA', label: 'Previsto no Plano de Contratações Anual?', tipo: 'select', opcoes: ['Sim', 'Não'] },
    { id: 'justificativaContratacao', label: 'Justificativa da contratação', tipo: 'textarea' },
    { id: 'quantidadeEstimada', label: 'Quantidade estimada', tipo: 'texto' },
    { id: 'grauPrioridade', label: 'Grau de prioridade', tipo: 'select', opcoes: ['Baixo', 'Médio', 'Alto', 'Urgente'] },
    { id: 'dataDesejada', label: 'Data desejada', tipo: 'data' },
  ],

  etp: [
    { id: 'descricaoNecessidade', label: '1. Descrição da necessidade', tipo: 'textarea' },
    { id: 'requisitosContratacao', label: '2. Requisitos da contratação', tipo: 'textarea' },
    { id: 'levantamentoMercado', label: '3. Levantamento de mercado e justificativa da escolha', tipo: 'textarea' },
    { id: 'estimativaQuantidades', label: '4. Estimativa de quantidades', tipo: 'textarea' },
    { id: 'estimativaValor', label: '5. Estimativa de valor', tipo: 'auto', auto: (c) => ctxBase(c).valor },
    { id: 'descricaoSolucao', label: '6. Descrição da solução como um todo', tipo: 'textarea' },
    { id: 'justificativaParcelamento', label: '7. Parcelamento da solução', tipo: 'select', opcoes: ['Solução única — sem parcelamento', 'Parcelado em itens/lotes'] },
    { id: 'resultadosPretendidos', label: '8. Resultados pretendidos', tipo: 'textarea' },
    { id: 'providencias', label: '9. Providências a serem adotadas', tipo: 'textarea' },
    { id: 'declaracaoViabilidade', label: '10. Declaração de viabilidade', tipo: 'select', opcoes: ['Viável', 'Inviável'] },
  ],

  tr: [
    { id: 'objeto', label: '1. Objeto', tipo: 'auto', auto: (c) => c.programa || '' },
    { id: 'fundamentacao', label: '2. Fundamentação da contratação', tipo: 'textarea' },
    { id: 'descricaoSolucao', label: '3. Descrição da solução', tipo: 'textarea' },
    { id: 'requisitosContratacao', label: '4. Requisitos da contratação', tipo: 'textarea' },
    { id: 'modeloExecucao', label: '5. Modelo de execução do objeto', tipo: 'textarea' },
    { id: 'modeloGestaoContrato', label: '6. Modelo de gestão do contrato', tipo: 'textarea' },
    { id: 'criteriosMedicaoPagamento', label: '7. Critérios de medição e pagamento', tipo: 'textarea' },
    { id: 'formaSelecaoFornecedor', label: '8. Forma de seleção do fornecedor', tipo: 'select', opcoes: ['Pregão Eletrônico', 'Concorrência', 'Dispensa de Licitação', 'Inexigibilidade', 'Concurso', 'Leilão', 'Credenciamento'] },
    { id: 'estimativaValor', label: '9. Estimativa de valor', tipo: 'auto', auto: (c) => ctxBase(c).valor },
    { id: 'adequacaoOrcamentaria', label: '10. Adequação orçamentária', tipo: 'textarea' },
  ],

  projetoBasico: [
    { id: 'objetoJustificativa', label: '1. Objeto e justificativa', tipo: 'textarea' },
    { id: 'especificacoesTecnicas', label: '2. Especificações técnicas', tipo: 'textarea' },
    { id: 'memorialDescritivo', label: '3. Memorial descritivo', tipo: 'textarea' },
    { id: 'cronogramaFisicoFinanceiro', label: '4. Cronograma físico-financeiro', tipo: 'textarea' },
    { id: 'planilhaOrcamentaria', label: '5. Planilha orçamentária', tipo: 'textarea' },
    { id: 'normasTecnicas', label: '6. Normas técnicas aplicáveis', tipo: 'select', opcoes: ['ABNT NBR aplicáveis à obra', 'Normas do órgão concedente', 'Normas municipais específicas', 'Não se aplica'] },
    { id: 'condicoesExecucao', label: '7. Condições de execução', tipo: 'textarea' },
  ],

  matrizRisco: [
    {
      id: 'riscos',
      label: 'Riscos identificados',
      tipo: 'lista',
      colunas: [
        { id: 'risco', label: 'Risco', tipo: 'texto', placeholder: 'Ex: Atraso na entrega de materiais' },
        { id: 'probabilidade', label: 'Probabilidade', tipo: 'select', opcoes: ['Baixa', 'Média', 'Alta'] },
        { id: 'impacto', label: 'Impacto', tipo: 'select', opcoes: ['Baixo', 'Médio', 'Alto'] },
        { id: 'responsavel', label: 'Responsável', tipo: 'select', opcoes: ['Contratante', 'Contratada', 'Compartilhado'] },
        { id: 'mitigacao', label: 'Medida de mitigação', tipo: 'texto', placeholder: 'Como reduzir/tratar esse risco' },
      ],
    },
  ],

  planoAcao: [
    { id: 'forcas', label: 'SWOT — Forças', tipo: 'textarea' },
    { id: 'fraquezas', label: 'SWOT — Fraquezas', tipo: 'textarea' },
    { id: 'oportunidades', label: 'SWOT — Oportunidades', tipo: 'textarea' },
    { id: 'ameacas', label: 'SWOT — Ameaças', tipo: 'textarea' },
    {
      id: 'itens5w2h',
      label: 'Plano 5W2H',
      tipo: 'lista',
      colunas: [
        { id: 'oQue', label: 'O quê', tipo: 'texto' },
        { id: 'porQue', label: 'Por quê', tipo: 'texto' },
        { id: 'quem', label: 'Quem', tipo: 'texto' },
        { id: 'quando', label: 'Quando', tipo: 'texto' },
        { id: 'onde', label: 'Onde', tipo: 'texto' },
        { id: 'como', label: 'Como', tipo: 'texto' },
        { id: 'quantoCusta', label: 'Quanto custa', tipo: 'texto' },
      ],
    },
  ],

  planoTrabalho: [
    { id: 'objetoProjeto', label: '2.3 Objeto do Projeto', tipo: 'textarea', placeholder: 'O que será feito e qual benefício trará à população.' },
    { id: 'justificativaProposicao', label: '2.4 Justificativa da Proposição', tipo: 'textarea', placeholder: 'Contexto, demanda existente, base legal e adequação da solução.' },
    {
      id: 'metas',
      label: '2.5 Metas a serem atingidas',
      tipo: 'lista',
      colunas: [
        { id: 'meta', label: 'Meta', tipo: 'texto', placeholder: 'Ex: Aquisição de equipamentos' },
        { id: 'indicador', label: 'Indicador de aferição', tipo: 'texto', placeholder: 'Ex: Nº de equipamentos entregues' },
        { id: 'quantidade', label: 'Quantidade', tipo: 'texto' },
        { id: 'unidade', label: 'Unidade', tipo: 'texto', placeholder: 'Ex: unidade, m², km' },
        { id: 'prazo', label: 'Prazo', tipo: 'texto', placeholder: 'Ex: 90 dias' },
      ],
    },
    { id: 'formaExecucao', label: '2.7 Forma de execução das atividades e cumprimento das metas', tipo: 'textarea' },
    {
      id: 'cronograma',
      label: '3. Execução (cronograma físico)',
      tipo: 'lista',
      colunas: [
        { id: 'etapa', label: 'Etapa/Fase', tipo: 'texto', placeholder: 'Ex: Licitação e contratação' },
        { id: 'inicio', label: 'Início', tipo: 'texto', placeholder: 'Ex: mês 1' },
        { id: 'termino', label: 'Término', tipo: 'texto', placeholder: 'Ex: mês 2' },
        { id: 'responsavel', label: 'Responsável', tipo: 'texto' },
      ],
    },
    {
      id: 'despesas',
      label: '5. Classificação da despesa e plano de aplicação',
      tipo: 'lista',
      colunas: [
        { id: 'natureza', label: 'Natureza da despesa', tipo: 'texto', placeholder: 'Ex: 4.4.90.52' },
        { id: 'especificacao', label: 'Especificação', tipo: 'texto', placeholder: 'Ex: Equipamentos e material permanente' },
        { id: 'quantidade', label: 'Quantidade', tipo: 'texto' },
        { id: 'valorUnitario', label: 'Valor unitário', tipo: 'texto' },
        { id: 'valorTotal', label: 'Valor total', tipo: 'texto' },
      ],
    },
  ],
};

// Tipos cujo documento tem um bloco "cadastral" fixo (auto, fora do
// formulário) além dos campos preenchíveis — mantido igual ao que já
// existia, por já ser 100% automático e correto.
export const TIPOS_COM_AUTOPREENCHIMENTO = ['oficio', 'memorando', 'justificativaTecnica', 'planoTrabalho', 'dfd', 'etp', 'tr', 'projetoBasico', 'matrizRisco', 'planoAcao'];

/** Valor inicial de cada campo 'auto' de um tipo, a partir do convênio/RT/usuário. */
export function valoresAutomaticos(tipoId, c, rt, usuario) {
  const campos = CAMPOS_DOC[tipoId] || [];
  const valores = {};
  campos.forEach((campo) => {
    if (campo.tipo === 'auto' && campo.auto) valores[campo.id] = campo.auto(c, rt, usuario) || '';
  });
  return valores;
}

/** Uma linha vazia para um campo tipo 'lista', pronta pra exibir inputs em branco. */
export function linhaListaVazia(campo) {
  const linha = {};
  (campo.colunas || []).forEach((col) => { linha[col.id] = ''; });
  return linha;
}

function linhaOuTraco(v) {
  return v && String(v).trim() ? v : '—';
}

// ---------- Montagem do texto final por tipo ----------

function montarOficio(v, c) {
  const { valor, contrapartida, tipoLabel } = ctxBase(c);
  return `OFÍCIO Nº ${v.numeroOficio || '_____/' + new Date().getFullYear()}

${hojeFormatado()}

Ao(À): ${v.destinatario || '[órgão/entidade destinatária]'}

Assunto: ${v.assunto}

Prezado(a) Senhor(a),

Dirijo-me a Vossa Senhoria para tratar do ${tipoLabel.toLowerCase()} nº ${c.numero || '[número]'}, firmado com ${c.conveniente || '[conveniente]'}${c.cnpj ? ' (CNPJ ' + c.cnpj + ')' : ''}, no valor de ${valor}${contrapartida ? ', com contrapartida de ' + contrapartida : ''}.

${v.corpo || '[corpo do ofício]'}

Sem mais para o momento, subscrevo-me,

${v.fecho || 'Atenciosamente'},

_________________________________
[Nome do responsável]
[Cargo]`;
}

function montarMemorando(v, c) {
  const tipoLabel = ctxBase(c).tipoLabel;
  return `MEMORANDO Nº _____/${new Date().getFullYear()}

${hojeFormatado()}

De: ${v.setorOrigem || '[setor de origem]'}
Para: ${v.setorDestino || '[setor destinatário]'}

Assunto: ${v.assunto}

Comunicamos que o ${tipoLabel.toLowerCase()} nº ${c.numero || '[número]'}, referente a "${c.programa || '[programa]'}", firmado com ${c.conveniente || '[conveniente]'}, encontra-se ${(v.situacaoAtual || '[situação atual]').toLowerCase()}.

Prazo final para prestação de contas: ${c.prazoLimitePC || '[a calcular]'}.

${v.detalhamento || ''}

Atenciosamente,

_________________________________
[Nome]
[Cargo/Setor]`;
}

function montarJustificativaTecnica(v, c, rt) {
  const { valor, contrapartida, tipoLabel } = ctxBase(c);
  return `JUSTIFICATIVA TÉCNICA

${tipoLabel}: ${c.numero || '[número]'}
Programa/Objeto: ${c.programa || '[programa]'}
${c.orgao ? 'Órgão concedente: ' + c.orgao + '\n' : ''}Conveniente: ${c.conveniente || '[conveniente]'}${c.cnpj ? ' — CNPJ ' + c.cnpj : ''}
Valor: ${valor}${contrapartida ? ' (contrapartida: ' + contrapartida + ')' : ''}
Vigência: ${c.dataInicio || '[início]'} a ${c.dataFim || '[fim]'}

1. DA NECESSIDADE
${v.necessidade || '[necessidade]'}

2. DO OBJETO
${v.objeto || '[objeto]'}

3. DA ADEQUAÇÃO DO OBJETO À NECESSIDADE
${v.adequacao || '[adequação]'}

4. DOS BENEFÍCIOS ESPERADOS
${v.beneficios || '[benefícios]'}

5. DA ESTIMATIVA DE VALOR
O valor total estimado é de ${valor}${contrapartida ? ', com contrapartida municipal de ' + contrapartida : ''}.

${c.municipioProp || '[Município]'}, ${hojeFormatado()}.

_________________________________
${rt ? rt.nome : '[Nome do responsável técnico]'}
${rt ? (rt.cargo || (rt.conselho && rt.numeroRegistro ? rt.conselho + ' ' + rt.numeroRegistro : '[cargo]')) : '[cargo]'}`;
}

function montarDFD(v, c) {
  return `DOCUMENTO DE FORMALIZAÇÃO DA DEMANDA (DFD)
Base legal: Lei 14.133/2021, art. 18

${ctxBase(c).tipoLabel} vinculado: ${c.numero || '[número]'} — ${c.programa || '[programa]'}

1. Setor requisitante: ${linhaOuTraco(v.setorRequisitante)}
2. Descrição da necessidade: ${linhaOuTraco(v.descricaoNecessidade)}
3. Previsão no Plano de Contratações Anual: ${linhaOuTraco(v.previstoPCA)}
4. Justificativa da contratação: ${linhaOuTraco(v.justificativaContratacao)}
5. Quantidade estimada: ${linhaOuTraco(v.quantidadeEstimada)}
6. Grau de prioridade: ${linhaOuTraco(v.grauPrioridade)}
7. Data desejada: ${linhaOuTraco(v.dataDesejada)}

${c.municipioProp || '[Município]'}, ${hojeFormatado()}.`;
}

function montarETP(v, c) {
  return `ESTUDO TÉCNICO PRELIMINAR (ETP)
Base legal: Lei 14.133/2021, art. 18, §1º

${ctxBase(c).tipoLabel} vinculado: ${c.numero || '[número]'} — ${c.programa || '[programa]'}

1. Descrição da necessidade
${linhaOuTraco(v.descricaoNecessidade)}

2. Descrição dos requisitos da contratação
${linhaOuTraco(v.requisitosContratacao)}

3. Levantamento de mercado e justificativa da escolha
${linhaOuTraco(v.levantamentoMercado)}

4. Estimativa de quantidades
${linhaOuTraco(v.estimativaQuantidades)}

5. Estimativa de valor
${v.estimativaValor || ctxBase(c).valor}

6. Descrição da solução como um todo
${linhaOuTraco(v.descricaoSolucao)}

7. Justificativa para parcelamento ou não da solução
${linhaOuTraco(v.justificativaParcelamento)}

8. Resultados pretendidos
${linhaOuTraco(v.resultadosPretendidos)}

9. Providências a serem adotadas
${linhaOuTraco(v.providencias)}

10. Declaração de viabilidade
${linhaOuTraco(v.declaracaoViabilidade)}

${c.municipioProp || '[Município]'}, ${hojeFormatado()}.`;
}

function montarTR(v, c) {
  return `TERMO DE REFERÊNCIA (TR)

${ctxBase(c).tipoLabel} vinculado: ${c.numero || '[número]'} — ${c.programa || '[programa]'}

1. Objeto
${v.objeto || c.programa || '[objeto]'}

2. Fundamentação da contratação
${linhaOuTraco(v.fundamentacao)}

3. Descrição da solução
${linhaOuTraco(v.descricaoSolucao)}

4. Requisitos da contratação
${linhaOuTraco(v.requisitosContratacao)}

5. Modelo de execução do objeto
${linhaOuTraco(v.modeloExecucao)}

6. Modelo de gestão do contrato
${linhaOuTraco(v.modeloGestaoContrato)}

7. Critérios de medição e pagamento
${linhaOuTraco(v.criteriosMedicaoPagamento)}

8. Forma de seleção do fornecedor
${linhaOuTraco(v.formaSelecaoFornecedor)}

9. Estimativa de valor
${v.estimativaValor || ctxBase(c).valor}

10. Adequação orçamentária
${linhaOuTraco(v.adequacaoOrcamentaria)}

${c.municipioProp || '[Município]'}, ${hojeFormatado()}.`;
}

function montarProjetoBasico(v, c) {
  return `PROJETO BÁSICO

${ctxBase(c).tipoLabel} vinculado: ${c.numero || '[número]'} — ${c.programa || '[programa]'}

1. Objeto e justificativa
${linhaOuTraco(v.objetoJustificativa)}

2. Especificações técnicas
${linhaOuTraco(v.especificacoesTecnicas)}

3. Memorial descritivo
${linhaOuTraco(v.memorialDescritivo)}

4. Cronograma físico-financeiro
${linhaOuTraco(v.cronogramaFisicoFinanceiro)}

5. Planilha orçamentária
${linhaOuTraco(v.planilhaOrcamentaria)}

6. Normas técnicas aplicáveis
${linhaOuTraco(v.normasTecnicas)}

7. Condições de execução
${linhaOuTraco(v.condicoesExecucao)}

${c.municipioProp || '[Município]'}, ${hojeFormatado()}.`;
}

function montarMatrizRisco(v, c) {
  const riscos = v.listas?.riscos || [];
  const linhasTabela = riscos.length
    ? riscos.map((r) => `| ${linhaOuTraco(r.risco)} | ${linhaOuTraco(r.probabilidade)} | ${linhaOuTraco(r.impacto)} | ${linhaOuTraco(r.responsavel)} | ${linhaOuTraco(r.mitigacao)} |`).join('\n')
    : '| — | — | — | — | — |';
  return `MATRIZ DE RISCO

${ctxBase(c).tipoLabel} vinculado: ${c.numero || '[número]'} — ${c.programa || '[programa]'}

| Risco | Probabilidade | Impacto | Responsável | Medida de mitigação |
|---|---|---|---|---|
${linhasTabela}

${c.municipioProp || '[Município]'}, ${hojeFormatado()}.`;
}

function montarPlanoAcao(v, c) {
  const itens = v.listas?.itens5w2h || [];
  const linhasTabela = itens.length
    ? itens.map((it) => `| ${linhaOuTraco(it.oQue)} | ${linhaOuTraco(it.porQue)} | ${linhaOuTraco(it.quem)} | ${linhaOuTraco(it.quando)} | ${linhaOuTraco(it.onde)} | ${linhaOuTraco(it.como)} | ${linhaOuTraco(it.quantoCusta)} |`).join('\n')
    : '| — | — | — | — | — | — | — |';
  return `PLANO DE AÇÃO

${ctxBase(c).tipoLabel} vinculado: ${c.numero || '[número]'} — ${c.programa || '[programa]'}

Análise SWOT
- Forças: ${linhaOuTraco(v.forcas)}
- Fraquezas: ${linhaOuTraco(v.fraquezas)}
- Oportunidades: ${linhaOuTraco(v.oportunidades)}
- Ameaças: ${linhaOuTraco(v.ameacas)}

Plano 5W2H
| O quê | Por quê | Quem | Quando | Onde | Como | Quanto custa |
|---|---|---|---|---|---|---|
${linhasTabela}

${c.municipioProp || '[Município]'}, ${hojeFormatado()}.`;
}

function montarPlanoTrabalho(v, c, rt, proponente, emenda) {
  const p = proponente || null;
  const e = emenda || null;
  const valor = formatMoeda(parseMoeda(c.valor || '0'));
  const contrapartida = c.contrapartida ? formatMoeda(parseMoeda(c.contrapartida)) : 'R$ 0,00';
  const valorTotal = formatMoeda(parseMoeda(c.valor || '0') + parseMoeda(c.contrapartida || '0'));
  const responsavelLinha = rt
    ? `${rt.nome}${rt.cargo ? ' — ' + rt.cargo : ''}${rt.numeroRegistro ? ' (' + (rt.conselho || 'CREA') + ' ' + rt.numeroRegistro + ')' : ''}`
    : '[nome do responsável] — [cargo]';

  // Dados cadastrais: usa o proponente/convenente vinculado quando existir;
  // cai para os campos soltos do convênio quando não houver vínculo.
  const orgaoEntidade = (p && p.razaoSocial) || c.orgao || '[órgão/entidade]';
  const naturezaJuridica = (p && p.natureza) || '[natureza jurídica]';
  const documento = (p && p.documento) || c.cnpj || '[CNPJ]';
  const endereco = (p && p.logradouro) || c.logradouro || '[endereço]';
  const bairro = (p && p.bairro) || '';
  const municipio = (p && p.municipio) || c.municipioProp || '[cidade]';
  const cep = (p && p.cep) || c.cep || '[CEP]';
  const telefone = (p && p.telefone) || c.telefoneInst || '[telefone]';
  const email = (p && p.email) || c.emailInst || '[e-mail]';
  const banco = (p && p.banco) || c.banco || '[banco]';
  const agencia = (p && p.agencia) || c.agencia || '[agência]';
  const conta = (p && p.conta) || c.conta || '[conta]';
  const repNome = (p && p.repNome) || '[Nome do(a) representante legal]';
  const repCargo = (p && p.repCargo) || '[cargo]';
  const repCpf = (p && p.repCpf) || '';

  const linhaEmenda = e
    ? `${e.parlamentar || '[parlamentar]'}${e.partido ? ' (' + e.partido + ')' : ''} — nº ${e.numero || '[número]'}/${e.ano || '[ano]'} — ${formatMoeda(parseMoeda(e.valor || '0'))}`
    : '[sem emenda parlamentar vinculada]';
  const origemRecurso = e
    ? `Emenda ${e.tipo || 'parlamentar'} de autoria de ${e.parlamentar || '[parlamentar]'}${e.partido ? ' (' + e.partido + ')' : ''}, nº ${e.numero || '[número]'}/${e.ano || '[ano]'}, no valor de ${formatMoeda(parseMoeda(e.valor || '0'))}, junto ao órgão ${e.orgao || c.orgao || '[órgão concedente]'}.`
    : `Recurso oriundo de ${c.orgao || '[órgão concedente]'}, sem emenda parlamentar vinculada cadastrada.`;

  const metas = v.listas?.metas || [];
  const linhasMetas = metas.length
    ? metas.map((m) => `| ${linhaOuTraco(m.meta)} | ${linhaOuTraco(m.indicador)} | ${linhaOuTraco(m.quantidade)} | ${linhaOuTraco(m.unidade)} | ${linhaOuTraco(m.prazo)} |`).join('\n')
    : '| — | — | — | — | — |';

  const cronograma = v.listas?.cronograma || [];
  const linhasCronograma = cronograma.length
    ? cronograma.map((et) => `| ${linhaOuTraco(et.etapa)} | ${linhaOuTraco(et.inicio)} | ${linhaOuTraco(et.termino)} | ${linhaOuTraco(et.responsavel)} |`).join('\n')
    : '| — | — | — | — |';

  const despesas = v.listas?.despesas || [];
  const linhasDespesas = despesas.length
    ? despesas.map((d) => `| ${linhaOuTraco(d.natureza)} | ${linhaOuTraco(d.especificacao)} | ${linhaOuTraco(d.quantidade)} | ${linhaOuTraco(d.valorUnitario)} | ${linhaOuTraco(d.valorTotal)} |`).join('\n')
    : '| — | — | — | — | — |';

  return `PLANO DE TRABALHO

Dados Cadastrais do Proponente/Convenente

1. DADOS CADASTRAIS DO PROPONENTE
1.1 Órgão/Entidade: ${orgaoEntidade}
1.2 Natureza jurídica: ${naturezaJuridica}
1.3 CNPJ/CPF: ${documento}
1.4 Endereço: ${endereco}${bairro ? ' — ' + bairro : ''}
1.5 Cidade: ${municipio}
1.6 UF: ${c.uf || '[UF]'}
1.7 CEP: ${cep}
1.8 Esfera Administrativa: ${(p && p.natureza) ? naturezaJuridica : (c.esfera || 'Municipal')}
1.9 Fone: ${telefone}
1.10 E-mail: ${email}
1.11 Representante legal: ${repNome}${repCargo ? ' — ' + repCargo : ''}${repCpf ? ' (CPF ' + repCpf + ')' : ''}
1.12 Responsável técnico/assinatura: ${responsavelLinha}
1.13 Emenda parlamentar vinculada: ${linhaEmenda}

Elaboração do Projeto

2. DISCRIMINAÇÃO DO PROJETO
2.1 Título do Projeto: ${c.programa || '[título do projeto]'}

2.2 Período de execução
Início: ${c.dataInicio || '[a partir do recebimento do recurso]'}
Término: ${c.dataFim || '[prazo de vigência]'}

2.3 Objeto do Projeto:
${linhaOuTraco(v.objetoProjeto)}

2.4 Justificativa da Proposição:
${linhaOuTraco(v.justificativaProposicao)}
Origem do recurso: ${origemRecurso}

2.5 Metas a serem atingidas:
| Meta | Indicador de aferição | Quantidade | Unidade | Prazo |
|---|---|---|---|---|
${linhasMetas}

2.6 Parâmetros para aferição das metas:
1. Comprovação documental — notas fiscais, contratos, termos de recebimento
2. Registro patrimonial, se aplicável
3. Instalação/disponibilização efetiva
4. Relatórios de acompanhamento emitidos pelo setor responsável

2.7 Forma de execução das atividades/projeto e de cumprimento das metas:
${linhaOuTraco(v.formaExecucao)}

3. EXECUÇÃO (CRONOGRAMA FÍSICO)
| Etapa/Fase | Início | Término | Responsável |
|---|---|---|---|
${linhasCronograma}

Valor total do Projeto: ${valorTotal}

4. DESEMBOLSO
4.1 Valores do Concedente: distribuir ${valor} entre os meses previstos de repasse.
4.2 Valores do Proponente (contrapartida): distribuir ${contrapartida} entre os meses previstos, se houver.

5. CLASSIFICAÇÃO DA DESPESA E PLANO DE APLICAÇÃO DOS RECURSOS
| Natureza da despesa | Especificação | Quantidade | Valor unitário | Valor total |
|---|---|---|---|---|
${linhasDespesas}

O Proponente deverá demonstrar como será aplicado o recurso, de acordo com o art. 53 do Decreto nº 44.474, de 23 de maio de 2017. Os recursos serão depositados e geridos em conta específica isenta de tarifa bancária, aberta em instituição financeira pública determinada pela administração.

Dados da conta bancária: Agência nº ${agencia} — Conta nº ${conta} — Banco: ${banco} — Tipo de conta: Corrente/Poupança.

${municipio || '[Município]'}, ${hojeFormatado()}.

_________________________________
${rt ? rt.nome : '[Nome do responsável técnico/Secretário(a)]'}
${rt ? (rt.cargo || (rt.conselho && rt.numeroRegistro ? rt.conselho + ' ' + rt.numeroRegistro : '[cargo]')) : '[cargo]'}

_________________________________
${repNome}
${repCargo || 'Prefeito(a) Municipal'}`;
}

const MONTADORES = {
  oficio: montarOficio,
  memorando: montarMemorando,
  justificativaTecnica: montarJustificativaTecnica,
  dfd: montarDFD,
  etp: montarETP,
  tr: montarTR,
  projetoBasico: montarProjetoBasico,
  matrizRisco: montarMatrizRisco,
  planoAcao: montarPlanoAcao,
  planoTrabalho: montarPlanoTrabalho,
};

/**
 * Monta o texto final do documento a partir dos valores preenchidos no
 * formulário. `valores` deve conter os campos simples (por id) e, se o tipo
 * tiver campo(s) 'lista', uma chave `listas` com { [campoId]: [linhas...] }.
 * `proponente` e `emenda` são o convenente e a emenda parlamentar vinculados
 * ao convênio (quando existirem) — hoje usados pelo Plano de Trabalho para
 * puxar dados cadastrais, bancários e de origem do recurso já cadastrados.
 */
export function montarDocumentoFinal(tipoId, valores, convenio, responsavelTecnico, usuario, proponente, emenda) {
  const montador = MONTADORES[tipoId];
  if (!montador || !convenio) return '';
  let texto = montador(valores || {}, convenio, responsavelTecnico, proponente, emenda);
  if (usuario) texto += `\n\nElaborado por: ${usuario.nome}${usuario.cargo ? ' — ' + usuario.cargo : ''}`;
  return texto;
}
