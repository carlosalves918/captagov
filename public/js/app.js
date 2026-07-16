/* ============================================================
 * CAPTAGOV v2 — Aplicação Principal
 * Arquitetura: Estado Centralizado, Render Declarativo
 * Persistência: IndexedDB via Dexie.js, tabelas separadas (ver db.js)
 * Funções puras (formatação, máscaras, validação): ver utils.js
 * ============================================================ */
import {
  gerarId, parseMoeda, formatMoeda, escapeHtml, formatMes, hojeFormatado,
  mascararValor, mascararCNPJ, mascararCPF, mascararCEP,
  calcularPrazoPC, statusConvenio, validarCpfOuCnpj,
  statusVigencia, formatData, formatValorMasked,
} from './utils.js';
import {
  db, carregarEstadoDb, salvarConvenioDb, removerConvenioDb,
  salvarEmendaDb, removerEmendaDb, salvarMetaDb, limparConveniosEmendasDb,
  salvarInstituicaoDb, removerInstituicaoDb, salvarProponenteDb, removerProponenteDb,
  criarSnapshotAutoDb, listarSnapshotsAutoDb, buscarSnapshotAutoDb, removerSnapshotAutoDb,
  salvarResponsavelTecnicoDb, removerResponsavelTecnicoDb, salvarUsuarioDb, removerUsuarioDb,
  salvarIdentidadeVisualDb,
} from './db.js';
import { toastSucesso, toastErro, toastAviso } from './toast.js';
import { gerarDocumentoAutomatico, gerarModeloEsqueleto, TIPOS_COM_AUTOPREENCHIMENTO } from './features/justificativa.js';

// ==================== ESTADO GLOBAL ====================
const STATE = {
  convenios: [],
  emendas: [],
  instituicoes: [],
  proponentes: [],
  responsaveisTecnicos: [],
  usuarios: [],
  backupsAutoLista: [],
  identidadeVisual: { nomeMunicipio: '', brasaoDataUrl: null },
  usuarioLogadoId: null,
  convenioAtualId: null,
  convenioEditandoId: null,
  emendaEditandoId: null,
  instituicaoEditandoId: null,
  proponenteEditandoId: null,
  responsavelTecnicoEditandoId: null,
  usuarioEditandoId: null,
  responsavelTecnicoSelecionadoId: null,
  usuarioSelecionadoId: null,
  convenioInstituicaoIdSelecionada: null,
  convenioProponenteIdSelecionada: null,
  contratadaEditandoId: null,
  aditivoAbertoCtId: null,
  protocoloSeq: 0,
  view: 'painel',
  subView: 'contratadas',
  docSubView: 'ia',
  cadastroMensagem: null,
  tipoInstrumento: 'convenio',
  emTipoAtual: 'Convênio',
  docGeradoTipo: null,
  docGeradoTexto: null,
  docGeradoEhModelo: false,
  docEditandoId: null,
  pagamentoDocsAbertoId: null,
};

// Tipos de emenda parlamentar disponíveis
const TIPOS_EMENDA = ['Pix', 'Transferência Fundo a Fundo', 'Emenda de Bancada', 'Emenda de Comissão', 'Convênio'];
// Tipos de emenda que exigem vínculo com um Convênio já cadastrado (dados completos do conveniente)
const TIPOS_EMENDA_COM_CONVENIO = ['Convênio'];

// Tipos de aditivo contratual disponíveis para as contratadas
const TIPOS_ADITIVO = [
  { id: 'valor', label: 'De Valor' },
  { id: 'prazo', label: 'De Prazo' },
  { id: 'valor_prazo', label: 'De Valor e Prazo' },
];

// ==================== PERSISTÊNCIA ====================
// Cada função abaixo grava SÓ o registro que mudou (não mais o estado inteiro).
// Mantido com os mesmos nomes de função de antes (salvarEstado) nos pontos de
// chamada mais genéricos, mas agora delegando para a tabela certa.
function persistirConvenio(id) {
  const c = STATE.convenios.find(x => x.id === id);
  if (c) salvarConvenioDb(c);
}

function persistirTodosConvenios() {
  STATE.convenios.forEach(c => salvarConvenioDb(c));
}

function persistirEmenda(id) {
  const e = STATE.emendas.find(x => x.id === id);
  if (e) salvarEmendaDb(e);
}

function persistirTodasEmendas() {
  STATE.emendas.forEach(e => salvarEmendaDb(e));
}

function persistirInstituicao(id) {
  const i = STATE.instituicoes.find(x => x.id === id);
  if (i) salvarInstituicaoDb(i);
}

function persistirTodasInstituicoes() {
  STATE.instituicoes.forEach(i => salvarInstituicaoDb(i));
}

function persistirProponente(id) {
  const p = STATE.proponentes.find(x => x.id === id);
  if (p) salvarProponenteDb(p);
}

function persistirTodosProponentes() {
  STATE.proponentes.forEach(p => salvarProponenteDb(p));
}

function persistirResponsavelTecnico(id) {
  const r = STATE.responsaveisTecnicos.find(x => x.id === id);
  if (r) salvarResponsavelTecnicoDb(r);
}

function persistirTodosResponsaveisTecnicos() {
  STATE.responsaveisTecnicos.forEach(r => salvarResponsavelTecnicoDb(r));
}

function persistirUsuario(id) {
  const u = STATE.usuarios.find(x => x.id === id);
  if (u) salvarUsuarioDb(u);
}

function persistirTodosUsuarios() {
  STATE.usuarios.forEach(u => salvarUsuarioDb(u));
}

function persistirMeta() {
  salvarMetaDb({ convenioAtualId: STATE.convenioAtualId, protocoloSeq: STATE.protocoloSeq });
}

// Compatibilidade com o restante do código (que ainda chama "salvarEstado()"
// nos pontos em que mexe no convênio/emenda "em foco" — financeiro, anexos,
// pagamentos, etc.). Persiste só os registros relevantes, não a base toda.
function salvarEstado() {
  if (STATE.convenioAtualId) persistirConvenio(STATE.convenioAtualId);
  if (STATE.convenioEditandoId && STATE.convenioEditandoId !== STATE.convenioAtualId) persistirConvenio(STATE.convenioEditandoId);
  if (STATE.emendaEditandoId) persistirEmenda(STATE.emendaEditandoId);
  if (STATE.instituicaoEditandoId) persistirInstituicao(STATE.instituicaoEditandoId);
  if (STATE.proponenteEditandoId) persistirProponente(STATE.proponenteEditandoId);
  if (STATE.responsavelTecnicoEditandoId) persistirResponsavelTecnico(STATE.responsavelTecnicoEditandoId);
  if (STATE.usuarioEditandoId) persistirUsuario(STATE.usuarioEditandoId);
  persistirMeta();
}

// ==================== ADITIVOS DE CONTRATO ====================
// Garante que uma contratada (mesmo cadastrada antes desta funcionalidade
// existir) tenha os campos de vigência/aditivos inicializados.
function garantirCamposAditivo(ct) {
  if (!ct.aditivos) ct.aditivos = [];
  if (ct.valorContratoOriginal === undefined || ct.valorContratoOriginal === null) {
    ct.valorContratoOriginal = ct.valorContrato || '0,00';
  }
  if (ct.dataInicioVigencia === undefined) ct.dataInicioVigencia = '';
  if (ct.dataFimVigenciaOriginal === undefined) ct.dataFimVigenciaOriginal = ct.dataFimVigencia || '';
  if (ct.dataFimVigencia === undefined) ct.dataFimVigencia = ct.dataFimVigenciaOriginal || '';
  return ct;
}

// Recalcula ct.valorContrato (vigente) e ct.dataFimVigencia (vigente) a
// partir do valor/vigência ORIGINAL do contrato somado ao histórico de
// aditivos. É chamada sempre que um aditivo é adicionado ou removido, o
// que torna a remoção segura (basta recalcular do zero) e mantém o valor
// e a vigência "vigentes" sempre consistentes com o histórico.
function recalcularContratada(ct) {
  garantirCamposAditivo(ct);
  const valorBase = parseMoeda(ct.valorContratoOriginal || '0');
  const totalAditivadoValor = ct.aditivos
    .filter(a => a.tipo === 'valor' || a.tipo === 'valor_prazo')
    .reduce((soma, a) => soma + (Number(a.valorAditivo) || 0), 0);
  ct.valorContrato = formatValorMasked(valorBase + totalAditivadoValor);

  const aditivosPrazoOrdenados = ct.aditivos
    .filter(a => (a.tipo === 'prazo' || a.tipo === 'valor_prazo') && a.novaDataFim)
    .sort((a, b) => (a.criadoEm || 0) - (b.criadoEm || 0));
  ct.dataFimVigencia = aditivosPrazoOrdenados.length
    ? aditivosPrazoOrdenados[aditivosPrazoOrdenados.length - 1].novaDataFim
    : (ct.dataFimVigenciaOriginal || '');
}

// Propaga a vigência das contratadas para o CONVÊNIO. O convênio guarda uma
// data-base (dataFimOriginal, sincronizada sempre que o cadastro é salvo) e
// aqui pegamos a data mais distante entre essa base e a vigência atual de
// cada contratada — assim, um aditivo de prazo que posterga o contrato de
// uma empresa também "puxa" a vigência do convênio (e o prazo de PC, que
// depende dela) para frente. Só estica pra frente, nunca encurta sozinho.
function recalcularVigenciaConvenio(c) {
  if (!c) return;
  if (!c.dataFimOriginal) c.dataFimOriginal = c.dataFim || '';
  const datasContratadas = (c.financeiro?.contratadas || [])
    .map(ct => ct.dataFimVigencia)
    .filter(Boolean);
  const todasDatas = [c.dataFimOriginal, ...datasContratadas].filter(Boolean);
  if (!todasDatas.length) return;
  const maisRecente = todasDatas.reduce((max, d) => (!max || new Date(d + 'T00:00:00') > new Date(max + 'T00:00:00')) ? d : max, null);
  if (maisRecente && maisRecente !== c.dataFim) {
    c.dataFim = maisRecente;
    c.prazoLimitePC = calcularPrazoPC(c.dataFim, c.prazoPC || '60');
  }
}

function toggleAditivos(ctId) {
  STATE.aditivoAbertoCtId = STATE.aditivoAbertoCtId === ctId ? null : ctId;
  renderFinanceiro();
}

// Abre (sem alternar/fechar) o painel de aditivos de uma contratada — usado
// a partir do Extrato de Aditivos e do alerta de contratos a vencer, onde
// sempre queremos garantir que o painel abra, nunca feche.
function abrirAditivoAqui(ctId) {
  STATE.aditivoAbertoCtId = ctId;
  STATE.subView = 'contratadas';
  renderTudo();
}

function atualizarCamposAditivo() {
  const tipo = document.getElementById('ad_tipo')?.value;
  const blocoValor = document.getElementById('ad_bloco_valor');
  const blocoPrazo = document.getElementById('ad_bloco_prazo');
  if (blocoValor) blocoValor.style.display = (tipo === 'valor' || tipo === 'valor_prazo') ? '' : 'none';
  if (blocoPrazo) blocoPrazo.style.display = (tipo === 'prazo' || tipo === 'valor_prazo') ? '' : 'none';
}

async function adicionarAditivo(ctId) {
  if (!podeEditar()) { bloqueadoSomenteLeitura(); return; }
  if (!STATE.convenioAtualId) return;
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;
  const ct = (c.financeiro.contratadas || []).find(x => x.id === ctId);
  if (!ct) return;
  garantirCamposAditivo(ct);

  const tipo = document.getElementById('ad_tipo')?.value || 'valor';
  const numero = document.getElementById('ad_numero')?.value.trim() || '';
  const dataAssinatura = document.getElementById('ad_data')?.value || '';
  const justificativa = document.getElementById('ad_justificativa')?.value.trim() || '';

  if (!numero) { toastAviso('Informe o número do aditivo.'); return; }
  if (!dataAssinatura) { toastAviso('Informe a data de assinatura do aditivo.'); return; }

  let valorAditivo = 0;
  if (tipo === 'valor' || tipo === 'valor_prazo') {
    valorAditivo = parseMoeda(document.getElementById('ad_valor')?.value || '0');
    if (!valorAditivo) { toastAviso('Informe o valor que está sendo aditivado.'); return; }
  }

  let novaDataFim = '';
  if (tipo === 'prazo' || tipo === 'valor_prazo') {
    novaDataFim = document.getElementById('ad_novaDataFim')?.value || '';
    if (!novaDataFim) { toastAviso('Informe a nova data de vigência.'); return; }
  }

  const dataFimAnterior = ct.dataFimVigencia || ct.dataFimVigenciaOriginal || '';

  const fileInput = document.getElementById('ad_anexo');
  const file = fileInput?.files?.[0];
  let arquivo = null;
  let arquivoDataUrl = null;
  if (file) {
    arquivo = file.name;
    try {
      arquivoDataUrl = await lerArquivoComoDataUrl(file);
    } catch (e) {
      console.error('Erro ao ler anexo do aditivo:', e);
    }
  }

  ct.aditivos.push({
    id: gerarId('ad'),
    numero,
    tipo,
    dataAssinatura,
    justificativa,
    valorAditivo: (tipo === 'valor' || tipo === 'valor_prazo') ? valorAditivo : 0,
    dataFimAnterior: (tipo === 'prazo' || tipo === 'valor_prazo') ? dataFimAnterior : '',
    novaDataFim: (tipo === 'prazo' || tipo === 'valor_prazo') ? novaDataFim : '',
    arquivo,
    arquivoDataUrl,
    criadoEm: Date.now(),
  });

  recalcularContratada(ct);
  const dataFimConvenioAnterior = c.dataFim;
  recalcularVigenciaConvenio(c);
  salvarEstado();
  const vigenciaConvenioMudou = (tipo === 'prazo' || tipo === 'valor_prazo') && c.dataFim !== dataFimConvenioAnterior;
  toastSucesso('Aditivo nº ' + numero + ' registrado — valor/vigência do contrato atualizados.' + (vigenciaConvenioMudou ? ' Vigência do convênio também foi atualizada para ' + formatData(c.dataFim) + '.' : ''));
  renderFinanceiro();
}

function removerAditivo(ctId, aditivoId) {
  if (!podeEditar()) { bloqueadoSomenteLeitura(); return; }
  if (!STATE.convenioAtualId) return;
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;
  const ct = (c.financeiro.contratadas || []).find(x => x.id === ctId);
  if (!ct) return;
  garantirCamposAditivo(ct);
  const ad = ct.aditivos.find(a => a.id === aditivoId);
  if (!ad) return;
  if (!confirm('Remover o Aditivo nº ' + (ad.numero || '?') + '? O valor e a vigência do contrato serão recalculados sem ele.')) return;
  ct.aditivos = ct.aditivos.filter(a => a.id !== aditivoId);
  recalcularContratada(ct);
  recalcularVigenciaConvenio(c);
  salvarEstado();
  renderFinanceiro();
}

// ==================== CÁLCULO FINANCEIRO ====================
function calcularResumoFinanceiro(id) {
  const c = STATE.convenios.find(x => x.id === id);
  if (!c) return null;
  if (!c.financeiro) c.financeiro = { extratos: [], rendimentos: [], autorizacoes: [], usos: [], contratadas: [], pagamentos: [] };
  const f = c.financeiro;
  const valor = parseMoeda(c.valor || '0');
  const contrapartida = parseMoeda(c.contrapartida || '0');
  const valorTotal = valor + contrapartida;
  const totalEntradas = (f.extratos || []).reduce((a, e) => a + (e.entradas || 0), 0);
  const totalSaidas = (f.extratos || []).reduce((a, e) => a + (e.saidas || 0), 0);
  const movExtrato = totalEntradas - totalSaidas;
  const totalRendimento = (f.rendimentos || []).reduce((a, r) => a + (r.rendimento || 0), 0);
  const totalUsoRendimento = (f.usos || []).reduce((a, u) => a + (u.valor || 0), 0);
  const saldoRendimento = totalRendimento - totalUsoRendimento;
  const totalPago = (f.pagamentos || []).reduce((a, p) => a + (p.valor || 0), 0);
  const totalContratado = (f.contratadas || []).reduce((a, ct) => a + parseMoeda(ct.valorContrato || '0'), 0);
  const saldoTotal = valorTotal + movExtrato + totalRendimento - totalUsoRendimento - totalPago;
  // Saldo do CONTRATO (o que ainda resta a pagar dentro do valor contratado
  // com a(s) contratada(s) via licitação) — diferente do saldo do convênio
  // (saldoTotal, que reflete o valor total repassado/contrapartida menos o
  // que já saiu). Só faz sentido quando há contratada(s) cadastrada(s).
  const saldoContrato = totalContratado > 0 ? (totalContratado - totalPago) : null;
  return { valor, contrapartida, valorTotal, totalEntradas, totalSaidas, movExtrato, totalRendimento, totalUsoRendimento, saldoRendimento, totalPago, totalContratado, saldoTotal, saldoContrato, fin: f };
}

async function carregarEstado() {
  const p = await carregarEstadoDb();
  STATE.convenios = p.convenios || [];
  STATE.emendas = p.emendas || [];
  STATE.instituicoes = p.instituicoes || [];
  STATE.proponentes = p.proponentes || [];
  STATE.responsaveisTecnicos = p.responsaveisTecnicos || [];
  STATE.usuarios = p.usuarios || [];
  STATE.identidadeVisual = p.identidadeVisual || { nomeMunicipio: '', brasaoDataUrl: null };
  STATE.convenioAtualId = p.convenioAtualId || null;
  STATE.protocoloSeq = p.protocoloSeq || 0;
  STATE.convenios.forEach(c => {
    (c.documentosExtras || []).forEach(doc => { if (!doc.status) doc.status = doc.anexado ? 'anexado' : 'solicitado'; });
  });
}

// ==================== NAVEGAÇÃO ====================
function mudarView(view) {
  const somenteAdmin = ['usuarios', 'identidadeVisual', 'backups'];
  if (somenteAdmin.includes(view) && !podeAdministrar()) {
    toastAviso('Essa área é restrita a administradores.');
    return;
  }
  STATE.view = view;
  if (view === 'prestacao') STATE.subView = 'contratadas';
  else if (view === 'documentos') STATE.docSubView = 'ia';
  else if (view === 'emendas') STATE.subView = 'lista';
  else if (view === 'instituicoes') STATE.subView = 'lista';
  else if (view === 'proponentes') STATE.subView = 'lista';
  else if (view === 'responsaveisTecnicos') STATE.subView = 'lista';
  else if (view === 'usuarios') STATE.subView = 'lista';
  else if (view === 'relatorios') STATE.subView = 'contratadas';
  if (view !== 'cadastro') STATE.cadastroMensagem = null;
  if (view !== 'documentos') { STATE.docGeradoTipo = null; STATE.docGeradoTexto = null; }
  renderTudo();
}

function mudarSubView(sub) {
  STATE.subView = sub;
  renderTudo();
}

function preencherComInstituicao(id) {
  if (!id) { STATE.convenioInstituicaoIdSelecionada = null; return; }
  const i = STATE.instituicoes.find(x => x.id === id);
  if (!i) return;
  STATE.convenioInstituicaoIdSelecionada = id;
  const orgao = document.getElementById('c_orgao');
  if (orgao) orgao.value = i.nomeFantasia || i.razaoSocial || '';
  toastSucesso('Dados da instituição preenchidos e vínculo salvo — se você editar o cadastro dela depois, use "Ressincronizar" pra atualizar este convênio.');
}

function preencherComProponente(id) {
  if (!id) { STATE.convenioProponenteIdSelecionada = null; return; }
  const p = STATE.proponentes.find(x => x.id === id);
  if (!p) return;
  STATE.convenioProponenteIdSelecionada = id;
  const mapa = {
    c_conveniente: p.razaoSocial, c_cnpj: p.documento, c_cep: p.cep, c_logradouro: p.logradouro,
    c_bairro: p.bairro, c_municipio: p.municipio, c_telefone: p.telefone, c_email: p.email,
    c_banco: p.banco, c_agencia: p.agencia, c_conta: p.conta,
  };
  Object.entries(mapa).forEach(([campo, valor]) => {
    const el = document.getElementById(campo);
    if (el && valor) el.value = valor;
  });
  const natEl = document.getElementById('c_natureza');
  if (natEl && [...natEl.options].some(o => o.value === p.natureza)) natEl.value = p.natureza;
  toastSucesso('Dados do proponente/convenente preenchidos e vínculo salvo — se você editar o cadastro dele depois, use "Ressincronizar" pra atualizar este convênio.');
}

// ==================== CRUD CONVÊNIOS ====================
const camposConvenio = [
  'c_numero', 'c_programa', 'c_orgao', 'c_esfera', 'c_natureza', 'c_conveniente', 'c_cnpj',
  'c_cep', 'c_logradouro', 'c_bairro', 'c_municipio', 'c_telefone', 'c_email',
  'c_banco', 'c_agencia', 'c_conta', 'c_valor', 'c_contrapartida',
  'c_data_assinatura', 'c_data_inicio', 'c_data_fim', 'c_prazo_pc'
];

const obrigatoriosBase = ['c_numero', 'c_conveniente', 'c_valor'];
const obrigatoriosConvenio = [...obrigatoriosBase, 'c_data_fim'];
const obrigatoriosProjeto = [...obrigatoriosBase];

function getFormData() {
  const d = {};
  camposConvenio.forEach(id => {
    const el = document.getElementById(id);
    if (el) d[id] = el.value;
  });
  return d;
}

function setFormData(d) {
  camposConvenio.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = d[id] || '';
  });
}

function novoConvenio(tipo) {
  STATE.convenioEditandoId = null;
  STATE.tipoInstrumento = tipo || 'convenio';
  STATE.cadastroMensagem = null;
  STATE.convenioInstituicaoIdSelecionada = null;
  STATE.convenioProponenteIdSelecionada = null;
  limparFormConvenio();
  mudarView('cadastro');
}

function editarConvenio(id) {
  const c = STATE.convenios.find(x => x.id === id);
  if (!c) return;
  STATE.convenioEditandoId = id;
  STATE.convenioAtualId = id;
  STATE.tipoInstrumento = c.tipo || 'convenio';
  STATE.cadastroMensagem = null;
  STATE.convenioInstituicaoIdSelecionada = c.instituicaoId || null;
  STATE.convenioProponenteIdSelecionada = c.proponenteId || null;
  // O formulário só existe no DOM depois do render — por isso precisa
  // mudar de tela ANTES de preencher os campos (senão fica tudo em branco).
  mudarView('cadastro');
  // Compatibilidade com registros antigos: "Federal" agora é "União"; dado antigo de proponente vira conveniente
  const esferaNormalizada = c.esfera === 'Federal' ? 'União' : (c.esfera === 'Estadual' ? 'Estado' : c.esfera);
  
  // Aguarda o próximo tick do navegador para garantir que o formulário foi renderizado
  // antes de tentar preencher os campos. Isso resolve o bug de formulário em branco
  // que ocorria quando o React renderizava a tela mas setFormData() era chamado antes
  // dos inputs existirem no DOM.
  requestAnimationFrame(() => {
    setFormData({
      c_numero: c.numero, c_programa: c.programa, c_orgao: c.orgao,
      c_esfera: esferaNormalizada, c_natureza: c.natureza,
      c_conveniente: c.conveniente || c.proponente,
      c_cnpj: c.cnpj, c_cep: c.cep, c_logradouro: c.logradouro,
      c_bairro: c.bairroProp, c_municipio: c.municipioProp,
      c_telefone: c.telefoneInst, c_email: c.emailInst,
      c_banco: c.banco, c_agencia: c.agencia, c_conta: c.conta, c_valor: c.valor,
      c_contrapartida: c.contrapartida,
      c_data_assinatura: c.dataAssinatura, c_data_inicio: c.dataInicio,
      c_data_fim: c.dataFim, c_prazo_pc: c.prazoPC || '60',
    });
  });
}

function salvarConvenio() {
  if (!podeEditar()) { bloqueadoSomenteLeitura(); return; }
  const form = getFormData();
  const obrigatorios = STATE.tipoInstrumento === 'projeto' ? obrigatoriosProjeto : obrigatoriosConvenio;
  const faltando = obrigatorios.filter(id => !form[id] || !form[id].trim());

  if (faltando.length) {
    STATE.cadastroMensagem = '<div class="alert alert-warning">Preencha os campos obrigatórios: ' + faltando.map(id => document.getElementById(id)?.closest('.form-group')?.querySelector('.form-label')?.textContent || id).join(', ') + '.</div>';
    renderTudo();
    return;
  }

  const dataInicio = form.c_data_inicio;
  const dataFim = form.c_data_fim;
  if (dataInicio && dataFim && new Date(dataFim) < new Date(dataInicio)) {
    STATE.cadastroMensagem = '<div class="alert alert-danger">A data de fim não pode ser anterior à data de início.</div>';
    renderTudo();
    return;
  }

  // Validação de CNPJ/CPF (dígito verificador) — antes só a máscara visual era checada.
  const docCheck = validarCpfOuCnpj(form.c_cnpj);
  if (form.c_cnpj && !docCheck.valido) {
    STATE.cadastroMensagem = '<div class="alert alert-danger">CNPJ/CPF do conveniente parece inválido. Confira os dígitos e tente novamente.</div>';
    renderTudo();
    return;
  }

  const prazoLimitePC = calcularPrazoPC(dataFim, form.c_prazo_pc);

  const dados = {
    tipo: STATE.tipoInstrumento,
    numero: form.c_numero, programa: form.c_programa, orgao: form.c_orgao,
    esfera: form.c_esfera, natureza: form.c_natureza, conveniente: form.c_conveniente,
    cnpj: form.c_cnpj, cep: form.c_cep, logradouro: form.c_logradouro,
    bairroProp: form.c_bairro, municipioProp: form.c_municipio,
    telefoneInst: form.c_telefone, emailInst: form.c_email,
    banco: form.c_banco, agencia: form.c_agencia, conta: form.c_conta,
    valor: form.c_valor, contrapartida: form.c_contrapartida,
    dataAssinatura: form.c_data_assinatura, dataInicio, dataFim, dataFimOriginal: dataFim,
    prazoPC: form.c_prazo_pc, prazoLimitePC,
    instituicaoId: STATE.convenioInstituicaoIdSelecionada || null,
    proponenteId: STATE.convenioProponenteIdSelecionada || null,
  };

  if (STATE.convenioEditandoId) {
    const idx = STATE.convenios.findIndex(c => c.id === STATE.convenioEditandoId);
    if (idx > -1) {
      STATE.convenios[idx] = {
        ...STATE.convenios[idx],
        ...dados,
      };
    }
    salvarEstado();
    STATE.cadastroMensagem = '<div class="alert alert-success">Convênio salvo às ' + new Date().toLocaleTimeString('pt-BR') + '</div>';
    renderTudo();
  } else {
    const novoId = gerarId('c');
    const novo = {
      id: novoId,
      ...dados,
      documentos: {},
      documentosExtras: [],
      docsGeradosIA: [],
      financeiro: { extratos: [], rendimentos: [], autorizacoes: [], usos: [], contratadas: [], pagamentos: [] },
    };
    STATE.convenios.push(novo);
    STATE.convenioEditandoId = novoId;
    STATE.convenioAtualId = novoId;
    salvarEstado();
    STATE.cadastroMensagem = '<div class="alert alert-success">Cadastrado com sucesso! Voltando ao Painel...</div>';
    renderTudo();
    setTimeout(() => { STATE.cadastroMensagem = null; mudarView('painel'); }, 900);
  }
}

