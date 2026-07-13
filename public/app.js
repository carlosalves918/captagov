/* ============================================================
 * CAPTAGOV v2 — Aplicação Principal
 * Arquitetura: Single Responsibility, Estado Centralizado, Render Declarativo
 * Persistência: IndexedDB via Dexie.js
 * ============================================================ */

// ==================== ESTADO GLOBAL ====================
const STATE = {
  convenios: [],
  emendas: [],
  convenioAtualId: null,
  convenioEditandoId: null,
  emendaEditandoId: null,
  protocoloSeq: 0,
  view: 'painel',
  subView: 'contratadas',
  docSubView: 'justificativa',
  tipoInstrumento: 'convenio',
};

const STORAGE_KEY = 'captagov_v2';
let _saveTimer = null;

// ==================== BANCO DE DADOS (IndexedDB / Dexie) ====================
const db = new Dexie('captagov_db_v2');
db.version(1).stores({ estado: 'id' });

function persistirDebounce(payload) {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    db.estado.put({ id: STORAGE_KEY, payload }).catch(e => console.error('Erro IndexedDB:', e));
  }, 300);
}

function salvarEstado() {
  const payload = {
    convenios: STATE.convenios,
    emendas: STATE.emendas,
    convenioAtualId: STATE.convenioAtualId,
    protocoloSeq: STATE.protocoloSeq,
  };
  persistirDebounce(payload);
}

async function carregarEstado() {
  const registro = await db.estado.get(STORAGE_KEY);
  if (!registro) return;
  const p = registro.payload;
  STATE.convenios = p.convenios || [];
  STATE.emendas = p.emendas || [];
  STATE.convenioAtualId = p.convenioAtualId || null;
  STATE.protocoloSeq = p.protocoloSeq || 0;
}

// ==================== MIGRAÇÃO (v1/v2 localStorage → IndexedDB) ====================
async function migrarLocalStorage() {
  const jaMigrado = await db.estado.get(STORAGE_KEY);
  if (jaMigrado) return false;

  const rawV2 = localStorage.getItem(STORAGE_KEY);
  if (rawV2) {
    try {
      await db.estado.put({ id: STORAGE_KEY, payload: JSON.parse(rawV2) });
      localStorage.removeItem(STORAGE_KEY);
      return true;
    } catch (e) { console.error('Erro migração v2:', e); }
  }

  const rawV1 = localStorage.getItem('captagov_v1');
  if (rawV1) {
    try {
      const v1 = JSON.parse(rawV1);
      const convenios = (v1.convenios || []).map(c => ({
        ...c,
        documentos: {},
        documentosExtras: [],
        docsGeradosIA: [],
        financeiro: { extratos: [], rendimentos: [], autorizacoes: [], usos: [], contratadas: [], pagamentos: [] },
      }));
      await db.estado.put({ id: STORAGE_KEY, payload: { convenios, convenioAtualId: v1.convenioAtualId || null, protocoloSeq: v1.protocoloSeq || 0, emendas: [] } });
      localStorage.removeItem('captagov_v1');
      return true;
    } catch (e) { console.error('Erro migração v1:', e); }
  }
  return false;
}

// ==================== UTILIDADES ====================
function gerarId(prefixo) {
  return prefixo + '_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
}