function excluirConvenio(id) {
  if (!podeEditar()) { bloqueadoSomenteLeitura(); return; }
  const c = STATE.convenios.find(x => x.id === id);
  if (!c) return;
  if (!confirm('Excluir o convênio "' + (c.numero || 'sem número') + '"? Esta ação não pode ser desfeita.')) return;
  STATE.convenios = STATE.convenios.filter(x => x.id !== id);
  if (STATE.convenioAtualId === id) STATE.convenioAtualId = null;
  if (STATE.convenioEditandoId === id) STATE.convenioEditandoId = null;
  removerConvenioDb(id).catch(e => { console.error(e); toastErro('Não consegui remover do banco local — tente novamente.'); });
  persistirMeta();
  toastSucesso('Convênio excluído.');
  mudarView('painel');
}

function duplicarConvenio(id) {
  const orig = STATE.convenios.find(x => x.id === id);
  if (!orig) return;
  const copia = {
    ...JSON.parse(JSON.stringify(orig)),
    id: gerarId('c'),
    numero: (orig.numero || 'sem número') + ' (cópia)',
  };
  STATE.convenios.push(copia);
  persistirConvenio(copia.id); // registro novo — precisa ser salvo explicitamente, não está "em foco"
  toastSucesso('Convênio duplicado.');
  mudarView('painel');
}

function abrirPrestacaoContas(id) {
  const c = STATE.convenios.find(x => x.id === id);
  if (c && c.tipo === 'projeto') { toastAviso('Projetos não têm prestação de contas — apenas Convênios.'); return; }
  STATE.convenioAtualId = id;
  STATE.subView = 'contratadas';
  salvarEstado();
  mudarView('prestacao');
}

// Atalho usado pelo alerta de "contratos a vencer" do Painel Geral: abre
// direto a prestação de contas do convênio já com o painel de aditivos da
// contratada em risco expandido, pra agilizar o registro do aditivo.
function abrirAditivoDireto(convenioId, contratadaId) {
  const c = STATE.convenios.find(x => x.id === convenioId);
  if (!c) return;
  STATE.convenioAtualId = convenioId;
  STATE.subView = 'contratadas';
  STATE.aditivoAbertoCtId = contratadaId;
  salvarEstado();
  mudarView('prestacao');
}

// ==================== CRUD EMENDAS ====================
function novaEmenda() {
  STATE.emendaEditandoId = null;
  limparFormEmenda();
  mudarView('emendas');
}

function editarEmenda(id) {
  const e = STATE.emendas.find(x => x.id === id);
  if (!e) return;
  STATE.emendaEditandoId = id;
  STATE.emTipoAtual = e.tipo || 'Convênio';
  STATE.view = 'emendas';
  STATE.subView = 'form';
  renderTudo();
  // O formulário só existe no DOM após o render acima
  ['em_parlamentar', 'em_partido', 'em_numero', 'em_ano', 'em_valor', 'em_orgao', 'em_objeto', 'em_situacao', 'em_esfera', 'em_obs', 'em_conveniente_nome', 'em_conveniente_cnpj'].forEach(k => {
    const el = document.getElementById(k);
    if (el) el.value = e[k.replace('em_', '')] || '';
  });
  const convSel = document.getElementById('em_convenio');
  if (convSel) convSel.value = e.convenioId || '';
}

function salvarEmenda() {
  if (!podeEditar()) { bloqueadoSomenteLeitura(); return; }
  const parlamentar = (document.getElementById('em_parlamentar')?.value || '').trim();
  const numero = (document.getElementById('em_numero')?.value || '').trim();
  const valor = (document.getElementById('em_valor')?.value || '').trim();
  const nota = document.getElementById('emendaNote');

  if (!parlamentar || !numero || !valor) {
    nota.innerHTML = '<div class="alert alert-warning">Preencha Parlamentar, Número e Valor.</div>';
    return;
  }

  const cnpjConveniente = document.getElementById('em_conveniente_cnpj')?.value || '';
  const docCheck = validarCpfOuCnpj(cnpjConveniente);
  if (cnpjConveniente && !docCheck.valido) {
    nota.innerHTML = '<div class="alert alert-danger">CNPJ/CPF do conveniente parece inválido. Confira os dígitos.</div>';
    return;
  }

  const dados = {
    parlamentar,
    partido: document.getElementById('em_partido')?.value || '',
    esfera: document.getElementById('em_esfera')?.value || 'União',
    tipo: document.getElementById('em_tipo')?.value || 'Convênio',
    numero, ano: document.getElementById('em_ano')?.value || '',
    valor, orgao: document.getElementById('em_orgao')?.value || '',
    objeto: document.getElementById('em_objeto')?.value || '',
    situacao: document.getElementById('em_situacao')?.value || 'Indicada',
    convenioId: document.getElementById('em_convenio')?.value || null,
    conveniente_nome: document.getElementById('em_conveniente_nome')?.value || '',
    conveniente_cnpj: document.getElementById('em_conveniente_cnpj')?.value || '',
    obs: document.getElementById('em_obs')?.value || '',
  };

  let idPersistir;
  if (STATE.emendaEditandoId) {
    const idx = STATE.emendas.findIndex(e => e.id === STATE.emendaEditandoId);
    if (idx > -1) STATE.emendas[idx] = { id: STATE.emendaEditandoId, ...dados };
    idPersistir = STATE.emendaEditandoId;
  } else {
    idPersistir = gerarId('em');
    STATE.emendas.push({ id: idPersistir, ...dados });
  }

  persistirEmenda(idPersistir); // usa o id certo mesmo quando é registro novo (emendaEditandoId ainda não existia)
  limparFormEmenda();
  nota.innerHTML = '<div class="alert alert-success">Emenda salva às ' + new Date().toLocaleTimeString('pt-BR') + '</div>';
}

function excluirEmenda(id) {
  if (!podeEditar()) { bloqueadoSomenteLeitura(); return; }
  const e = STATE.emendas.find(x => x.id === id);
  if (!e) return;
  if (!confirm('Excluir a emenda de ' + (e.parlamentar || '?') + '?')) return;
  STATE.emendas = STATE.emendas.filter(x => x.id !== id);
  removerEmendaDb(id).catch(err => { console.error(err); toastErro('Não consegui remover do banco local — tente novamente.'); });
  if (STATE.emendaEditandoId === id) {
    STATE.emendaEditandoId = null;
    limparFormEmenda();
  }
  salvarEstado();
}

// ==================== CRUD INSTITUIÇÕES ====================
function novaInstituicao() {
  STATE.instituicaoEditandoId = null;
  limparFormInstituicao();
  mudarSubView('form');
}

function editarInstituicao(id) {
  const i = STATE.instituicoes.find(x => x.id === id);
  if (!i) return;
  STATE.instituicaoEditandoId = id;
  STATE.view = 'instituicoes';
  STATE.subView = 'form';
  renderTudo();
  ['in_razaoSocial', 'in_nomeFantasia', 'in_cnpj', 'in_esfera', 'in_cep', 'in_logradouro',
    'in_bairro', 'in_municipio', 'in_telefone', 'in_email', 'in_repNome', 'in_repCargo', 'in_repCpf', 'in_obs',
  ].forEach(k => {
    const el = document.getElementById(k);
    if (el) el.value = i[k.replace('in_', '')] || '';
  });
}

function salvarInstituicao() {
  if (!podeEditar()) { bloqueadoSomenteLeitura(); return; }
  const nota = document.getElementById('instituicaoNote');
  const razaoSocial = (document.getElementById('in_razaoSocial')?.value || '').trim();
  const cnpj = (document.getElementById('in_cnpj')?.value || '').trim();

  if (!razaoSocial) {
    nota.innerHTML = '<div class="alert alert-warning">Informe a Razão Social.</div>';
    return;
  }
  const docCheck = validarCpfOuCnpj(cnpj);
  if (cnpj && !docCheck.valido) {
    nota.innerHTML = '<div class="alert alert-danger">CNPJ parece inválido. Confira os dígitos.</div>';
    return;
  }

  const dados = {
    razaoSocial,
    nomeFantasia: document.getElementById('in_nomeFantasia')?.value || '',
    cnpj,
    esfera: document.getElementById('in_esfera')?.value || 'Municipal',
    cep: document.getElementById('in_cep')?.value || '',
    logradouro: document.getElementById('in_logradouro')?.value || '',
    bairro: document.getElementById('in_bairro')?.value || '',
    municipio: document.getElementById('in_municipio')?.value || '',
    telefone: document.getElementById('in_telefone')?.value || '',
    email: document.getElementById('in_email')?.value || '',
    repNome: document.getElementById('in_repNome')?.value || '',
    repCargo: document.getElementById('in_repCargo')?.value || '',
    repCpf: document.getElementById('in_repCpf')?.value || '',
    obs: document.getElementById('in_obs')?.value || '',
  };

  let idPersistir;
  if (STATE.instituicaoEditandoId) {
    const idx = STATE.instituicoes.findIndex(i => i.id === STATE.instituicaoEditandoId);
    if (idx > -1) STATE.instituicoes[idx] = { id: STATE.instituicaoEditandoId, ...dados };
    idPersistir = STATE.instituicaoEditandoId;
  } else {
    idPersistir = gerarId('in');
    STATE.instituicoes.push({ id: idPersistir, ...dados });
  }

  persistirInstituicao(idPersistir);
  STATE.instituicaoEditandoId = null;
  limparFormInstituicao();
  mudarSubView('lista');
  toastSucesso('Instituição salva.');
}

function excluirInstituicao(id) {
  if (!podeEditar()) { bloqueadoSomenteLeitura(); return; }
  const i = STATE.instituicoes.find(x => x.id === id);
  if (!i) return;
  if (!confirm('Excluir a instituição "' + (i.razaoSocial || '?') + '"?')) return;
  STATE.instituicoes = STATE.instituicoes.filter(x => x.id !== id);
  removerInstituicaoDb(id).catch(err => { console.error(err); toastErro('Não consegui remover do banco local — tente novamente.'); });
  if (STATE.instituicaoEditandoId === id) {
    STATE.instituicaoEditandoId = null;
    limparFormInstituicao();
  }
  renderTudo();
}

// ==================== CRUD PROPONENTES/CONVENENTES ====================
function novaProponente() {
  STATE.proponenteEditandoId = null;
  limparFormProponente();
  mudarSubView('form');
}

function editarProponente(id) {
  const p = STATE.proponentes.find(x => x.id === id);
  if (!p) return;
  STATE.proponenteEditandoId = id;
  STATE.view = 'proponentes';
  STATE.subView = 'form';
  renderTudo();
  // Aguarda o próximo tick do navegador para garantir que o formulário foi renderizado
  requestAnimationFrame(() => {
    ['pp_razaoSocial', 'pp_natureza', 'pp_documento', 'pp_cep', 'pp_logradouro', 'pp_bairro',
      'pp_municipio', 'pp_telefone', 'pp_email', 'pp_banco', 'pp_agencia', 'pp_conta',
      'pp_repNome', 'pp_repCargo', 'pp_repCpf', 'pp_obs',
    ].forEach(k => {
      const el = document.getElementById(k);
      if (el) el.value = p[k.replace('pp_', '')] || '';
    });
  });
}

function salvarProponente() {
  if (!podeEditar()) { bloqueadoSomenteLeitura(); return; }
  const nota = document.getElementById('proponenteNote');
  const razaoSocial = (document.getElementById('pp_razaoSocial')?.value || '').trim();
  const documento = (document.getElementById('pp_documento')?.value || '').trim();

  if (!razaoSocial) {
    nota.innerHTML = '<div class="alert alert-warning">Informe o Nome/Razão Social do proponente.</div>';
    return;
  }
  const docCheck = validarCpfOuCnpj(documento);
  if (documento && !docCheck.valido) {
    nota.innerHTML = '<div class="alert alert-danger">CPF/CNPJ parece inválido. Confira os dígitos.</div>';
    return;
  }

  const dados = {
    razaoSocial,
    natureza: document.getElementById('pp_natureza')?.value || 'OSC',
    documento,
    cep: document.getElementById('pp_cep')?.value || '',
    logradouro: document.getElementById('pp_logradouro')?.value || '',
    bairro: document.getElementById('pp_bairro')?.value || '',
    municipio: document.getElementById('pp_municipio')?.value || '',
    telefone: document.getElementById('pp_telefone')?.value || '',
    email: document.getElementById('pp_email')?.value || '',
    banco: document.getElementById('pp_banco')?.value || '',
    agencia: document.getElementById('pp_agencia')?.value || '',
    conta: document.getElementById('pp_conta')?.value || '',
    repNome: document.getElementById('pp_repNome')?.value || '',
    repCargo: document.getElementById('pp_repCargo')?.value || '',
    repCpf: document.getElementById('pp_repCpf')?.value || '',
    obs: document.getElementById('pp_obs')?.value || '',
  };

  let idPersistir;
  if (STATE.proponenteEditandoId) {
    const idx = STATE.proponentes.findIndex(p => p.id === STATE.proponenteEditandoId);
    if (idx > -1) STATE.proponentes[idx] = { id: STATE.proponenteEditandoId, ...dados };
    idPersistir = STATE.proponenteEditandoId;
  } else {
    idPersistir = gerarId('pp');
    STATE.proponentes.push({ id: idPersistir, ...dados });
  }

  persistirProponente(idPersistir);
  STATE.proponenteEditandoId = null;
  limparFormProponente();
  mudarSubView('lista');
  toastSucesso('Proponente/Convenente salvo.');
}

function excluirProponente(id) {
  if (!podeEditar()) { bloqueadoSomenteLeitura(); return; }
  const p = STATE.proponentes.find(x => x.id === id);
  if (!p) return;
  if (!confirm('Excluir o proponente "' + (p.razaoSocial || '?') + '"?')) return;
  STATE.proponentes = STATE.proponentes.filter(x => x.id !== id);
  removerProponenteDb(id).catch(err => { console.error(err); toastErro('Não consegui remover do banco local — tente novamente.'); });
  if (STATE.proponenteEditandoId === id) {
    STATE.proponenteEditandoId = null;
    limparFormProponente();
  }
  renderTudo();
}

// ==================== BACKUP AUTOMÁTICO ====================
// Cria um snapshot interno (dentro do próprio IndexedDB) uma vez por dia de uso,
// mantendo os últimos 7. Isso protege contra edição/exclusão acidental de dados,
// mas NÃO protege contra o navegador limpar o cache/dados — por isso, a cada
// semana também é disparado um lembrete pra exportar um backup externo (JSON).
const INTERVALO_BACKUP_AUTO_MS = 24 * 60 * 60 * 1000; // 1 dia
const INTERVALO_LEMBRETE_EXPORT_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

async function verificarBackupAutomatico() {
  try {
    const agora = Date.now();
    const registro = await db.meta.get('backupAuto');
    const ultimoEm = registro?.ultimoEm ? new Date(registro.ultimoEm).getTime() : 0;
    if (agora - ultimoEm >= INTERVALO_BACKUP_AUTO_MS) {
      const payload = {
        convenios: STATE.convenios,
        emendas: STATE.emendas,
        instituicoes: STATE.instituicoes,
        proponentes: STATE.proponentes,
        responsaveisTecnicos: STATE.responsaveisTecnicos,
        usuarios: STATE.usuarios,
        convenioAtualId: STATE.convenioAtualId,
        protocoloSeq: STATE.protocoloSeq,
      };
      await criarSnapshotAutoDb(payload);
      await db.meta.put({ chave: 'backupAuto', ultimoEm: new Date().toISOString() });
    }

    const registroExport = await db.meta.get('lembreteExport');
    const ultimoLembreteEm = registroExport?.ultimoEm ? new Date(registroExport.ultimoEm).getTime() : 0;
    if (agora - ultimoLembreteEm >= INTERVALO_LEMBRETE_EXPORT_MS) {
      toastAviso('Já faz uma semana — considere exportar um backup (JSON) pra manter seus dados seguros fora do navegador.');
      await db.meta.put({ chave: 'lembreteExport', ultimoEm: new Date().toISOString() });
    }
  } catch (e) {
    console.error('Erro ao verificar/criar backup automático:', e);
  }
}

async function abrirTelaBackups() {
  if (!podeAdministrar()) { toastAviso('Essa área é restrita a administradores.'); return; }
  try {
    STATE.backupsAutoLista = await listarSnapshotsAutoDb();
  } catch (e) {
    console.error(e);
    STATE.backupsAutoLista = [];
  }
  STATE.view = 'backups';
  renderTudo();
}

async function restaurarSnapshotAuto(id) {
  if (!podeEditar()) { bloqueadoSomenteLeitura(); return; }
  if (!confirm('Restaurar este backup automático? Isso substitui TODOS os dados atuais (convênios, emendas, instituições, proponentes) pelo conteúdo salvo nesse ponto no tempo.')) return;
  try {
    const snap = await buscarSnapshotAutoDb(id);
    if (!snap) { toastErro('Backup não encontrado.'); return; }
    const payload = snap.payload;
    await limparConveniosEmendasDb();
    STATE.convenios = payload.convenios || [];
    STATE.emendas = payload.emendas || [];
    STATE.instituicoes = payload.instituicoes || [];
    STATE.proponentes = payload.proponentes || [];
    STATE.responsaveisTecnicos = payload.responsaveisTecnicos || [];
    STATE.usuarios = payload.usuarios || [];
    STATE.convenioAtualId = payload.convenioAtualId || null;
    STATE.protocoloSeq = payload.protocoloSeq || 0;
    persistirTodosConvenios();
    persistirTodasEmendas();
    persistirTodasInstituicoes();
    persistirTodosProponentes();
    persistirTodosResponsaveisTecnicos();
    persistirTodosUsuarios();
    persistirMeta();
    STATE.view = 'painel';
    renderTudo();
    toastSucesso('Backup restaurado com sucesso.');
  } catch (e) {
    console.error(e);
    toastErro('Não consegui restaurar esse backup — veja o console para detalhes.');
  }
}

async function excluirSnapshotAuto(id) {
  if (!podeEditar()) { bloqueadoSomenteLeitura(); return; }
  if (!confirm('Excluir este backup automático da lista?')) return;
  try {
    await removerSnapshotAutoDb(id);
    STATE.backupsAutoLista = await listarSnapshotsAutoDb();
    renderTudo();
  } catch (e) {
    console.error(e);
    toastErro('Não consegui remover esse backup.');
  }
}

function formatarDataHoraSnapshot(iso) {
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch { return iso; }
}

function renderBackups() {
  return `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <div class="card-title" style="margin-bottom:0;">Backups Automáticos (${STATE.backupsAutoLista.length})</div>
        <button class="btn btn-secondary btn-sm" onclick="mudarView('painel')">← Voltar ao Painel</button>
      </div>
      <div class="alert alert-info" style="margin-bottom:16px;">
        Um backup interno é criado automaticamente 1x por dia de uso (mantemos os últimos 7). Isso protege contra edição ou exclusão
        acidental, mas não substitui o <strong>Exportar Backup (JSON)</strong> — só ele tira os dados de dentro do navegador.
      </div>
      ${STATE.backupsAutoLista.length === 0
      ? '<div class="empty-state"><div class="empty-state-icon">🕐</div><div class="empty-state-title">Nenhum backup automático ainda</div></div>'
      : STATE.backupsAutoLista.map(s => `
          <div class="convenio-card" style="margin-bottom:8px;">
            <div class="convenio-card-title">${formatarDataHoraSnapshot(s.criadoEm)}</div>
            <div style="display:flex;align-items:center;gap:12px;">
              <button class="btn btn-ghost btn-sm" onclick="restaurarSnapshotAuto('${s.id}')">↺ Restaurar</button>
              <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="excluirSnapshotAuto('${s.id}')">🗑</button>
            </div>
          </div>
        `).join('')}
    </div>
  `;
}

// ==================== CRUD RESPONSÁVEL TÉCNICO ====================
function novoResponsavelTecnico() {
  STATE.responsavelTecnicoEditandoId = null;
  limparFormResponsavelTecnico();
  mudarSubView('form');
}

function editarResponsavelTecnico(id) {
  const r = STATE.responsaveisTecnicos.find(x => x.id === id);
  if (!r) return;
  STATE.responsavelTecnicoEditandoId = id;
  STATE.view = 'responsaveisTecnicos';
  STATE.subView = 'form';
  renderTudo();
  // Aguarda o próximo tick do navegador para garantir que o formulário foi renderizado
  requestAnimationFrame(() => {
    ['rt_nome', 'rt_cargo', 'rt_conselho', 'rt_numeroRegistro', 'rt_cpf', 'rt_telefone', 'rt_email', 'rt_obs'].forEach(k => {
      const el = document.getElementById(k);
      if (el) el.value = r[k.replace('rt_', '')] || '';
    });
  });
}

function salvarResponsavelTecnico() {
  if (!podeEditar()) { bloqueadoSomenteLeitura(); return; }
  const nota = document.getElementById('responsavelTecnicoNote');
  const nome = (document.getElementById('rt_nome')?.value || '').trim();
  const cpf = (document.getElementById('rt_cpf')?.value || '').trim();

  if (!nome) {
    nota.innerHTML = '<div class="alert alert-warning">Informe o nome do responsável técnico.</div>';
    return;
  }
  const docCheck = validarCpfOuCnpj(cpf);
  if (cpf && !docCheck.valido) {
    nota.innerHTML = '<div class="alert alert-danger">CPF parece inválido. Confira os dígitos.</div>';
    return;
  }

  const dados = {
    nome,
    cargo: document.getElementById('rt_cargo')?.value || '',
    conselho: document.getElementById('rt_conselho')?.value || 'CREA',
    numeroRegistro: document.getElementById('rt_numeroRegistro')?.value || '',
    cpf,
    telefone: document.getElementById('rt_telefone')?.value || '',
    email: document.getElementById('rt_email')?.value || '',
    obs: document.getElementById('rt_obs')?.value || '',
  };

  let idPersistir;
  if (STATE.responsavelTecnicoEditandoId) {
    const idx = STATE.responsaveisTecnicos.findIndex(r => r.id === STATE.responsavelTecnicoEditandoId);
    if (idx > -1) STATE.responsaveisTecnicos[idx] = { id: STATE.responsavelTecnicoEditandoId, ...dados };
    idPersistir = STATE.responsavelTecnicoEditandoId;
  } else {
    idPersistir = gerarId('rt');
    STATE.responsaveisTecnicos.push({ id: idPersistir, ...dados });
  }

  persistirResponsavelTecnico(idPersistir);
  STATE.responsavelTecnicoEditandoId = null;
  limparFormResponsavelTecnico();
  mudarSubView('lista');
  toastSucesso('Responsável técnico salvo.');
}

function excluirResponsavelTecnico(id) {
  if (!podeEditar()) { bloqueadoSomenteLeitura(); return; }
  const r = STATE.responsaveisTecnicos.find(x => x.id === id);
  if (!r) return;
  if (!confirm('Excluir o responsável técnico "' + (r.nome || '?') + '"?')) return;
  STATE.responsaveisTecnicos = STATE.responsaveisTecnicos.filter(x => x.id !== id);
  removerResponsavelTecnicoDb(id).catch(err => { console.error(err); toastErro('Não consegui remover do banco local — tente novamente.'); });
  if (STATE.responsavelTecnicoEditandoId === id) {
    STATE.responsavelTecnicoEditandoId = null;
    limparFormResponsavelTecnico();
  }
  renderTudo();
}

// ==================== AUTENTICAÇÃO LOCAL (ETAPA 1) ====================
// Login simples, guardado só no navegador (mesma base local de tudo o
// resto do app) — controla quem usa o computador compartilhado e atribui
// autoria às ações, mas NÃO é segurança de servidor: quem tiver acesso ao
// navegador ainda enxerga os dados pelo DevTools. Uma etapa futura com
// backend real (ex. Supabase) é quem vai resolver isso de vez — ver README.
const CHAVE_SESSAO = 'captagov_sessao_usuario';
const PAPEIS = { ADMIN: 'admin', OPERADOR: 'operador', LEITURA: 'leitura' };
const PAPEL_LABEL = { admin: 'Administrador', operador: 'Operador', leitura: 'Somente leitura' };