function parseMoeda(v) {
  return parseFloat(String(v).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
}

function formatMoeda(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}

function formatMes(mes) {
  if (!mes) return '—';
  const [ano, m] = mes.split('-');
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return nomes[parseInt(m, 10) - 1] + '/' + ano;
}

function hojeFormatado() {
  return new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

// ==================== MÁSCARAS ====================
function mascararValor(e) {
  let d = e.value.replace(/\D/g, '');
  d = d.replace(/^0+(?=\d)/, '');
  while (d.length < 3) d = '0' + d;
  const cent = d.slice(-2);
  let int = d.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  e.value = int + ',' + cent;
}

function mascararCNPJ(e) {
  let v = e.value.replace(/\D/g, '').slice(0, 14);
  v = v.replace(/^(\d{2})(\d)/, '$1.$2');
  v = v.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
  v = v.replace(/\.(\d{3})(\d)/, '.$1/$2');
  v = v.replace(/(\d{4})(\d)/, '$1-$2');
  e.value = v;
}

function mascararCPF(e) {
  let v = e.value.replace(/\D/g, '').slice(0, 11);
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  e.value = v;
}

function mascararCEP(e) {
  let v = e.value.replace(/\D/g, '').slice(0, 8);
  v = v.replace(/(\d{5})(\d)/, '$1-$2');
  e.value = v;
}

// ==================== CÁLCULO FINANCEIRO ====================
function calcularResumoFinanceiro(id) {
  const c = STATE.convenios.find(x => x.id === id);
  if (!c) return null;
  if (!c.financeiro) c.financeiro = { extratos: [], rendimentos: [], autorizacoes: [], usos: [], contratadas: [], pagamentos: [] };
  const f = c.financeiro;
  const valor = parseMoeda(c.valor || '0');
  const totalEntradas = (f.extratos || []).reduce((a, e) => a + (e.entradas || 0), 0);
  const totalSaidas = (f.extratos || []).reduce((a, e) => a + (e.saidas || 0), 0);
  const movExtrato = totalEntradas - totalSaidas;
  const totalRendimento = (f.rendimentos || []).reduce((a, r) => a + (r.rendimento || 0), 0);
  const totalUsoRendimento = (f.usos || []).reduce((a, u) => a + (u.valor || 0), 0);
  const saldoRendimento = totalRendimento - totalUsoRendimento;
  const totalPago = (f.pagamentos || []).reduce((a, p) => a + (p.valor || 0), 0);
  const saldoTotal = valor + movExtrato + totalRendimento - totalUsoRendimento - totalPago;
  return { valor, totalEntradas, totalSaidas, movExtrato, totalRendimento, totalUsoRendimento, saldoRendimento, totalPago, saldoTotal, fin: f };
}

function calcularPrazoPC(dataFim, prazoDias) {
  if (!dataFim) return '—';
  const fim = new Date(dataFim + 'T00:00:00');
  const dias = parseInt(prazoDias || '60', 10);
  const limite = new Date(fim.getTime() + dias * 24 * 60 * 60 * 1000);
  return limite.toLocaleDateString('pt-BR');
}

function statusConvenio(c) {
  if (!c.prazoLimitePC || c.prazoLimitePC === '—') return { label: 'Sem prazo', cls: 'badge-info' };
  const [dia, mes, ano] = c.prazoLimitePC.split('/');
  if (!dia || !mes || !ano) return { label: 'Em execução', cls: 'badge-info' };
  const hoje = new Date();
  const limite = new Date(ano, mes - 1, dia);
  const diff = Math.floor((limite - hoje) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { label: 'PC vencida', cls: 'badge-danger' };
  if (diff <= 30) return { label: diff + 'd para PC', cls: 'badge-warn' };
  return { label: 'Em execução', cls: 'badge-ok' };
}

// ==================== NAVEGAÇÃO ====================
function mudarView(view) {
  STATE.view = view;
  if (view === 'prestacao') STATE.subView = 'contratadas';
  else if (view === 'documentos') STATE.docSubView = 'justificativa';
  else if (view === 'emendas') STATE.subView = 'lista';
  else if (view === 'relatorios') STATE.subView = 'contratadas';
  renderTudo();
}

function mudarSubView(sub) {
  STATE.subView = sub;
  renderTudo();
}

function mudarDocSubView(sub) {
  STATE.docSubView = sub;
  renderTudo();
}

// ==================== CRUD CONVÊNIOS ====================
const camposConvenio = [
  'c_numero', 'c_programa', 'c_orgao', 'c_esfera', 'c_natureza', 'c_proponente', 'c_cnpj',
  'c_cep', 'c_logradouro', 'c_bairro', 'c_municipio', 'c_telefone', 'c_email',
  'c_responsavel', 'c_cargo', 'c_resp_cpf', 'c_resp_tel', 'c_resp_email',
  'c_tec_nome', 'c_tec_reg', 'c_tec_tel', 'c_tec_email',
  'c_banco', 'c_conta', 'c_valor', 'c_contrapartida',
  'c_data_assinatura', 'c_data_inicio', 'c_data_fim', 'c_prazo_pc'
];

const obrigatorios = ['c_numero', 'c_proponente', 'c_valor', 'c_data_fim'];

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
  limparFormConvenio();
  mudarView('cadastro');
}

function editarConvenio(id) {
  const c = STATE.convenios.find(x => x.id === id);
  if (!c) return;
  STATE.convenioEditandoId = id;
  STATE.convenioAtualId = id;
  STATE.tipoInstrumento = c.tipo || 'convenio';
  setFormData({
    c_numero: c.numero, c_programa: c.programa, c_orgao: c.orgao,
    c_esfera: c.esfera, c_natureza: c.natureza, c_proponente: c.proponente,
    c_cnpj: c.cnpj, c_cep: c.cep, c_logradouro: c.logradouro,
    c_bairro: c.bairroProp, c_municipio: c.municipioProp,
    c_telefone: c.telefoneInst, c_email: c.emailInst,
    c_responsavel: c.responsavel, c_cargo: c.cargo,
    c_resp_cpf: c.responsavelCpf, c_resp_tel: c.responsavelTelefone,
    c_resp_email: c.responsavelEmail,
    c_tec_nome: c.tecnicoNome, c_tec_reg: c.tecnicoRegistro,
    c_tec_tel: c.tecnicoTelefone, c_tec_email: c.tecnicoEmail,
    c_banco: c.banco, c_conta: c.conta, c_valor: c.valor,
    c_contrapartida: c.contrapartida,
    c_data_assinatura: c.dataAssinatura, c_data_inicio: c.dataInicio,
    c_data_fim: c.dataFim, c_prazo_pc: c.prazoPC || '60',
  });
  salvarEstado();
  mudarView('cadastro');
}

function salvarConvenio() {
  const form = getFormData();
  const faltando = obrigatorios.filter(id => !form[id] || !form[id].trim());
  const nota = document.getElementById('savedNote');

  if (faltando.length) {
    nota.innerHTML = '<div class="alert alert-warning">Preencha os campos obrigatórios: ' + faltando.map(id => document.getElementById(id)?.closest('.form-group')?.querySelector('.form-label')?.textContent || id).join(', ') + '.</div>';
    return;
  }

  const dataInicio = form.c_data_inicio;
  const dataFim = form.c_data_fim;
  if (dataInicio && dataFim && new Date(dataFim) < new Date(dataInicio)) {
    nota.innerHTML = '<div class="alert alert-danger">A data de fim não pode ser anterior à data de início.</div>';
    return;
  }

  const prazoLimitePC = calcularPrazoPC(dataFim, form.c_prazo_pc);

  const dados = {
    tipo: STATE.tipoInstrumento,
    numero: form.c_numero, programa: form.c_programa, orgao: form.c_orgao,
    esfera: form.c_esfera, natureza: form.c_natureza, proponente: form.c_proponente,
    cnpj: form.c_cnpj, cep: form.c_cep, logradouro: form.c_logradouro,
    bairroProp: form.c_bairro, municipioProp: form.c_municipio,
    telefoneInst: form.c_telefone, emailInst: form.c_email,
    responsavel: form.c_responsavel, cargo: form.c_cargo,
    responsavelCpf: form.c_resp_cpf, responsavelTelefone: form.c_resp_tel,
    responsavelEmail: form.c_resp_email,
    tecnicoNome: form.c_tec_nome, tecnicoRegistro: form.c_tec_reg,
    tecnicoTelefone: form.c_tec_tel, tecnicoEmail: form.c_tec_email,
    banco: form.c_banco, conta: form.c_conta,
    valor: form.c_valor, contrapartida: form.c_contrapartida,
    dataAssinatura: form.c_data_assinatura, dataInicio, dataFim,
    prazoPC: form.c_prazo_pc, prazoLimitePC,
  };

  if (STATE.convenioEditandoId) {
    const idx = STATE.convenios.findIndex(c => c.id === STATE.convenioEditandoId);
    if (idx > -1) {
      STATE.convenios[idx] = {
        ...STATE.convenios[idx],
        ...dados,
      };
    }
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
  }

  salvarEstado();
  nota.innerHTML = '<div class="alert alert-success">Convênio salvo às ' + new Date().toLocaleTimeString('pt-BR') + '</div>';
  renderTudo();
}

function excluirConvenio(id) {
  const c = STATE.convenios.find(x => x.id === id);
  if (!c) return;
  if (!confirm('Excluir o convênio "' + (c.numero || 'sem número') + '"? Esta ação não pode ser desfeita.')) return;
  STATE.convenios = STATE.convenios.filter(x => x.id !== id);
  if (STATE.convenioAtualId === id) STATE.convenioAtualId = null;
  if (STATE.convenioEditandoId === id) STATE.convenioEditandoId = null;
  salvarEstado();
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
  salvarEstado();
  mudarView('painel');
}

function abrirPrestacaoContas(id) {
  STATE.convenioAtualId = id;
  STATE.subView = 'contratadas';
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
  ['em_parlamentar', 'em_partido', 'em_numero', 'em_ano', 'em_valor', 'em_orgao', 'em_objeto', 'em_situacao', 'em_obs'].forEach(k => {
    const el = document.getElementById(k);
    if (el) el.value = e[k.replace('em_', '')] || '';
  });
  const convSel = document.getElementById('em_convenio');
  if (convSel) convSel.value = e.convenioId || '';
  mudarView('emendas');
}

function salvarEmenda() {
  const parlamentar = (document.getElementById('em_parlamentar')?.value || '').trim();
  const numero = (document.getElementById('em_numero')?.value || '').trim();
  const valor = (document.getElementById('em_valor')?.value || '').trim();
  const nota = document.getElementById('emendaNote');

  if (!parlamentar || !numero || !valor) {
    nota.innerHTML = '<div class="alert alert-warning">Preencha Parlamentar, Número e Valor.</div>';
    return;
  }

  const dados = {
    parlamentar,
    partido: document.getElementById('em_partido')?.value || '',
    numero, ano: document.getElementById('em_ano')?.value || '',
    valor, orgao: document.getElementById('em_orgao')?.value || '',
    objeto: document.getElementById('em_objeto')?.value || '',
    situacao: document.getElementById('em_situacao')?.value || 'Indicada',
    convenioId: document.getElementById('em_convenio')?.value || null,
    obs: document.getElementById('em_obs')?.value || '',
  };

  if (STATE.emendaEditandoId) {
    const idx = STATE.emendas.findIndex(e => e.id === STATE.emendaEditandoId);
    if (idx > -1) STATE.emendas[idx] = { id: STATE.emendaEditandoId, ...dados };
  } else {
    STATE.emendas.push({ id: gerarId('em'), ...dados });
  }

  salvarEstado();
  limparFormEmenda();
  nota.innerHTML = '<div class="alert alert-success">Emenda salva às ' + new Date().toLocaleTimeString('pt-BR') + '</div>';
}

function excluirEmenda(id) {
  const e = STATE.emendas.find(x => x.id === id);
  if (!e) return;
  if (!confirm('Excluir a emenda de ' + (e.parlamentar || '?') + '?')) return;
  STATE.emendas = STATE.emendas.filter(x => x.id !== id);
  if (STATE.emendaEditandoId === id) {
    STATE.emendaEditandoId = null;
    limparFormEmenda();
  }
  salvarEstado();
}

// ==================== FINANCEIRO ====================
function adicionarContratada() {
  if (!STATE.convenioAtualId) return;
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;
  const nome = document.getElementById('ct_razao')?.value.trim();
  const cnpj = document.getElementById('ct_cnpj')?.value.trim();
  if (!nome) { alert('Informe a razão social.'); return; }
  c.financeiro.contratadas.push({
    id: gerarId('ct'), razaoSocial: nome, cnpj,
    numeroContrato: document.getElementById('ct_numero')?.value || '',
    valorContrato: document.getElementById('ct_valorContrato')?.value || '',
  });
  salvarEstado();
  document.getElementById('ct_razao').value = '';
  document.getElementById('ct_cnpj').value = '';
  document.getElementById('ct_numero').value = '';
  document.getElementById('ct_valorContrato').value = '';
  renderFinanceiro();
}

async function registrarPagamento() {
  if (!STATE.convenioAtualId) return;
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;
  const resumo = calcularResumoFinanceiro(c.id);
  const valor = parseMoeda(document.getElementById('pg_valor')?.value || '0');
  const saldoRestante = resumo.saldoTotal - valor;
  if (saldoRestante < -0.009) {
    alert('Saldo insuficiente para este pagamento. Saldo atual: ' + formatMoeda(resumo.saldoTotal));
    return;
  }

  const contratadaId = document.getElementById('pg_contratada')?.value || '';
  if (!contratadaId) { alert('Selecione a contratada.'); return; }

  const anexos = [];
  const fileInput = document.getElementById('pg_anexo');
  if (fileInput && fileInput.files && fileInput.files.length > 0) {
    for (let i = 0; i < fileInput.files.length; i++) {
      const file = fileInput.files[i];
      anexos.push({ nome: file.name, type: file.type, dataUrl: null });
      await lerArquivoComoDataUrl(file).then(dataUrl => {
        anexos[anexos.length - 1].dataUrl = dataUrl;
      });
    }
  }

  c.financeiro.pagamentos.push({
    id: gerarId('pg'), numero: c.financeiro.pagamentos.length + 1,
    contratadaId, valor, data: document.getElementById('pg_data')?.value || '',
    status: 'pendente',
    docs: docsVaziosPagamento(),
    anexos: anexos,
    obs: document.getElementById('pg_obs')?.value || '',
  });
  salvarEstado();
  renderFinanceiro();
}

// ==================== PAGAMENTOS - ANEXOS ====================
function togglePagamentoStatus(id) {
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
  salvarEstado();
  renderFinanceiro();
}

// ==================== PAGAMENTOS - CHECKLIST DE DOCUMENTOS ====================
function togglePagamentoDocs(pagamentoId) {
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
    togglePagamentoDocs(pagamentoId);
  };
  reader.onerror = function () {
    pg.docs[catId].anexado = true;
    pg.docs[catId].arquivo = file.name;
    pg.docs[catId].arquivoDataUrl = null;
    salvarEstado();
    togglePagamentoDocs(pagamentoId);
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
  togglePagamentoDocs(pagamentoId);
}

function togglePagamentoAnexos(pagamentoId) {
  const container = document.getElementById('pagamentoAnexosContainer');
  if (!container) return;
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;
  const pg = (c.financeiro.pagamentos || []).find(p => p.id === pagamentoId);
  if (!pg) return;
  const anexos = pg.anexos || [];
  if (anexos.length === 0) {
    container.innerHTML = '<div style="padding:12px 16px;color:var(--gray-500);">Nenhum anexo neste pagamento.</div>';
    return;
  }
  container.innerHTML = `
    <div style="margin-top:12px;padding:12px 16px;background:var(--gray-50);border:1px solid var(--gray-200);border-radius:var(--radius-sm);">
      <div style="font-size:13px;color:var(--gray-600);margin-bottom:8px;font-weight:600;">Anexos — Pagamento nº ${pg.numero}</div>
      ${anexos.map(a => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--gray-100);">
          <div style="font-size:13px;color:var(--gray-700);">📎 ${escapeHtml(a.nome)} <span style="color:var(--gray-400);font-size:12px;">${escapeHtml(a.type || '')}</span></div>
          <div style="display:flex;gap:6px;">
            ${a.dataUrl ? `<a href="${a.dataUrl}" download="${escapeHtml(a.nome)}" class="btn btn-ghost btn-sm">⬇ Baixar</a>` : ''}
            <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="removerAnexoPagamento('${pg.id}','${escapeHtml(a.nome)}')">✕</button>
          </div>
        </div>
      `).join('')}
    </div>`;
}

function removerAnexoPagamento(pagamentoId, nome) {
  if (!STATE.convenioAtualId) return;
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;
  const pg = (c.financeiro.pagamentos || []).find(p => p.id === pagamentoId);
  if (!pg || !pg.anexos) return;
  pg.anexos = pg.anexos.filter(a => a.nome !== nome);
  salvarEstado();
  renderFinanceiro();
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
  const nome = document.getElementById('docExtraNome')?.value.trim();
  if (!nome) { alert('Dê um nome ao documento.'); return; }
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;
  if (!c.documentosExtras) c.documentosExtras = [];
  c.documentosExtras.push({ id: gerarId('dx'), nome, anexado: false, arquivo: null, arquivoDataUrl: null });
  salvarEstado();
  document.getElementById('docExtraNome').value = '';
  renderDocs();
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
    salvarEstado();
    renderDocs();
  };
  reader.readAsDataURL(file);
}

function removerDocExtra(id) {
  if (!STATE.convenioAtualId) return;
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c || !c.documentosExtras) return;
  c.documentosExtras = c.documentosExtras.filter(x => x.id !== id);
  salvarEstado();
  renderDocs();
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
];

// ==================== RELATÓRIOS ====================
function exportarCSVFinanceiro() {
  if (!STATE.convenioAtualId) { alert('Selecione um convênio.'); return; }
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;
  const fin = c.financeiro;
  const linhas = [['tipo', 'data', 'campo1', 'campo2', 'observação']];
  (fin.contratadas || []).forEach(ct => linhas.push(['contratada', ct.numeroContrato, ct.valorContrato, '', ct.razaoSocial]));
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
    versao: 2,
    exportadoEm: new Date().toISOString(),
    convenios: STATE.convenios,
    convenioAtualId: STATE.convenioAtualId,
    protocoloSeq: STATE.protocoloSeq,
    emendas: STATE.emendas,
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
  if (!STATE.convenioAtualId) { alert('Selecione um convênio.'); return; }
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;

  if (typeof JSZip === 'undefined') { alert('Biblioteca JSZip não carregada. Recarregue a página.'); return; }

  const zip = new JSZip();
  const pastaBase = zip.folder('anexos-' + (c.numero || 'convenio'));
  const pastaPagamentos = pastaBase.folder('pagamentos');
  const pastaExtratos = pastaBase.folder('extratos');
  const pastaRendimentos = pastaBase.folder('rendimentos');
  const pastaDocumentos = pastaBase.folder('documentos');

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

  // Documentos extras
  (c.documentosExtras || []).forEach(doc => {
    if (doc.arquivoDataUrl) {
      const base64 = doc.arquivoDataUrl.split(',')[1];
      pastaDocumentos.file(doc.arquivo || doc.nome, base64, { base64: true });
      count++;
    }
  });

  if (count === 0) { alert('Nenhum anexo encontrado para exportar.'); return; }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'anexos-' + (c.numero || 'convenio') + '.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  alert(`${count} arquivo(s) exportados com sucesso!`);
}

// ==================== IMPORTAR DADOS ====================
function importarDados(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function () {
    let payload;
    try { payload = JSON.parse(reader.result); } catch { alert('Arquivo inválido.'); return; }
    if (!payload || !Array.isArray(payload.convenios)) { alert('Não é um backup CaptaGov.'); return; }
    if (!confirm('Substituir todos os dados (' + STATE.convenios.length + ' convênio(s))?')) return;
    STATE.convenios = payload.convenios || [];
    STATE.convenioAtualId = payload.convenioAtualId || null;
    STATE.protocoloSeq = payload.protocoloSeq || 0;
    STATE.emendas = payload.emendas || [];
    STATE.convenios.forEach(c => {
      if (!c.financeiro) c.financeiro = { extratos: [], rendimentos: [], autorizacoes: [], usos: [], contratadas: [], pagamentos: [] };
      if (!c.documentosExtras) c.documentosExtras = [];
      if (!c.docsGeradosIA) c.docsGeradosIA = [];
    });
    salvarEstado();
    renderTudo();
    alert('Backup importado com sucesso.');
  };
  reader.readAsText(file);
}

// ==================== RENDERIZAÇÃO ====================
function renderTudo() {
  renderSidebar();
  renderHeader();
  renderBody();
}

function renderSidebar() {
  const el = document.getElementById('sidebar');
  if (!el) return;
  const items = [
    { id: 'painel', icon: '📊', label: 'Painel Geral' },
    { id: 'cadastro', icon: '📝', label: 'Cadastro' },
    { id: 'prestacao', icon: '📋', label: 'Prestação de Contas' },
    { id: 'documentos', icon: '📁', label: 'Gestão de Documentos' },
    { id: 'relatorios', icon: '📈', label: 'Relatórios' },
    { id: 'emendas', icon: '🏛️', label: 'Emendas Parlamentares' },
  ];
  el.innerHTML = `
    <div class="sidebar-header">
      <div class="sidebar-logo">
        <img src="/logo.png" alt="CaptaGov" class="sidebar-logo-img" />
      </div>
    </div>
    <nav class="sidebar-nav">
      ${items.map(i => `
        <button class="sidebar-nav-item ${STATE.view === i.id ? 'active' : ''}" onclick="mudarView('${i.id}')">
          <span class="icon">${i.icon}</span>
          <span>${i.label}</span>
        </button>
      `).join('')}
    </nav>
    <div class="sidebar-footer">
      <div style="margin-bottom:8px;">
        <button class="btn btn-secondary btn-sm" style="width:100%;margin-bottom:6px;" onclick="exportarDados()">⬇ Exportar Backup (JSON)</button>
        <button class="btn btn-secondary btn-sm" style="width:100%;margin-bottom:6px;" onclick="exportarAnexosZIP()">📦 Exportar Anexos (ZIP)</button>
        <label class="btn btn-secondary btn-sm" style="width:100%;display:block;text-align:center;">
          ⬆ Importar Backup
          <input type="file" accept=".json" style="display:none" onchange="importarDados(this.files[0])" />
        </label>
      </div>
      <div>CaptaGov v2.1 — Dados locais</div>
    </div>
  `;
}

function renderHeader() {
  const el = document.getElementById('mainHeader');
  if (!el) return;
  const nomesAbas = {
    painel: 'Painel Geral', cadastro: 'Cadastro', prestacao: 'Prestação de Contas',
    documentos: 'Gestão de Documentos', relatorios: 'Relatórios', emendas: 'Emendas Parlamentares',
  };
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  el.innerHTML = `
    <div class="main-header-left">
      <div>
        <div class="main-header-title">${nomesAbas[STATE.view] || STATE.view}</div>
        ${c ? '<div class="main-header-breadcrumb">Convênio: ' + escapeHtml(c.numero || 'sem número') + ' — ' + escapeHtml(c.programa || '') + '</div>' : ''}
      </div>
    </div>
    <div class="main-header-date">${hojeFormatado()}</div>
  `;
}

function renderBody() {
  const el = document.getElementById('mainBody');
  if (!el) return;
  switch (STATE.view) {
    case 'painel': el.innerHTML = renderPainel(); break;
    case 'cadastro': el.innerHTML = renderCadastro(); break;
    case 'prestacao': el.innerHTML = renderPrestacaoContas(); break;
    case 'documentos': el.innerHTML = renderGestaoDocumentos(); break;
    case 'relatorios': el.innerHTML = renderRelatorios(); break;
    case 'emendas': el.innerHTML = renderEmendas(); break;
    default: el.innerHTML = '<div class="empty-state"><div class="empty-state-title">Página em desenvolvimento</div></div>';
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
      (c.proponente || '').toLowerCase().includes(termo))
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
            <div class="convenio-card-sub">${escapeHtml(c.proponente || 'Proponente não informado')}</div>
          </div>
          <div class="convenio-card-right">
            <span class="font-mono" style="font-size:14px;">R$ ${escapeHtml(c.valor || '0,00')}</span>
            <span class="font-mono" style="font-size:14px;">Saldo: <strong class="${saldoClass}">${saldo}</strong></span>
            <span class="badge ${st.cls}">${st.label}</span>
            <button class="btn btn-ghost btn-sm" onclick="editarConvenio('${c.id}')">Abrir</button>
            <button class="btn btn-ghost btn-sm" onclick="abrirPrestacaoContas('${c.id}')">📂 PC</button>
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

      <div id="savedNote"></div>

      <div class="form-grid">
        <div class="form-section-title">📌 Identificação do ${ehConvenio ? 'Convênio' : 'Projeto'}</div>
        <div class="form-group">
          <label class="form-label">Número / Identificação <span class="required">*</span></label>
          <input class="form-input" type="text" id="c_numero" />
        </div>
        <div class="form-group">
          <label class="form-label">Programa</label>
          <input class="form-input" type="text" id="c_programa" placeholder="Ex: Programa de Aceleração do Crescimento" />
        </div>
        ${ehConvenio ? `
        <div class="form-group">
          <label class="form-label">Órgão Concedente</label>
          <input class="form-input" type="text" id="c_orgao" />
        </div>
        <div class="form-group">
          <label class="form-label">Esfera</label>
          <select class="form-input form-select" id="c_esfera">
            <option>Federal</option><option>Estadual</option><option>Municipal</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Natureza Jurídica</label>
          <select class="form-input form-select" id="c_natureza">
            <option>Prefeitura Municipal</option><option>Autarquia</option><option>Fundação</option><option>Outros</option>
          </select>
        </div>
        ` : ''}

        <div class="form-section-title">🏢 Dados do Proponente</div>
        <div class="form-group">
          <label class="form-label">Nome / Razão Social <span class="required">*</span></label>
          <input class="form-input" type="text" id="c_proponente" />
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

        <div class="form-section-title">👤 Responsável</div>
        <div class="form-group">
          <label class="form-label">Nome</label>
          <input class="form-input" type="text" id="c_responsavel" />
        </div>
        <div class="form-group">
          <label class="form-label">Cargo</label>
          <input class="form-input" type="text" id="c_cargo" placeholder="Prefeito(a) Municipal" />
        </div>
        <div class="form-group">
          <label class="form-label">CPF</label>
          <input class="form-input" type="text" id="c_resp_cpf" maxlength="14" oninput="mascararCPF(this)" placeholder="000.000.000-00" />
        </div>
        <div class="form-group">
          <label class="form-label">Telefone</label>
          <input class="form-input" type="text" id="c_resp_tel" />
        </div>
        <div class="form-group">
          <label class="form-label">E-mail</label>
          <input class="form-input" type="email" id="c_resp_email" />
        </div>

        <div class="form-section-title">🔧 Técnico Responsável</div>
        <div class="form-group">
          <label class="form-label">Nome</label>
          <input class="form-input" type="text" id="c_tec_nome" />
        </div>
        <div class="form-group">
          <label class="form-label">Registro Profissional</label>
          <input class="form-input" type="text" id="c_tec_reg" />
        </div>
        <div class="form-group">
          <label class="form-label">Telefone</label>
          <input class="form-input" type="text" id="c_tec_tel" />
        </div>
        <div class="form-group">
          <label class="form-label">E-mail</label>
          <input class="form-input" type="email" id="c_tec_email" />
        </div>

        <div class="form-section-title">💰 Dados Financeiros</div>
        <div class="form-group">
          <label class="form-label">Banco</label>
          <input class="form-input" type="text" id="c_banco" />
        </div>
        <div class="form-group">
          <label class="form-label">Conta</label>
          <input class="form-input" type="text" id="c_conta" />
        </div>
        <div class="form-group">
          <label class="form-label">Valor Total (R$) <span class="required">*</span></label>
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
        <div class="form-group">
          <label class="form-label">Data de Início</label>
          <input class="form-input" type="date" id="c_data_inicio" />
        </div>
        <div class="form-group">
          <label class="form-label">Data de Fim <span class="required">*</span></label>
          <input class="form-input" type="date" id="c_data_fim" />
        </div>
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

  const resumo = calcularResumoFinanceiro(c.id);
  const subTabs = [
    { id: 'contratadas', label: 'Contratadas' },
    { id: 'pagamentos', label: 'Pagamentos' },
    { id: 'extratos', label: 'Extratos' },
    { id: 'rendimentos', label: 'Rendimentos' },
    { id: 'docs', label: 'Documentos' },
  ];

  return `
    <div class="card mb-6">
      <div class="card-title" style="margin-bottom:16px;">${escapeHtml(c.numero || 'sem número')} — ${escapeHtml(c.programa || '')}</div>
      <div class="fin-summary-grid">
        <div class="fin-summary-card">
          <div class="fin-summary-label">Valor do Convênio</div>
          <div class="fin-summary-value neutral">${formatMoeda(resumo.valor)}</div>
        </div>
        <div class="fin-summary-card">
          <div class="fin-summary-label">Movimento Extrato</div>
          <div class="fin-summary-value ${resumo.movExtrato >= 0 ? 'positive' : 'negative'}">${formatMoeda(resumo.movExtrato)}</div>
        </div>
        <div class="fin-summary-card">
          <div class="fin-summary-label">Total Pago</div>
          <div class="fin-summary-value negative">${formatMoeda(resumo.totalPago)}</div>
        </div>
        <div class="fin-summary-card">
          <div class="fin-summary-label">Saldo Total</div>
          <div class="fin-summary-value ${resumo.saldoTotal >= 0 ? 'positive' : 'negative'}">${formatMoeda(resumo.saldoTotal)}</div>
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
  return `
    <div style="margin-bottom:20px;">
      <div class="card-title" style="font-size:16px;">Adicionar Contratada</div>
      <div class="card-subtitle">Cadastre empresas contratadas para vincular pagamentos.</div>
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:12px;align-items:end;margin-top:12px;">
        <div class="form-group"><label class="form-label">Razão Social <span class="required">*</span></label><input class="form-input" id="ct_razao" /></div>
        <div class="form-group"><label class="form-label">CNPJ</label><input class="form-input" id="ct_cnpj" maxlength="18" oninput="mascararCNPJ(this)" /></div>
        <div class="form-group"><label class="form-label">Nº Contrato</label><input class="form-input" id="ct_numero" /></div>
        <div class="form-group"><label class="form-label">Valor Contrato</label><input class="form-input" id="ct_valorContrato" oninput="mascararValor(this)" inputmode="numeric" /></div>
        <button class="btn btn-primary" style="height:42px;" onclick="adicionarContratada()">+ Adicionar</button>
      </div>
    </div>
    ${fin.contratadas && fin.contratadas.length > 0 ? `
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Razão Social</th><th>CNPJ</th><th>Nº Contrato</th><th>Valor</th><th></th></tr></thead>
          <tbody>
            ${fin.contratadas.map(ct => `
              <tr>
                <td><strong>${escapeHtml(ct.razaoSocial)}</strong></td>
                <td>${escapeHtml(ct.cnpj || '—')}</td>
                <td>${escapeHtml(ct.numeroContrato || '—')}</td>
                <td class="font-mono">${formatMoeda(parseMoeda(ct.valorContrato || '0'))}</td>
                <td><button class="btn btn-ghost btn-sm" onclick="removerContratada('${ct.id}')">Remover</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : '<div class="empty-state text-sm" style="padding:30px;">Nenhuma contratada cadastrada.</div>'}
  `;
}

function renderPagamentos(c, resumo) {
  const fin = c.financeiro;
  const contratadas = fin.contratadas || [];
  return `
    <div style="margin-bottom:20px;">
      <div class="card-title" style="font-size:16px;">Registrar Pagamento</div>
      <div class="card-subtitle">Saldo disponível: <strong style="color:${resumo.saldoTotal >= 0 ? 'var(--green-600)' : 'var(--danger)'}">${formatMoeda(resumo.saldoTotal)}</strong></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto;gap:12px;align-items:end;margin-top:12px;">
        <div class="form-group"><label class="form-label">Contratada <span class="required">*</span></label>
          <select class="form-input form-select" id="pg_contratada">
            <option value="">Selecione...</option>
            ${contratadas.map(ct => `<option value="${ct.id}">${escapeHtml(ct.razaoSocial)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">Data</label><input class="form-input" type="date" id="pg_data" /></div>
        <div class="form-group"><label class="form-label">Valor (R$) <span class="required">*</span></label><input class="form-input" id="pg_valor" oninput="mascararValor(this);updateSaldoPreview()" inputmode="numeric" /></div>
        <div class="form-group"><label class="form-label">Obs</label><input class="form-input" id="pg_obs" /></div>
        <div class="form-group"><label class="form-label">Anexos</label><input class="form-input" type="file" id="pg_anexo" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xml,.zip" /></div>
        <button class="btn btn-primary" style="height:42px;" onclick="registrarPagamento()">+ Registrar</button>
      </div>
    </div>
    ${fin.pagamentos && fin.pagamentos.length > 0 ? `
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Nº</th><th>Contratada</th><th>Data</th><th>Valor</th><th>Status</th><th>Anexos</th><th>Checklist Docs</th><th></th></tr></thead>
          <tbody>
            ${fin.pagamentos.map(p => {
              const ct = contratadas.find(x => x.id === p.contratadaId);
              const anexosCount = (p.anexos || []).length;
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
                  ${anexosCount > 0
                    ? `<span style="color:var(--gray-500);font-size:13px;">📎 ${anexosCount}</span>
                    <button class="btn btn-ghost btn-sm" onclick="togglePagamentoAnexos('${p.id}')" title="Ver anexos">👁️</button>`
                    : '<span style="color:var(--gray-400);font-size:13px;">—</span>'}
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
      <div id="pagamentoAnexosContainer"></div>
      <div id="pagamentoDocsContainer"></div>
    ` : '<div class="empty-state text-sm" style="padding:30px;">Nenhum pagamento registrado.</div>'}
  `;
}

function renderExtratos(c) {
  const fin = c.financeiro;
  return `
    <div style="margin-bottom:20px;">
      <div class="card-title" style="font-size:16px;">Lançar Extrato Mensal</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr auto;gap:12px;align-items:end;margin-top:12px;">
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
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr auto;gap:12px;align-items:end;margin-top:12px;">
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
  const subTabs = [
    { id: 'justificativa', label: 'Justificativa Técnica' },
    { id: 'ia', label: 'Documentos por IA' },
  ];
  return `
    <div class="subtabs">
      ${subTabs.map(t => `<button class="subtab ${STATE.docSubView === t.id ? 'active' : ''}" onclick="mudarDocSubView('${t.id}')">${t.label}</button>`).join('')}
    </div>
    <div class="card">
      ${STATE.docSubView === 'justificativa' ? renderJustificativa() : renderDocsIA()}
    </div>
  `;
}

function renderJustificativa() {
  return `
    <div class="card-title" style="font-size:16px;">Gerador de Justificativa Técnica</div>
    <div class="card-subtitle">Preencha os campos abaixo. O texto será gerado localmente a partir dos dados do convênio ativo.</div>
    <div class="form-grid" style="margin-top:16px;">
      <div class="form-group"><label class="form-label">Município</label><input class="form-input" id="doc_municipio" /></div>
      <div class="form-group"><label class="form-label">Fonte de Recurso</label>
        <select class="form-input form-select" id="doc_fonte">
          <option>FNDE</option><option>SUDENE</option><option>COMPESA</option><option>SEDUH/PE</option><option>PROMAQ</option>
        </select>
      </div>
      <div class="form-group full-width"><label class="form-label">Objeto do Projeto</label><input class="form-input" id="doc_objeto" /></div>
      <div class="form-group"><label class="form-label">Valor (R$)</label><input class="form-input" id="doc_valor" oninput="mascararValor(this)" inputmode="numeric" /></div>
      <div class="form-group"><label class="form-label">Bairro / Localidade</label><input class="form-input" id="doc_bairro" /></div>
      <div class="form-group full-width"><label class="form-label">Situação Atual x Desejada</label><textarea class="form-input" id="doc_situacao" rows="4" style="resize:vertical;" placeholder="Ex: A escola X possui 300 alunos em sala superlotada x sala com 25 alunos por turma"></textarea></div>
    </div>
    <div style="margin-top:16px;display:flex;gap:12px;">
      <button class="btn btn-primary btn-lg" onclick="gerarJustificativa()">📄 Gerar Documento</button>
      <button class="btn btn-secondary btn-lg" onclick="preencherDoConvenio()">🔄 Preencher do Convênio</button>
    </div>
    <div id="docResult" style="margin-top:20px;"></div>
  `;
}

function gerarJustificativa() {
  const dados = {
    municipio: document.getElementById('doc_municipio')?.value || '',
    fonte: document.getElementById('doc_fonte')?.value || 'FNDE',
    objeto: document.getElementById('doc_objeto')?.value || '',
    valor: document.getElementById('doc_valor')?.value || '',
    bairro: document.getElementById('doc_bairro')?.value || '',
    situacao: document.getElementById('doc_situacao')?.value || '',
  };
  if (!dados.municipio || !dados.objeto || !dados.situacao) {
    document.getElementById('docResult').innerHTML = '<div class="alert alert-warning">Preencha Município, Objeto e Situação.</div>';
    return;
  }

  const [atual, desejada] = dados.situacao.split(/\s+(?:x|vs\.?|→|->)\s+|\n/i).map(s => s.trim()).filter(Boolean);
  const situacaoAtual = atual || 'não detalhada';
  const situacaoDesejada = desejada || '';
  const d = { ...dados, situacaoAtual, situacaoDesejada };

  const contextualizacoes = {
    FNDE: `O Município de ${d.municipio} apresenta demanda por ${d.objeto.toLowerCase()}, em conformidade com as diretrizes do Fundo Nacional de Desenvolvimento da Educação (FNDE).`,
    SUDENE: `O Município de ${d.municipio}, integrante da área de atuação da SUDENE, identifica a necessidade de ${d.objeto.toLowerCase()} como medida estruturante para o desenvolvimento regional.`,
    COMPESA: `O Município de ${d.municipio} apresenta demanda por ${d.objeto.toLowerCase()}, no âmbito da infraestrutura de saneamento básico, em parceria com a COMPESA.`,
    'SEDUH/PE': `O Município de ${d.municipio} apresenta demanda de infraestrutura urbana, alinhada às diretrizes da SEDUH/PE.`,
    PROMAQ: `O Município de ${d.municipio} apresenta demanda por ${d.objeto.toLowerCase()}, no âmbito do Programa de Modernização de Máquinas e Equipamentos (PROMAQ).`,
  };

  const local = d.bairro ? ` na localidade de ${d.bairro}` : '';
  const valorTxt = d.valor ? `, no valor total de R$ ${d.valor}` : '';

  const texto = [
    (contextualizacoes[d.fonte] || contextualizacoes.FNDE),
    `Atualmente${local}, verifica-se a seguinte situação: ${situacaoAtual}. Essa condição demanda intervenção técnica planejada.`,
    `Para equacionar o problema, propõe-se a execução de ${d.objeto.toLowerCase()}${valorTxt}, com recursos oriundos de ${d.fonte}.`,
    `Espera-se, com a execução do objeto, a melhoria efetiva das condições atualmente enfrentadas, com benefício direto à população do Município de ${d.municipio}.${situacaoDesejada ? ' A situação desejada: ' + situacaoDesejada + '.' : ''}`,
  ].join('\n\n');

  document.getElementById('docResult').innerHTML = `
    <div style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:var(--radius-md);padding:20px;">
      <div style="font-size:12px;color:var(--gray-500);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Justificativa Técnica Gerada</div>
      <div style="font-size:15px;line-height:1.8;color:var(--gray-800);white-space:pre-wrap;">${escapeHtml(texto)}</div>
      <div style="margin-top:16px;display:flex;gap:8px;">
        <button class="btn btn-secondary btn-sm" onclick="copiarTexto(this)">📋 Copiar Texto</button>
      </div>
    </div>
  `;
}

function copiarTexto(btn) {
  const textEl = btn.closest('div').previousElementSibling;
  navigator.clipboard.writeText(textEl.textContent).then(() => {
    btn.textContent = '✓ Copiado!';
    setTimeout(() => { btn.textContent = '📋 Copiar Texto'; }, 2000);
  });
}

function preencherDoConvenio() {
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) { alert('Selecione um convênio no Painel Geral.'); return; }
  const mun = (c.municipioProp || '').split('/')[0].trim() || '';
  const programa = (c.programa || '').toUpperCase();
  let fonte = 'FNDE';
  if (programa.includes('SUDENE')) fonte = 'SUDENE';
  else if (programa.includes('COMPESA')) fonte = 'COMPESA';
  else if (programa.includes('SEDUH')) fonte = 'SEDUH/PE';
  else if (programa.includes('PROMAQ')) fonte = 'PROMAQ';

  ['doc_municipio', 'doc_fonte', 'doc_objeto', 'doc_valor', 'doc_bairro'].forEach((id, i) => {
    const vals = [mun, fonte, c.programa || '', c.valor || '', c.bairroProp || ''];
    const el = document.getElementById(id);
    if (el) el.value = vals[i];
  });
  document.getElementById('docResult').innerHTML = '<div class="alert alert-success">Campos preenchidos a partir do convênio ativo. Revise antes de gerar.</div>';
}

// ==================== DOCUMENTOS POR IA (placeholder) ====================
function renderDocsIA() {
  return `
    <div class="card-title" style="font-size:16px;">Documentos por IA</div>
    <div class="card-subtitle">Selecione o tipo de documento. A geração será simulada localmente neste protótipo.</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-top:16px;">
      ${TIPOS_DOC_IA.map(t => `
        <div style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:var(--radius-md);padding:16px;cursor:pointer;" onclick="alert('Em breve: geração real via API de IA. Atualmente simulado.')">
          <div style="font-size:24px;margin-bottom:8px;">📄</div>
          <div style="font-weight:600;font-size:14px;color:var(--navy-900);">${t.nome}</div>
          <div style="font-size:12px;color:var(--gray-500);margin-top:4px;">${t.desc}</div>
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
      <div class="form-group" style="flex:1;"><label class="form-label">Nome do Documento</label><input class="form-input" id="docExtraNome" /></div>
      <button class="btn btn-primary" style="height:42px;" onclick="adicionarDocExtra()">+ Adicionar</button>
    </div>
    ${extras.length === 0
    ? '<div class="empty-state text-sm" style="padding:30px;">Nenhum documento anexado.</div>'
    : extras.map(doc => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--gray-50);border:1px solid var(--gray-200);border-radius:var(--radius-sm);margin-bottom:8px;">
        <div>
          <div style="font-weight:500;font-size:14px;">${escapeHtml(doc.nome)}</div>
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
    </div>

    ${!c ? '<div class="empty-state"><div class="empty-state-icon">📈</div><div class="empty-state-title">Selecione um convênio</div><div class="empty-state-text">Escolha um convênio acima para visualizar os relatórios.</div></div>' : `
      ${renderRelatorioFinanceiro(c)}
    `}

    <div class="card mt-6">
      <div class="card-title" style="font-size:16px;">Relatório Geral — Todos os Convênios</div>
      <div class="table-wrapper" style="margin-top:16px;">
        <table>
          <thead><tr><th>Convênio</th><th>Programa</th><th>Proponente</th><th>Valor</th><th>Saldo</th><th>PC até</th></tr></thead>
          <tbody>
            ${STATE.convenios.map(cv => {
              const res = calcularResumoFinanceiro(cv.id);
              const saldoClass = res && res.saldoTotal < 0 ? 'negative' : 'positive';
              return `<tr>
                <td><strong>${escapeHtml(cv.numero || '?')}</strong></td>
                <td>${escapeHtml(cv.programa || '—')}</td>
                <td>${escapeHtml(cv.proponente || '—')}</td>
                <td class="font-mono">${formatMoeda(res ? res.valor : 0)}</td>
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
      <div class="card-subtitle">Proponente: ${escapeHtml(c.proponente || '?')} · Valor: ${formatMoeda(resumo.valor)}</div>

      <div class="fin-summary-grid">
        <div class="fin-summary-card"><div class="fin-summary-label">Movimento Extrato</div><div class="fin-summary-value ${resumo.movExtrato >= 0 ? 'positive' : 'negative'}">${formatMoeda(resumo.movExtrato)}</div></div>
        <div class="fin-summary-card"><div class="fin-summary-label">Rendimento</div><div class="fin-summary-value">${formatMoeda(resumo.totalRendimento)}</div></div>
        <div class="fin-summary-card"><div class="fin-summary-label">Total Pago</div><div class="fin-summary-value negative">${formatMoeda(resumo.totalPago)}</div></div>
        <div class="fin-summary-card"><div class="fin-summary-label">Saldo Total</div><div class="fin-summary-value ${resumo.saldoTotal >= 0 ? 'positive' : 'negative'}">${formatMoeda(resumo.saldoTotal)}</div></div>
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
      const situacaoClass = e.situacao === 'Paga' || e.situacao === 'Conveniada' ? 'badge-ok' : e.situacao === 'Empenhada' ? 'badge-warn' : 'badge-info';
      return `
        <div class="convenio-card" style="margin-bottom:8px;">
          <div>
            <div class="convenio-card-title">${escapeHtml(e.parlamentar || '?')} <span style="color:var(--gray-400);font-weight:400;">— nº ${escapeHtml(e.numero || '?')}${e.ano ? '/' + escapeHtml(e.ano) : ''}</span></div>
            <div class="convenio-card-sub">${escapeHtml(e.objeto || 'Objeto não informado')}${e.orgao ? ' · ' + escapeHtml(e.orgao) : ''}</div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <span class="font-mono" style="font-size:14px;">R$ ${escapeHtml(e.valor || '0,00')}</span>
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

function renderEmendaForm() {
  return `
    <div class="card-title" style="font-size:16px;">${STATE.emendaEditandoId ? 'Editar' : 'Nova'} Emenda Parlamentar</div>
    <div id="emendaNote"></div>
    <div class="form-grid" style="margin-top:16px;">
      <div class="form-group"><label class="form-label">Parlamentar <span class="required">*</span></label><input class="form-input" id="em_parlamentar" /></div>
      <div class="form-group"><label class="form-label">Partido</label><input class="form-input" id="em_partido" /></div>
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
      <div class="form-group">
        <label class="form-label">Vincular a Convênio</label>
        <select class="form-input form-select" id="em_convenio">
          <option value="">— nenhum —</option>
          ${STATE.convenios.map(cv => `<option value="${cv.id}">${escapeHtml(cv.numero || '?')} — ${escapeHtml(cv.programa || '')}</option>`).join('')}
        </select>
      </div>
      <div class="form-group full-width"><label class="form-label">Observações</label><input class="form-input" id="em_obs" /></div>
    </div>
    <div style="margin-top:16px;display:flex;gap:12px;">
      <button class="btn btn-primary btn-lg" onclick="salvarEmenda()">💾 Salvar Emenda</button>
      <button class="btn btn-secondary btn-lg" onclick="mudarSubView('lista')">Cancelar</button>
    </div>
  `;
}

function limparFormEmenda() {
  ['em_parlamentar', 'em_partido', 'em_numero', 'em_ano', 'em_valor', 'em_orgao', 'em_objeto', 'em_obs'].forEach(k => {
    const el = document.getElementById(k);
    if (el) el.value = '';
  });
  const sel = document.getElementById('em_situacao');
  if (sel) sel.value = 'Indicada';
}

function limparFormConvenio() {
  camposConvenio.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('c_esfera').value = 'Federal';
  document.getElementById('c_natureza').value = 'Prefeitura Municipal';
  document.getElementById('c_cargo').value = 'Prefeito(a) Municipal';
  document.getElementById('c_prazo_pc').value = '60';
}

// ==================== REMOÇÕES ====================
function removerContratada(id) {
  if (!STATE.convenioAtualId) return;
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;
  if (!confirm('Remover esta contratada?')) return;
  c.financeiro.contratadas = (c.financeiro.contratadas || []).filter(x => x.id !== id);
  salvarEstado();
  renderTudo();
}

function removerPagamento(id) {
  if (!STATE.convenioAtualId) return;
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;
  if (!confirm('Remover este pagamento?')) return;
  c.financeiro.pagamentos = (c.financeiro.pagamentos || []).filter(x => x.id !== id);
  salvarEstado();
  renderTudo();
}

function removerExtrato(id) {
  if (!STATE.convenioAtualId) return;
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) return;
  if (!confirm('Remover este lançamento?')) return;
  c.financeiro.extratos = (c.financeiro.extratos || []).filter(x => x.id !== id);
  salvarEstado();
  renderTudo();
}

function removerRendimento(id) {
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
  const saldo = resumo.saldoTotal - valorPgto;
  const el = document.getElementById('saldoPreview');
  if (el) {
    el.textContent = formatMoeda(saldo);
    el.style.color = saldo < 0 ? 'var(--danger)' : 'var(--green-600)';
  }
}

// ==================== GERAÇÃO DE PDF ====================
function gerarPDFRelatorio() {
  const c = STATE.convenios.find(x => x.id === STATE.convenioAtualId);
  if (!c) { alert('Selecione um convênio.'); return; }
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

  // Cabeçalho
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('CAPT', M, 14);
  doc.setTextColor(...GREEN);
  doc.text('GOV', M + 30, 14);
  doc.setFontSize(10);
  doc.setTextColor(180, 200, 220);
  doc.setFont('helvetica', 'normal');
  doc.text('Relatório Financeiro', M, 22);
  doc.text(new Date().toLocaleDateString('pt-BR'), W - M - 30, 22, { align: 'right' });

  y = 40;
  doc.setTextColor(...NAVY);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(c.numero ? 'Convênio: ' + c.numero : 'Sem número', M, y);
  y += 8;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY);
  doc.text('Programa: ' + (c.programa || '—') + '  |  Proponente: ' + (c.proponente || '—'), M, y);
  y += 6;
  doc.text('Vigência: ' + (c.dataInicio || '—') + ' a ' + (c.dataFim || '—') + '  |  PC até: ' + (c.prazoLimitePC || '—'), M, y);

  y += 14;
  // Cards resumo
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(M, y, W - 2 * M, 30, 3, 3, 'F');
  const cards = [
    { label: 'Valor do Convênio', value: formatMoeda(resumo.valor), color: TEAL },
    { label: 'Movimento Extrato', value: formatMoeda(resumo.movExtrato), color: resumo.movExtrato >= 0 ? GREEN : [239, 68, 68] },
    { label: 'Total Pago', value: formatMoeda(resumo.totalPago), color: [239, 68, 68] },
    { label: 'Saldo Total', value: formatMoeda(resumo.saldoTotal), color: resumo.saldoTotal >= 0 ? GREEN : [239, 68, 68] },
  ];
  const cw = (W - 2 * M) / 4;
  cards.forEach((card, i) => {
    const cx = M + i * cw;
    doc.setTextColor(...GRAY);
    doc.setFontSize(8);
    doc.text(card.label, cx + 3, y + 8);
    doc.setTextColor(...card.color);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(card.value, cx + 3, y + 22);
  });
  doc.setFont('helvetica', 'normal');

  y += 40;

  // Pagamentos
  if (fin.pagamentos && fin.pagamentos.length > 0) {
    doc.setTextColor(...NAVY);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Pagamentos às Contratadas', M, y);
    y += 6;

    const headers = [['Nº', 'Contratada', 'Data', 'Valor', 'Status']];
    const rows = fin.pagamentos.map(p => {
      const ct = (fin.contratadas || []).find(x => x.id === p.contratadaId);
      return [String(p.numero), ct ? ct.razaoSocial : '?', p.data ? new Date(p.data + 'T00:00:00').toLocaleDateString('pt-BR') : '—', formatMoeda(p.valor), p.status];
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
  }

  // Extratos
  if (fin.extratos && fin.extratos.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setTextColor(...NAVY);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Extrato Bancário Mensal', M, y);
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

  // Rodapé
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text('CaptaGov — Relatório Financeiro — Página ' + i + ' de ' + totalPages, M, 290, { align: 'left' });
    doc.text('Gerado em ' + new Date().toLocaleDateString('pt-BR'), W - M, 290, { align: 'right' });
  }

  doc.save('relatorio-' + (c.numero || 'convenio') + '.pdf');
}

// ==================== INICIALIZAÇÃO ====================
(async function iniciar() {
  await migrarLocalStorage();
  await carregarEstado();
  renderTudo();
})();