async function hashSenha(texto) {
  const dados = new TextEncoder().encode(texto || '');
  const buffer = await crypto.subtle.digest('SHA-256', dados);
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Se ninguém tiver senha cadastrada, o app funciona igual antes (sem tela de
// login) — assim quem já usa o CaptaGov não é pego de surpresa.
function algumUsuarioTemSenha() {
  return STATE.usuarios.some(u => !!u.senhaHash);
}

function usuarioAtual() {
  return STATE.usuarios.find(u => u.id === STATE.usuarioLogadoId) || null;
}

// Sem sistema de login ativado (ninguém com senha), trata como admin —
// mantém todo o comportamento de hoje. Com login ativado e ninguém logado,
// não tem papel nenhum (a tela de login barra antes disso importar).
function papelAtual() {
  if (!algumUsuarioTemSenha()) return PAPEIS.ADMIN;
  return usuarioAtual()?.papel || null;
}

function podeAdministrar() {
  return papelAtual() === PAPEIS.ADMIN;
}

function podeEditar() {
  return papelAtual() !== PAPEIS.LEITURA;
}

function bloqueadoSomenteLeitura() {
  toastAviso('Seu perfil é "Somente leitura" — peça a um administrador ou operador para fazer essa alteração.');
}

async function fazerLogin(usuarioId, senhaTexto) {
  const u = STATE.usuarios.find(x => x.id === usuarioId);
  if (!u || !u.senhaHash) { toastErro('Usuário inválido.'); return false; }
  const hash = await hashSenha(senhaTexto);
  if (hash !== u.senhaHash) { toastErro('Senha incorreta.'); return false; }
  STATE.usuarioLogadoId = u.id;
  STATE.usuarioSelecionadoId = u.id; // já deixa pré-selecionado em Documentos/Relatórios
  try { sessionStorage.setItem(CHAVE_SESSAO, u.id); } catch (e) { /* navegador sem sessionStorage (modo privado restrito) — segue só na memória */ }
  toastSucesso('Bem-vindo(a), ' + (u.nome || 'usuário') + '!');
  renderTudo();
  return true;
}

function fazerLogout() {
  STATE.usuarioLogadoId = null;
  try { sessionStorage.removeItem(CHAVE_SESSAO); } catch (e) { /* ignora */ }
  renderTudo();
}

// Roda na inicialização: se já havia sessão nesta aba (recarregou a página),
// reloga automaticamente — sem pedir senha de novo a cada F5.
function restaurarSessao() {
  try {
    const id = sessionStorage.getItem(CHAVE_SESSAO);
    if (id && STATE.usuarios.some(u => u.id === id && u.senhaHash)) {
      STATE.usuarioLogadoId = id;
    }
  } catch (e) { /* ignora */ }
}

// ==================== CRUD USUÁRIOS ====================
function novoUsuario() {
  STATE.usuarioEditandoId = null;
  limparFormUsuario();
  mudarSubView('form');
}

function editarUsuario(id) {
  const u = STATE.usuarios.find(x => x.id === id);
  if (!u) return;
  STATE.usuarioEditandoId = id;
  STATE.view = 'usuarios';
  STATE.subView = 'form';
  renderTudo();
  // Aguarda o próximo tick do navegador para garantir que o formulário foi renderizado
  requestAnimationFrame(() => {
    ['us_nome', 'us_cargo', 'us_setor', 'us_email', 'us_telefone', 'us_obs'].forEach(k => {
      const el = document.getElementById(k);
      if (el) el.value = u[k.replace('us_', '')] || '';
    });
    const papelEl = document.getElementById('us_papel');
    if (papelEl) papelEl.value = u.papel || PAPEIS.OPERADOR;
  });
}

async function salvarUsuario() {
  const nota = document.getElementById('usuarioNote');
  const nome = (document.getElementById('us_nome')?.value || '').trim();
  if (!nome) {
    nota.innerHTML = '<div class="alert alert-warning">Informe o nome do usuário.</div>';
    return;
  }

  const senhaEl = document.getElementById('us_senha');
  const senhaTexto = senhaEl ? senhaEl.value : '';
  const limparSenha = !!document.getElementById('us_limpar_senha')?.checked;
  const papelEl = document.getElementById('us_papel');

  const dados = {
    nome,
    cargo: document.getElementById('us_cargo')?.value || '',
    setor: document.getElementById('us_setor')?.value || '',
    email: document.getElementById('us_email')?.value || '',
    telefone: document.getElementById('us_telefone')?.value || '',
    obs: document.getElementById('us_obs')?.value || '',
    papel: papelEl?.value || PAPEIS.OPERADOR,
  };

  let idPersistir;
  let senhaHashAnterior = null;
  if (STATE.usuarioEditandoId) {
    const idx = STATE.usuarios.findIndex(u => u.id === STATE.usuarioEditandoId);
    if (idx > -1) senhaHashAnterior = STATE.usuarios[idx].senhaHash || null;
    if (limparSenha) {
      dados.senhaHash = null;
    } else if (senhaTexto) {
      dados.senhaHash = await hashSenha(senhaTexto);
    } else {
      dados.senhaHash = senhaHashAnterior;
    }
    if (idx > -1) STATE.usuarios[idx] = { id: STATE.usuarioEditandoId, ...dados };
    idPersistir = STATE.usuarioEditandoId;
    // Se o usuário logado limpou a própria senha, desloga na hora.
    if (limparSenha && STATE.usuarioLogadoId === idPersistir) fazerLogout();
  } else {
    idPersistir = gerarId('us');
    if (senhaTexto) dados.senhaHash = await hashSenha(senhaTexto);
    STATE.usuarios.push({ id: idPersistir, ...dados });
  }

  persistirUsuario(idPersistir);
  STATE.usuarioEditandoId = null;
  limparFormUsuario();
  mudarSubView('lista');
  toastSucesso('Usuário salvo.');
}

function excluirUsuario(id) {
  const u = STATE.usuarios.find(x => x.id === id);
  if (!u) return;
  if (!confirm('Excluir o usuário "' + (u.nome || '?') + '"?')) return;
  STATE.usuarios = STATE.usuarios.filter(x => x.id !== id);
  removerUsuarioDb(id).catch(err => { console.error(err); toastErro('Não consegui remover do banco local — tente novamente.'); });
  if (STATE.usuarioEditandoId === id) {
    STATE.usuarioEditandoId = null;
    limparFormUsuario();
  }
  if (STATE.usuarioLogadoId === id) { fazerLogout(); return; }
  renderTudo();
}

// ==================== FINANCEIRO ====================
function adicionarContratada() {
  if (!podeEditar()) { bloqueadoSomenteLeitura(); return; }
  if (!STATE.convenioAtualId) return;
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;

  const nome = document.getElementById('ct_razao')?.value.trim();
  const cnpj = document.getElementById('ct_cnpj')?.value.trim();
  if (!nome) { toastAviso('Informe a razão social.'); return; }

  const numeroContrato = document.getElementById('ct_numero')?.value || '';
  const valorContrato = document.getElementById('ct_valorContrato')?.value || '';
  const dataInicioVigencia = document.getElementById('ct_dataInicio')?.value || '';
  const dataFimVigenciaOriginal = document.getElementById('ct_dataFim')?.value || '';

  const fileInput = document.getElementById('ct_anexo');
  const fileExtratoInput = document.getElementById('ct_anexo_extrato');

  const file = fileInput?.files?.[0];
  const fileExtrato = fileExtratoInput?.files?.[0];

  const processarArquivos = async () => {
    let contratoArquivo = null;
    let contratoArquivoDataUrl = null;
    let extratoArquivo = null;
    let extratoArquivoDataUrl = null;

    if (file) {
      contratoArquivo = file.name;
      contratoArquivoDataUrl = await new Promise(res => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.readAsDataURL(file);
      });
    }

    if (fileExtrato) {
      extratoArquivo = fileExtrato.name;
      extratoArquivoDataUrl = await new Promise(res => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.readAsDataURL(fileExtrato);
      });
    }

    if (STATE.contratadaEditandoId) {
      const ct = c.financeiro.contratadas.find(x => x.id === STATE.contratadaEditandoId);
      if (ct) {
        garantirCamposAditivo(ct);
        ct.razaoSocial = nome;
        ct.cnpj = cnpj;
        ct.numeroContrato = numeroContrato;
        // O campo do formulário edita o valor/vigência ORIGINAL do contrato;
        // o valor/vigência VIGENTE é recalculado por cima somando os aditivos.
        ct.valorContratoOriginal = valorContrato;
        ct.dataInicioVigencia = dataInicioVigencia;
        ct.dataFimVigenciaOriginal = dataFimVigenciaOriginal;
        recalcularContratada(ct);
        if (contratoArquivo) {
          ct.contratoArquivo = contratoArquivo;
          ct.contratoArquivoDataUrl = contratoArquivoDataUrl;
        }
        if (extratoArquivo) {
          ct.extratoArquivo = extratoArquivo;
          ct.extratoArquivoDataUrl = extratoArquivoDataUrl;
        }
      }
      STATE.contratadaEditandoId = null;
    } else {
      c.financeiro.contratadas.push({
        id: gerarId('ct'),
        razaoSocial: nome,
        cnpj,
        numeroContrato,
        valorContrato,
        valorContratoOriginal: valorContrato,
        dataInicioVigencia,
        dataFimVigenciaOriginal,
        dataFimVigencia: dataFimVigenciaOriginal,
        aditivos: [],
        contratoArquivo,
        contratoArquivoDataUrl,
        extratoArquivo,
        extratoArquivoDataUrl
      });
    }

    salvarEstado();
    renderFinanceiro();
  };

  processarArquivos();
}

function editarContratada(id) {
  if (!STATE.convenioAtualId) return;
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;
  const ct = (c.financeiro.contratadas || []).find(x => x.id === id);
  if (!ct) return;
  garantirCamposAditivo(ct);
  STATE.contratadaEditandoId = id;
  renderFinanceiro();
  // O preenchimento dos campos agora é feito via template string no renderContratadas
  // para garantir persistência mesmo com re-renders do React/MainBody.
  setTimeout(() => document.getElementById('ct_razao')?.focus(), 50);
}

function cancelarEdicaoContratada() {
  STATE.contratadaEditandoId = null;
  renderFinanceiro();
}

async function registrarPagamento() {
  if (!podeEditar()) { bloqueadoSomenteLeitura(); return; }
  if (!STATE.convenioAtualId) return;
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;
  const resumo = calcularResumoFinanceiro(c.id);
  const valor = parseMoeda(document.getElementById('pg_valor')?.value || '0');

  // Quando há contratada(s) cadastrada(s) (obra licitada), o pagamento não
  // pode estourar o valor contratado — essa é a trava mais específica.
  // Além disso, também não pode faltar dinheiro de fato no convênio
  // (saldo do repasse/contrapartida, considerando extratos e rendimentos).
  if (resumo.saldoContrato !== null && valor - resumo.saldoContrato > 0.009) {
    toastErro('Saldo insuficiente no CONTRATO para este pagamento. Saldo disponível no contrato: ' + formatMoeda(resumo.saldoContrato));
    return;
  }
  if (valor - resumo.saldoTotal > 0.009) {
    toastErro('Saldo insuficiente no CONVÊNIO para este pagamento. Saldo disponível: ' + formatMoeda(resumo.saldoTotal));
    return;
  }

  const contratadaId = document.getElementById('pg_contratada')?.value || '';
  if (!contratadaId) { toastAviso('Selecione a contratada.'); return; }

  c.financeiro.pagamentos.push({
    id: gerarId('pg'), numero: c.financeiro.pagamentos.length + 1,
    contratadaId, valor, data: document.getElementById('pg_data')?.value || '',
    status: 'pendente',
    docs: docsVaziosPagamento(),
    historico: [{ status: 'pendente', quando: new Date().toISOString() }],
    obs: document.getElementById('pg_obs')?.value || '',
  });
  salvarEstado();
  renderFinanceiro();
}

// ==================== PAGAMENTOS - ANEXOS ====================
function togglePagamentoStatus(id) {
  if (!podeEditar()) { bloqueadoSomenteLeitura(); return; }
  if (!STATE.convenioAtualId) return;
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;
  const pg = (c.financeiro.pagamentos || []).find(p => p.id === id);
  if (!pg) return;
  if (pg.status === 'pendente') {
    const docs = pg.docs || {};
    const semINSS = !docs.inss || !docs.inss.anexado;
    const semTributos = !docs.tributos || !docs.tributos.anexado;
    if ((semINSS || semTributos) && !confirm('Este pagamento ainda não tem comprovante de INSS e/ou quitação de tributos no checklist. Deseja marcar como fechado mesmo assim?')) return;
  }
  pg.status = pg.status === 'pendente' ? 'fechado' : 'pendente';
  if (!pg.historico) pg.historico = [];
  pg.historico.push({ status: pg.status, quando: new Date().toISOString() });
  salvarEstado();
  renderFinanceiro();
}

// ==================== PAGAMENTOS - CHECKLIST DE DOCUMENTOS ====================
// Alterna (abre/fecha) o checklist de documentos de um pagamento. Clicar no
// mesmo pagamento que já está aberto recolhe o painel; clicar em outro troca
// pra ele. A renderização em si fica em renderPagamentoDocsContainer, que é
// reaproveitada por anexar/remover pra atualizar sem fechar o painel.
function togglePagamentoDocs(pagamentoId) {
  const container = document.getElementById('pagamentoDocsContainer');
  if (!container) return;
  if (STATE.pagamentoDocsAbertoId === pagamentoId) {
    STATE.pagamentoDocsAbertoId = null;
    container.innerHTML = '';
    return;
  }
  STATE.pagamentoDocsAbertoId = pagamentoId;
  renderPagamentoDocsContainer(pagamentoId);
}

function renderPagamentoDocsContainer(pagamentoId) {
  const container = document.getElementById('pagamentoDocsContainer');
  if (!container) return;
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;
  const pg = (c.financeiro.pagamentos || []).find(p => p.id === pagamentoId);
  if (!pg) return;
  if (!pg.docs) pg.docs = docsVaziosPagamento();

  container.innerHTML = `
    <div style="margin-top:12px;padding:16px;background:var(--gray-50);border:1px solid var(--gray-200);border-radius:var(--radius-sm);">
      <div style="font-size:13px;color:var(--gray-600);margin-bottom:12px;font-weight:600;">Checklist de Documentos — Pagamento nº ${pg.numero}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;">
        ${CATEGORIAS_DOC_PAGAMENTO.map(cat => {
          const item = pg.docs[cat.id] || { anexado: false, arquivo: null, arquivoDataUrl: null };
          return `
            <div style="background:var(--white);border:1px solid ${item.anexado ? 'var(--green-300)' : 'var(--gray-200)'};border-radius:var(--radius-sm);padding:10px 12px;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px;">
                <span style="font-size:12.5px;font-weight:500;color:var(--navy-900);">${escapeHtml(cat.nome)}</span>
                <span class="badge ${item.anexado ? 'badge-ok' : 'badge-warn'}" style="font-size:10px;">${item.anexado ? 'anexado' : 'pendente'}</span>
              </div>
              ${item.anexado
                ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
                    <span style="font-size:12px;color:var(--gray-500);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📎 ${escapeHtml(item.arquivo || '')}</span>
                    <div style="display:flex;gap:4px;flex-shrink:0;">
                      ${item.arquivoDataUrl ? `<a href="${item.arquivoDataUrl}" download="${escapeHtml(item.arquivo)}" class="btn btn-ghost btn-sm" style="padding:2px 6px;">⬇</a>` : ''}
                      <button class="btn btn-ghost btn-sm" style="padding:2px 6px;color:var(--danger);" onclick="removerDocPagamento('${pg.id}','${cat.id}')">✕</button>
                    </div>
                  </div>`
                : (pg.status === 'fechado'
                    ? '<span style="font-size:11px;color:var(--gray-400);">pagamento fechado</span>'
                    : `<input type="file" style="font-size:11px;width:100%;" onchange="anexarDocPagamento('${pg.id}','${cat.id}',this.files[0])" />`)
              }
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

function anexarDocPagamento(pagamentoId, catId, file) {
  if (!file || !STATE.convenioAtualId) return;
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;
  const pg = (c.financeiro.pagamentos || []).find(p => p.id === pagamentoId);
  if (!pg) return;
  if (!pg.docs) pg.docs = docsVaziosPagamento();
  if (!pg.docs[catId]) pg.docs[catId] = { anexado: false, arquivo: null, arquivoDataUrl: null };
  const reader = new FileReader();
  reader.onload = function () {
    pg.docs[catId].anexado = true;
    pg.docs[catId].arquivo = file.name;
    pg.docs[catId].arquivoDataUrl = reader.result;
    salvarEstado();
    renderPagamentoDocsContainer(pagamentoId);
  };
  reader.onerror = function () {
    pg.docs[catId].anexado = true;
    pg.docs[catId].arquivo = file.name;
    pg.docs[catId].arquivoDataUrl = null;
    salvarEstado();
    renderPagamentoDocsContainer(pagamentoId);
  };
  reader.readAsDataURL(file);
}

function removerDocPagamento(pagamentoId, catId) {
  if (!STATE.convenioAtualId) return;
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;
  const pg = (c.financeiro.pagamentos || []).find(p => p.id === pagamentoId);
  if (!pg || !pg.docs || !pg.docs[catId]) return;
  const cat = CATEGORIAS_DOC_PAGAMENTO.find(x => x.id === catId);
  if (!confirm('Remover o anexo "' + (cat ? cat.nome : catId) + '" deste pagamento?')) return;
  pg.docs[catId] = { anexado: false, arquivo: null, arquivoDataUrl: null };
  salvarEstado();
  renderPagamentoDocsContainer(pagamentoId);
}

// ==================== EXTRATOS ====================
function lerArquivoComoDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// ==================== EXTRATOS ====================
async function lancarExtrato() {
  if (!podeEditar()) { bloqueadoSomenteLeitura(); return; }
  if (!STATE.convenioAtualId) return;
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;
  const anexos = [];
  const fileInput = document.getElementById('ex_anexo');
  if (fileInput && fileInput.files && fileInput.files.length > 0) {
    for (let i = 0; i < fileInput.files.length; i++) {
      const file = fileInput.files[i];
      anexos.push({ nome: file.name, type: file.type, dataUrl: null });
      await lerArquivoComoDataUrl(file).then(dataUrl => { anexos[anexos.length - 1].dataUrl = dataUrl; });
    }
  }
  c.financeiro.extratos.push({
    id: gerarId('ex'),
    mes: document.getElementById('ex_mes')?.value || '',
    entradas: parseMoeda(document.getElementById('ex_entradas')?.value || '0'),
    saidas: parseMoeda(document.getElementById('ex_saidas')?.value || '0'),
    obs: document.getElementById('ex_obs')?.value || '',
    anexos: anexos,
  });
  salvarEstado();
  renderFinanceiro();
}

async function lancarRendimento() {
  if (!podeEditar()) { bloqueadoSomenteLeitura(); return; }
  if (!STATE.convenioAtualId) return;
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;
  const anexos = [];
  const fileInput = document.getElementById('rd_anexo');
  if (fileInput && fileInput.files && fileInput.files.length > 0) {
    for (let i = 0; i < fileInput.files.length; i++) {
      const file = fileInput.files[i];
      anexos.push({ nome: file.name, type: file.type, dataUrl: null });
      await lerArquivoComoDataUrl(file).then(dataUrl => { anexos[anexos.length - 1].dataUrl = dataUrl; });
    }
  }
  c.financeiro.rendimentos.push({
    id: gerarId('rd'),
    mes: document.getElementById('rd_mes')?.value || '',
    aplicado: parseMoeda(document.getElementById('rd_aplicado')?.value || '0'),
    rendimento: parseMoeda(document.getElementById('rd_rendimento')?.value || '0'),
    obs: document.getElementById('rd_obs')?.value || '',
    anexos: anexos,
  });
  salvarEstado();
  renderFinanceiro();
}

// ==================== EXTRATOS - ANEXOS ====================
function toggleExtratoAnexos(extratoId) {
  const container = document.getElementById('extratoAnexosContainer');
  if (!container) return;
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;
  const ex = (c.financeiro.extratos || []).find(e => e.id === extratoId);
  if (!ex) return;
  const anexos = ex.anexos || [];
  if (anexos.length === 0) {
    container.innerHTML = '<div style="padding:12px 16px;color:var(--gray-500);">Nenhum anexo neste extrato.</div>';
    return;
  }
  container.innerHTML = `
    <div style="margin-top:12px;padding:12px 16px;background:var(--gray-50);border:1px solid var(--gray-200);border-radius:var(--radius-sm);">
      <div style="font-size:13px;color:var(--gray-600);margin-bottom:8px;font-weight:600;">Anexos — Extrato ${formatMes(ex.mes)}</div>
      ${anexos.map(a => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--gray-100);">
          <div style="font-size:13px;color:var(--gray-700);">📎 ${escapeHtml(a.nome)}</div>
          <div style="display:flex;gap:6px;">
            ${a.dataUrl ? `<a href="${a.dataUrl}" download="${escapeHtml(a.nome)}" class="btn btn-ghost btn-sm">⬇ Baixar</a>` : ''}
            <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="removerAnexoExtrato('${ex.id}','${escapeHtml(a.nome)}')">✕</button>
          </div>
        </div>
      `).join('')}
    </div>`;
}

function removerAnexoExtrato(extratoId, nome) {
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;
  const ex = (c.financeiro.extratos || []).find(e => e.id === extratoId);
  if (!ex || !ex.anexos) return;
  ex.anexos = ex.anexos.filter(a => a.nome !== nome);
  salvarEstado();
  renderFinanceiro();
}

// ==================== RENDIMENTOS - ANEXOS ====================
function toggleRendimentoAnexos(rendimentoId) {
  const container = document.getElementById('rendimentoAnexosContainer');
  if (!container) return;
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;
  const rd = (c.financeiro.rendimentos || []).find(r => r.id === rendimentoId);
  if (!rd) return;
  const anexos = rd.anexos || [];
  if (anexos.length === 0) {
    container.innerHTML = '<div style="padding:12px 16px;color:var(--gray-500);">Nenhum anexo neste rendimento.</div>';
    return;
  }
  container.innerHTML = `
    <div style="margin-top:12px;padding:12px 16px;background:var(--gray-50);border:1px solid var(--gray-200);border-radius:var(--radius-sm);">
      <div style="font-size:13px;color:var(--gray-600);margin-bottom:8px;font-weight:600;">Anexos — Rendimento ${formatMes(rd.mes)}</div>
      ${anexos.map(a => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--gray-100);">
          <div style="font-size:13px;color:var(--gray-700);">📎 ${escapeHtml(a.nome)}</div>
          <div style="display:flex;gap:6px;">
            ${a.dataUrl ? `<a href="${a.dataUrl}" download="${escapeHtml(a.nome)}" class="btn btn-ghost btn-sm">⬇ Baixar</a>` : ''}
            <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="removerAnexoRendimento('${rd.id}','${escapeHtml(a.nome)}')">✕</button>
          </div>
        </div>
      `).join('')}
    </div>`;
}

function removerAnexoRendimento(rendimentoId, nome) {
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;
  const rd = (c.financeiro.rendimentos || []).find(r => r.id === rendimentoId);
  if (!rd || !rd.anexos) return;
  rd.anexos = rd.anexos.filter(a => a.nome !== nome);
  salvarEstado();
  renderFinanceiro();
}

// ==================== DOCUMENTOS ====================
const CATEGORIAS_DOC = [
  { id: 'medicao', nome: 'Medição' },
  { id: 'memoria', nome: 'Memória de Cálculo' },
  { id: 'certidoes', nome: 'Certidões' },
  { id: 'comprovante', nome: 'Comprovante de Pagamento' },
  { id: 'fotografico', nome: 'Relatório Fotográfico' },
  { id: 'extrato', nome: 'Extrato Bancário' },
];

// ==================== CHECKLIST DOCUMENTAL POR PAGAMENTO ====================
// Cada pagamento carrega seu próprio checklist de documentos comprobatórios,
// independente do upload genérico de "anexos" (que continua existindo).
const CATEGORIAS_DOC_PAGAMENTO = [
  { id: 'empenho', nome: 'Nota de Empenho' },
  { id: 'medicao', nome: 'Medição ou Ordem de Compra' },
  { id: 'notaFiscal', nome: 'Nota Fiscal' },
  { id: 'notaLiquidacao', nome: 'Nota de Liquidação' },
  { id: 'notaPagamento', nome: 'Nota de Pagamento' },
  { id: 'comprovantePagamento', nome: 'Comprovante de Pagamento ao Fornecedor' },
  { id: 'memoria', nome: 'Memória de Cálculo' },
  { id: 'fotografico', nome: 'Relatório Fotográfico' },
  { id: 'certidoes', nome: 'Certidões' },
  { id: 'inss', nome: 'Comprovante INSS' },
  { id: 'iss', nome: 'Comprovante de ISS' },
  { id: 'tributos', nome: 'Quitação de Tributos' },
];

function docsVaziosPagamento() {
  const est = {};
  CATEGORIAS_DOC_PAGAMENTO.forEach(c => { est[c.id] = { anexado: false, arquivo: null, arquivoDataUrl: null }; });
  return est;
}

function adicionarDocExtra() {
  if (!STATE.convenioAtualId) return;
  const nomeEl = document.getElementById('docExtraNome');
  const nome = nomeEl ? nomeEl.value.trim() : '';
  if (!nome) { toastAviso('Dê um nome ao documento.'); return; }
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;
  if (!c.documentosExtras) c.documentosExtras = [];

  const fileInput = document.getElementById('docExtraAnexo');
  const file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;

  const registrar = (arquivoDataUrl) => {
    c.documentosExtras.push({
      id: gerarId('dx'),
      nome,
      anexado: !!file,
      arquivo: file ? file.name : null,
      arquivoDataUrl: arquivoDataUrl || null,
      status: file ? 'anexado' : 'solicitado',
    });
    salvarEstado();
    renderFinanceiro();
  };

  if (file) {
    const reader = new FileReader();
    reader.onload = () => registrar(reader.result);
    reader.readAsDataURL(file);
  } else {
    registrar(null);
  }
}

function anexarDocExtra(id, file) {
  if (!file || !STATE.convenioAtualId) return;
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c || !c.documentosExtras) return;
  const doc = c.documentosExtras.find(x => x.id === id);
  if (!doc) return;
  const reader = new FileReader();
  reader.onload = function () {
    doc.anexado = true;
    doc.arquivo = file.name;
    doc.arquivoDataUrl = reader.result;
    doc.status = 'anexado';
    salvarEstado();
    renderFinanceiro();
  };
  reader.readAsDataURL(file);
}

function removerDocExtra(id) {
  if (!STATE.convenioAtualId) return;
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c || !c.documentosExtras) return;
  c.documentosExtras = c.documentosExtras.filter(x => x.id !== id);
  salvarEstado();
  renderFinanceiro();
}

// ==================== GERAÇÃO DE DOCUMENTOS ====================
const TIPOS_DOC_IA = [
  { id: 'oficio', nome: 'Ofício', desc: 'Comunicação oficial a outro órgão ou autoridade.' },
  { id: 'memorando', nome: 'Memorando', desc: 'Comunicação interna entre setores.' },
  { id: 'dfd', nome: 'DFD', desc: 'Formalização da Demanda (Lei 14.133/2021).' },
  { id: 'etp', nome: 'ETP', desc: 'Estudo Técnico Preliminar.' },
  { id: 'tr', nome: 'Termo de Referência', desc: 'Especificações do objeto contratado.' },
  { id: 'projetoBasico', nome: 'Projeto Básico', desc: 'Detalhamento técnico da obra.' },
  { id: 'matrizRisco', nome: 'Matriz de Risco', desc: 'Identificação e alocação de riscos.' },
  { id: 'justificativaTecnica', nome: 'Justificativa Técnica', desc: 'Fundamentação da necessidade.' },
  { id: 'planoAcao', nome: 'Plano de Ação (SWOT + 5W2H)', desc: 'Análise de viabilidade e plano.' },
  { id: 'planoTrabalho', nome: 'Plano de Trabalho', desc: 'Estrutura completa SICONV/TransfereGov: dados cadastrais, discriminação do projeto, cronograma, desembolso, classificação da despesa e plano de aplicação.' },
];

// ==================== RELATÓRIOS ====================
function exportarCSVFinanceiro() {
  if (!STATE.convenioAtualId) { toastAviso('Selecione um convênio.'); return; }
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;
  const fin = c.financeiro;
  const linhas = [['tipo', 'data', 'campo1', 'campo2', 'observação']];
  (fin.contratadas || []).forEach(ct => {
    linhas.push(['contratada', ct.numeroContrato, ct.valorContrato, '', ct.razaoSocial]);
    (ct.aditivos || []).forEach(a => {
      const detalhe = (a.tipo === 'valor' || a.tipo === 'valor_prazo') ? 'valor +' + a.valorAditivo : '';
      const detalhe2 = (a.tipo === 'prazo' || a.tipo === 'valor_prazo') ? ('nova vigência ' + a.novaDataFim) : '';
      linhas.push(['aditivo', a.dataAssinatura, detalhe, detalhe2, 'Aditivo nº ' + a.numero + ' — ' + ct.razaoSocial + (a.justificativa ? ' — ' + a.justificativa : '')]);
    });
  });
  (fin.pagamentos || []).forEach(p => {
    const ct = (fin.contratadas || []).find(x => x.id === p.contratadaId);
    linhas.push(['pagamento', p.data, p.valor, '', 'nº' + p.numero + ' — ' + (ct ? ct.razaoSocial : '?')]);
  });
  (fin.extratos || []).forEach(e => linhas.push(['extrato', e.mes, e.entradas, e.saidas, e.obs || '']));
  (fin.rendimentos || []).forEach(r => linhas.push(['rendimento', r.mes, r.aplicado, r.rendimento, r.obs || '']));
  (fin.autorizacoes || []).forEach(a => linhas.push(['autorizacao', a.data, a.valor, '', a.finalidade + ' (' + a.status + ')']));
  const csv = linhas.map(l => l.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'financeiro-' + (c.numero || 'convênio') + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ==================== BACKUP / EXPORTAR / IMPORTAR ====================
function exportarDados() {
  const payload = {
    formato: 'captagov-backup',
    versao: 3,
    exportadoEm: new Date().toISOString(),
    convenios: STATE.convenios,
    convenioAtualId: STATE.convenioAtualId,
    protocoloSeq: STATE.protocoloSeq,
    emendas: STATE.emendas,
    instituicoes: STATE.instituicoes,
    proponentes: STATE.proponentes,
    responsaveisTecnicos: STATE.responsaveisTecnicos,
    usuarios: STATE.usuarios,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'captagov-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ==================== EXPORTAR ANEXOS EM ZIP ====================
async function exportarAnexosZIP() {
  if (!STATE.convenioAtualId) { toastAviso('Selecione um convênio.'); return; }
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;

  if (typeof JSZip === 'undefined') { toastErro('Biblioteca JSZip não carregada. Recarregue a página.'); return; }

  const zip = new JSZip();
  const pastaBase = zip.folder('anexos-' + (c.numero || 'convenio'));
  const pastaPagamentos = pastaBase.folder('pagamentos');
  const pastaExtratos = pastaBase.folder('extratos');
  const pastaRendimentos = pastaBase.folder('rendimentos');
  const pastaDocumentos = pastaBase.folder('documentos');
  const pastaContratos = pastaBase.folder('contratos');

  let count = 0;

  // Anexos de pagamentos
  (c.financeiro.pagamentos || []).forEach(pg => {
    (pg.anexos || []).forEach(a => {
      if (a.dataUrl) {
        const base64 = a.dataUrl.split(',')[1];
        pastaPagamentos.file(`pag${pg.numero}_${a.nome}`, base64, { base64: true });
        count++;
      }
    });
    // Checklist de documentos por categoria do pagamento
    CATEGORIAS_DOC_PAGAMENTO.forEach(cat => {
      const item = pg.docs && pg.docs[cat.id];
      if (item && item.anexado && item.arquivoDataUrl) {
        const base64 = item.arquivoDataUrl.split(',')[1];
        pastaPagamentos.file(`pag${pg.numero}/${cat.nome}_${item.arquivo || cat.id}`, base64, { base64: true });
        count++;
      }
    });
  });

  // Anexos de extratos
  (c.financeiro.extratos || []).forEach(ex => {
    (ex.anexos || []).forEach(a => {
      if (a.dataUrl) {
        const base64 = a.dataUrl.split(',')[1];
        pastaExtratos.file(`${ex.mes}_${a.nome}`, base64, { base64: true });
        count++;
      }
    });
  });

  // Anexos de rendimentos
  (c.financeiro.rendimentos || []).forEach(rd => {
    (rd.anexos || []).forEach(a => {
      if (a.dataUrl) {
        const base64 = a.dataUrl.split(',')[1];
        pastaRendimentos.file(`${rd.mes}_${a.nome}`, base64, { base64: true });
        count++;
      }
    });
  });

  // Contratos das contratadas
  (c.financeiro.contratadas || []).forEach(ct => {
    if (ct.contratoArquivoDataUrl) {
      const base64 = ct.contratoArquivoDataUrl.split(',')[1];
      pastaContratos.file(`${ct.razaoSocial || 'contratada'}_${ct.contratoArquivo}`, base64, { base64: true });
      count++;
    }
  });

  // Documentos extras
  (c.documentosExtras || []).forEach(doc => {
    if (doc.arquivoDataUrl) {
      const base64 = doc.arquivoDataUrl.split(',')[1];
      pastaDocumentos.file(doc.arquivo || doc.nome, base64, { base64: true });
      count++;
    }
  });

  if (count === 0) { toastAviso('Nenhum anexo encontrado para exportar.'); return; }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'anexos-' + (c.numero || 'convenio') + '.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toastSucesso(`${count} arquivo(s) exportados com sucesso!`);
}

// ==================== IMPORTAR DADOS ====================
function importarDados(file) {
  if (!podeEditar()) { bloqueadoSomenteLeitura(); return; }
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function () {
    let payload;
    try { payload = JSON.parse(reader.result); } catch { toastErro('Arquivo inválido — não é um JSON legível.'); return; }
    if (!payload || !Array.isArray(payload.convenios)) { toastErro('Não é um backup do CaptaGov.'); return; }
    if (!confirm('Substituir todos os dados (' + STATE.convenios.length + ' convênio(s))?')) return;
    STATE.convenios = payload.convenios || [];
    STATE.convenioAtualId = payload.convenioAtualId || null;
    STATE.protocoloSeq = payload.protocoloSeq || 0;
    STATE.emendas = payload.emendas || [];
    STATE.instituicoes = payload.instituicoes || [];
    STATE.proponentes = payload.proponentes || [];
    STATE.responsaveisTecnicos = payload.responsaveisTecnicos || [];
    STATE.usuarios = payload.usuarios || [];
    STATE.convenios.forEach(c => {
      if (!c.financeiro) c.financeiro = { extratos: [], rendimentos: [], autorizacoes: [], usos: [], contratadas: [], pagamentos: [] };
      if (!c.documentosExtras) c.documentosExtras = [];
      c.documentosExtras.forEach(doc => { if (!doc.status) doc.status = doc.anexado ? 'anexado' : 'solicitado'; });
      if (!c.docsGeradosIA) c.docsGeradosIA = [];
    });
    try {
      await limparConveniosEmendasDb(); // "substituir tudo" precisa limpar o que tinha antes, senão fica lixo órfão no IndexedDB
      persistirTodosConvenios();
      persistirTodasEmendas();
      persistirTodasInstituicoes();
      persistirTodosProponentes();
      persistirTodosResponsaveisTecnicos();
      persistirTodosUsuarios();
      persistirMeta();
      renderTudo();
      toastSucesso('Backup importado com sucesso.');
    } catch (e) {
      console.error('Erro ao importar backup:', e);
      toastErro('Deu erro ao gravar os dados importados no banco local. Tente novamente.');
    }
  };
  reader.onerror = () => toastErro('Não consegui ler o arquivo selecionado.');
  reader.readAsText(file);
}

// ==================== RENDERIZAÇÃO ====================
// A partir da v3.1, Sidebar e Header viraram componentes React de verdade
// (ver contexts/AppContext.jsx e components/). O corpo principal (`#mainBody`)
// ainda é renderizado do jeito antigo para as telas que faltam migrar, mas
// quem decide *quando* chamar renderBody() é o componente React <MainBody/>
// — isso evita que renderBody() rode antes da div #mainBody existir no DOM
// (ela só existe quando a view atual não é 'painel', que agora é 100% React).
function renderTudo() {
  window.dispatchEvent(new CustomEvent('captagov:changed'));
}

function renderBody() {
  const el = document.getElementById('mainBody');
  if (!el) return;

  // Corrige um bug conhecido: como isso reconstrói o HTML inteiro via
  // innerHTML, o campo de texto em foco perdia o cursor (voltava pro fim ou
  // pro início) a cada tecla digitada — muito perceptível no campo de busca.
  // Aqui a gente guarda id + seleção do campo focado antes de renderizar de
  // novo, e restaura depois.
  const ativo = document.activeElement;
  const preservar = ativo && ativo.id && (ativo.tagName === 'INPUT' || ativo.tagName === 'TEXTAREA')
    ? { id: ativo.id, selStart: ativo.selectionStart, selEnd: ativo.selectionEnd }
    : null;

  switch (STATE.view) {
    case 'painel': el.innerHTML = ''; break; // Painel Geral agora é React puro — ver <PainelGeral/>
    case 'cadastro': el.innerHTML = renderCadastro(); break;
    case 'prestacao': el.innerHTML = renderPrestacaoContas(); break;
    case 'documentos': el.innerHTML = renderGestaoDocumentos(); break;
    case 'relatorios': el.innerHTML = renderRelatorios(); break;
    case 'emendas': el.innerHTML = renderEmendas(); break;
    case 'instituicoes': el.innerHTML = renderInstituicoes(); break;
    case 'proponentes': el.innerHTML = renderProponentes(); break;
    case 'backups': el.innerHTML = renderBackups(); break;
    case 'responsaveisTecnicos': el.innerHTML = renderResponsaveisTecnicos(); break;
    case 'usuarios': el.innerHTML = renderUsuarios(); break;
    case 'identidadeVisual': el.innerHTML = renderIdentidadeVisual(); break;
    default: el.innerHTML = '<div class="empty-state"><div class="empty-state-title">Página em desenvolvimento</div></div>';
  }

  if (preservar) {
    const elFoco = document.getElementById(preservar.id);
    if (elFoco && (elFoco.tagName === 'INPUT' || elFoco.tagName === 'TEXTAREA')) {
      elFoco.focus();
      try { elFoco.setSelectionRange(preservar.selStart, preservar.selEnd); } catch { /* tipos como date/number não suportam seleção — ignora */ }
    }
  }
}

// ==================== PAINEL ====================
function renderPainel() {
  const resumo = STATE.convenios.map(c => calcularResumoFinanceiro(c.id)).filter(Boolean);
  const totalValor = resumo.reduce((a, r) => a + r.valor, 0);
  const totalSaldo = resumo.reduce((a, r) => a + r.saldoTotal, 0);
  const totalPago = resumo.reduce((a, r) => a + r.totalPago, 0);
  const pendentesPC = STATE.convenios.filter(c => {
    const st = statusConvenio(c);
    return st.cls === 'badge-warn' || st.cls === 'badge-danger';
  }).length;

  const busca = document.getElementById('painelBusca');
  const termo = busca ? busca.value.trim().toLowerCase() : '';
  const lista = termo
    ? STATE.convenios.filter(c =>
      (c.numero || '').toLowerCase().includes(termo) ||
      (c.programa || '').toLowerCase().includes(termo) ||
      (c.conveniente || c.proponente || '').toLowerCase().includes(termo))
    : STATE.convenios;

  return `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon blue">📋</div>
        <div class="stat-content">
          <div class="stat-value">${STATE.convenios.length}</div>
          <div class="stat-label">Convênios / Projetos</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green">💰</div>
        <div class="stat-content">
          <div class="stat-value">${formatMoeda(totalSaldo)}</div>
          <div class="stat-label">Saldo Total</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon teal">💳</div>
        <div class="stat-content">
          <div class="stat-value">${formatMoeda(totalPago)}</div>
          <div class="stat-label">Total Pago</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon warning">⚠️</div>
        <div class="stat-content">
          <div class="stat-value">${pendentesPC}</div>
          <div class="stat-label">PC Pendente / Vencida</div>
        </div>
      </div>
    </div>

    <div class="card mb-6">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
        <div class="card-title" style="margin-bottom:0;">Convênios e Projetos</div>
        <div style="display:flex;gap:12px;align-items:center;">
          <div class="search-input">
            <span class="search-icon">🔍</span>
            <input type="text" placeholder="Buscar convênio..." value="${escapeHtml(termo)}" id="painelBusca" oninput="renderTudo()" />
          </div>
          <button class="btn btn-primary" onclick="novoConvenio('convenio')">+ Novo Convênio</button>
          <button class="btn btn-secondary" onclick="novoConvenio('projeto')">+ Novo Projeto</button>
        </div>
      </div>
      ${lista.length === 0
    ? `<div class="empty-state"><div class="empty-state-icon">📂</div><div class="empty-state-title">${STATE.convenios.length === 0 ? 'Nenhum convênio cadastrado' : 'Nenhum resultado encontrado'}</div><div class="empty-state-text">${STATE.convenios.length === 0 ? 'Clique em "Novo Convênio" para começar.' : 'Tente uma busca diferente.'}</div></div>`
    : lista.slice().reverse().map(c => {
      const st = statusConvenio(c);
      const res = calcularResumoFinanceiro(c.id);
      const saldo = res ? formatMoeda(res.saldoTotal) : formatMoeda(0);
      const saldoClass = res && res.saldoTotal < 0 ? 'negative' : 'positive';
      return `
        <div class="convenio-card">
          <div class="convenio-card-left">
            <div class="convenio-card-title">
              <span class="badge ${c.tipo === 'projeto' ? 'badge-info' : 'badge-ok'}">${c.tipo === 'projeto' ? 'Projeto' : 'Convênio'}</span>
              ${escapeHtml(c.numero || 'sem número')} — ${escapeHtml(c.programa || 'Sem programa')}
            </div>
            <div class="convenio-card-sub">${escapeHtml(c.conveniente || c.proponente || 'Convenente não informado')}</div>
          </div>
          <div class="convenio-card-right">
            <div style="display:flex;flex-direction:column;gap:4px;font-size:13px;margin-bottom:8px;">
              <span class="font-mono">Repasse: <strong>${formatMoeda(res ? res.valor : 0)}</strong></span>
              ${c.contrapartida ? `<span class="font-mono">Contrapartida: <strong>${formatMoeda(res ? res.contrapartida : 0)}</strong></span>` : ''}
              <span class="font-mono">Total: <strong>${formatMoeda(res ? res.valorTotal : 0)}</strong></span>
            </div>
            <span class="font-mono" style="font-size:14px;">Saldo: <strong class="${saldoClass}">${saldo}</strong></span>
            <span class="badge ${st.cls}">${st.label}</span>
            <button class="btn btn-ghost btn-sm" onclick="editarConvenio('${c.id}')">Abrir</button>
            ${c.tipo === 'projeto' ? '' : `<button class="btn btn-ghost btn-sm" onclick="abrirPrestacaoContas('${c.id}')">📂 PC</button>`}
            <button class="btn btn-ghost btn-sm" onclick="duplicarConvenio('${c.id}')">⧉</button>
            <button class="btn btn-ghost btn-sm" onclick="excluirConvenio('${c.id}')" style="color:var(--danger);">🗑</button>
          </div>
        </div>
      `;
    }).join('')}
    </div>
  `;
}

// ==================== CADASTRO ====================
function renderCadastro() {
  const ehConvenio = STATE.tipoInstrumento === 'convenio';
  return `
    <div class="card">
      <button class="btn btn-ghost btn-sm" style="margin-bottom:16px;" onclick="mudarView('painel')">← Voltar ao Painel</button>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
        <div>
          <div class="card-title">${STATE.convenioEditandoId ? 'Editar' : 'Novo'} ${ehConvenio ? 'Convênio' : 'Projeto'}</div>
          <div class="card-subtitle">Preencha os dados do ${ehConvenio ? 'convênio' : 'projeto'}. Campos com <span style="color:var(--danger)">*</span> são obrigatórios.</div>
        </div>
        <div class="toggle-group" style="min-width:200px;">
          <button class="toggle-btn ${ehConvenio ? 'active' : ''}" onclick="STATE.tipoInstrumento='convenio';renderTudo()">Convênio</button>
          <button class="toggle-btn ${!ehConvenio ? 'active' : ''}" onclick="STATE.tipoInstrumento='projeto';renderTudo()">Projeto</button>
        </div>
      </div>

      <div id="savedNote">${STATE.cadastroMensagem || ''}</div>

      <div class="form-grid">
        <div class="form-section-title">📌 Identificação do ${ehConvenio ? 'Convênio' : 'Projeto'}</div>
        <div class="form-row-split">
          <div class="form-group">
            <label class="form-label">Número / Identificação <span class="required">*</span></label>
            <input class="form-input" type="text" id="c_numero" />
          </div>
          <div class="form-group">
            <label class="form-label">Programa</label>
            <input class="form-input" type="text" id="c_programa" placeholder="Ex: Programa de Aceleração do Crescimento" />
          </div>
        </div>
        ${ehConvenio ? `
        <div class="form-section-title">🏛️ Proponente (Concedente do Recurso)</div>
        ${STATE.instituicoes.length > 0 ? `
        <div class="form-group full-width">
          <label class="form-label">Preencher com instituição já cadastrada</label>
          <div style="display:flex;gap:8px;">
            <select class="form-input form-select" onchange="preencherComInstituicao(this.value)" style="flex:1;">
              <option value="">— selecionar —</option>
              ${STATE.instituicoes.map(i => `<option value="${i.id}" ${STATE.convenioInstituicaoIdSelecionada === i.id ? 'selected' : ''}>${escapeHtml(i.razaoSocial)}</option>`).join('')}
            </select>
            ${STATE.convenioInstituicaoIdSelecionada ? `<button type="button" class="btn btn-secondary btn-sm" onclick="preencherComInstituicao('${STATE.convenioInstituicaoIdSelecionada}')" title="Puxar de novo os dados atuais do cadastro">🔄 Ressincronizar</button>` : ''}
          </div>
        </div>
        ` : ''}
        <div class="form-group">
          <label class="form-label">Esfera do Proponente</label>
          <select class="form-input form-select" id="c_esfera">
            <option>União</option><option>Estado</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Órgão / Entidade Proponente</label>
          <input class="form-input" type="text" id="c_orgao" placeholder="Ex: Ministério da Saúde, Governo do Estado de..." />
        </div>
        ` : ''}

        <div class="form-section-title">🏢 Dados do Convenente (Prefeitura)</div>
        ${STATE.proponentes.length > 0 ? `
        <div class="form-group full-width">
          <label class="form-label">Preencher com proponente/convenente já cadastrado</label>
          <div style="display:flex;gap:8px;">
            <select class="form-input form-select" onchange="preencherComProponente(this.value)" style="flex:1;">
              <option value="">— selecionar —</option>
              ${STATE.proponentes.map(p => `<option value="${p.id}" ${STATE.convenioProponenteIdSelecionada === p.id ? 'selected' : ''}>${escapeHtml(p.razaoSocial)}</option>`).join('')}
            </select>
            ${STATE.convenioProponenteIdSelecionada ? `<button type="button" class="btn btn-secondary btn-sm" onclick="preencherComProponente('${STATE.convenioProponenteIdSelecionada}')" title="Puxar de novo os dados atuais do cadastro">🔄 Ressincronizar</button>` : ''}
          </div>
        </div>
        ` : ''}
        <div class="form-group">
          <label class="form-label">Nome / Razão Social <span class="required">*</span></label>
          <input class="form-input" type="text" id="c_conveniente" placeholder="Ex: Prefeitura Municipal de..." />
        </div>
        <div class="form-group">
          <label class="form-label">Natureza Jurídica</label>
          <select class="form-input form-select" id="c_natureza">
            <option>Prefeitura Municipal</option><option>Autarquia</option><option>Fundação</option><option>Outros</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">CNPJ</label>
          <input class="form-input" type="text" id="c_cnpj" maxlength="18" oninput="mascararCNPJ(this)" placeholder="00.000.000/0000-00" />
        </div>
        <div class="form-group">
          <label class="form-label">CEP</label>
          <input class="form-input" type="text" id="c_cep" maxlength="9" oninput="mascararCEP(this)" placeholder="00000-000" />
        </div>
        <div class="form-group">
          <label class="form-label">Logradouro</label>
          <input class="form-input" type="text" id="c_logradouro" />
        </div>
        <div class="form-group">
          <label class="form-label">Bairro</label>
          <input class="form-input" type="text" id="c_bairro" />
        </div>
        <div class="form-group">
          <label class="form-label">Município</label>
          <input class="form-input" type="text" id="c_municipio" />
        </div>
        <div class="form-group">
          <label class="form-label">Telefone</label>
          <input class="form-input" type="text" id="c_telefone" />
        </div>
        <div class="form-group">
          <label class="form-label">E-mail</label>
          <input class="form-input" type="email" id="c_email" />
        </div>

        <div class="form-section-title">💰 Dados Financeiros</div>
        <div class="form-group">
          <label class="form-label">Banco</label>
          <input class="form-input" type="text" id="c_banco" />
        </div>
        <div class="form-group">
          <label class="form-label">Agência</label>
          <input class="form-input" type="text" id="c_agencia" />
        </div>
        <div class="form-group">
          <label class="form-label">Conta</label>
          <input class="form-input" type="text" id="c_conta" />
        </div>
        <div class="form-group">
          <label class="form-label">Repasse (R$) <span class="required">*</span></label>
          <input class="form-input" type="text" id="c_valor" oninput="mascararValor(this)" inputmode="numeric" />
        </div>
        ${ehConvenio ? `
        <div class="form-group">
          <label class="form-label">Contrapartida (R$)</label>
          <input class="form-input" type="text" id="c_contrapartida" oninput="mascararValor(this)" inputmode="numeric" />
        </div>
        ` : ''}

        <div class="form-section-title">📅 Vigência e Prazos</div>
        <div class="form-group">
          <label class="form-label">Data de Assinatura</label>
          <input class="form-input" type="date" id="c_data_assinatura" />
        </div>
        ${ehConvenio ? `
        <div class="form-group">
          <label class="form-label">Data de Início</label>
          <input class="form-input" type="date" id="c_data_inicio" />
        </div>
        <div class="form-group">
          <label class="form-label">Data de Fim <span class="required">*</span></label>
          <input class="form-input" type="date" id="c_data_fim" />
        </div>
        ` : ''}
        <div class="form-group">
          <label class="form-label">Prazo PC (dias)</label>
          <input class="form-input" type="number" id="c_prazo_pc" value="60" min="1" />
        </div>
      </div>

      <div style="display:flex;gap:12px;margin-top:24px;">
        <button class="btn btn-primary btn-lg" onclick="salvarConvenio()">💾 Salvar ${ehConvenio ? 'Convênio' : 'Projeto'}</button>
        <button class="btn btn-secondary btn-lg" onclick="novoConvenio('${ehConvenio ? 'convenio' : 'projeto'}')">Limpar</button>
      </div>
    </div>
  `;
}

// ==================== PRESTAÇÃO DE CONTAS ====================
function renderPrestacaoContas() {
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) {
    return `<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-title">Nenhum convênio selecionado</div><div class="empty-state-text">Selecione um convênio no Painel Geral para acessar a Prestação de Contas.</div></div>`;
  }
  if (c.tipo === 'projeto') {
    return `<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-title">Não se aplica a Projetos</div><div class="empty-state-text">"${escapeHtml(c.numero || 'Este projeto')}" está cadastrado como Projeto, e Projetos não têm prestação de contas neste sistema — só Convênios têm. Selecione um Convênio no Painel Geral para acessar esta tela.</div></div>`;
  }

  const resumo = calcularResumoFinanceiro(c.id);
  const subTabs = [
    { id: 'contratadas', label: 'Contratadas' },
    { id: 'pagamentos', label: 'Pagamentos' },
    { id: 'extratos', label: 'Extratos' },
    { id: 'rendimentos', label: 'Rendimentos' },
    { id: 'aditivos', label: 'Extrato de Aditivos' },
    { id: 'docs', label: 'Documentos' },
  ];

  return `
    <div class="card mb-6">
      <div class="card-title" style="margin-bottom:16px;">${escapeHtml(c.numero || 'sem número')} — ${escapeHtml(c.programa || '')}</div>
      <div class="fin-summary-grid">
        <div class="fin-summary-card">
          <div class="fin-summary-label">Repasse</div>
          <div class="fin-summary-value neutral">${formatMoeda(resumo.valor)}</div>
        </div>
        ${resumo.contrapartida > 0 ? `
        <div class="fin-summary-card">
          <div class="fin-summary-label">Contrapartida</div>
          <div class="fin-summary-value neutral">${formatMoeda(resumo.contrapartida)}</div>
        </div>
        <div class="fin-summary-card">
          <div class="fin-summary-label">Valor Total</div>
          <div class="fin-summary-value neutral"><strong>${formatMoeda(resumo.valorTotal)}</strong></div>
        </div>
        ` : ''}
        <div class="fin-summary-card">
          <div class="fin-summary-label">Valor Contratado</div>
          <div class="fin-summary-value">${formatMoeda(resumo.totalContratado)}</div>
        </div>
        <div class="fin-summary-card">
          <div class="fin-summary-label">Total Pago</div>
          <div class="fin-summary-value negative">${formatMoeda(resumo.totalPago)}</div>
        </div>
        <div class="fin-summary-card">
          <div class="fin-summary-label">Saldo ${resumo.totalContratado > 0 ? 'do Contrato' : 'Total'}</div>
          <div class="fin-summary-value ${(resumo.saldoContrato ?? resumo.saldoTotal) >= 0 ? 'positive' : 'negative'}">${formatMoeda(resumo.saldoContrato ?? resumo.saldoTotal)}</div>
        </div>
      </div>
    </div>

    <div class="subtabs">
      ${subTabs.map(t => `<button class="subtab ${STATE.subView === t.id ? 'active' : ''}" onclick="mudarSubView('${t.id}')">${t.label}</button>`).join('')}
    </div>

    <div class="card">
      ${renderSubPrestacaoContas(c, resumo)}
    </div>
  `;
}

function renderSubPrestacaoContas(c, resumo) {
  switch (STATE.subView) {
    case 'contratadas': return renderContratadas(c);
    case 'pagamentos': return renderPagamentos(c, resumo);
    case 'extratos': return renderExtratos(c);
    case 'rendimentos': return renderRendimentos(c);
    case 'aditivos': return renderExtratoAditivos(c);
    case 'docs': return renderDocs();
    default: return '';
  }
}

// Alias para compatibilidade (chamado por registrarPagamento, lancarExtrato, etc.)
function renderFinanceiro() {
  renderTudo();
}

function renderContratadas(c) {
  const fin = c.financeiro;
  const editando = STATE.contratadaEditandoId ? (fin.contratadas || []).find(x => x.id === STATE.contratadaEditandoId) : null;
  return `
    <div style="margin-bottom:20px;">
      <div class="card-title" style="font-size:16px;">${editando ? 'Editar Contratada' : 'Adicionar Contratada'}</div>
      <div class="card-subtitle">Cadastre empresas contratadas para vincular pagamentos.</div>
      
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;align-items:end;margin-top:12px;">
        <div class="form-group">
          <label class="form-label">Razão Social <span class="required">*</span></label>
          <input class="form-input" id="ct_razao" value="${escapeHtml(editando?.razaoSocial || '')}" />
        </div>
        <div class="form-group">
          <label class="form-label">CNPJ</label>
          <input class="form-input" id="ct_cnpj" maxlength="18" oninput="mascararCNPJ(this)" value="${escapeHtml(editando?.cnpj || '')}" />
        </div>
        <div class="form-group">
          <label class="form-label">Nº Contrato</label>
          <input class="form-input" id="ct_numero" value="${escapeHtml(editando?.numeroContrato || '')}" />
        </div>
        <div class="form-group">
          <label class="form-label">Valor Contrato${editando && (editando.aditivos || []).some(a => a.tipo !== 'prazo') ? ' (original)' : ''}</label>
          <input class="form-input" id="ct_valorContrato" oninput="mascararValor(this)" inputmode="numeric" value="${escapeHtml(editando?.valorContratoOriginal ?? editando?.valorContrato ?? '')}" />
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary" style="height:42px;" onclick="adicionarContratada()">${editando ? '💾 Salvar' : '+ Adicionar'}</button>
          ${editando ? `<button class="btn btn-secondary" style="height:42px;" onclick="cancelarEdicaoContratada()">Cancelar</button>` : ''}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:12px;max-width:800px;">
        <div class="form-group">
          <label class="form-label">Início de Execução</label>
          <input class="form-input" type="date" id="ct_dataInicio" value="${escapeHtml(editando?.dataInicioVigencia || '')}" />
        </div>
        <div class="form-group">
          <label class="form-label">Fim de Vigência${editando && (editando.aditivos || []).some(a => a.tipo !== 'valor') ? ' (original)' : ''}</label>
          <input class="form-input" type="date" id="ct_dataFim" value="${escapeHtml(editando?.dataFimVigenciaOriginal ?? editando?.dataFimVigencia ?? '')}" />
        </div>
      </div>
      ${editando ? `<div class="card-subtitle" style="margin-top:6px;">Para aditivar valor ou prazo depois de salvo, use o botão <strong>Aditivos</strong> na tabela abaixo — os campos acima guardam sempre os dados <em>originais</em> do contrato.</div>` : ''}

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:12px;max-width:800px;">
        <div class="form-group">
          <label class="form-label">Anexar Contrato (PDF/imagem)</label>
          <input class="form-input" type="file" id="ct_anexo" accept=".pdf,.jpg,.jpeg,.png" />
          ${editando && editando.contratoArquivo ? `<div style="font-size:11px;color:var(--gray-500);margin-top:4px;">📎 Atual: ${escapeHtml(editando.contratoArquivo)}</div>` : ''}
        </div>
        <div class="form-group">
          <label class="form-label">Anexar Extrato do Contrato (PDF/imagem)</label>
          <input class="form-input" type="file" id="ct_anexo_extrato" accept=".pdf,.jpg,.jpeg,.png" />
          ${editando && editando.extratoArquivo ? `<div style="font-size:11px;color:var(--gray-500);margin-top:4px;">📎 Atual: ${escapeHtml(editando.extratoArquivo)}</div>` : ''}
        </div>
      </div>
    </div>

    ${fin.contratadas && fin.contratadas.length > 0 ? `
      <div class="table-wrapper">
        <table class="table-comfortable">
          <thead><tr><th>Razão Social</th><th>CNPJ</th><th>Nº Contrato</th><th>Valor Vigente</th><th>Vigência</th><th>Anexos</th><th></th></tr></thead>
          <tbody>
            ${fin.contratadas.map(ct => {
              garantirCamposAditivo(ct);
              const vig = statusVigencia({ dataFim: ct.dataFimVigencia });
              const houveAditivoValor = parseMoeda(ct.valorContratoOriginal || '0') !== parseMoeda(ct.valorContrato || '0');
              return `
              <tr${STATE.contratadaEditandoId === ct.id ? ' style="background:var(--blue-100);"' : ''}>
                <td><strong>${escapeHtml(ct.razaoSocial)}</strong></td>
                <td style="white-space:nowrap;">${escapeHtml(ct.cnpj || '—')}</td>
                <td style="white-space:nowrap;">${escapeHtml(ct.numeroContrato || '—')}</td>
                <td class="font-mono" style="white-space:nowrap;">
                  ${formatMoeda(parseMoeda(ct.valorContrato || '0'))}
                  ${houveAditivoValor ? `<div style="font-size:10px;color:var(--gray-500);font-family:inherit;">orig. ${formatMoeda(parseMoeda(ct.valorContratoOriginal || '0'))}</div>` : ''}
                </td>
                <td style="white-space:nowrap;">
                  <span class="badge ${vig.cls}" style="font-size:10.5px;">${vig.label}</span>
                  ${ct.dataFimVigencia ? `<div style="font-size:10px;color:var(--gray-500);margin-top:2px;">até ${formatData(ct.dataFimVigencia)}</div>` : ''}
                </td>
                <td>
                  <div style="display:flex;flex-direction:column;gap:4px;">
                    ${ct.contratoArquivo && ct.contratoArquivoDataUrl
                      ? `<a href="${ct.contratoArquivoDataUrl}" download="${escapeHtml(ct.contratoArquivo)}" class="btn btn-ghost btn-sm td-truncate" style="justify-content:flex-start;padding:2px 4px;" title="Contrato: ${escapeHtml(ct.contratoArquivo)}">📄 Contrato</a>`
                      : '<span style="font-size:10px;color:var(--gray-400);">Sem contrato</span>'}
                    
                    ${ct.extratoArquivo && ct.extratoArquivoDataUrl
                      ? `<a href="${ct.extratoArquivoDataUrl}" download="${escapeHtml(ct.extratoArquivo)}" class="btn btn-ghost btn-sm td-truncate" style="justify-content:flex-start;padding:2px 4px;" title="Extrato: ${escapeHtml(ct.extratoArquivo)}">📄 Extrato</a>`
                      : '<span style="font-size:10px;color:var(--gray-400);">Sem extrato</span>'}
                  </div>
                </td>
                <td style="white-space:nowrap;">
                  <div class="td-actions">
                    <button class="btn btn-ghost btn-sm" onclick="toggleAditivos('${ct.id}')" title="Aditivos de valor/prazo">📑 Aditivos${ct.aditivos.length ? ' (' + ct.aditivos.length + ')' : ''}</button>
                    <button class="btn btn-ghost btn-sm" onclick="editarContratada('${ct.id}')" title="Editar">Editar</button>
                    <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="removerContratada('${ct.id}')" title="Remover">Remover</button>
                  </div>
                </td>
              </tr>
              ${STATE.aditivoAbertoCtId === ct.id ? `
              <tr>
                <td colspan="7" style="background:var(--gray-50);padding:0;">
                  ${renderAditivosPanel(ct)}
                </td>
              </tr>` : ''}
            `;
            }).join('')}
          </tbody>
        </table>
      </div>
    ` : '<div class="empty-state text-sm" style="padding:30px;">Nenhuma contratada cadastrada.</div>'}
  `;
}

function renderAditivosPanel(ct) {
  garantirCamposAditivo(ct);
  const aditivos = [...ct.aditivos].sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
  return `
    <div style="padding:16px 20px;border-top:1px solid var(--gray-200);border-bottom:1px solid var(--gray-200);">
      <div style="font-size:13px;color:var(--navy-900);font-weight:600;margin-bottom:4px;">
        Aditivos — ${escapeHtml(ct.razaoSocial)} ${ct.numeroContrato ? '· Contrato nº ' + escapeHtml(ct.numeroContrato) : ''}
      </div>
      <div class="card-subtitle" style="margin-bottom:14px;">
        Valor original: <strong>${formatMoeda(parseMoeda(ct.valorContratoOriginal || '0'))}</strong> ·
        Valor vigente: <strong>${formatMoeda(parseMoeda(ct.valorContrato || '0'))}</strong>
        &nbsp;|&nbsp;
        Vigência original: <strong>${ct.dataFimVigenciaOriginal ? formatData(ct.dataFimVigenciaOriginal) : '—'}</strong> ·
        Vigência atual: <strong>${ct.dataFimVigencia ? formatData(ct.dataFimVigencia) : '—'}</strong>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;align-items:end;">
        <div class="form-group">
          <label class="form-label">Tipo de Aditivo</label>
          <select class="form-input form-select" id="ad_tipo" onchange="atualizarCamposAditivo()">
            ${TIPOS_ADITIVO.map(t => `<option value="${t.id}">${t.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Nº do Aditivo <span class="required">*</span></label>
          <input class="form-input" id="ad_numero" placeholder="Ex: 1º Aditivo" />
        </div>
        <div class="form-group">
          <label class="form-label">Data de Assinatura <span class="required">*</span></label>
          <input class="form-input" type="date" id="ad_data" />
        </div>
        <div class="form-group">
          <label class="form-label">Anexo do Aditivo</label>
          <input class="form-input" type="file" id="ad_anexo" accept=".pdf,.jpg,.jpeg,.png" />
        </div>
        <button class="btn btn-primary" style="height:42px;" onclick="adicionarAditivo('${ct.id}')">+ Registrar Aditivo</button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:10px;max-width:700px;">
        <div class="form-group" id="ad_bloco_valor">
          <label class="form-label">Valor Aditivado (R$) — será somado ao valor vigente</label>
          <input class="form-input" id="ad_valor" oninput="mascararValor(this)" inputmode="numeric" placeholder="0,00" />
        </div>
        <div class="form-group" id="ad_bloco_prazo" style="display:none;">
          <label class="form-label">Nova Data de Vigência Final — prorroga/posterga o prazo</label>
          <input class="form-input" type="date" id="ad_novaDataFim" />
        </div>
      </div>
      <div class="form-group" style="margin-top:10px;max-width:700px;">
        <label class="form-label">Justificativa</label>
        <input class="form-input" id="ad_justificativa" placeholder="Motivo do aditivo (opcional)" />
      </div>

      ${aditivos.length > 0 ? `
        <div class="table-wrapper" style="margin-top:16px;">
          <table class="table-comfortable">
            <thead><tr><th>Nº</th><th>Tipo</th><th>Assinatura</th><th>Valor Aditivado</th><th>Nova Vigência</th><th>Anexo</th><th></th></tr></thead>
            <tbody>
              ${aditivos.map(a => `
                <tr>
                  <td><strong>${escapeHtml(a.numero)}</strong></td>
                  <td>${escapeHtml((TIPOS_ADITIVO.find(t => t.id === a.tipo) || {}).label || a.tipo)}</td>
                  <td style="white-space:nowrap;">${a.dataAssinatura ? formatData(a.dataAssinatura) : '—'}</td>
                  <td class="font-mono">${(a.tipo === 'valor' || a.tipo === 'valor_prazo') ? '+ ' + formatMoeda(a.valorAditivo) : '—'}</td>
                  <td style="white-space:nowrap;">${(a.tipo === 'prazo' || a.tipo === 'valor_prazo') ? formatData(a.novaDataFim) + (a.dataFimAnterior ? ` <span style="color:var(--gray-400);">(era ${formatData(a.dataFimAnterior)})</span>` : '') : '—'}</td>
                  <td>${a.arquivo && a.arquivoDataUrl
                    ? `<a href="${a.arquivoDataUrl}" download="${escapeHtml(a.arquivo)}" class="btn btn-ghost btn-sm td-truncate" title="${escapeHtml(a.arquivo)}">📎</a>`
                    : '<span style="font-size:10px;color:var(--gray-400);">—</span>'}</td>
                  <td><button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="removerAditivo('${ct.id}','${a.id}')">Remover</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '<div class="empty-state text-sm" style="padding:16px 0;">Nenhum aditivo registrado para este contrato ainda.</div>'}
    </div>
  `;
}

function renderExtratoAditivos(c) {
  const fin = c.financeiro;
  const contratadas = fin.contratadas || [];
  const todos = [];
  contratadas.forEach(ct => {
    garantirCamposAditivo(ct);
    (ct.aditivos || []).forEach(a => todos.push({ ct, a }));
  });
  todos.sort((x, y) => (y.a.criadoEm || 0) - (x.a.criadoEm || 0));

  const totalAditivadoValor = todos
    .filter(({ a }) => a.tipo === 'valor' || a.tipo === 'valor_prazo')
    .reduce((soma, { a }) => soma + (Number(a.valorAditivo) || 0), 0);
  const qtdAditivosPrazo = todos.filter(({ a }) => a.tipo === 'prazo' || a.tipo === 'valor_prazo').length;
  const contratosEmRisco = contratadas.filter(ct => {
    const v = statusVigencia({ dataFim: ct.dataFimVigencia });
    return v.dias !== null && v.dias <= 30;
  });

  return `
    <div style="margin-bottom:20px;">
      <div class="card-title" style="font-size:16px;">Extrato de Aditivos</div>
      <div class="card-subtitle">Visão consolidada de todos os aditivos (valor e prazo) registrados nas contratadas deste convênio.</div>

      <div class="fin-summary-grid" style="margin-top:12px;">
        <div class="fin-summary-card">
          <div class="fin-summary-label">Total de Aditivos</div>
          <div class="fin-summary-value neutral">${todos.length}</div>
        </div>
        <div class="fin-summary-card">
          <div class="fin-summary-label">Total Aditivado em Valor</div>
          <div class="fin-summary-value">${formatMoeda(totalAditivadoValor)}</div>
        </div>
        <div class="fin-summary-card">
          <div class="fin-summary-label">Aditivos de Prazo</div>
          <div class="fin-summary-value neutral">${qtdAditivosPrazo}</div>
        </div>
        <div class="fin-summary-card">
          <div class="fin-summary-label">Contratos a Vencer (30d) / Vencidos</div>
          <div class="fin-summary-value ${contratosEmRisco.length ? 'negative' : ''}">${contratosEmRisco.length}</div>
        </div>
      </div>
    </div>

    ${contratosEmRisco.length > 0 ? `
      <div class="alert alert-warning" style="margin-top:4px;">
        ⚠️ ${contratosEmRisco.length} contrato(s) com vigência vencida ou perto de vencer sem um aditivo recente:
        ${contratosEmRisco.map(ct => {
          const v = statusVigencia({ dataFim: ct.dataFimVigencia });
          return `<div style="margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span class="badge ${v.cls}" style="font-size:10.5px;">${v.label}</span>
            <strong>${escapeHtml(ct.razaoSocial)}</strong>
            ${ct.numeroContrato ? `<span style="color:var(--gray-500);">(contrato nº ${escapeHtml(ct.numeroContrato)})</span>` : ''}
            <button class="btn btn-ghost btn-sm" onclick="abrirAditivoAqui('${ct.id}')" title="Registrar aditivo">📑 Registrar aditivo</button>
          </div>`;
        }).join('')}
      </div>
    ` : ''}

    ${todos.length > 0 ? `
      <div class="table-wrapper" style="margin-top:16px;">
        <table class="table-comfortable">
          <thead><tr><th>Contratada</th><th>Nº Aditivo</th><th>Tipo</th><th>Assinatura</th><th>Valor Aditivado</th><th>Nova Vigência</th><th>Anexo</th><th></th></tr></thead>
          <tbody>
            ${todos.map(({ ct, a }) => `
              <tr>
                <td><strong>${escapeHtml(ct.razaoSocial)}</strong>${ct.numeroContrato ? `<div style="font-size:10px;color:var(--gray-500);">contrato nº ${escapeHtml(ct.numeroContrato)}</div>` : ''}</td>
                <td>${escapeHtml(a.numero)}</td>
                <td>${escapeHtml((TIPOS_ADITIVO.find(t => t.id === a.tipo) || {}).label || a.tipo)}</td>
                <td style="white-space:nowrap;">${a.dataAssinatura ? formatData(a.dataAssinatura) : '—'}</td>
                <td class="font-mono">${(a.tipo === 'valor' || a.tipo === 'valor_prazo') ? '+ ' + formatMoeda(a.valorAditivo) : '—'}</td>
                <td style="white-space:nowrap;">${(a.tipo === 'prazo' || a.tipo === 'valor_prazo') ? formatData(a.novaDataFim) : '—'}</td>
                <td>${a.arquivo && a.arquivoDataUrl
                  ? `<a href="${a.arquivoDataUrl}" download="${escapeHtml(a.arquivo)}" class="btn btn-ghost btn-sm td-truncate" title="${escapeHtml(a.arquivo)}">📎</a>`
                  : '<span style="font-size:10px;color:var(--gray-400);">—</span>'}</td>
                <td><button class="btn btn-ghost btn-sm" onclick="abrirAditivoAqui('${ct.id}')" title="Ver na contratada">Ver</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : '<div class="empty-state text-sm" style="padding:30px;">Nenhum aditivo registrado neste convênio ainda.</div>'}
  `;
}

function renderPagamentos(c, resumo) {
  const fin = c.financeiro;
  const contratadas = fin.contratadas || [];
  return `
    <div style="margin-bottom:20px;">
      <div class="card-title" style="font-size:16px;">Registrar Pagamento</div>
      <div class="card-subtitle">
        ${resumo.saldoContrato !== null ? `Saldo disponível no contrato: <strong style="color:${resumo.saldoContrato >= 0 ? 'var(--green-600)' : 'var(--danger)'}">${formatMoeda(resumo.saldoContrato)}</strong> · ` : ''}Saldo disponível no convênio: <strong style="color:${resumo.saldoTotal >= 0 ? 'var(--green-600)' : 'var(--danger)'}">${formatMoeda(resumo.saldoTotal)}</strong>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;align-items:end;margin-top:12px;">
        <div class="form-group"><label class="form-label">Contratada <span class="required">*</span></label>
          <select class="form-input form-select" id="pg_contratada">
            <option value="">Selecione...</option>
            ${contratadas.map(ct => `<option value="${ct.id}">${escapeHtml(ct.razaoSocial)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">Data</label><input class="form-input" type="date" id="pg_data" /></div>
        <div class="form-group"><label class="form-label">Valor (R$) <span class="required">*</span></label><input class="form-input" id="pg_valor" oninput="mascararValor(this);updateSaldoPreview()" inputmode="numeric" /></div>
        <div class="form-group"><label class="form-label">Obs</label><input class="form-input" id="pg_obs" /></div>
        <button class="btn btn-primary" style="height:42px;" onclick="registrarPagamento()">+ Registrar</button>
      </div>
      <div class="card-subtitle" style="margin-top:8px;">Saldo após este pagamento: <strong id="saldoPreview">—</strong></div>
    </div>
    ${fin.pagamentos && fin.pagamentos.length > 0 ? `
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Nº</th><th>Contratada</th><th>Data</th><th>Valor</th><th>Status</th><th>Checklist Docs</th><th></th></tr></thead>
          <tbody>
            ${fin.pagamentos.map(p => {
              const ct = contratadas.find(x => x.id === p.contratadaId);
              const docsObj = p.docs || {};
              const docsTotal = CATEGORIAS_DOC_PAGAMENTO.length;
              const docsAnexados = CATEGORIAS_DOC_PAGAMENTO.filter(cat => docsObj[cat.id] && docsObj[cat.id].anexado).length;
              return `<tr>
                <td>${p.numero}</td>
                <td>${escapeHtml(ct ? ct.razaoSocial : '?')}</td>
                <td>${p.data ? new Date(p.data + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                <td class="font-mono">${formatMoeda(p.valor)}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:6px;">
                    <span class="badge ${p.status === 'fechado' ? 'badge-ok' : 'badge-warn'}">${p.status}</span>
                    <button class="btn btn-ghost btn-sm" onclick="togglePagamentoStatus('${p.id}')" title="Alternar status">🔄</button>
                  </div>
                </td>
                <td style="text-align:center;">
                  <button class="btn btn-ghost btn-sm" onclick="togglePagamentoDocs('${p.id}')" title="Checklist de documentos do pagamento">
                    📁 ${docsAnexados}/${docsTotal}
                  </button>
                </td>
                <td><button class="btn btn-ghost btn-sm" onclick="removerPagamento('${p.id}')">Remover</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div id="pagamentoDocsContainer"></div>
    ` : '<div class="empty-state text-sm" style="padding:30px;">Nenhum pagamento registrado.</div>'}
  `;
}

function renderExtratos(c) {
  const fin = c.financeiro;
  return `
    <div style="margin-bottom:20px;">
      <div class="card-title" style="font-size:16px;">Lançar Extrato Mensal</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;align-items:end;margin-top:12px;">
        <div class="form-group"><label class="form-label">Mês <span class="required">*</span></label><input class="form-input" type="month" id="ex_mes" /></div>
        <div class="form-group"><label class="form-label">Entradas (R$)</label><input class="form-input" id="ex_entradas" oninput="mascararValor(this)" inputmode="numeric" /></div>
        <div class="form-group"><label class="form-label">Saídas (R$)</label><input class="form-input" id="ex_saidas" oninput="mascararValor(this)" inputmode="numeric" /></div>
        <div class="form-group"><label class="form-label">Obs</label><input class="form-input" id="ex_obs" /></div>
        <div class="form-group"><label class="form-label">Anexo</label><input class="form-input" type="file" id="ex_anexo" accept=".pdf,.jpg,.jpeg,.png" /></div>
        <button class="btn btn-primary" style="height:42px;" onclick="lancarExtrato()">+ Lançar</button>
      </div>
    </div>
    ${fin.extratos && fin.extratos.length > 0 ? `
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Mês</th><th>Entradas</th><th>Saídas</th><th>Saldo do Mês</th><th>Obs</th><th>Anexo</th><th></th></tr></thead>
          <tbody>
            ${fin.extratos.sort((a, b) => a.mes.localeCompare(b.mes)).map(e => `
              <tr>
                <td><strong>${formatMes(e.mes)}</strong></td>
                <td class="font-mono" style="color:var(--green-600);">${formatMoeda(e.entradas)}</td>
                <td class="font-mono" style="color:var(--danger);">${formatMoeda(e.saidas)}</td>
                <td class="font-mono">${formatMoeda(e.entradas - e.saidas)}</td>
                <td>${escapeHtml(e.obs || '—')}</td>
                <td>
                  ${(e.anexos || []).length > 0
                    ? `<span style="color:var(--gray-500);font-size:13px;">📎 ${(e.anexos || []).length}</span>
                    <button class="btn btn-ghost btn-sm" onclick="toggleExtratoAnexos('${e.id}')" title="Ver anexo">👁️</button>`
                    : '<span style="color:var(--gray-400);font-size:13px;">—</span>'}
                </td>
                <td><button class="btn btn-ghost btn-sm" onclick="removerExtrato('${e.id}')">Remover</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div id="extratoAnexosContainer"></div>
    ` : '<div class="empty-state text-sm" style="padding:30px;">Nenhum lançamento de extrato.</div>'}
  `;
}

function renderRendimentos(c) {
  const fin = c.financeiro;
  return `
    <div style="margin-bottom:20px;">
      <div class="card-title" style="font-size:16px;">Lançar Rendimento</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;align-items:end;margin-top:12px;">
        <div class="form-group"><label class="form-label">Mês <span class="required">*</span></label><input class="form-input" type="month" id="rd_mes" /></div>
        <div class="form-group"><label class="form-label">Aplicado (R$)</label><input class="form-input" id="rd_aplicado" oninput="mascararValor(this)" inputmode="numeric" /></div>
        <div class="form-group"><label class="form-label">Rendimento (R$)</label><input class="form-input" id="rd_rendimento" oninput="mascararValor(this)" inputmode="numeric" /></div>
        <div class="form-group"><label class="form-label">Obs</label><input class="form-input" id="rd_obs" /></div>
        <div class="form-group"><label class="form-label">Anexo</label><input class="form-input" type="file" id="rd_anexo" accept=".pdf,.jpg,.jpeg,.png" /></div>
        <button class="btn btn-primary" style="height:42px;" onclick="lancarRendimento()">+ Lançar</button>
      </div>
    </div>
    ${fin.rendimentos && fin.rendimentos.length > 0 ? `
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Mês</th><th>Aplicado</th><th>Rendimento</th><th>Obs</th><th>Anexo</th><th></th></tr></thead>
          <tbody>
            ${fin.rendimentos.sort((a, b) => a.mes.localeCompare(b.mes)).map(r => `
              <tr>
                <td><strong>${formatMes(r.mes)}</strong></td>
                <td class="font-mono">${formatMoeda(r.aplicado)}</td>
                <td class="font-mono" style="color:var(--green-600);">${formatMoeda(r.rendimento)}</td>
                <td>${escapeHtml(r.obs || '—')}</td>
                <td>
                  ${(r.anexos || []).length > 0
                    ? `<span style="color:var(--gray-500);font-size:13px;">📎 ${(r.anexos || []).length}</span>
                    <button class="btn btn-ghost btn-sm" onclick="toggleRendimentoAnexos('${r.id}')" title="Ver anexo">👁️</button>`
                    : '<span style="color:var(--gray-400);font-size:13px;">—</span>'}
                </td>
                <td><button class="btn btn-ghost btn-sm" onclick="removerRendimento('${r.id}')">Remover</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div id="rendimentoAnexosContainer"></div>
    ` : '<div class="empty-state text-sm" style="padding:30px;">Nenhum rendimento registrado.</div>'}
  `;
}

// ==================== GESTÃO DE DOCUMENTOS ====================
function renderGestaoDocumentos() {
  return `
    <div class="card">
      ${renderDocsIA()}
    </div>
  `;
}

// ==================== GERAÇÃO DE DOCUMENTOS (offline, real) ====================
// Preenche o texto a partir dos dados do convênio selecionado (sem IA — é
// montagem de template). Pros tipos que exigem análise técnica (DFD, ETP,
// TR, Projeto Básico, Matriz de Risco, Plano de Ação), mostra um modelo
// estruturado pra preencher, em vez de fingir que foi gerado sozinho.
//
// Preparado para, no futuro (build Electron), trocar `gerarDocumentoAutomatico`
// por uma chamada real à API da Anthropic (ver STUB abaixo) sem mudar o
// resto do fluxo: geração -> revisão -> salvar -> editar/aprovar/remover.
function gerarDocumento(tipoId) {
  if (!podeEditar()) { bloqueadoSomenteLeitura(); return; }
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) { toastAviso('Selecione um convênio no Painel antes de gerar o documento.'); return; }
  const rt = STATE.responsaveisTecnicos.find(x => x.id === STATE.responsavelTecnicoSelecionadoId) || null;
  const usuario = STATE.usuarios.find(x => x.id === STATE.usuarioSelecionadoId) || null;
  const auto = gerarDocumentoAutomatico(tipoId, c, rt, usuario);
  STATE.docGeradoTipo = tipoId;
  STATE.docGeradoTexto = auto || gerarModeloEsqueleto(tipoId, c, rt, usuario) || '';
  STATE.docGeradoEhModelo = !auto;
  STATE.docEditandoId = null;
  renderTudo();
}

// STUB — quando o app virar Electron com acesso à internet, esta função passa
// a chamar de fato a API da Anthropic (fetch para api.anthropic.com/v1/messages
// com a chave lida de um arquivo local de configuração). Por enquanto ela só
// encaminha para a geração offline por template, mantendo a mesma assinatura,
// para que o resto do app (salvar/editar/aprovar/remover) não precise mudar.
async function gerarDocumentoComIA(tipoId, contextoExtra) {
  // eslint-disable-next-line no-unused-vars
  const _contexto = contextoExtra; // reservado para o prompt, quando a integração real existir
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return null;
  const rt = STATE.responsaveisTecnicos.find(x => x.id === STATE.responsavelTecnicoSelecionadoId) || null;
  const usuario = STATE.usuarios.find(x => x.id === STATE.usuarioSelecionadoId) || null;
  return gerarDocumentoAutomatico(tipoId, c, rt, usuario) || gerarModeloEsqueleto(tipoId, c, rt, usuario) || '';
}

function fecharDocumentoGerado() {
  STATE.docGeradoTipo = null;
  STATE.docGeradoTexto = null;
  STATE.docEditandoId = null;
  renderTudo();
}

function copiarDocumentoGerado() {
  const el = document.getElementById('docGeradoTexto');
  if (!el) return;
  navigator.clipboard.writeText(el.value)
    .then(() => toastSucesso('Texto copiado para a área de transferência.'))
    .catch(() => toastErro('Não consegui copiar automaticamente — selecione e copie manualmente.'));
}

function baixarDocumentoGerado() {
  const el = document.getElementById('docGeradoTexto');
  if (!el) return;
  const tipo = TIPOS_DOC_IA.find(t => t.id === STATE.docGeradoTipo);
  baixarTextoComoArquivo(el.value, tipo ? tipo.nome : 'documento');
}

function baixarTextoComoArquivo(texto, nomeBase) {
  const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (nomeBase || 'documento').replace(/\s+/g, '_') + '.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Grava (ou atualiza, se já existir docEditandoId) o texto revisado na lista
// permanente de documentos do convênio — a partir daqui ele passa a ter um
// histórico e pode ser reaberto, aprovado ou removido depois.
function salvarDocumentoGerado() {
  if (!podeEditar()) { bloqueadoSomenteLeitura(); return; }
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;
  const el = document.getElementById('docGeradoTexto');
  if (!el) return;
  if (!c.docsGeradosIA) c.docsGeradosIA = [];

  if (STATE.docEditandoId) {
    const doc = c.docsGeradosIA.find(d => d.id === STATE.docEditandoId);
    if (doc) {
      doc.texto = el.value;
      doc.atualizadoEm = new Date().toISOString();
      toastSucesso('Documento atualizado.');
    }
  } else {
    const tipo = TIPOS_DOC_IA.find(t => t.id === STATE.docGeradoTipo);
    c.docsGeradosIA.push({
      id: gerarId('doc'),
      tipoId: STATE.docGeradoTipo,
      titulo: tipo ? tipo.nome : 'Documento',
      texto: el.value,
      status: 'rascunho',
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    });
    toastSucesso('Documento salvo na lista do convênio.');
  }

  salvarEstado();
  STATE.docGeradoTipo = null;
  STATE.docGeradoTexto = null;
  STATE.docEditandoId = null;
  renderTudo();
}

// Reabre um documento já salvo no editor de texto para revisão.
function editarDocumentoSalvo(id) {
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c || !c.docsGeradosIA) return;
  const doc = c.docsGeradosIA.find(d => d.id === id);
  if (!doc) return;
  STATE.docGeradoTipo = doc.tipoId;
  STATE.docGeradoTexto = doc.texto;
  STATE.docGeradoEhModelo = false;
  STATE.docEditandoId = id;
  renderTudo();
}

function aprovarDocumentoSalvo(id) {
  if (!podeEditar()) { bloqueadoSomenteLeitura(); return; }
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c || !c.docsGeradosIA) return;
  const doc = c.docsGeradosIA.find(d => d.id === id);
  if (!doc) return;
  doc.status = 'aprovado';
  doc.aprovadoEm = new Date().toISOString();
  salvarEstado();
  toastSucesso('Documento marcado como aprovado.');
  renderTudo();
}

function reverterDocumentoSalvo(id) {
  if (!podeEditar()) { bloqueadoSomenteLeitura(); return; }
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c || !c.docsGeradosIA) return;
  const doc = c.docsGeradosIA.find(d => d.id === id);
  if (!doc) return;
  doc.status = 'rascunho';
  doc.aprovadoEm = null;
  salvarEstado();
  renderTudo();
}

function baixarDocumentoSalvo(id) {
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c || !c.docsGeradosIA) return;
  const doc = c.docsGeradosIA.find(d => d.id === id);
  if (!doc) return;
  baixarTextoComoArquivo(doc.texto, doc.titulo);
}

function removerDocumentoSalvo(id) {
  if (!podeEditar()) { bloqueadoSomenteLeitura(); return; }
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c || !c.docsGeradosIA) return;
  const doc = c.docsGeradosIA.find(d => d.id === id);
  if (!doc) return;
  if (!confirm('Remover o documento "' + doc.titulo + '"? Esta ação não pode ser desfeita.')) return;
  c.docsGeradosIA = c.docsGeradosIA.filter(d => d.id !== id);
  salvarEstado();
  toastSucesso('Documento removido.');
  renderTudo();
}

function renderDocsIA() {
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);

  if (STATE.docGeradoTipo) {
    const tipo = TIPOS_DOC_IA.find(t => t.id === STATE.docGeradoTipo);
    const editando = !!STATE.docEditandoId;
    return `
      <div class="card-title" style="font-size:16px;">${escapeHtml(tipo ? tipo.nome : 'Documento')}${editando ? ' <span class="badge badge-info" style="margin-left:8px;">Editando</span>' : ''}</div>
      <div class="card-subtitle">
        ${editando
          ? 'Revisando um documento já salvo. Ao salvar, a versão anterior é substituída.'
          : STATE.docGeradoEhModelo
            ? 'Modelo estruturado — este tipo de documento exige análise técnica, então preparamos as seções corretas para você preencher.'
            : 'Gerado automaticamente a partir dos dados do convênio selecionado. Revise antes de usar oficialmente.'}
      </div>
      <textarea id="docGeradoTexto" class="form-input" style="margin-top:12px;min-height:360px;font-family:'IBM Plex Mono',monospace;font-size:13px;line-height:1.5;">${escapeHtml(STATE.docGeradoTexto || '')}</textarea>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="salvarDocumentoGerado()">💾 ${editando ? 'Salvar alterações' : 'Salvar documento'}</button>
        <button class="btn btn-secondary" onclick="copiarDocumentoGerado()">Copiar</button>
        <button class="btn btn-secondary" onclick="baixarDocumentoGeradoPDF()">📄 Baixar PDF</button>
        <button class="btn btn-ghost" onclick="baixarDocumentoGerado()">Baixar .txt</button>
        <button class="btn btn-ghost" onclick="fecharDocumentoGerado()">Cancelar</button>
      </div>
    `;
  }

  return `
    <div class="card-title" style="font-size:16px;">Geração de Documentos</div>
    <div class="card-subtitle">Preenchimento automático a partir dos dados do convênio selecionado no Painel — sem IA, 100% offline (pronto para IA real quando o app virar Electron).</div>
    ${STATE.responsaveisTecnicos.length > 0 ? `
    <div class="form-group full-width" style="margin-top:12px;max-width:420px;">
      <label class="form-label">Responsável técnico (assina Justificativa/Plano de Trabalho)</label>
      <select class="form-input form-select" onchange="STATE.responsavelTecnicoSelecionadoId=this.value">
        <option value="">— nenhum (deixar em branco) —</option>
        ${STATE.responsaveisTecnicos.map(r => `<option value="${r.id}" ${STATE.responsavelTecnicoSelecionadoId === r.id ? 'selected' : ''}>${escapeHtml(r.nome)}${r.cargo ? ' — ' + escapeHtml(r.cargo) : ''}</option>`).join('')}
      </select>
    </div>
    ` : ''}
    ${STATE.usuarios.length > 0 ? `
    <div class="form-group full-width" style="margin-top:12px;max-width:420px;">
      <label class="form-label">Elaborado por (usuário)</label>
      <select class="form-input form-select" onchange="STATE.usuarioSelecionadoId=this.value">
        <option value="">— nenhum (deixar em branco) —</option>
        ${STATE.usuarios.map(u => `<option value="${u.id}" ${STATE.usuarioSelecionadoId === u.id ? 'selected' : ''}>${escapeHtml(u.nome)}${u.cargo ? ' — ' + escapeHtml(u.cargo) : ''}</option>`).join('')}
      </select>
    </div>
    ` : ''}
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-top:16px;">
      ${TIPOS_DOC_IA.map(t => `
        <div style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:var(--radius-md);padding:16px;cursor:pointer;" onclick="gerarDocumento('${t.id}')">
          <div style="font-size:24px;margin-bottom:8px;">📄</div>
          <div style="font-weight:600;font-size:14px;color:var(--navy-900);">${t.nome}</div>
          <div style="font-size:12px;color:var(--gray-500);margin-top:4px;">${t.desc}</div>
          <div style="font-size:11px;margin-top:8px;font-weight:600;color:${TIPOS_COM_AUTOPREENCHIMENTO.includes(t.id) ? 'var(--green-600)' : 'var(--gray-500)'};">
            ${TIPOS_COM_AUTOPREENCHIMENTO.includes(t.id) ? '✓ Preenchimento automático' : '○ Modelo para preencher'}
          </div>
        </div>
      `).join('')}
    </div>
    ${renderDocumentosSalvos(c)}
  `;
}

// Lista dos documentos já salvos para o convênio selecionado, com os
// controles pós-geração: editar (reabre no editor), aprovar/reverter status,
// baixar e remover.
function renderDocumentosSalvos(c) {
  if (!c) return '';
  const docs = c.docsGeradosIA || [];
  if (docs.length === 0) return '';
  return `
    <div class="card-title" style="font-size:16px;margin-top:28px;">Documentos Salvos (${docs.length})</div>
    <div style="margin-top:8px;">
      ${docs.slice().reverse().map(doc => `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 16px;background:var(--gray-50);border:1px solid var(--gray-200);border-radius:var(--radius-sm);margin-bottom:8px;">
          <div style="min-width:0;">
            <div style="font-weight:500;font-size:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              ${escapeHtml(doc.titulo)}
              <span class="badge ${doc.status === 'aprovado' ? 'badge-ok' : 'badge-warn'}">${doc.status === 'aprovado' ? 'Aprovado' : 'Rascunho'}</span>
            </div>
            <div style="font-size:12px;color:var(--gray-500);">
              Salvo em ${new Date(doc.criadoEm).toLocaleDateString('pt-BR')}${doc.atualizadoEm && doc.atualizadoEm !== doc.criadoEm ? ' · editado em ' + new Date(doc.atualizadoEm).toLocaleDateString('pt-BR') : ''}
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <button class="btn btn-ghost btn-sm" onclick="editarDocumentoSalvo('${doc.id}')">✏️ Editar</button>
            ${doc.status === 'aprovado'
              ? `<button class="btn btn-ghost btn-sm" onclick="reverterDocumentoSalvo('${doc.id}')">↩ Reverter p/ rascunho</button>`
              : `<button class="btn btn-ghost btn-sm" style="color:var(--green-600);" onclick="aprovarDocumentoSalvo('${doc.id}')">✓ Aprovar</button>`}
            <button class="btn btn-ghost btn-sm" onclick="baixarDocumentoSalvoPDF('${doc.id}')">📄 PDF</button>
            <button class="btn btn-ghost btn-sm" onclick="baixarDocumentoSalvo('${doc.id}')">⬇ .txt</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="removerDocumentoSalvo('${doc.id}')">🗑 Remover</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ==================== DOCUMENTOS EXTRAS ====================
function renderDocs() {
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return '<div class="empty-state text-sm">Nenhum convênio selecionado.</div>';
  const extras = c.documentosExtras || [];
  return `
    <div style="margin-bottom:16px;display:flex;gap:12px;align-items:end;">
      <div class="form-group" style="flex:1;"><label class="form-label">Nome do Documento</label><input class="form-input" id="docExtraNome" placeholder="Ex: Certidão de Regularidade..." /></div>
      <div class="form-group" style="flex:1;"><label class="form-label">Anexo (opcional)</label><input class="form-input" type="file" id="docExtraAnexo" /></div>
      <button class="btn btn-primary" style="height:42px;" onclick="adicionarDocExtra()">+ Adicionar</button>
    </div>
    <div style="font-size:12px;color:var(--gray-500);margin:-8px 0 16px;">Se nenhum anexo for selecionado, o documento entra na lista como <strong>Solicitado</strong>, e pode ser anexado depois.</div>
    ${extras.length === 0
    ? '<div class="empty-state text-sm" style="padding:30px;">Nenhum documento cadastrado.</div>'
    : extras.map(doc => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--gray-50);border:1px solid var(--gray-200);border-radius:var(--radius-sm);margin-bottom:8px;">
        <div>
          <div style="font-weight:500;font-size:14px;display:flex;align-items:center;gap:8px;">
            ${escapeHtml(doc.nome)}
            ${doc.anexado
              ? '<span class="badge badge-ok">Anexado</span>'
              : '<span class="badge badge-warn">Solicitado</span>'}
          </div>
          ${doc.anexado && doc.arquivo ? '<div style="font-size:12px;color:var(--gray-500);">📎 ' + escapeHtml(doc.arquivo) + '</div>' : ''}
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          ${doc.anexado && doc.arquivoDataUrl ? `<a href="${doc.arquivoDataUrl}" download="${escapeHtml(doc.arquivo)}" class="btn btn-ghost btn-sm">⬇ Baixar</a>` : ''}
          ${!doc.anexado ? `<label class="btn btn-ghost btn-sm">📎 Anexar<input type="file" style="display:none" onchange="anexarDocExtra('${doc.id}',this.files[0])" /></label>` : ''}
          <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="removerDocExtra('${doc.id}')">✕</button>
        </div>
      </div>
    `).join('')}
  `;
}

// ==================== RELATÓRIOS ====================
function renderRelatorios() {
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  return `
    <div style="display:flex;gap:16px;align-items:center;margin-bottom:24px;">
      <div class="form-group" style="min-width:300px;">
        <label class="form-label">Selecione o Convênio</label>
        <select class="form-input form-select" id="relatorioSelect" onchange="STATE.convenioAtualId=this.value;renderTudo();">
          <option value="">— Selecione —</option>
          ${STATE.convenios.map(cv => `<option value="${cv.id}" ${cv.id === STATE.convenioAtualId ? 'selected' : ''}>${escapeHtml(cv.numero || '?')} — ${escapeHtml(cv.programa || '')}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-primary" onclick="gerarPDFRelatorio()">📥 Gerar PDF</button>
      <button class="btn btn-secondary" onclick="exportarCSVFinanceiro()">📊 Exportar CSV</button>
      <button class="btn btn-secondary" onclick="exportarAnexosZIP()">📦 Exportar Tudo (ZIP)</button>
      ${STATE.usuarios.length > 0 ? `
      <div class="form-group" style="min-width:220px;margin-bottom:0;">
        <label class="form-label">Emitido por</label>
        <select class="form-input form-select" onchange="STATE.usuarioSelecionadoId=this.value">
          <option value="">— nenhum —</option>
          ${STATE.usuarios.map(u => `<option value="${u.id}" ${STATE.usuarioSelecionadoId === u.id ? 'selected' : ''}>${escapeHtml(u.nome)}</option>`).join('')}
        </select>
      </div>
      ` : ''}
    </div>

    ${!c ? '<div class="empty-state"><div class="empty-state-icon">📈</div><div class="empty-state-title">Selecione um convênio</div><div class="empty-state-text">Escolha um convênio acima para visualizar os relatórios.</div></div>' : `
      ${renderRelatorioFinanceiro(c)}
    `}

    <div class="card mt-6">
      <div class="card-title" style="font-size:16px;">Relatório Geral — Todos os Convênios</div>
      <div class="table-wrapper" style="margin-top:16px;">
        <table>
          <thead><tr><th>Convênio</th><th>Programa</th><th>Convenente</th><th>Repasse</th><th>Contrapartida</th><th>Total</th><th>Saldo</th><th>PC até</th></tr></thead>
          <tbody>
            ${STATE.convenios.map(cv => {
              const res = calcularResumoFinanceiro(cv.id);
              const saldoClass = res && res.saldoTotal < 0 ? 'negative' : 'positive';
              return `<tr>
                <td><strong>${escapeHtml(cv.numero || '?')}</strong></td>
                <td>${escapeHtml(cv.programa || '—')}</td>
                <td>${escapeHtml(cv.conveniente || cv.proponente || '—')}</td>
                <td class="font-mono">${formatMoeda(res ? res.valor : 0)}</td>
                <td class="font-mono">${formatMoeda(res ? res.contrapartida : 0)}</td>
                <td class="font-mono"><strong>${formatMoeda(res ? res.valorTotal : 0)}</strong></td>
                <td class="font-mono ${saldoClass}">${formatMoeda(res ? res.saldoTotal : 0)}</td>
                <td>${escapeHtml(cv.prazoLimitePC || '—')}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderRelatorioFinanceiro(c) {
  const resumo = calcularResumoFinanceiro(c.id);
  const fin = resumo.fin;
  return `
    <div class="card">
      <div class="card-title" style="font-size:18px;">${escapeHtml(c.numero || '?')} — ${escapeHtml(c.programa || '')}</div>
      <div class="card-subtitle">Convenente: ${escapeHtml(c.conveniente || c.proponente || '?')} · Repasse: ${formatMoeda(resumo.valor)}${resumo.contrapartida > 0 ? ' · Contrapartida: ' + formatMoeda(resumo.contrapartida) + ' · Total: ' + formatMoeda(resumo.valorTotal) : ''}</div>

      <div class="fin-summary-grid">
        <div class="fin-summary-card"><div class="fin-summary-label">Valor Contratado</div><div class="fin-summary-value">${formatMoeda(resumo.totalContratado)}</div></div>
        <div class="fin-summary-card"><div class="fin-summary-label">Rendimento</div><div class="fin-summary-value">${formatMoeda(resumo.totalRendimento)}</div></div>
        <div class="fin-summary-card"><div class="fin-summary-label">Total Pago</div><div class="fin-summary-value negative">${formatMoeda(resumo.totalPago)}</div></div>
        <div class="fin-summary-card"><div class="fin-summary-label">Saldo ${resumo.totalContratado > 0 ? 'do Contrato' : 'Total'}</div><div class="fin-summary-value ${(resumo.saldoContrato ?? resumo.saldoTotal) >= 0 ? 'positive' : 'negative'}">${formatMoeda(resumo.saldoContrato ?? resumo.saldoTotal)}</div></div>
      </div>

      ${fin.pagamentos && fin.pagamentos.length > 0 ? `
        <div style="margin-top:20px;"><div class="card-title" style="font-size:14px;">Pagamentos</div>
        <div class="table-wrapper"><table>
          <thead><tr><th>Nº</th><th>Contratada</th><th>Data</th><th>Valor</th><th>Status</th></tr></thead>
          <tbody>${fin.pagamentos.map(p => {
            const ct = (fin.contratadas || []).find(x => x.id === p.contratadaId);
            return `<tr><td>${p.numero}</td><td>${escapeHtml(ct ? ct.razaoSocial : '?')}</td><td>${p.data ? new Date(p.data + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td><td class="font-mono">${formatMoeda(p.valor)}</td><td><span class="badge ${p.status === 'fechado' ? 'badge-ok' : 'badge-warn'}">${p.status}</span></td></tr>`;
          }).join('')}</tbody>
        </table></div></div>
      ` : ''}

      ${fin.extratos && fin.extratos.length > 0 ? `
        <div style="margin-top:20px;"><div class="card-title" style="font-size:14px;">Extratos</div>
        <div class="table-wrapper"><table>
          <thead><tr><th>Mês</th><th>Entradas</th><th>Saídas</th><th>Saldo</th></tr></thead>
          <tbody>${fin.extratos.sort((a, b) => a.mes.localeCompare(b.mes)).map(e =>
            `<tr><td>${formatMes(e.mes)}</td><td class="font-mono">${formatMoeda(e.entradas)}</td><td class="font-mono">${formatMoeda(e.saidas)}</td><td class="font-mono">${formatMoeda(e.entradas - e.saidas)}</td></tr>`
          ).join('')}</tbody>
        </table></div></div>
      ` : ''}

      ${fin.rendimentos && fin.rendimentos.length > 0 ? `
        <div style="margin-top:20px;"><div class="card-title" style="font-size:14px;">Rendimentos</div>
        <div class="table-wrapper"><table>
          <thead><tr><th>Mês</th><th>Aplicado</th><th>Rendimento</th></tr></thead>
          <tbody>${fin.rendimentos.sort((a, b) => a.mes.localeCompare(b.mes)).map(r =>
            `<tr><td>${formatMes(r.mes)}</td><td class="font-mono">${formatMoeda(r.aplicado)}</td><td class="font-mono">${formatMoeda(r.rendimento)}</td></tr>`
          ).join('')}</tbody>
        </table></div></div>
      ` : ''}
    </div>
  `;
}

// ==================== EMENDAS ====================
function renderEmendas() {
  const subTabs = [
    { id: 'lista', label: 'Lista de Emendas' },
    { id: 'form', label: STATE.emendaEditandoId ? 'Editar Emenda' : 'Nova Emenda' },
  ];
  return `
    <div class="subtabs">
      ${subTabs.map(t => `<button class="subtab ${STATE.subView === t.id ? 'active' : ''}" onclick="mudarSubView('${t.id}')">${t.label}</button>`).join('')}
    </div>
    <div class="card">
      ${STATE.subView === 'lista' ? renderEmendaLista() : renderEmendaForm()}
    </div>
  `;
}

function renderEmendaLista() {
  const busca = document.getElementById('emendaBusca');
  const termo = busca ? busca.value.trim().toLowerCase() : '';
  const lista = termo
    ? STATE.emendas.filter(e => (e.parlamentar || '').toLowerCase().includes(termo) || (e.numero || '').toLowerCase().includes(termo))
    : STATE.emendas;

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
      <div class="card-title" style="margin-bottom:0;">Emendas Parlamentares (${STATE.emendas.length})</div>
      <div style="display:flex;gap:12px;">
        <div class="search-input">
          <span class="search-icon">🔍</span>
          <input type="text" placeholder="Buscar emenda..." value="${escapeHtml(termo)}" id="emendaBusca" oninput="renderTudo()" />
        </div>
        <button class="btn btn-primary" onclick="mudarSubView('form')">+ Nova Emenda</button>
      </div>
    </div>
    ${lista.length === 0
    ? '<div class="empty-state"><div class="empty-state-icon">🏛️</div><div class="empty-state-title">Nenhuma emenda cadastrada</div></div>'
    : lista.slice().reverse().map(e => {
      const conv = e.convenioId ? STATE.convenios.find(cv => cv.id === e.convenioId) : null;
      const conveniente = conv ? (conv.conveniente || conv.proponente) : e.conveniente_nome;
      const situacaoClass = e.situacao === 'Paga' || e.situacao === 'Conveniada' ? 'badge-ok' : e.situacao === 'Empenhada' ? 'badge-warn' : 'badge-info';
      return `
        <div class="convenio-card" style="margin-bottom:8px;">
          <div>
            <div class="convenio-card-title">${escapeHtml(e.parlamentar || '?')} <span style="color:var(--gray-400);font-weight:400;">— nº ${escapeHtml(e.numero || '?')}${e.ano ? '/' + escapeHtml(e.ano) : ''}</span></div>
            <div class="convenio-card-sub">${escapeHtml(e.objeto || 'Objeto não informado')}${e.orgao ? ' · ' + escapeHtml(e.orgao) : ''}${conveniente ? ' · Convenente: ' + escapeHtml(conveniente) : ''}</div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <span class="font-mono" style="font-size:14px;">R$ ${escapeHtml(e.valor || '0,00')}</span>
            <span class="badge badge-info">${escapeHtml(e.esfera || 'União')}</span>
            <span class="badge badge-info">${escapeHtml(e.tipo || 'Convênio')}</span>
            ${conv ? `<span class="badge badge-info">Vinc: ${escapeHtml(conv.numero || '?')}</span>` : ''}
            <span class="badge ${situacaoClass}">${escapeHtml(e.situacao || '?')}</span>
            <button class="btn btn-ghost btn-sm" onclick="editarEmenda('${e.id}')">Editar</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="excluirEmenda('${e.id}')">🗑</button>
          </div>
        </div>
      `;
    }).join('')}
  `;
}

function mudarTipoEmenda(valor) {
  STATE.emTipoAtual = valor;
  renderTudo();
}

function renderEmendaForm() {
  const tipo = STATE.emTipoAtual || 'Convênio';
  const exigeConvenio = TIPOS_EMENDA_COM_CONVENIO.includes(tipo);
  return `
    <div class="card-title" style="font-size:16px;">${STATE.emendaEditandoId ? 'Editar' : 'Nova'} Emenda Parlamentar</div>
    <div id="emendaNote"></div>
    <div class="form-grid" style="margin-top:16px;">
      <div class="form-group"><label class="form-label">Parlamentar <span class="required">*</span></label><input class="form-input" id="em_parlamentar" /></div>
      <div class="form-group"><label class="form-label">Partido</label><input class="form-input" id="em_partido" /></div>
      <div class="form-group">
        <label class="form-label">Esfera <span class="required">*</span></label>
        <select class="form-input form-select" id="em_esfera">
          <option>União</option><option>Estadual</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Tipo de Emenda <span class="required">*</span></label>
        <select class="form-input form-select" id="em_tipo" onchange="mudarTipoEmenda(this.value)">
          ${TIPOS_EMENDA.map(t => `<option ${t === tipo ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Nº Emenda <span class="required">*</span></label><input class="form-input" id="em_numero" /></div>
      <div class="form-group"><label class="form-label">Ano</label><input class="form-input" id="em_ano" /></div>
      <div class="form-group"><label class="form-label">Valor (R$) <span class="required">*</span></label><input class="form-input" id="em_valor" oninput="mascararValor(this)" inputmode="numeric" /></div>
      <div class="form-group"><label class="form-label">Órgão Destinatário</label><input class="form-input" id="em_orgao" /></div>
      <div class="form-group full-width"><label class="form-label">Objeto</label><input class="form-input" id="em_objeto" /></div>
      <div class="form-group">
        <label class="form-label">Situação</label>
        <select class="form-input form-select" id="em_situacao">
          <option>Indicada</option><option>Empenhada</option><option>Paga</option><option>Conveniada</option><option>Cancelada</option>
        </select>
      </div>

      ${exigeConvenio ? `
      <div class="form-section-title">🏢 Convenente</div>
      <div class="form-group full-width">
        <label class="form-label">Vincular a Convênio Cadastrado</label>
        <select class="form-input form-select" id="em_convenio">
          <option value="">— nenhum —</option>
          ${STATE.convenios.map(cv => `<option value="${cv.id}">${escapeHtml(cv.numero || '?')} — ${escapeHtml(cv.conveniente || cv.proponente || '')}</option>`).join('')}
        </select>
        <div style="font-size:12px;color:var(--gray-400);margin-top:4px;">Selecione o convênio já cadastrado; os dados da prefeitura (convenente) serão obtidos automaticamente do cadastro.</div>
      </div>
      ` : `
      <div class="form-section-title">🏢 Convenente (Beneficiário direto)</div>
      <div class="form-group">
        <label class="form-label">Nome do Convenente / Prefeitura</label>
        <input class="form-input" id="em_conveniente_nome" placeholder="Ex: Prefeitura Municipal de..." />
      </div>
      <div class="form-group">
        <label class="form-label">CNPJ do Convenente</label>
        <input class="form-input" id="em_conveniente_cnpj" maxlength="18" oninput="mascararCNPJ(this)" placeholder="00.000.000/0000-00" />
      </div>
      `}

      <div class="form-group full-width"><label class="form-label">Observações</label><input class="form-input" id="em_obs" /></div>
    </div>
    <div style="margin-top:16px;display:flex;gap:12px;">
      <button class="btn btn-primary btn-lg" onclick="salvarEmenda()">💾 Salvar Emenda</button>
      <button class="btn btn-secondary btn-lg" onclick="mudarSubView('lista')">Cancelar</button>
    </div>
  `;
}

function renderInstituicoes() {
  const subTabs = [
    { id: 'lista', label: 'Lista de Instituições' },
    { id: 'form', label: STATE.instituicaoEditandoId ? 'Editar Instituição' : 'Nova Instituição' },
  ];
  return `
    <div class="subtabs">
      ${subTabs.map(t => `<button class="subtab ${STATE.subView === t.id ? 'active' : ''}" onclick="mudarSubView('${t.id}')">${t.label}</button>`).join('')}
    </div>
    <div class="card">
      ${STATE.subView === 'lista' ? renderInstituicaoLista() : renderInstituicaoForm()}
    </div>
  `;
}

function renderInstituicaoLista() {
  const busca = document.getElementById('instituicaoBusca');
  const termo = busca ? busca.value.trim().toLowerCase() : '';
  const lista = termo
    ? STATE.instituicoes.filter(i => (i.razaoSocial || '').toLowerCase().includes(termo) || (i.cnpj || '').includes(termo))
    : STATE.instituicoes;

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
      <div class="card-title" style="margin-bottom:0;">Instituições (${STATE.instituicoes.length})</div>
      <div style="display:flex;gap:12px;">
        <div class="search-input">
          <span class="search-icon">🔍</span>
          <input type="text" placeholder="Buscar instituição..." value="${escapeHtml(termo)}" id="instituicaoBusca" oninput="renderTudo()" />
        </div>
        <button class="btn btn-primary" onclick="mudarSubView('form')">+ Nova Instituição</button>
      </div>
    </div>
    ${lista.length === 0
    ? '<div class="empty-state"><div class="empty-state-icon">🏢</div><div class="empty-state-title">Nenhuma instituição cadastrada</div></div>'
    : lista.slice().reverse().map(i => `
        <div class="convenio-card" style="margin-bottom:8px;">
          <div>
            <div class="convenio-card-title">${escapeHtml(i.razaoSocial || '?')}${i.nomeFantasia ? ' <span style="color:var(--gray-400);font-weight:400;">— ' + escapeHtml(i.nomeFantasia) + '</span>' : ''}</div>
            <div class="convenio-card-sub">${i.cnpj ? 'CNPJ ' + escapeHtml(i.cnpj) : 'CNPJ não informado'}${i.municipio ? ' · ' + escapeHtml(i.municipio) : ''}${i.repNome ? ' · Repres.: ' + escapeHtml(i.repNome) : ''}</div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <span class="badge badge-info">${escapeHtml(i.esfera || 'Municipal')}</span>
            <button class="btn btn-ghost btn-sm" onclick="editarInstituicao('${i.id}')">Editar</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="excluirInstituicao('${i.id}')">🗑</button>
          </div>
        </div>
      `).join('')}
  `;
}

function renderInstituicaoForm() {
  return `
    <div class="card-title" style="font-size:16px;">${STATE.instituicaoEditandoId ? 'Editar' : 'Nova'} Instituição</div>
    <div id="instituicaoNote"></div>
    <div class="form-grid" style="margin-top:16px;">
      <div class="form-group full-width"><label class="form-label">Razão Social <span class="required">*</span></label><input class="form-input" id="in_razaoSocial" placeholder="Ex: Prefeitura Municipal de..." /></div>
      <div class="form-group"><label class="form-label">Nome Fantasia</label><input class="form-input" id="in_nomeFantasia" /></div>
      <div class="form-group"><label class="form-label">CNPJ</label><input class="form-input" id="in_cnpj" maxlength="18" oninput="mascararCNPJ(this)" placeholder="00.000.000/0000-00" /></div>
      <div class="form-group">
        <label class="form-label">Esfera</label>
        <select class="form-input form-select" id="in_esfera">
          <option>Municipal</option><option>Estadual</option><option>Federal</option><option>OSC / Privada</option>
        </select>
      </div>

      <div class="form-section-title">📍 Endereço</div>
      <div class="form-group"><label class="form-label">CEP</label><input class="form-input" id="in_cep" maxlength="9" oninput="mascararCEP(this)" placeholder="00000-000" /></div>
      <div class="form-group"><label class="form-label">Logradouro</label><input class="form-input" id="in_logradouro" /></div>
      <div class="form-group"><label class="form-label">Bairro</label><input class="form-input" id="in_bairro" /></div>
      <div class="form-group"><label class="form-label">Município</label><input class="form-input" id="in_municipio" /></div>
      <div class="form-group"><label class="form-label">Telefone</label><input class="form-input" id="in_telefone" /></div>
      <div class="form-group"><label class="form-label">E-mail</label><input class="form-input" id="in_email" type="email" /></div>

      <div class="form-section-title">👤 Representante Legal</div>
      <div class="form-group"><label class="form-label">Nome</label><input class="form-input" id="in_repNome" placeholder="Ex: Prefeito(a) Municipal" /></div>
      <div class="form-group"><label class="form-label">Cargo</label><input class="form-input" id="in_repCargo" /></div>
      <div class="form-group"><label class="form-label">CPF</label><input class="form-input" id="in_repCpf" maxlength="14" oninput="mascararCPF(this)" placeholder="000.000.000-00" /></div>

      <div class="form-group full-width"><label class="form-label">Observações</label><input class="form-input" id="in_obs" /></div>
    </div>
    <div style="margin-top:16px;display:flex;gap:12px;">
      <button class="btn btn-primary btn-lg" onclick="salvarInstituicao()">💾 Salvar Instituição</button>
      <button class="btn btn-secondary btn-lg" onclick="mudarSubView('lista')">Cancelar</button>
    </div>
  `;
}

function limparFormInstituicao() {
  ['in_razaoSocial', 'in_nomeFantasia', 'in_cnpj', 'in_cep', 'in_logradouro', 'in_bairro',
    'in_municipio', 'in_telefone', 'in_email', 'in_repNome', 'in_repCargo', 'in_repCpf', 'in_obs',
  ].forEach(k => { const el = document.getElementById(k); if (el) el.value = ''; });
  const nota = document.getElementById('instituicaoNote');
  if (nota) nota.innerHTML = '';
}

function renderProponentes() {
  const subTabs = [
    { id: 'lista', label: 'Lista de Proponentes' },
    { id: 'form', label: STATE.proponenteEditandoId ? 'Editar Proponente' : 'Novo Proponente' },
  ];
  return `
    <div class="subtabs">
      ${subTabs.map(t => `<button class="subtab ${STATE.subView === t.id ? 'active' : ''}" onclick="mudarSubView('${t.id}')">${t.label}</button>`).join('')}
    </div>
    <div class="card">
      ${STATE.subView === 'lista' ? renderProponenteLista() : renderProponenteForm()}
    </div>
  `;
}

function renderProponenteLista() {
  const busca = document.getElementById('proponenteBusca');
  const termo = busca ? busca.value.trim().toLowerCase() : '';
  const lista = termo
    ? STATE.proponentes.filter(p => (p.razaoSocial || '').toLowerCase().includes(termo) || (p.documento || '').includes(termo))
    : STATE.proponentes;

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
      <div class="card-title" style="margin-bottom:0;">Proponentes / Convenentes (${STATE.proponentes.length})</div>
      <div style="display:flex;gap:12px;">
        <div class="search-input">
          <span class="search-icon">🔍</span>
          <input type="text" placeholder="Buscar proponente..." value="${escapeHtml(termo)}" id="proponenteBusca" oninput="renderTudo()" />
        </div>
        <button class="btn btn-primary" onclick="mudarSubView('form')">+ Novo Proponente</button>
      </div>
    </div>
    ${lista.length === 0
    ? '<div class="empty-state"><div class="empty-state-icon">🤝</div><div class="empty-state-title">Nenhum proponente cadastrado</div></div>'
    : lista.slice().reverse().map(p => `
        <div class="convenio-card" style="margin-bottom:8px;">
          <div>
            <div class="convenio-card-title">${escapeHtml(p.razaoSocial || '?')}</div>
            <div class="convenio-card-sub">${p.documento ? escapeHtml(p.documento) : 'CPF/CNPJ não informado'}${p.municipio ? ' · ' + escapeHtml(p.municipio) : ''}${p.repNome ? ' · Repres.: ' + escapeHtml(p.repNome) : ''}</div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <span class="badge badge-info">${escapeHtml(p.natureza || 'OSC')}</span>
            <button class="btn btn-ghost btn-sm" onclick="editarProponente('${p.id}')">Editar</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="excluirProponente('${p.id}')">🗑</button>
          </div>
        </div>
      `).join('')}
  `;
}

function renderProponenteForm() {
  return `
    <div class="card-title" style="font-size:16px;">${STATE.proponenteEditandoId ? 'Editar' : 'Novo'} Proponente / Convenente</div>
    <div id="proponenteNote"></div>
    <div class="form-grid" style="margin-top:16px;">
      <div class="form-group full-width"><label class="form-label">Nome / Razão Social <span class="required">*</span></label><input class="form-input" id="pp_razaoSocial" placeholder="Ex: OSC, consórcio, empresa ou pessoa física" /></div>
      <div class="form-group">
        <label class="form-label">Natureza</label>
        <select class="form-input form-select" id="pp_natureza">
          <option>OSC</option><option>Consórcio Público</option><option>Empresa Privada</option><option>Pessoa Física</option><option>Prefeitura</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">CPF/CNPJ</label><input class="form-input" id="pp_documento" maxlength="18" oninput="mascararCNPJ(this)" placeholder="CPF ou CNPJ" /></div>

      <div class="form-section-title">📍 Endereço</div>
      <div class="form-group"><label class="form-label">CEP</label><input class="form-input" id="pp_cep" maxlength="9" oninput="mascararCEP(this)" placeholder="00000-000" /></div>
      <div class="form-group"><label class="form-label">Logradouro</label><input class="form-input" id="pp_logradouro" /></div>
      <div class="form-group"><label class="form-label">Bairro</label><input class="form-input" id="pp_bairro" /></div>
      <div class="form-group"><label class="form-label">Município</label><input class="form-input" id="pp_municipio" /></div>
      <div class="form-group"><label class="form-label">Telefone</label><input class="form-input" id="pp_telefone" /></div>
      <div class="form-group"><label class="form-label">E-mail</label><input class="form-input" id="pp_email" type="email" /></div>

      <div class="form-section-title">🏦 Dados Bancários</div>
      <div class="form-group"><label class="form-label">Banco</label><input class="form-input" id="pp_banco" /></div>
      <div class="form-group"><label class="form-label">Agência</label><input class="form-input" id="pp_agencia" /></div>
      <div class="form-group"><label class="form-label">Conta</label><input class="form-input" id="pp_conta" /></div>

      <div class="form-section-title">👤 Representante Legal</div>
      <div class="form-group"><label class="form-label">Nome</label><input class="form-input" id="pp_repNome" /></div>
      <div class="form-group"><label class="form-label">Cargo</label><input class="form-input" id="pp_repCargo" /></div>
      <div class="form-group"><label class="form-label">CPF</label><input class="form-input" id="pp_repCpf" maxlength="14" oninput="mascararCPF(this)" placeholder="000.000.000-00" /></div>

      <div class="form-group full-width"><label class="form-label">Observações</label><input class="form-input" id="pp_obs" /></div>
    </div>
    <div style="margin-top:16px;display:flex;gap:12px;">
      <button class="btn btn-primary btn-lg" onclick="salvarProponente()">💾 Salvar Proponente</button>
      <button class="btn btn-secondary btn-lg" onclick="mudarSubView('lista')">Cancelar</button>
    </div>
  `;
}

function limparFormProponente() {
  ['pp_razaoSocial', 'pp_documento', 'pp_cep', 'pp_logradouro', 'pp_bairro', 'pp_municipio',
    'pp_telefone', 'pp_email', 'pp_banco', 'pp_agencia', 'pp_conta', 'pp_repNome', 'pp_repCargo', 'pp_repCpf', 'pp_obs',
  ].forEach(k => { const el = document.getElementById(k); if (el) el.value = ''; });
  const nota = document.getElementById('proponenteNote');
  if (nota) nota.innerHTML = '';
}

function renderResponsaveisTecnicos() {
  const subTabs = [
    { id: 'lista', label: 'Lista de Responsáveis Técnicos' },
    { id: 'form', label: STATE.responsavelTecnicoEditandoId ? 'Editar Responsável Técnico' : 'Novo Responsável Técnico' },
  ];
  return `
    <div class="subtabs">
      ${subTabs.map(t => `<button class="subtab ${STATE.subView === t.id ? 'active' : ''}" onclick="mudarSubView('${t.id}')">${t.label}</button>`).join('')}
    </div>
    <div class="card">
      ${STATE.subView === 'lista' ? renderResponsavelTecnicoLista() : renderResponsavelTecnicoForm()}
    </div>
  `;
}

function renderResponsavelTecnicoLista() {
  const busca = document.getElementById('responsavelTecnicoBusca');
  const termo = busca ? busca.value.trim().toLowerCase() : '';
  const lista = termo
    ? STATE.responsaveisTecnicos.filter(r => (r.nome || '').toLowerCase().includes(termo) || (r.numeroRegistro || '').includes(termo))
    : STATE.responsaveisTecnicos;

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
      <div class="card-title" style="margin-bottom:0;">Responsáveis Técnicos (${STATE.responsaveisTecnicos.length})</div>
      <div style="display:flex;gap:12px;">
        <div class="search-input">
          <span class="search-icon">🔍</span>
          <input type="text" placeholder="Buscar responsável técnico..." value="${escapeHtml(termo)}" id="responsavelTecnicoBusca" oninput="renderTudo()" />
        </div>
        <button class="btn btn-primary" onclick="mudarSubView('form')">+ Novo Responsável Técnico</button>
      </div>
    </div>
    ${lista.length === 0
    ? '<div class="empty-state"><div class="empty-state-icon">👷</div><div class="empty-state-title">Nenhum responsável técnico cadastrado</div></div>'
    : lista.slice().reverse().map(r => `
        <div class="convenio-card" style="margin-bottom:8px;">
          <div>
            <div class="convenio-card-title">${escapeHtml(r.nome || '?')}</div>
            <div class="convenio-card-sub">${escapeHtml(r.conselho || 'CREA')} ${escapeHtml(r.numeroRegistro || '(sem nº)')}${r.cargo ? ' · ' + escapeHtml(r.cargo) : ''}</div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <button class="btn btn-ghost btn-sm" onclick="editarResponsavelTecnico('${r.id}')">Editar</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="excluirResponsavelTecnico('${r.id}')">🗑</button>
          </div>
        </div>
      `).join('')}
  `;
}

function renderResponsavelTecnicoForm() {
  return `
    <div class="card-title" style="font-size:16px;">${STATE.responsavelTecnicoEditandoId ? 'Editar' : 'Novo'} Responsável Técnico</div>
    <div id="responsavelTecnicoNote"></div>
    <div class="form-grid" style="margin-top:16px;">
      <div class="form-group full-width"><label class="form-label">Nome <span class="required">*</span></label><input class="form-input" id="rt_nome" /></div>
      <div class="form-group"><label class="form-label">Cargo / Função</label><input class="form-input" id="rt_cargo" placeholder="Ex: Engenheiro Civil" /></div>
      <div class="form-group">
        <label class="form-label">Conselho</label>
        <select class="form-input form-select" id="rt_conselho">
          <option>CREA</option><option>CAU</option><option>CRM</option><option>CRC</option><option>Outro</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Nº de Registro</label><input class="form-input" id="rt_numeroRegistro" placeholder="Ex: 12345-D/PE" /></div>
      <div class="form-group"><label class="form-label">CPF</label><input class="form-input" id="rt_cpf" maxlength="14" oninput="mascararCPF(this)" placeholder="000.000.000-00" /></div>
      <div class="form-group"><label class="form-label">Telefone</label><input class="form-input" id="rt_telefone" /></div>
      <div class="form-group"><label class="form-label">E-mail</label><input class="form-input" id="rt_email" type="email" /></div>
      <div class="form-group full-width"><label class="form-label">Observações</label><input class="form-input" id="rt_obs" /></div>
    </div>
    <div style="margin-top:16px;display:flex;gap:12px;">
      <button class="btn btn-primary btn-lg" onclick="salvarResponsavelTecnico()">💾 Salvar Responsável Técnico</button>
      <button class="btn btn-secondary btn-lg" onclick="mudarSubView('lista')">Cancelar</button>
    </div>
  `;
}

function limparFormResponsavelTecnico() {
  ['rt_nome', 'rt_cargo', 'rt_numeroRegistro', 'rt_cpf', 'rt_telefone', 'rt_email', 'rt_obs']
    .forEach(k => { const el = document.getElementById(k); if (el) el.value = ''; });
  const nota = document.getElementById('responsavelTecnicoNote');
  if (nota) nota.innerHTML = '';
}

function renderUsuarios() {
  const subTabs = [
    { id: 'lista', label: 'Lista de Usuários' },
    { id: 'form', label: STATE.usuarioEditandoId ? 'Editar Usuário' : 'Novo Usuário' },
  ];
  return `
    <div class="subtabs">
      ${subTabs.map(t => `<button class="subtab ${STATE.subView === t.id ? 'active' : ''}" onclick="mudarSubView('${t.id}')">${t.label}</button>`).join('')}
    </div>
    <div class="card">
      ${STATE.subView === 'lista' ? renderUsuarioLista() : renderUsuarioForm()}
    </div>
  `;
}

function renderUsuarioLista() {
  const busca = document.getElementById('usuarioBusca');
  const termo = busca ? busca.value.trim().toLowerCase() : '';
  const lista = termo
    ? STATE.usuarios.filter(u => (u.nome || '').toLowerCase().includes(termo) || (u.email || '').toLowerCase().includes(termo))
    : STATE.usuarios;

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
      <div class="card-title" style="margin-bottom:0;">Usuários (${STATE.usuarios.length})</div>
      <div style="display:flex;gap:12px;">
        <div class="search-input">
          <span class="search-icon">🔍</span>
          <input type="text" placeholder="Buscar usuário..." value="${escapeHtml(termo)}" id="usuarioBusca" oninput="renderTudo()" />
        </div>
        <button class="btn btn-primary" onclick="mudarSubView('form')">+ Novo Usuário</button>
      </div>
    </div>
    <div class="alert alert-info" style="margin-bottom:16px;">
      Além de identificar quem elabora/assina os documentos, um usuário com senha cadastrada pode fazer login no sistema — o papel dele (Administrador/Operador/Somente leitura) controla o que ele pode ver e alterar. É um controle local, pra uso em computador compartilhado — não substitui um backend com autenticação de servidor.
    </div>
    ${lista.length === 0
    ? '<div class="empty-state"><div class="empty-state-icon">👤</div><div class="empty-state-title">Nenhum usuário cadastrado</div></div>'
    : lista.slice().reverse().map(u => `
        <div class="convenio-card" style="margin-bottom:8px;">
          <div>
            <div class="convenio-card-title">${escapeHtml(u.nome || '?')}</div>
            <div class="convenio-card-sub">${u.cargo ? escapeHtml(u.cargo) : 'Cargo não informado'}${u.setor ? ' · ' + escapeHtml(u.setor) : ''}${u.email ? ' · ' + escapeHtml(u.email) : ''}</div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <span class="badge ${u.papel === PAPEIS.ADMIN ? 'badge-ok' : u.papel === PAPEIS.LEITURA ? 'badge-info' : 'badge-warn'}">${escapeHtml(PAPEL_LABEL[u.papel] || 'Operador')}</span>
            <span style="font-size:12px;color:${u.senhaHash ? 'var(--green-600)' : 'var(--gray-400)'};">${u.senhaHash ? '🔒 Login ativo' : '— sem login'}</span>
            <button class="btn btn-ghost btn-sm" onclick="editarUsuario('${u.id}')">Editar</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="excluirUsuario('${u.id}')">🗑</button>
          </div>
        </div>
      `).join('')}
  `;
}

function renderUsuarioForm() {
  const editando = STATE.usuarioEditandoId ? STATE.usuarios.find(x => x.id === STATE.usuarioEditandoId) : null;
  const temSenha = !!(editando && editando.senhaHash);
  return `
    <div class="card-title" style="font-size:16px;">${STATE.usuarioEditandoId ? 'Editar' : 'Novo'} Usuário</div>
    <div id="usuarioNote"></div>
    <div class="form-grid" style="margin-top:16px;">
      <div class="form-group full-width"><label class="form-label">Nome <span class="required">*</span></label><input class="form-input" id="us_nome" /></div>
      <div class="form-group"><label class="form-label">Cargo / Função</label><input class="form-input" id="us_cargo" /></div>
      <div class="form-group"><label class="form-label">Setor</label><input class="form-input" id="us_setor" /></div>
      <div class="form-group"><label class="form-label">E-mail</label><input class="form-input" id="us_email" type="email" /></div>
      <div class="form-group"><label class="form-label">Telefone</label><input class="form-input" id="us_telefone" /></div>
      <div class="form-group full-width"><label class="form-label">Observações</label><input class="form-input" id="us_obs" /></div>

      <div class="form-section-title">🔐 Acesso ao sistema</div>
      <div class="form-group">
        <label class="form-label">Papel</label>
        <select class="form-input form-select" id="us_papel">
          <option value="${PAPEIS.ADMIN}">Administrador — acesso total</option>
          <option value="${PAPEIS.OPERADOR}" selected>Operador — usa o dia a dia, sem acesso a Usuários/Identidade Visual/Backups</option>
          <option value="${PAPEIS.LEITURA}">Somente leitura — não pode salvar, lançar ou excluir nada</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">${temSenha ? 'Nova senha (deixe em branco pra manter a atual)' : 'Senha (opcional — sem senha, este usuário não consegue fazer login)'}</label>
        <input class="form-input" type="password" id="us_senha" autocomplete="new-password" placeholder="${temSenha ? '••••••' : 'Deixe em branco = sem login'}" />
      </div>
      ${temSenha ? `
      <div class="form-group full-width">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--gray-600);cursor:pointer;">
          <input type="checkbox" id="us_limpar_senha" style="width:auto;" />
          Remover a senha deste usuário (ele deixa de conseguir fazer login)
        </label>
      </div>
      ` : ''}
    </div>
    <div style="margin-top:16px;display:flex;gap:12px;">
      <button class="btn btn-primary btn-lg" onclick="salvarUsuario()">💾 Salvar Usuário</button>
      <button class="btn btn-secondary btn-lg" onclick="mudarSubView('lista')">Cancelar</button>
    </div>
  `;
}

function limparFormUsuario() {
  ['us_nome', 'us_cargo', 'us_setor', 'us_email', 'us_telefone', 'us_obs', 'us_senha']
    .forEach(k => { const el = document.getElementById(k); if (el) el.value = ''; });
  const papelEl = document.getElementById('us_papel');
  if (papelEl) papelEl.value = PAPEIS.OPERADOR;
  const limparEl = document.getElementById('us_limpar_senha');
  if (limparEl) limparEl.checked = false;
  const nota = document.getElementById('usuarioNote');
  if (nota) nota.innerHTML = '';
}

// ==================== IDENTIDADE VISUAL (TIMBRE OFICIAL) ====================
// Brasão + nome do município usados no cabeçalho do Relatório Financeiro (PDF)
// e dos documentos gerados (Ofício, Memorando, Justificativa) — no lugar da
// marca do próprio CaptaGov, já que esses documentos são pra uso oficial.
let _brasaoTempDataUrl = undefined; // undefined = não alterado nesta sessão de edição; null = removido; string = novo

function renderIdentidadeVisual() {
  const iv = STATE.identidadeVisual || {};
  const brasaoAtual = _brasaoTempDataUrl !== undefined ? _brasaoTempDataUrl : iv.brasaoDataUrl;
  return `
    <div class="card">
      <div class="card-title">🏛️ Identidade Visual do Município</div>
      <div class="card-subtitle">Esse nome e brasão passam a aparecer no cabeçalho do Relatório Financeiro (PDF) e dos documentos gerados (Ofício, Memorando, Justificativa), no lugar da marca do CaptaGov — pra ficarem prontos pra uso oficial.</div>
      <div id="identidadeNote"></div>
      <div class="form-grid" style="margin-top:16px;">
        <div class="form-group full-width">
          <label class="form-label">Nome do Município / Órgão (cabeçalho dos documentos)</label>
          <input class="form-input" id="iv_nome" value="${escapeHtml(iv.nomeMunicipio || '')}" placeholder="Ex: Prefeitura Municipal de Itapissuma" />
        </div>
        <div class="form-group full-width">
          <label class="form-label">Brasão / Logo (PNG ou JPG — fundo transparente de preferência)</label>
          <input class="form-input" type="file" id="iv_brasao" accept=".png,.jpg,.jpeg" onchange="preverBrasao(this)" />
          <div id="iv_brasao_preview" style="margin-top:10px;">
            ${brasaoAtual
              ? `<div style="display:flex;align-items:center;gap:12px;">
                   <img src="${brasaoAtual}" style="height:64px;border:1px solid var(--gray-200);border-radius:var(--radius-sm);padding:4px;background:var(--white);" />
                   <button type="button" class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="removerBrasao()">Remover brasão</button>
                 </div>`
              : '<span style="color:var(--gray-400);font-size:13px;">Nenhum brasão definido — os documentos usam a marca padrão do CaptaGov.</span>'}
          </div>
        </div>
      </div>
      <div style="margin-top:16px;display:flex;gap:12px;">
        <button class="btn btn-primary btn-lg" onclick="salvarIdentidadeVisual()">💾 Salvar Identidade Visual</button>
      </div>
    </div>
  `;
}

function preverBrasao(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    _brasaoTempDataUrl = r.result;
    renderTudo();
  };
  r.readAsDataURL(file);
}

function removerBrasao() {
  _brasaoTempDataUrl = null;
  renderTudo();
}

async function salvarIdentidadeVisual() {
  const nomeEl = document.getElementById('iv_nome');
  const nomeMunicipio = nomeEl ? nomeEl.value.trim() : '';
  const brasaoDataUrl = _brasaoTempDataUrl !== undefined ? _brasaoTempDataUrl : (STATE.identidadeVisual?.brasaoDataUrl || null);
  STATE.identidadeVisual = { nomeMunicipio, brasaoDataUrl };
  await salvarIdentidadeVisualDb(STATE.identidadeVisual);
  _brasaoTempDataUrl = undefined;
  toastSucesso('Identidade visual salva — os próximos relatórios e documentos já usam o novo timbre.');
  renderTudo();
}

function limparFormEmenda() {
  ['em_parlamentar', 'em_partido', 'em_numero', 'em_ano', 'em_valor', 'em_orgao', 'em_objeto', 'em_obs', 'em_conveniente_nome', 'em_conveniente_cnpj'].forEach(k => {
    const el = document.getElementById(k);
    if (el) el.value = '';
  });
  const sel = document.getElementById('em_situacao');
  if (sel) sel.value = 'Indicada';
  const esf = document.getElementById('em_esfera');
  if (esf) esf.value = 'União';
  STATE.emTipoAtual = 'Convênio';
  const tp = document.getElementById('em_tipo');
  if (tp) tp.value = 'Convênio';
}

function limparFormConvenio() {
  camposConvenio.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  setVal('c_esfera', 'União');
  setVal('c_natureza', 'Prefeitura Municipal');
  setVal('c_prazo_pc', '60');
}

// ==================== REMOÇÕES ====================
function removerContratada(id) {
  if (!podeEditar()) { bloqueadoSomenteLeitura(); return; }
  if (!STATE.convenioAtualId) return;
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;
  if (!confirm('Remover esta contratada?')) return;
  c.financeiro.contratadas = (c.financeiro.contratadas || []).filter(x => x.id !== id);
  if (STATE.contratadaEditandoId === id) STATE.contratadaEditandoId = null;
  salvarEstado();
  renderTudo();
}

function removerPagamento(id) {
  if (!podeEditar()) { bloqueadoSomenteLeitura(); return; }
  if (!STATE.convenioAtualId) return;
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;
  if (!confirm('Remover este pagamento?')) return;
  c.financeiro.pagamentos = (c.financeiro.pagamentos || []).filter(x => x.id !== id);
  salvarEstado();
  renderTudo();
}

function removerExtrato(id) {
  if (!podeEditar()) { bloqueadoSomenteLeitura(); return; }
  if (!STATE.convenioAtualId) return;
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;
  if (!confirm('Remover este lançamento?')) return;
  c.financeiro.extratos = (c.financeiro.extratos || []).filter(x => x.id !== id);
  salvarEstado();
  renderTudo();
}

function removerRendimento(id) {
  if (!podeEditar()) { bloqueadoSomenteLeitura(); return; }
  if (!STATE.convenioAtualId) return;
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;
  if (!confirm('Remover este rendimento?')) return;
  c.financeiro.rendimentos = (c.financeiro.rendimentos || []).filter(x => x.id !== id);
  salvarEstado();
  renderTudo();
}

function updateSaldoPreview() {
  if (!STATE.convenioAtualId) return;
  const resumo = calcularResumoFinanceiro(STATE.convenioAtualId);
  const valorPgto = parseMoeda(document.getElementById('pg_valor')?.value || '0');
  const el = document.getElementById('saldoPreview');
  if (!el) return;
  if (resumo.saldoContrato !== null) {
    const saldoContratoPos = resumo.saldoContrato - valorPgto;
    const saldoConvenioPos = resumo.saldoTotal - valorPgto;
    el.textContent = 'Contrato: ' + formatMoeda(saldoContratoPos) + '  ·  Convênio: ' + formatMoeda(saldoConvenioPos);
    el.style.color = (saldoContratoPos < 0 || saldoConvenioPos < 0) ? 'var(--danger)' : 'var(--green-600)';
  } else {
    const saldo = resumo.saldoTotal - valorPgto;
    el.textContent = formatMoeda(saldo);
    el.style.color = saldo < 0 ? 'var(--danger)' : 'var(--green-600)';
  }
}

// ==================== GERAÇÃO DE PDF ====================
// Desenha a faixa de cabeçalho azul-marinho no topo do PDF. Se o município já
// cadastrou brasão/nome em Identidade Visual, usa isso; senão cai na marca
// padrão do CaptaGov. Retorna o Y onde o conteúdo do documento deve começar.
function desenharCabecalhoPDF(doc, W, M, subtitulo) {
  const iv = STATE.identidadeVisual || {};
  const NAVY = [11, 27, 51];
  const GREEN = [22, 163, 74];
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 30, 'F');

  if (iv.brasaoDataUrl) {
    try {
      const formato = /^data:image\/(png|jpe?g)/i.test(iv.brasaoDataUrl)
        ? (/jpe?g/i.test(iv.brasaoDataUrl.slice(0, 20)) ? 'JPEG' : 'PNG')
        : 'PNG';
      doc.addImage(iv.brasaoDataUrl, formato, M, 5, 20, 20);
    } catch (e) { /* formato de imagem incompatível — segue sem brasão */ }
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(iv.nomeMunicipio || 'Documento Oficial', M + 24, 15);
    doc.setFontSize(9);
    doc.setTextColor(180, 200, 220);
    doc.setFont('helvetica', 'normal');
    doc.text(subtitulo, M + 24, 22);
  } else if (iv.nomeMunicipio) {
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text(iv.nomeMunicipio, M, 15);
    doc.setFontSize(9);
    doc.setTextColor(180, 200, 220);
    doc.setFont('helvetica', 'normal');
    doc.text(subtitulo, M, 22);
  } else {
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('CAPT', M, 14);
    doc.setTextColor(...GREEN);
    doc.text('GOV', M + 30, 14);
    doc.setFontSize(10);
    doc.setTextColor(180, 200, 220);
    doc.setFont('helvetica', 'normal');
    doc.text(subtitulo, M, 22);
  }
  doc.setTextColor(180, 200, 220);
  doc.setFontSize(9);
  doc.text(new Date().toLocaleDateString('pt-BR'), W - M - 30, 22, { align: 'right' });
  return 40;
}

// Monta um PDF formatado (timbre + título + corpo do texto com quebra de
// página automática) a partir do texto de um documento gerado (Ofício,
// Memorando, Justificativa etc.) — em vez do antigo .txt sem formatação.
function gerarPDFDocumentoTexto(titulo, texto, c) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');
  const W = 210, M = 20;
  const NAVY = [11, 27, 51];

  let y = desenharCabecalhoPDF(doc, W, M, titulo);
  y += 4;
  doc.setTextColor(...NAVY);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(titulo, M, y);
  y += 8;

  if (c) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Convênio: ' + (c.numero || '—') + '   |   Convenente: ' + (c.conveniente || c.proponente || '—'), M, y);
    y += 8;
  }

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'normal');
  const larguraUtil = W - 2 * M;
  const linhas = doc.splitTextToSize(texto || '', larguraUtil);
  const margemInferior = 20;
  linhas.forEach(linha => {
    if (y > 297 - margemInferior) { doc.addPage(); y = 20; }
    doc.text(linha, M, y);
    y += 5.4;
  });

  const totalPaginas = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Página ${i} de ${totalPaginas}`, W - M, 290, { align: 'right' });
  }
  return doc;
}

// Baixa em PDF o documento que está aberto no editor (ainda não salvo, ou em revisão).
function baixarDocumentoGeradoPDF() {
  const el = document.getElementById('docGeradoTexto');
  if (!el) return;
  const tipo = TIPOS_DOC_IA.find(t => t.id === STATE.docGeradoTipo);
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  const titulo = tipo ? tipo.nome : 'Documento';
  const pdf = gerarPDFDocumentoTexto(titulo, el.value, c);
  pdf.save(titulo.replace(/\s+/g, '_') + '.pdf');
}

// Baixa em PDF um documento já salvo na lista de documentos do convênio.
function baixarDocumentoSalvoPDF(id) {
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c || !c.docsGeradosIA) return;
  const docSalvo = c.docsGeradosIA.find(d => d.id === id);
  if (!docSalvo) return;
  const pdf = gerarPDFDocumentoTexto(docSalvo.titulo, docSalvo.texto, c);
  pdf.save(docSalvo.titulo.replace(/\s+/g, '_') + '.pdf');
}

function gerarPDFRelatorio() {
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) { toastAviso('Selecione um convênio.'); return; }
  const resumo = calcularResumoFinanceiro(c.id);
  const fin = resumo.fin;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');
  const W = 210, M = 20;
  let y = 20;

  // Cores
  const NAVY = [11, 27, 51];
  const GREEN = [22, 163, 74];
  const GRAY = [100, 116, 139];
  const TEAL = [13, 148, 136];
  const RED = [239, 68, 68];
  const AMBER = [217, 119, 6];

  y = desenharCabecalhoPDF(doc, W, M, 'Relatório Financeiro');
  doc.setTextColor(...NAVY);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(c.numero ? 'Convênio: ' + c.numero : 'Sem número', M, y);
  y += 8;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY);
  doc.text('Programa: ' + (c.programa || '—') + '  |  Convenente: ' + (c.conveniente || c.proponente || '—'), M, y);
  y += 6;
  doc.text('Vigência: ' + (c.dataInicio || '—') + ' a ' + (c.dataFim || '—') + '  |  PC até: ' + (c.prazoLimitePC || '—'), M, y);
  y += 12;

  // ==================== RESUMO EXECUTIVO ====================
  // Reaproveita a mesma lógica de status usada no restante do app
  // (statusConvenio/statusVigencia) para o relatório nunca divergir
  // do que é mostrado nas telas.
  const statPC = statusConvenio(c);
  const statVig = statusVigencia(c);
  const pctExecutado = resumo.valorTotal > 0
    ? Math.max(0, Math.min(1, resumo.totalPago / resumo.valorTotal))
    : null;
  const alertas = [];
  if (statPC.cls === 'badge-danger') {
    alertas.push({ cor: RED, texto: 'Prestação de contas vencida (prazo: ' + (c.prazoLimitePC || '—') + ').' });
  } else if (statPC.cls === 'badge-warn') {
    alertas.push({ cor: AMBER, texto: 'Prestação de contas vence em breve (prazo: ' + (c.prazoLimitePC || '—') + ').' });
  }
  if (statVig.cls === 'badge-danger') {
    alertas.push({ cor: RED, texto: 'Vigência do convênio encerrada ou encerrando hoje.' });
  } else if (statVig.cls === 'badge-warn') {
    alertas.push({ cor: AMBER, texto: 'Vigência encerra em ' + statVig.dias + ' dia(s).' });
  }
  if (resumo.saldoTotal < 0) {
    alertas.push({ cor: RED, texto: 'Saldo do convênio está negativo: ' + formatMoeda(resumo.saldoTotal) + '.' });
  }

  const alturaResumo = 18 + alertas.length * 5.5 + (pctExecutado !== null ? 8 : 0);
  if (y + alturaResumo > 265) { doc.addPage(); y = 20; }
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(M, y, W - 2 * M, alturaResumo, 3, 3, 'FD');
  let yResumo = y + 8;
  doc.setTextColor(...NAVY);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Resumo Executivo', M + 5, yResumo);
  const corStatus = statPC.cls === 'badge-danger' ? RED : statPC.cls === 'badge-warn' ? AMBER : GREEN;
  doc.setFontSize(9);
  doc.setTextColor(...corStatus);
  doc.text(statPC.label, W - M - 5, yResumo, { align: 'right' });
  yResumo += 7;

  if (pctExecutado !== null) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRAY);
    doc.text('Executado: ' + (pctExecutado * 100).toFixed(1) + '% do valor total', M + 5, yResumo);
    const barX = M + 5, barW = W - 2 * M - 10, barY = yResumo + 2;
    doc.setFillColor(226, 232, 240);
    doc.roundedRect(barX, barY, barW, 3, 1.5, 1.5, 'F');
    doc.setFillColor(...(pctExecutado >= 1 ? GREEN : TEAL));
    doc.roundedRect(barX, barY, Math.max(barW * pctExecutado, 3), 3, 1.5, 1.5, 'F');
    yResumo += 9;
  }

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  if (alertas.length === 0) {
    doc.setTextColor(...GREEN);
    doc.text('Nenhuma pendência crítica identificada.', M + 5, yResumo);
  } else {
    alertas.forEach(a => {
      doc.setTextColor(...a.cor);
      doc.text('•  ' + a.texto, M + 5, yResumo);
      yResumo += 5.5;
    });
  }
  y += alturaResumo + 10;

  // Dados cadastrais completos
  doc.setTextColor(...NAVY);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Dados do Convênio', M, y);
  y += 7;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  const linhasCadastro = [
    'Órgão: ' + (c.orgao || '—') + '   |   Esfera: ' + (c.esfera || '—') + '   |   Natureza: ' + (c.natureza || '—'),
    'CNPJ: ' + (c.cnpj || '—') + '   |   Endereço: ' + (c.logradouro || '—') + ', ' + (c.bairroProp || '—') + ' — ' + (c.municipioProp || '—'),
    'Contato institucional: ' + (c.telefoneInst || '—') + '   |   ' + (c.emailInst || '—'),
    (c.responsavel || c.cargo || c.responsavelCpf) ? 'Responsável: ' + (c.responsavel || '—') + ' (' + (c.cargo || '—') + ')   |   CPF: ' + (c.responsavelCpf || '—') : null,
    (c.responsavelTelefone || c.responsavelEmail) ? 'Contato do responsável: ' + (c.responsavelTelefone || '—') + '   |   ' + (c.responsavelEmail || '—') : null,
    (c.tecnicoNome || c.tecnicoRegistro) ? 'Técnico responsável: ' + (c.tecnicoNome || '—') + '   |   Registro: ' + (c.tecnicoRegistro || '—') : null,
    (c.tecnicoTelefone || c.tecnicoEmail) ? 'Contato do técnico: ' + (c.tecnicoTelefone || '—') + '   |   ' + (c.tecnicoEmail || '—') : null,
    'Banco/Agência/Conta: ' + (c.banco || '—') + ' / ' + (c.agencia || '—') + ' / ' + (c.conta || '—') + '   |   Contrapartida: ' + (c.contrapartida ? formatMoeda(parseMoeda(c.contrapartida)) : '—'),
    'Assinatura: ' + (c.dataAssinatura || '—') + '   |   Vigência: ' + (c.dataInicio || '—') + ' a ' + (c.dataFim || '—') + '   |   PC até: ' + (c.prazoLimitePC || '—'),
  ].filter(Boolean);
  linhasCadastro.forEach(linha => { doc.text(linha, M, y); y += 5; });

  y += 6;
  // Cards resumo
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(M, y, W - 2 * M, 30, 3, 3, 'F');
  const cards = [
    { label: 'Valor Total', value: formatMoeda(resumo.valorTotal), color: TEAL },
    { label: 'Movimento Extrato', value: formatMoeda(resumo.movExtrato), color: resumo.movExtrato >= 0 ? GREEN : RED },
    { label: 'Total Pago', value: formatMoeda(resumo.totalPago), color: GRAY },
    { label: 'Saldo Total', value: formatMoeda(resumo.saldoTotal), color: resumo.saldoTotal >= 0 ? GREEN : RED },
  ];
  const cw = (W - 2 * M) / 4;
  const larguraUtilCard = cw - 6; // espaço disponível pro valor sem invadir o card vizinho
  cards.forEach((card, i) => {
    const cx = M + i * cw;
    doc.setTextColor(...GRAY);
    doc.setFontSize(8);
    doc.text(card.label, cx + 3, y + 8);
    doc.setTextColor(...card.color);
    doc.setFont('helvetica', 'bold');
    // Reduz a fonte do valor até caber na largura do card — evita que
    // convênios de valor alto (ex: R$ 12.847.392,50) estourem pro card
    // vizinho e fiquem sobrepostos.
    let fonteValor = 12;
    doc.setFontSize(fonteValor);
    while (fonteValor > 7 && doc.getTextWidth(card.value) > larguraUtilCard) {
      fonteValor -= 0.5;
      doc.setFontSize(fonteValor);
    }
    doc.text(card.value, cx + 3, y + 22);
  });
  doc.setFont('helvetica', 'normal');

  y += 40;

  // ==================== GRÁFICO DE EVOLUÇÃO FINANCEIRA ====================
  // Barras entradas x saídas por mês, a partir do extrato bancário lançado.
  if (fin.extratos && fin.extratos.length > 0) {
    const alturaGrafico = 55;
    if (y + alturaGrafico > 260) { doc.addPage(); y = 20; }
    doc.setTextColor(...NAVY);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Evolução Financeira Mensal', M, y);
    y += 6;

    const extratosOrd = [...fin.extratos].sort((a, b) => a.mes.localeCompare(b.mes));
    const gx0 = M, gy0 = y, gw = W - 2 * M, gh = 36;
    doc.setDrawColor(226, 232, 240);
    doc.rect(gx0, gy0, gw, gh, 'S');
    const maxValor = Math.max(1, ...extratosOrd.flatMap(e => [e.entradas || 0, e.saidas || 0]));
    const nMeses = extratosOrd.length;
    const wGrupo = gw / nMeses;
    const wBarra = Math.min(6, wGrupo / 3.5);
    extratosOrd.forEach((e, i) => {
      const cxg = gx0 + i * wGrupo + wGrupo / 2;
      const hEnt = ((e.entradas || 0) / maxValor) * (gh - 10);
      const hSai = ((e.saidas || 0) / maxValor) * (gh - 10);
      doc.setFillColor(...GREEN);
      doc.rect(cxg - wBarra - 1, gy0 + gh - 8 - hEnt, wBarra, hEnt, 'F');
      doc.setFillColor(...RED);
      doc.rect(cxg + 1, gy0 + gh - 8 - hSai, wBarra, hSai, 'F');
      doc.setFontSize(6);
      doc.setTextColor(...GRAY);
      doc.text(formatMes(e.mes).slice(0, 6), cxg, gy0 + gh - 2, { align: 'center' });
    });
    doc.setFillColor(...GREEN);
    doc.rect(gx0, gy0 + gh + 4, 3, 3, 'F');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.text('Entradas', gx0 + 5, gy0 + gh + 6.5);
    doc.setFillColor(...RED);
    doc.rect(gx0 + 25, gy0 + gh + 4, 3, 3, 'F');
    doc.text('Saídas', gx0 + 30, gy0 + gh + 6.5);
    y = gy0 + gh + 14;
  }

  // ==================== SUMÁRIO (ÍNDICE) ====================
  // Reserva uma página em branco aqui (logo após a visão geral) e só a
  // preenche no final, quando já sabemos em que página cada seção caiu —
  // assim o índice fica no lugar certo (início do relatório) mesmo com
  // conteúdo de tamanho variável pela frente.
  doc.addPage();
  const paginaIndice = doc.internal.getCurrentPageInfo().pageNumber;
  doc.addPage();
  y = 20;
  const secoesIndice = [];

  // Contratadas
  if (fin.contratadas && fin.contratadas.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setTextColor(...NAVY);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Contratadas', M, y);
    secoesIndice.push({ titulo: 'Contratadas', pagina: doc.internal.getCurrentPageInfo().pageNumber });
    y += 6;

    doc.autoTable({
      head: [['Razão Social', 'CNPJ', 'Nº Contrato', 'Valor Vigente', 'Vigência Final']],
      body: fin.contratadas.map(ct => [
        ct.razaoSocial || '—', ct.cnpj || '—', ct.numeroContrato || '—',
        formatMoeda(parseMoeda(ct.valorContrato || '0')),
        ct.dataFimVigencia ? formatData(ct.dataFimVigencia) : '—',
      ]),
      startY: y,
      headStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: [51, 65, 85] },
      alternateRowStyles: { fillColor: [241, 245, 249] },
      margin: { left: M, right: M },
      theme: 'grid',
    });
    y = doc.lastAutoTable.finalY + 10;

    // Aditivos (histórico de alterações de valor/prazo por contratada)
    const todosAditivos = [];
    fin.contratadas.forEach(ct => (ct.aditivos || []).forEach(a => todosAditivos.push({ ct, a })));
    if (todosAditivos.length > 0) {
      if (y > 240) { doc.addPage(); y = 20; }
      doc.setTextColor(...NAVY);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Aditivos Contratuais', M, y);
      secoesIndice.push({ titulo: 'Aditivos Contratuais', pagina: doc.internal.getCurrentPageInfo().pageNumber });
      y += 6;
      doc.autoTable({
        head: [['Contratada', 'Aditivo', 'Tipo', 'Assinatura', 'Valor Aditivado', 'Nova Vigência']],
        body: todosAditivos.map(({ ct, a }) => [
          ct.razaoSocial || '—',
          a.numero || '—',
          (TIPOS_ADITIVO.find(t => t.id === a.tipo) || {}).label || a.tipo,
          a.dataAssinatura ? formatData(a.dataAssinatura) : '—',
          (a.tipo === 'valor' || a.tipo === 'valor_prazo') ? formatMoeda(a.valorAditivo) : '—',
          (a.tipo === 'prazo' || a.tipo === 'valor_prazo') ? formatData(a.novaDataFim) : '—',
        ]),
        startY: y,
        headStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9, textColor: [51, 65, 85] },
        alternateRowStyles: { fillColor: [241, 245, 249] },
        margin: { left: M, right: M },
        theme: 'grid',
      });
      y = doc.lastAutoTable.finalY + 10;
    }
  }

  // Pagamentos
  if (fin.pagamentos && fin.pagamentos.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setTextColor(...NAVY);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Pagamentos às Contratadas', M, y);
    secoesIndice.push({ titulo: 'Pagamentos às Contratadas', pagina: doc.internal.getCurrentPageInfo().pageNumber });
    y += 6;

    const headers = [['Nº', 'Contratada', 'Data', 'Valor', 'Status', 'Documentos']];
    const rows = fin.pagamentos.map(p => {
      const ct = (fin.contratadas || []).find(x => x.id === p.contratadaId);
      const docsObj = p.docs || {};
      const docsAnexados = CATEGORIAS_DOC_PAGAMENTO.filter(cat => docsObj[cat.id] && docsObj[cat.id].anexado).length;
      return [String(p.numero), ct ? ct.razaoSocial : '?', p.data ? new Date(p.data + 'T00:00:00').toLocaleDateString('pt-BR') : '—', formatMoeda(p.valor), p.status, docsAnexados + '/' + CATEGORIAS_DOC_PAGAMENTO.length];
    });

    doc.autoTable({
      head: headers, body: rows, startY: y,
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: [51, 65, 85] },
      alternateRowStyles: { fillColor: [241, 245, 249] },
      margin: { left: M, right: M },
      theme: 'grid',
    });
    y = doc.lastAutoTable.finalY + 10;

    // Histórico de status dos pagamentos
    const historicoRows = [];
    fin.pagamentos.forEach(p => {
      (p.historico || []).forEach(h => {
        historicoRows.push([String(p.numero), h.status, new Date(h.quando).toLocaleString('pt-BR')]);
      });
    });
    if (historicoRows.length > 0) {
      if (y > 240) { doc.addPage(); y = 20; }
      doc.setTextColor(...NAVY);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Histórico de Status dos Pagamentos', M, y);
      secoesIndice.push({ titulo: 'Histórico de Status dos Pagamentos', pagina: doc.internal.getCurrentPageInfo().pageNumber });
      y += 6;
      doc.autoTable({
        head: [['Pagamento nº', 'Status', 'Quando']],
        body: historicoRows,
        startY: y,
        headStyles: { fillColor: GRAY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9, textColor: [51, 65, 85] },
        alternateRowStyles: { fillColor: [241, 245, 249] },
        margin: { left: M, right: M },
        theme: 'grid',
      });
      y = doc.lastAutoTable.finalY + 10;
    }
  }

  // Extratos
  if (fin.extratos && fin.extratos.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setTextColor(...NAVY);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Extrato Bancário Mensal', M, y);
    secoesIndice.push({ titulo: 'Extrato Bancário Mensal', pagina: doc.internal.getCurrentPageInfo().pageNumber });
    y += 6;

    const headers = [['Mês', 'Entradas', 'Saídas', 'Saldo do Mês']];
    const rows = fin.extratos.sort((a, b) => a.mes.localeCompare(b.mes)).map(e => [
      formatMes(e.mes), formatMoeda(e.entradas), formatMoeda(e.saidas), formatMoeda(e.entradas - e.saidas),
    ]);

    doc.autoTable({
      head: headers, body: rows, startY: y,
      headStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: [51, 65, 85] },
      alternateRowStyles: { fillColor: [241, 245, 249] },
      margin: { left: M, right: M },
      theme: 'grid',
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // Rendimentos
  if (fin.rendimentos && fin.rendimentos.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setTextColor(...NAVY);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Rendimentos', M, y);
    secoesIndice.push({ titulo: 'Rendimentos', pagina: doc.internal.getCurrentPageInfo().pageNumber });
    y += 6;

    const headers = [['Mês', 'Aplicado', 'Rendimento']];
    const rows = fin.rendimentos.sort((a, b) => a.mes.localeCompare(b.mes)).map(r => [
      formatMes(r.mes), formatMoeda(r.aplicado), formatMoeda(r.rendimento),
    ]);

    doc.autoTable({
      head: headers, body: rows, startY: y,
      headStyles: { fillColor: GREEN, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: [51, 65, 85] },
      alternateRowStyles: { fillColor: [241, 245, 249] },
      margin: { left: M, right: M },
      theme: 'grid',
    });
  }

  // ==================== PREENCHIMENTO DO SUMÁRIO ====================
  // Volta para a página reservada lá no início e escreve o índice, já
  // sabendo em que página cada seção efetivamente caiu.
  doc.setPage(paginaIndice);
  let ySum = 25;
  doc.setTextColor(...NAVY);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Sumário', M, ySum);
  ySum += 12;
  doc.setFontSize(10.5);
  if (secoesIndice.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRAY);
    doc.text('Este convênio não possui seções financeiras adicionais lançadas.', M, ySum);
  } else {
    secoesIndice.forEach(s => {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      const numPag = String(s.pagina);
      const larguraPag = doc.getTextWidth(numPag);
      const xTitulo = M;
      const xPag = W - M;
      doc.text(s.titulo, xTitulo, ySum);
      doc.setTextColor(...GRAY);
      doc.text(numPag, xPag, ySum, { align: 'right' });
      // Linha pontilhada entre o título e o número da página
      const xInicioPontos = xTitulo + doc.getTextWidth(s.titulo) + 2;
      const xFimPontos = xPag - larguraPag - 2;
      if (xFimPontos > xInicioPontos) {
        doc.setLineDashPattern([0.5, 1.2], 0);
        doc.setDrawColor(203, 213, 225);
        doc.line(xInicioPontos, ySum - 1, xFimPontos, ySum - 1);
        doc.setLineDashPattern([], 0);
      }
      ySum += 8;
    });
  }

  // Rodapé
  const usuarioEmissor = STATE.usuarios.find(u => u.id === STATE.usuarioSelecionadoId);
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text('CaptaGov — Relatório Financeiro — Página ' + i + ' de ' + totalPages, M, 290, { align: 'left' });
    doc.text('Gerado em ' + new Date().toLocaleDateString('pt-BR'), W - M, 290, { align: 'right' });
    if (usuarioEmissor) {
      doc.text('Emitido por: ' + usuarioEmissor.nome, M, 294);
    }
  }

  doc.save('relatorio-' + (c.numero || 'convenio') + '.pdf');
}

// ==================== EXPOSIÇÃO GLOBAL ====================
// O arquivo agora é um módulo ES (import/export), então funções não ficam
// automaticamente disponíveis em window como antes. O HTML é montado via
// template string com onclick="nomeDaFuncao(...)", então cada função
// chamada dessa forma precisa ser atribuída a window explicitamente.
Object.assign(window, {
  abrirAditivoAqui, abrirAditivoDireto, abrirPrestacaoContas, abrirTelaBackups, adicionarAditivo, adicionarContratada, adicionarDocExtra, anexarDocExtra,
  anexarDocPagamento, aprovarDocumentoSalvo, atualizarCamposAditivo, baixarDocumentoGerado, baixarDocumentoSalvo, cancelarEdicaoContratada,
  copiarDocumentoGerado, duplicarConvenio, editarContratada, editarConvenio,
  editarDocumentoSalvo, editarEmenda, editarInstituicao, editarProponente, editarResponsavelTecnico, editarUsuario,
  escapeHtml, excluirConvenio, excluirEmenda,
  excluirInstituicao, excluirProponente, excluirResponsavelTecnico, excluirUsuario, exportarAnexosZIP,
  exportarCSVFinanceiro, exportarDados, fecharDocumentoGerado, gerarDocumento,
  gerarPDFRelatorio, importarDados, lancarExtrato, lancarRendimento,
  mascararCEP, mascararCNPJ, mascararCPF, mascararValor, mudarSubView,
  mudarTipoEmenda, mudarView, novoConvenio, preencherComInstituicao, preencherComProponente,
  registrarPagamento,
  removerAditivo, removerAnexoExtrato, removerAnexoRendimento, removerContratada,
  removerDocExtra, removerDocPagamento, removerDocumentoSalvo, removerExtrato, removerPagamento,
  removerRendimento, renderTudo, renderBody, restaurarSnapshotAuto, excluirSnapshotAuto,
  reverterDocumentoSalvo, salvarConvenio, salvarDocumentoGerado, salvarEmenda, salvarInstituicao, salvarProponente,
  salvarResponsavelTecnico, salvarUsuario,
  preverBrasao, removerBrasao, salvarIdentidadeVisual, baixarDocumentoGeradoPDF, baixarDocumentoSalvoPDF,
  toggleAditivos, toggleExtratoAnexos, togglePagamentoDocs, togglePagamentoStatus,
  toggleRendimentoAnexos, updateSaldoPreview,
  // Expostos para a ponte React (ver contexts/AppContext.jsx) — telas ainda não
  // migradas continuam usando essas funções por baixo dos panos.
  STATE, calcularResumoFinanceiro, statusConvenio,
  fazerLogin, fazerLogout, algumUsuarioTemSenha, usuarioAtual, papelAtual, podeAdministrar, PAPEL_LABEL,
});

// Avisa a ponte React (se já estiver montada) que window.STATE já existe,
// mesmo que os dados ainda não tenham carregado do IndexedDB.
window.dispatchEvent(new CustomEvent('captagov:changed'));

// ==================== INICIALIZAÇÃO ====================
(async function iniciar() {
  try {
    await carregarEstado(); // já cuida de migrar dados de versões antigas, se existirem
    restaurarSessao(); // relogin automático se já havia sessão ativa nesta aba
  } catch (e) {
    console.error('Erro ao carregar dados salvos:', e);
    toastErro('Não consegui carregar os dados salvos localmente. Veja o console para detalhes.');
  }
  renderTudo();
  verificarBackupAutomatico();
})();
