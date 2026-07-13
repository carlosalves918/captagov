/* ============================================================
 * CAPTAGOV — PROTOTIPO REFACTORADO
 * 
 * Estrutura unificada: cada convênio é um objeto único contendo
 * dados, documentos e financeiro. Elimina redundâncias e garante
 * que todas as abas puxam da mesma fonte.
 * ============================================================ */

const nomesAbas = {
  painel: 'Painel geral',
  cadastro: 'Convênio',
  documento: 'Gestão de Documentos',
  checklist: 'Prestação de contas',
  relatorio: 'Relatórios',
  emendas: 'Emendas Parlamentares'
};

const STORAGE_KEY = 'captagov_v2';

/* ---- BANCO LOCAL (IndexedDB via Dexie) ----
 * Troca do localStorage (limite ~5-10MB) pelo IndexedDB (limite prático
 * na casa dos GB, fatia do disco livre). A API do Dexie é assíncrona,
 * então salvarEstado() grava em memória na hora (síncrono, como antes)
 * e persiste no IndexedDB em segundo plano (debounced). carregarEstado()
 * agora é assíncrona e é aguardada uma única vez na inicialização. */
const db = new Dexie('captagov_db');
db.version(1).stores({ estado: 'id' }); // registro único, chave fixa

let _salvarPendente = null;
function _persistirNoIndexedDB(payload){
  if(_salvarPendente) clearTimeout(_salvarPendente);
  _salvarPendente = setTimeout(() => {
    db.estado.put({ id: STORAGE_KEY, payload }).catch(e => {
      console.error('Não foi possível salvar no IndexedDB:', e);
    });
  }, 250); // debounce: evita gravar a cada tecla digitada
}

/* ---- ESTRUTURA UNIFICADA ---- */
// Cada convênio:
// {
//   id,
//   // DADOS
//   numero, programa, orgao, esfera, natureza, proponente, cnpj, cep,
//   logradouro, bairroProp, municipioProp, telefoneInst, emailInst,
//   responsavel, cargo, responsavelCpf, responsavelTelefone, responsavelEmail,
//   tecnicoNome, tecnicoRegistro, tecnicoTelefone, tecnicoEmail,
//   banco, conta, valor, contrapartida,
//   dataAssinatura, dataInicio, dataFim, prazoPC, prazoLimitePC,
//   // DOCUMENTOS GERAIS
//   documentos: { [catId]: { anexado, arquivo, arquivoDataUrl, validade } },
//   // FINANCEIRO
//   financeiro: {
//     contratadas: [],
//     pagamentos: [],
//     extratos: [],
//     rendimentos: [],
//     autorizacoes: [],
//     usos: []
//   }
// }
let convenios = [];
let convenioEditandoId = null;
let convenioAtualId = null;
let protocoloSeq = 0;
let emendas = [];
let emendaEditandoId = null;

/* ---- PERSISTÊNCIA ---- */
function salvarEstado(){
  try{
    const payload = { convenios, convenioAtualId, protocoloSeq, emendas };
    _persistirNoIndexedDB(payload);
    return true;
  }catch(e){
    console.error('Não foi possível salvar no IndexedDB:', e);
    return false;
  }
}

async function carregarEstado(){
  try{
    const registro = await db.estado.get(STORAGE_KEY);
    if(!registro) return;
    const payload = registro.payload;
    convenios = payload.convenios || [];
    convenioAtualId = payload.convenioAtualId || null;
    protocoloSeq = payload.protocoloSeq || 0;
    emendas = payload.emendas || [];
  }catch(e){
    console.error('Não foi possível carregar dados salvos:', e);
  }
}

/* ---- MIGRAÇÃO do formato antigo (localStorage v1/v2 -> IndexedDB) ---- */
async function migrarDeLocalStorage(){
  // Se já existe estado no IndexedDB, não há nada a migrar.
  const jaMigrado = await db.estado.get(STORAGE_KEY);
  if(jaMigrado) return false;

  // v2: já existia em localStorage (versão anterior deste mesmo app)
  const rawV2 = localStorage.getItem(STORAGE_KEY);
  if(rawV2){
    try{
      const payload = JSON.parse(rawV2);
      await db.estado.put({ id: STORAGE_KEY, payload });
      localStorage.removeItem(STORAGE_KEY);
      return true;
    }catch(e){
      console.error('Erro migrando v2 do localStorage:', e);
    }
  }
  return migrarDeV1();
}

async function migrarDeV1(){
  const raw = localStorage.getItem('captagov_v1');
  if(!raw) return false;
  try{
    const v1 = JSON.parse(raw);
    const docsV1 = v1.docsPorConvenio || {};
    const finV1 = v1.financeiroPorConvenio || {};

    convenios = (v1.convenios || []).map(c => {
      const docBase = {};
      categoriasDocumentais.forEach(cat => {
        const item = (docsV1[c.id] || {})[cat.id];
        docBase[cat.id] = item || { anexado:false, arquivo:null, arquivoDataUrl:null, validade:null };
      });

      const finRaw = finV1[c.id];
      let fin;
      if(Array.isArray(finRaw)){
        fin = { extratos:[], rendimentos:[], autorizacoes:[], usos:[], contratadas:[], pagamentos:[] };
        finRaw.forEach(l => {
          const mes = (l.data||'').slice(0,7);
          if(l.tipo==='rendimento'){
            fin.rendimentos.push({id:gerarIdLancamento('rd'), mes, aplicado:0, rendimento:l.valor, obs:'(migrado)', criadoEm:l.data});
          }else{
            fin.extratos.push({id:gerarIdLancamento('ex'), mes, entradas:0, saidas:l.valor, obs:'(migrado)', criadoEm:l.data});
          }
        });
      }else{
        fin = finRaw || { extratos:[], rendimentos:[], autorizacoes:[], usos:[], contratadas:[], pagamentos:[] };
      }

      return { ...c, documentos: docBase, financeiro: fin };
    });
    convenioAtualId = v1.convenioAtualId || null;
    protocoloSeq = v1.protocoloSeq || 0;
    await db.estado.put({ id: STORAGE_KEY, payload: { convenios, convenioAtualId, protocoloSeq, emendas } });
    localStorage.removeItem('captagov_v1');
    return true;
  }catch(e){
    console.error('Erro na migração:', e);
    return false;
  }
}

function gerarIdConvenio(){
  return 'c_' + Date.now() + '_' + Math.floor(Math.random()*1000);
}

/* ---- UTILIDADES ---- */
function parseMoeda(v){
  return parseFloat(String(v).replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(',', '.')) || 0;
}
function formatMoeda(v){
  return (v || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
}

/* ---- MÁSCARA DE CAMPOS DE VALOR (R$) ----
 * Formata o campo enquanto o usuário digita, no padrão brasileiro:
 * milhar separado por ponto, centavos separados por vírgula.
 * O usuário digita só números; a pontuação é inserida automaticamente. */
const CAMPOS_MOEDA = [
  'c_valor', 'c_contrapartida', 'ct_valorContrato', 'pg_valor',
  'ex_entradas', 'ex_saidas', 'rd_aplicado', 'rd_rendimento',
  'au_valor', 'us_valor', 'doc_valor', 'em_valor'
];

function mascararValorMoeda(valorBruto){
  let digitos = String(valorBruto || '').replace(/\D/g, '');
  if(!digitos) return '';
  digitos = digitos.replace(/^0+(?=\d)/, '');
  while(digitos.length < 3) digitos = '0' + digitos;
  const centavos = digitos.slice(-2);
  let inteiro = digitos.slice(0, -2);
  inteiro = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return inteiro + ',' + centavos;
}

function aplicarMascarasMoeda(){
  CAMPOS_MOEDA.forEach(id => {
    const el = document.getElementById(id);
    if(!el || el.dataset.mascaraMoeda) return;
    el.dataset.mascaraMoeda = '1';
    el.setAttribute('inputmode', 'numeric');
    if(el.value) el.value = mascararValorMoeda(el.value);
    el.addEventListener('input', function(){
      this.value = mascararValorMoeda(this.value);
      // mantém o cursor no fim, que é onde a digitação normalmente acontece
      if(document.activeElement === this){
        this.setSelectionRange(this.value.length, this.value.length);
      }
    });
  });
}
function formatMes(mes){
  if(!mes) return '—';
  const [ano, m] = mes.split('-');
  const nomes = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return nomes[parseInt(m,10)-1] + '/' + ano;
}
function gerarIdLancamento(prefixo){
  return prefixo + '_' + Date.now() + '_' + Math.floor(Math.random()*10000);
}
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

/* ---- MÁSCARAS ---- */
function mascarar(input, tipo){
  let v = input.value.replace(/\D/g, '');
  if(tipo === 'cnpj'){
    v = v.slice(0,14);
    v = v.replace(/^(\d{2})(\d)/, '$1.$2');
    v = v.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
    v = v.replace(/\.(\d{3})(\d)/, '.$1/$2');
    v = v.replace(/(\d{4})(\d)/, '$1-$2');
  }else if(tipo === 'cpf'){
    v = v.slice(0,11);
    v = v.replace(/(\d{3})(\d)/, '$1.$2');
    v = v.replace(/(\d{3})(\d)/, '$1.$2');
    v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }else if(tipo === 'cep'){
    v = v.slice(0,8);
    v = v.replace(/(\d{5})(\d)/, '$1-$2');
  }
  input.value = v;
}

/* ---- NAVEGAÇÃO ---- */
function mudarAba(view){
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.querySelectorAll('.tab[data-view]').forEach(t => {
    t.classList.remove('active');
    t.setAttribute('aria-selected', 'false');
  });
  const tabAtiva = document.querySelector('.tab[data-view="' + view + '"]');
  tabAtiva.classList.add('active');
  tabAtiva.setAttribute('aria-selected', 'true');
  document.getElementById('mastheadPath').firstChild.textContent = 'CAPTAGOV / ' + (nomesAbas[view] || view).toUpperCase();

  if(view === 'checklist'){
    atualizarViewChecklist();
    sincronizarSaldoPreview();
  }
  if(view === 'relatorio') atualizarViewRelatorio();
  if(view === 'documento') tentarPreEncherDocumento();
  if(view === 'emendas') renderEmendas();
  atualizarTagConvenioAtivo();
}

/* ---- SUBMENU (submenus internos da Prestação de Contas) ---- */
function mudarSubaba(sub){
  document.querySelectorAll('#view-checklist .subview').forEach(v => v.classList.remove('active'));
  const alvo = document.getElementById('sub-' + sub);
  if(alvo) alvo.classList.add('active');
  document.querySelectorAll('#view-checklist .subtab').forEach(t => t.classList.remove('active'));
  const tabAtiva = document.querySelector('#view-checklist .subtab[data-subview="' + sub + '"]');
  if(tabAtiva) tabAtiva.classList.add('active');
}

/* ---- SUBMENU (subabas internas de Gestão de Documentos) ---- */
function mudarSubabaDocumentos(sub){
  document.querySelectorAll('#view-documento .subview').forEach(v => v.classList.remove('active'));
  const alvo = document.getElementById('subdoc-' + sub);
  if(alvo) alvo.classList.add('active');
  document.querySelectorAll('#view-documento .subtab').forEach(t => t.classList.remove('active'));
  const tabAtiva = document.querySelector('#view-documento .subtab[data-subview-doc="' + sub + '"]');
  if(tabAtiva) tabAtiva.classList.add('active');
  if(sub === 'ia'){
    renderTiposDocIA();
    preencherContextoIA();
    const c = convenios.find(x => x.id === convenioAtualId);
    if(c) renderListaDocsIA(c);
  }
}

(function preencherDataMasthead(){
  const hoje = new Date();
  const texto = hoje.toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });
  document.getElementById('mastheadDate').textContent = texto.replace(/^\w/, c => c.toUpperCase());
})();

function atualizarTagConvenioAtivo(){
  const tag = document.getElementById('tagConvenioAtivo');
  const c = convenios.find(x => x.id === convenioAtualId);
  if(c){
    tag.textContent = '● ' + (c.numero || 'convênio ativo');
    tag.classList.remove('hidden');
  }else{
    tag.textContent = '';
    tag.classList.add('hidden');
  }
}

/* ---- PRAZOS ---- */
function calcularPrazos(){
  const fimStr = document.getElementById('c_data_fim').value;
  const inicioStr = document.getElementById('c_data_inicio').value;
  const prazoDias = parseInt(document.getElementById('c_prazo_pc').value || '60', 10);
  const out = document.getElementById('dataLimitePC');
  const chip = document.getElementById('chipPrazo');

  if(!fimStr){
    out.textContent = '—';
    chip.textContent = 'calculado automaticamente';
    chip.className = 'chip ok';
    return;
  }
  if(inicioStr && new Date(fimStr) < new Date(inicioStr)){
    out.textContent = '—';
    chip.textContent = 'data de fim anterior à data de início';
    chip.className = 'chip fail';
    return;
  }
  const fim = new Date(fimStr + 'T00:00:00');
  const limite = new Date(fim.getTime() + prazoDias*24*60*60*1000);
  out.textContent = limite.toLocaleDateString('pt-BR');
  chip.textContent = 'calculado automaticamente';
  chip.className = 'chip ok';
}

/* ============================================================
 * CÁLULO FINANCEIRO UNIFICADO — ÚNICA FONTE DE VERDADE
 * ============================================================ */
function calcularResumoFinanceiro(id){
  const c = convenios.find(x => x.id === id);
  if(!c) return null;
  const fin = c.financeiro;
  if(!fin){
    c.financeiro = { extratos:[], rendimentos:[], autorizacoes:[], usos:[], contratadas:[], pagamentos:[] };
  }
  const f = c.financeiro;
  const valorConvenio = parseMoeda(c.valor || '0');
  const totalEntradas = (f.extratos||[]).reduce((a,e) => a + (e.entradas||0), 0);
  const totalSaidas = (f.extratos||[]).reduce((a,e) => a + (e.saidas||0), 0);
  const movExtrato = totalEntradas - totalSaidas;
  const totalRendimento = (f.rendimentos||[]).reduce((a,r) => a + (r.rendimento||0), 0);
  const totalUsoRendimento = (f.usos||[]).reduce((a,u) => a + (u.valor||0), 0);
  const saldoRendimentoDisponivel = totalRendimento - totalUsoRendimento;
  const totalPago = (f.pagamentos||[]).reduce((a,p) => a + (p.valor||0), 0);
  const saldoTotal = valorConvenio + movExtrato + totalRendimento - totalUsoRendimento - totalPago;
  return { valorConvenio, totalEntradas, totalSaidas, movExtrato, totalRendimento, totalUsoRendimento, saldoRendimentoDisponivel, totalPago, saldoTotal, fin: f };
}

/* ---- SALDO EM TEMPO REAL ---- */
function sincronizarSaldoPreview(){
  if(!convenioAtualId) return;
  const resumo = calcularResumoFinanceiro(convenioAtualId);
  if(!resumo) return;
  const valorPreview = parseMoeda(document.getElementById('pg_valor')?.value || '0');
  const saldoRestante = resumo.saldoTotal - valorPreview;
  const box = document.getElementById('saldoRealtime');
  const valEl = document.getElementById('saldoRealtimeValor');
  valEl.textContent = formatMoeda(saldoRestante);
  if(saldoRestante < -0.009){
    box.classList.add('insuficiente');
  }else{
    box.classList.remove('insuficiente');
  }
}

function atualizarSaldoPreview(){
  sincronizarSaldoPreview();
}

/* ============================================================
 * PAINEL GERAL / CRUD
 * ============================================================ */
const camposFormularioConvenio = [
  'c_numero','c_programa','c_orgao','c_esfera','c_natureza','c_proponente','c_cnpj',
  'c_cep','c_logradouro','c_bairro_prop','c_municipio_prop','c_telefone_inst','c_email_inst',
  'c_responsavel','c_cargo','c_responsavel_cpf','c_responsavel_telefone','c_responsavel_email',
  'c_tecnico_nome','c_tecnico_registro','c_tecnico_telefone','c_tecnico_email',
  'c_banco','c_conta','c_valor','c_contrapartida',
  'c_data_assinatura','c_data_inicio','c_data_fim','c_prazo_pc'
];
const camposObrigatorios = ['c_numero','c_proponente','c_valor','c_data_fim'];

function limparValidacaoVisual(){
  camposFormularioConvenio.forEach(id => {
    const el = document.getElementById(id);
    if(el) el.closest('.field').classList.remove('invalid');
  });
}

let tipoInstrumentoAtual = 'convenio';

/* Alterna entre Convênio (recurso da União/Estado, emendas parlamentares)
 * e Projeto (recurso do tesouro municipal) — oculta os campos que só se
 * aplicam a convênio (órgão concedente, esfera, natureza jurídica,
 * contrapartida) e ajusta os rótulos do formulário. */
function selecionarTipoInstrumento(tipo){
  tipoInstrumentoAtual = tipo;
  const ehConvenio = tipo === 'convenio';
  document.getElementById('tipoBtnConvenio').classList.toggle('active', ehConvenio);
  document.getElementById('tipoBtnProjeto').classList.toggle('active', !ehConvenio);
  document.querySelectorAll('.campo-convenio').forEach(el => el.classList.toggle('hidden', !ehConvenio));
  document.getElementById('cadastroTitulo').textContent = (convenioEditandoId ? 'Editar ' : 'Cadastro do ') + (ehConvenio ? 'Convênio' : 'Projeto');
  document.getElementById('labelNumero').textContent = 'Número / identificação do ' + (ehConvenio ? 'convênio' : 'projeto') + ' *';
  document.getElementById('labelValor').textContent = 'Valor total do ' + (ehConvenio ? 'convênio' : 'projeto') + ' (R$) *';
}

function limparFormularioConvenio(){
  camposFormularioConvenio.forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('c_esfera').value = 'Federal';
  document.getElementById('c_natureza').value = 'Prefeitura Municipal';
  document.getElementById('c_cargo').value = 'Prefeito(a) Municipal';
  document.getElementById('c_prazo_pc').value = '60';
  document.getElementById('savedNote').textContent = '';
  limparValidacaoVisual();
  calcularPrazos();
}

function novoConvenio(tipo){
  convenioEditandoId = null;
  selecionarTipoInstrumento(tipo || 'convenio');
  limparFormularioConvenio();
  mudarAba('cadastro');
}

function editarConvenio(id){
  const c = convenios.find(x => x.id === id);
  if(!c) return;
  convenioEditandoId = id;
  convenioAtualId = id;
  salvarEstado();
  selecionarTipoInstrumento(c.tipo || 'convenio');
  document.getElementById('c_numero').value = c.numero || '';
  document.getElementById('c_programa').value = c.programa || '';
  document.getElementById('c_orgao').value = c.orgao || '';
  document.getElementById('c_esfera').value = c.esfera || 'Federal';
  document.getElementById('c_natureza').value = c.natureza || 'Prefeitura Municipal';
  document.getElementById('c_proponente').value = c.proponente || '';
  document.getElementById('c_cnpj').value = c.cnpj || '';
  document.getElementById('c_cep').value = c.cep || '';
  document.getElementById('c_logradouro').value = c.logradouro || '';
  document.getElementById('c_bairro_prop').value = c.bairroProp || '';
  document.getElementById('c_municipio_prop').value = c.municipioProp || '';
  document.getElementById('c_telefone_inst').value = c.telefoneInst || '';
  document.getElementById('c_email_inst').value = c.emailInst || '';
  document.getElementById('c_responsavel').value = c.responsavel || '';
  document.getElementById('c_cargo').value = c.cargo || '';
  document.getElementById('c_responsavel_cpf').value = c.responsavelCpf || '';
  document.getElementById('c_responsavel_telefone').value = c.responsavelTelefone || '';
  document.getElementById('c_responsavel_email').value = c.responsavelEmail || '';
  document.getElementById('c_tecnico_nome').value = c.tecnicoNome || '';
  document.getElementById('c_tecnico_registro').value = c.tecnicoRegistro || '';
  document.getElementById('c_tecnico_telefone').value = c.tecnicoTelefone || '';
  document.getElementById('c_tecnico_email').value = c.tecnicoEmail || '';
  document.getElementById('c_banco').value = c.banco || '';
  document.getElementById('c_conta').value = c.conta || '';
  document.getElementById('c_valor').value = c.valor || '';
  document.getElementById('c_contrapartida').value = c.contrapartida || '';
  document.getElementById('c_data_assinatura').value = c.dataAssinatura || '';
  document.getElementById('c_data_inicio').value = c.dataInicio || '';
  document.getElementById('c_data_fim').value = c.dataFim || '';
  document.getElementById('c_prazo_pc').value = c.prazoPC || '60';
  document.getElementById('savedNote').textContent = '';
  limparValidacaoVisual();
  calcularPrazos();
  atualizarTagConvenioAtivo();
  mudarAba('cadastro');
}

function validarFormularioConvenio(){
  limparValidacaoVisual();
  const faltando = [];
  camposObrigatorios.forEach(id => {
    const el = document.getElementById(id);
    if(!el.value || !el.value.trim()){
      el.closest('.field').classList.add('invalid');
      faltando.push(el.previousElementSibling ? el.previousElementSibling.textContent.replace(' *','') : id);
    }
  });
  return faltando;
}

function salvarConvenio(){
  const note = document.getElementById('savedNote');
  const faltando = validarFormularioConvenio();
  if(faltando.length){
    note.innerHTML = '<span class="save-warning">Preencha os campos obrigatórios: ' + faltando.join(', ') + '.</span>';
    return;
  }
  const dataInicio = document.getElementById('c_data_inicio').value;
  const dataFim = document.getElementById('c_data_fim').value;
  if(dataInicio && dataFim && new Date(dataFim) < new Date(dataInicio)){
    note.innerHTML = '<span class="save-warning">A data de fim de vigência não pode ser anterior à data de início.</span>';
    return;
  }

  const dados = {
    tipo: tipoInstrumentoAtual,
    numero: document.getElementById('c_numero').value,
    programa: document.getElementById('c_programa').value,
    orgao: document.getElementById('c_orgao').value,
    esfera: document.getElementById('c_esfera').value,
    natureza: document.getElementById('c_natureza').value,
    proponente: document.getElementById('c_proponente').value,
    cnpj: document.getElementById('c_cnpj').value,
    cep: document.getElementById('c_cep').value,
    logradouro: document.getElementById('c_logradouro').value,
    bairroProp: document.getElementById('c_bairro_prop').value,
    municipioProp: document.getElementById('c_municipio_prop').value,
    telefoneInst: document.getElementById('c_telefone_inst').value,
    emailInst: document.getElementById('c_email_inst').value,
    responsavel: document.getElementById('c_responsavel').value,
    cargo: document.getElementById('c_cargo').value,
    responsavelCpf: document.getElementById('c_responsavel_cpf').value,
    responsavelTelefone: document.getElementById('c_responsavel_telefone').value,
    responsavelEmail: document.getElementById('c_responsavel_email').value,
    tecnicoNome: document.getElementById('c_tecnico_nome').value,
    tecnicoRegistro: document.getElementById('c_tecnico_registro').value,
    tecnicoTelefone: document.getElementById('c_tecnico_telefone').value,
    tecnicoEmail: document.getElementById('c_tecnico_email').value,
    banco: document.getElementById('c_banco').value,
    conta: document.getElementById('c_conta').value,
    valor: document.getElementById('c_valor').value,
    contrapartida: document.getElementById('c_contrapartida').value,
    dataAssinatura: document.getElementById('c_data_assinatura').value,
    dataInicio,
    dataFim,
    prazoPC: document.getElementById('c_prazo_pc').value,
    prazoLimitePC: document.getElementById('dataLimitePC').textContent,
  };

  if(convenioEditandoId){
    const idx = convenios.findIndex(c => c.id === convenioEditandoId);
    if(idx > -1) convenios[idx] = Object.assign({ id: convenioEditandoId, documentos: convenios[idx].documentos || {}, financeiro: convenios[idx].financeiro || {} }, dados);
  }else{
    convenioEditandoId = gerarIdConvenio();
    convenios.push(Object.assign({
      id: convenioEditandoId,
      documentos: {},
      documentosExtras: [],
      docsGeradosIA: [],
      financeiro: { extratos:[], rendimentos:[], autorizacoes:[], usos:[], contratadas:[], pagamentos:[] }
    }, dados));
  }
  convenioAtualId = convenioEditandoId;

  // Inicializa documentos se novo
  if(!convenios[convenios.length-1].documentos || Object.keys(convenios[convenios.length-1].documentos).length === 0){
    const ultimo = convenios[convenios.length-1];
    categoriasDocumentais.forEach(cat => {
      if(!ultimo.documentos[cat.id]) ultimo.documentos[cat.id] = { anexado:false, arquivo:null, arquivoDataUrl:null, validade:null };
    });
  }

  salvarEstado();
  note.textContent = '✓ salvo às ' + new Date().toLocaleTimeString('pt-BR');
  atualizarTagConvenioAtivo();
  renderPainel();
}

function excluirConvenio(id){
  const c = convenios.find(x => x.id === id);
  if(!c) return;
  const ok = confirm('Excluir o convênio "' + (c.numero || '(sem número)') + '"? Todos os dados, documentos e lançamentos financeiros serão apagados. Esta ação não pode ser desfeita.');
  if(!ok) return;
  convenios = convenios.filter(x => x.id !== id);
  if(convenioAtualId === id) convenioAtualId = null;
  if(convenioEditandoId === id) convenioEditandoId = null;
  salvarEstado();
  atualizarTagConvenioAtivo();
  renderPainel();
  atualizarViewChecklist();
}

function duplicarConvenio(id){
  const original = convenios.find(x => x.id === id);
  if(!original) return;
  const novoId = gerarIdConvenio();
  const copia = Object.assign({}, original, {
    id: novoId,
    numero: (original.numero || '(sem número)') + ' (cópia)',
    documentos: JSON.parse(JSON.stringify(original.documentos || {})),
    documentosExtras: JSON.parse(JSON.stringify(original.documentosExtras || [])),
    docsGeradosIA: JSON.parse(JSON.stringify(original.docsGeradosIA || [])),
    financeiro: JSON.parse(JSON.stringify(original.financeiro || { extratos:[], rendimentos:[], autorizacoes:[], usos:[], contratadas:[], pagamentos:[] }))
  });
  convenios.push(copia);
  salvarEstado();
  renderPainel();
}

function abrirChecklistConvenio(id){
  convenioAtualId = id;
  salvarEstado();
  mudarAba('checklist');
}

function statusConvenio(c){
  if(!c.prazoLimitePC || c.prazoLimitePC === '—') return { label:'sem prazo definido', cls:'' };
  const partes = c.prazoLimitePC.split('/');
  if(partes.length !== 3) return { label:'em execução', cls:'' };
  const hoje = new Date();
  const limite = new Date(partes[2], partes[1]-1, partes[0]);
  const dias = Math.floor((limite - hoje) / (1000*60*60*24));
  if(dias < 0) return { label:'PC vencida', cls:'warn' };
  if(dias <= 30) return { label:dias + 'd p/ PC', cls:'warn' };
  return { label:'em execução', cls:'ok' };
}

function renderPainel(){
  const wrap = document.getElementById('painelLista');
  document.getElementById('contadorConvenios').textContent = convenios.length;
  const buscaEl = document.getElementById('painelBusca');
  const termo = buscaEl ? buscaEl.value.trim().toLowerCase() : '';
  const lista = termo
    ? convenios.filter(c =>
        (c.numero||'').toLowerCase().includes(termo) ||
        (c.programa||'').toLowerCase().includes(termo) ||
        (c.proponente||'').toLowerCase().includes(termo))
    : convenios;

  if(convenios.length === 0){
    wrap.innerHTML = '<div class="painel-empty">Nenhum convênio cadastrado ainda. Clique em <b>+ Novo convênio</b> para começar.</div>';
    return;
  }
  if(lista.length === 0){
    wrap.innerHTML = '<div class="painel-empty">Nenhum convênio encontrado para essa busca.</div>';
    return;
  }

  wrap.innerHTML = '';
  lista.slice().reverse().forEach(c => {
    const st = statusConvenio(c);
    const resumo = calcularResumoFinanceiro(c.id);
    const saldo = resumo ? formatMoeda(resumo.saldoTotal) : 'R$ ' + escapeHtml(c.valor || '0,00');
    const card = document.createElement('div');
    card.className = 'convenio-card' + (c.id === convenioAtualId ? '' : '');
    card.innerHTML = `
      <div class="convenio-card-main">
        <div class="convenio-card-title"><span class="tipo-chip ${c.tipo === 'projeto' ? 'projeto' : 'convenio'}">${c.tipo === 'projeto' ? 'Projeto' : 'Convênio'}</span> ${escapeHtml(c.numero || '(sem número)')} — ${escapeHtml(c.programa || 'Sem programa definido')}</div>
        <div class="convenio-card-sub">${escapeHtml(c.proponente || 'Proponente não informado')}</div>
      </div>
      <div class="convenio-card-meta">
        <span>R$ ${escapeHtml(c.valor || '0,00')}</span>
        <span>Saldo: <b style="color:${resumo && resumo.saldoTotal < 0 ? 'var(--seal-deep)' : 'var(--teal-deep)'}">${saldo}</b></span>
        <span>PC até ${escapeHtml(c.prazoLimitePC || '—')}</span>
        <span class="chip ${st.cls}">${st.label}</span>
      </div>
      <div class="convenio-card-actions">
        <button class="btn-ghost" onclick="editarConvenio('${c.id}')">Abrir</button>
        <button class="btn-icon" title="Prestação de contas" onclick="abrirChecklistConvenio('${c.id}')">📂</button>
        <button class="btn-icon" title="Duplicar convênio" onclick="duplicarConvenio('${c.id}')">⧉</button>
        <button class="btn-icon danger" title="Excluir convênio" onclick="excluirConvenio('${c.id}')">🗑️</button>
      </div>
    `;
    wrap.appendChild(card);
  });
}

/* ============================================================
 * EMENDAS PARLAMENTARES — módulo independente, com vínculo
 * opcional a um convênio já cadastrado.
 * ============================================================ */
const camposFormularioEmenda = ['em_parlamentar','em_partido','em_numero','em_ano','em_valor','em_orgao','em_objeto','em_situacao','em_convenio','em_obs'];

function gerarIdEmenda(){
  return 'em_' + Date.now() + '_' + Math.floor(Math.random()*1000);
}

function popularSelectConvenioEmenda(valorSelecionado){
  const sel = document.getElementById('em_convenio');
  if(!sel) return;
  const atual = valorSelecionado !== undefined ? valorSelecionado : sel.value;
  sel.innerHTML = '<option value="">— nenhum vínculo ainda —</option>' +
    convenios.map(c => `<option value="${c.id}">${escapeHtml(c.numero || '(sem número)')} — ${escapeHtml(c.programa || 'Sem programa')}</option>`).join('');
  sel.value = atual || '';
}

function limparFormularioEmenda(){
  emendaEditandoId = null;
  camposFormularioEmenda.forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  document.getElementById('em_situacao').value = 'Indicada';
  popularSelectConvenioEmenda('');
  document.getElementById('emendaFormTitulo').textContent = 'Nova emenda parlamentar';
  document.getElementById('emendaSavedNote').textContent = '';
}

function novaEmenda(){
  limparFormularioEmenda();
  document.getElementById('em_parlamentar').focus();
}

function editarEmenda(id){
  const e = emendas.find(x => x.id === id);
  if(!e) return;
  emendaEditandoId = id;
  document.getElementById('em_parlamentar').value = e.parlamentar || '';
  document.getElementById('em_partido').value = e.partido || '';
  document.getElementById('em_numero').value = e.numero || '';
  document.getElementById('em_ano').value = e.ano || '';
  document.getElementById('em_valor').value = e.valor || '';
  document.getElementById('em_orgao').value = e.orgao || '';
  document.getElementById('em_objeto').value = e.objeto || '';
  document.getElementById('em_situacao').value = e.situacao || 'Indicada';
  popularSelectConvenioEmenda(e.convenioId || '');
  document.getElementById('em_obs').value = e.obs || '';
  document.getElementById('emendaFormTitulo').textContent = 'Editar emenda — ' + (e.numero || '(sem número)');
  document.getElementById('emendaSavedNote').textContent = '';
  document.getElementById('emendaFormCard').scrollIntoView({ behavior:'smooth', block:'start' });
}

function salvarEmenda(){
  const note = document.getElementById('emendaSavedNote');
  const parlamentar = document.getElementById('em_parlamentar').value.trim();
  const numero = document.getElementById('em_numero').value.trim();
  const valor = document.getElementById('em_valor').value.trim();
  const faltando = [];
  if(!parlamentar) faltando.push('Parlamentar (autor)');
  if(!numero) faltando.push('Número da emenda');
  if(!valor) faltando.push('Valor indicado');
  if(faltando.length){
    note.innerHTML = '<span class="save-warning">Preencha os campos obrigatórios: ' + faltando.join(', ') + '.</span>';
    return;
  }

  const dados = {
    parlamentar,
    partido: document.getElementById('em_partido').value,
    numero,
    ano: document.getElementById('em_ano').value,
    valor,
    orgao: document.getElementById('em_orgao').value,
    objeto: document.getElementById('em_objeto').value,
    situacao: document.getElementById('em_situacao').value,
    convenioId: document.getElementById('em_convenio').value || null,
    obs: document.getElementById('em_obs').value,
  };

  if(emendaEditandoId){
    const idx = emendas.findIndex(e => e.id === emendaEditandoId);
    if(idx > -1) emendas[idx] = Object.assign({ id: emendaEditandoId }, dados);
  }else{
    emendas.push(Object.assign({ id: gerarIdEmenda() }, dados));
  }

  salvarEstado();
  note.textContent = '✓ salvo às ' + new Date().toLocaleTimeString('pt-BR');
  limparFormularioEmenda();
  renderEmendas();
}

function excluirEmenda(id){
  const e = emendas.find(x => x.id === id);
  if(!e) return;
  const ok = confirm('Excluir a emenda de ' + (e.parlamentar || '(sem nome)') + ' (nº ' + (e.numero || 's/n') + ')? Esta ação não pode ser desfeita.');
  if(!ok) return;
  emendas = emendas.filter(x => x.id !== id);
  if(emendaEditandoId === id) limparFormularioEmenda();
  salvarEstado();
  renderEmendas();
}

function situacaoEmendaClasse(situacao){
  if(situacao === 'Paga' || situacao === 'Conveniada') return 'ok';
  if(situacao === 'Empenhada') return 'warn';
  if(situacao === 'Cancelada') return 'fail';
  return '';
}

function renderEmendas(){
  popularSelectConvenioEmenda();
  const wrap = document.getElementById('emendaLista');
  if(!wrap) return;
  const buscaEl = document.getElementById('emendaBusca');
  const termo = buscaEl ? buscaEl.value.trim().toLowerCase() : '';
  const lista = termo
    ? emendas.filter(e =>
        (e.parlamentar||'').toLowerCase().includes(termo) ||
        (e.numero||'').toLowerCase().includes(termo) ||
        (e.orgao||'').toLowerCase().includes(termo))
    : emendas;

  if(emendas.length === 0){
    wrap.innerHTML = '<div class="painel-empty">Nenhuma emenda cadastrada ainda. Use o formulário abaixo para registrar a primeira.</div>';
    return;
  }
  if(lista.length === 0){
    wrap.innerHTML = '<div class="painel-empty">Nenhuma emenda encontrada para essa busca.</div>';
    return;
  }

  wrap.innerHTML = '';
  lista.slice().reverse().forEach(e => {
    const conv = e.convenioId ? convenios.find(c => c.id === e.convenioId) : null;
    const card = document.createElement('div');
    card.className = 'convenio-card';
    card.innerHTML = `
      <div class="convenio-card-main">
        <div class="convenio-card-title">${escapeHtml(e.parlamentar || '(sem nome)')} <span style="color:var(--ink-faint); font-weight:400;">— nº ${escapeHtml(e.numero || 's/n')}${e.ano ? '/' + escapeHtml(e.ano) : ''}</span></div>
        <div class="convenio-card-sub">${escapeHtml(e.objeto || 'Objeto não informado')}${e.orgao ? ' · ' + escapeHtml(e.orgao) : ''}</div>
      </div>
      <div class="convenio-card-meta">
        <span>R$ ${escapeHtml(e.valor || '0,00')}</span>
        <span>${conv ? 'Vinculada a ' + escapeHtml(conv.numero || 'convênio') : 'Sem convênio vinculado'}</span>
        <span class="chip ${situacaoEmendaClasse(e.situacao)}">${escapeHtml(e.situacao || 'Indicada')}</span>
      </div>
      <div class="convenio-card-actions">
        <button class="btn-ghost" onclick="editarEmenda('${e.id}')">Editar</button>
        <button class="btn-icon danger" title="Excluir emenda" onclick="excluirEmenda('${e.id}')">🗑️</button>
      </div>
    `;
    wrap.appendChild(card);
  });
}

/* ============================================================
 * CHECKLIST / PRESTAÇÃO DE CONTAS — DOCUMENTOS + FINANCEIRO
 * ============================================================ */
const categoriasDocumentais = [
  { id: 'medicao', nome: 'Medição', temValidade: false },
  { id: 'memoria', nome: 'Memória de Cálculo', temValidade: false },
  { id: 'certidoes', nome: 'Certidões', temValidade: true },
  { id: 'comprovante', nome: 'Comprovante de Pagamento', temValidade: false },
  { id: 'fotografico', nome: 'Relatório Fotográfico', temValidade: false },
  { id: 'extrato', nome: 'Extrato Bancário', temValidade: false },
];

const categoriasPagamentoDocs = [
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

function docsVaziosPagamento(){
  const est = {};
  categoriasPagamentoDocs.forEach(c => est[c.id] = { anexado:false, arquivo:null, arquivoDataUrl:null });
  return est;
}

function atualizarViewChecklist(){
  const empty = document.getElementById('checklistEmpty');
  const content = document.getElementById('checklistContent');
  const label = document.getElementById('checklistConvenioLabel');
  atualizarTagConvenioAtivo();

  const c = convenios.find(x => x.id === convenioAtualId);
  if(!c){
    empty.classList.remove('hidden');
    content.classList.add('hidden');
    return;
  }
  empty.classList.add('hidden');
  content.classList.remove('hidden');
  label.textContent = 'Convênio ' + (c.numero || '') + ' — ' + (c.programa || '') + '. Saldo atualizado em tempo real, pagamentos vinculados ao saldo, controle financeiro mensal e checklist documental.';
  renderDocCards();
  renderFinanceiro();
  sincronizarSaldoPreview();
}

/* ---- DOCUMENTOS GERAIS ----
 * A checklist fixa de categorias (Medição, Memória de Cálculo etc.) e a
 * barra de progresso foram removidas da interface — o convênio agora só
 * tem a listagem aberta de "Outros documentos" abaixo. A função é mantida
 * (delegando para os extras) para não quebrar as chamadas já existentes. */
function renderDocCards(){
  const c = convenios.find(x => x.id === convenioAtualId);
  if(!c) return;
  if(!c.documentosExtras) c.documentosExtras = [];
  renderDocCardsExtras(c);
}

/* ---- DOCUMENTOS GERAIS — LISTAGEM ----
 * O usuário nomeia livremente cada documento e anexa o arquivo; conforme
 * vai lançando, a lista abaixo vira uma listagem simples pronta pra baixar. */
function renderDocCardsExtras(c){
  const wrap = document.getElementById('docCardsExtras');
  if(!wrap) return;
  const extras = c.documentosExtras || [];
  if(!extras.length){
    wrap.innerHTML = '<div class="painel-empty" style="padding:20px;">Nenhum documento anexado ainda.</div>';
    return;
  }
  wrap.innerHTML = '';
  extras.forEach(doc => {
    const item = document.createElement('div');
    item.className = 'doc-list-item' + (doc.anexado ? ' pronto' : '');

    let acaoHtml;
    if(doc.anexado && doc.arquivoDataUrl){
      acaoHtml = '<a class="doc-list-download" href="'+doc.arquivoDataUrl+'" target="_blank" rel="noopener" download="'+escapeHtml(doc.arquivo)+'">⬇ baixar</a>';
    } else if(doc.anexado){
      acaoHtml = '<span class="doc-list-pendente" style="opacity:0.8;">📎 '+escapeHtml(doc.arquivo)+' (conteúdo não salvo)</span>';
    } else {
      acaoHtml = '<div class="doc-list-attach"><input type="file" aria-label="Anexar arquivo de '+escapeHtml(doc.nome)+'" onchange="anexarDocExtra(\''+doc.id+'\', this.files[0])" /></div>';
    }

    item.innerHTML = `
      <div class="doc-list-name">${escapeHtml(doc.nome)}</div>
      ${acaoHtml}
      <button class="btn-ghost btn-small" onclick="removerDocumentoExtra('${doc.id}')">remover</button>
    `;
    wrap.appendChild(item);
  });
}

function adicionarDocumentoExtra(){
  if(!convenioAtualId) return;
  const input = document.getElementById('docExtraNome');
  const nome = input.value.trim();
  if(!nome){ alert('Dê um nome ao documento antes de adicionar.'); return; }
  const c = convenios.find(x => x.id === convenioAtualId);
  if(!c) return;
  if(!c.documentosExtras) c.documentosExtras = [];
  c.documentosExtras.push({ id: gerarIdLancamento('dx'), nome, anexado:false, arquivo:null, arquivoDataUrl:null });
  input.value = '';
  salvarEstado();
  renderDocCardsExtras(c);
}

function anexarDocExtra(id, file){
  if(!file || !convenioAtualId) return;
  const c = convenios.find(x => x.id === convenioAtualId);
  if(!c || !c.documentosExtras) return;
  const doc = c.documentosExtras.find(x => x.id === id);
  if(!doc) return;
  const LIMITE_AVISO = 4 * 1024 * 1024;

  if(file.size > LIMITE_AVISO){
    const continuar = confirm('O arquivo "' + file.name + '" tem ' + (file.size/1024/1024).toFixed(1) + 'MB. Deseja tentar anexar?');
    if(!continuar){
      doc.anexado = true;
      doc.arquivo = file.name;
      doc.arquivoDataUrl = null;
      salvarEstado();
      renderDocCardsExtras(c);
      return;
    }
  }

  const reader = new FileReader();
  reader.onload = function(){
    doc.anexado = true;
    doc.arquivo = file.name;
    doc.arquivoDataUrl = reader.result;
    const ok = salvarEstado();
    if(!ok){
      doc.arquivoDataUrl = null;
      salvarEstado();
      alert('Não foi possível salvar o conteúdo do arquivo (limite do navegador). O nome ficou registrado.');
    }
    renderDocCardsExtras(c);
  };
  reader.onerror = function(){
    doc.anexado = true;
    doc.arquivo = file.name;
    doc.arquivoDataUrl = null;
    salvarEstado();
    renderDocCardsExtras(c);
  };
  reader.readAsDataURL(file);
}

function removerDocumentoExtra(id){
  if(!convenioAtualId) return;
  const c = convenios.find(x => x.id === convenioAtualId);
  if(!c || !c.documentosExtras) return;
  const doc = c.documentosExtras.find(x => x.id === id);
  if(!doc) return;
  if(!confirm('Remover o documento "' + doc.nome + '"?')) return;
  c.documentosExtras = c.documentosExtras.filter(x => x.id !== id);
  salvarEstado();
  renderDocCardsExtras(c);
}

function anexarDoc(id, file){
  if(!file || !convenioAtualId) return;
  const c = convenios.find(x => x.id === convenioAtualId);
  if(!c) return;
  const LIMITE_AVISO = 4 * 1024 * 1024;

  if(file.size > LIMITE_AVISO){
    const continuar = confirm('O arquivo "' + file.name + '" tem ' + (file.size/1024/1024).toFixed(1) + 'MB. Deseja tentar anexar?');
    if(!continuar){
      c.documentos[id].anexado = true;
      c.documentos[id].arquivo = file.name;
      c.documentos[id].arquivoDataUrl = null;
      salvarEstado();
      renderDocCards();
      return;
    }
  }

  const reader = new FileReader();
  reader.onload = function(){
    c.documentos[id].anexado = true;
    c.documentos[id].arquivo = file.name;
    c.documentos[id].arquivoDataUrl = reader.result;
    const ok = salvarEstado();
    if(!ok){
      c.documentos[id].arquivoDataUrl = null;
      salvarEstado();
      alert('Não foi possível salvar o conteúdo do arquivo (limite do navegador). O nome ficou registrado.');
    }
    renderDocCards();
  };
  reader.onerror = function(){
    c.documentos[id].anexado = true;
    c.documentos[id].arquivo = file.name;
    c.documentos[id].arquivoDataUrl = null;
    salvarEstado();
    renderDocCards();
  };
  reader.readAsDataURL(file);
}

function definirValidade(id, data){
  if(!convenioAtualId) return;
  const c = convenios.find(x => x.id === convenioAtualId);
  if(!c) return;
  c.documentos[id].validade = data;
  salvarEstado();
  renderDocCards();
}

/* ---- FINANCEIRO ---- */
/* Renderiza uma tabela de lançamentos mensais (extrato ou rendimento) já
 * ordenada por mês. `linhaHtml` recebe o item e devolve as <td>s da linha —
 * evita duplicar o mesmo laço/ordenação/estado-vazio para cada tipo. */
function renderTabelaMensal(tbody, lista, colspan, msgVazio, linhaHtml){
  tbody.innerHTML = '';
  if(!lista.length){
    tbody.innerHTML = '<tr class="fin-empty-row"><td colspan="' + colspan + '">' + msgVazio + '</td></tr>';
    return;
  }
  lista.slice().sort((a,b) => a.mes.localeCompare(b.mes)).forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = linhaHtml(item);
    tbody.appendChild(tr);
  });
}

function renderFinanceiro(){
  const tabelaEx = document.getElementById('tabelaExtratos');
  const tabelaRd = document.getElementById('tabelaRendimentos');
  const tabelaAu = document.getElementById('tabelaAutorizacoes');
  const tabelaUs = document.getElementById('tabelaUsosRendimento');
  const selectUso = document.getElementById('us_autorizacao');
  if(!tabelaEx) return;

  if(!convenioAtualId){
    [tabelaEx, tabelaRd, tabelaAu, tabelaUs].forEach(t => t.innerHTML = '');
    document.getElementById('tabelaContratadas').innerHTML = '';
    document.getElementById('listaPagamentos').innerHTML = '';
    return;
  }

  const resumo = calcularResumoFinanceiro(convenioAtualId);
  if(!resumo) return;
  const fin = resumo.fin;

  // Cards de resumo
  document.getElementById('finValorConvenio').textContent = formatMoeda(resumo.valorConvenio);
  document.getElementById('finMovExtrato').textContent = formatMoeda(resumo.movExtrato);
  document.getElementById('finRendAcumulado').textContent = formatMoeda(resumo.totalRendimento);
  document.getElementById('finTotalPago').textContent = formatMoeda(resumo.totalPago);
  document.getElementById('finSaldoTotal').textContent = formatMoeda(resumo.saldoTotal);

  // Saldo em tempo real
  sincronizarSaldoPreview();

  renderContratadas(fin);
  renderPagamentos(fin);

  // Extratos e Rendimentos — mesma renderização genérica (ver renderTabelaMensal)
  renderTabelaMensal(tabelaEx, fin.extratos, 6, 'Nenhum extrato bancário lançado ainda.', e =>
    '<td>' + formatMes(e.mes) + '</td>' +
    '<td class="num">' + formatMoeda(e.entradas) + '</td>' +
    '<td class="num">' + formatMoeda(e.saidas) + '</td>' +
    '<td class="num">' + formatMoeda(e.entradas - e.saidas) + '</td>' +
    '<td>' + escapeHtml(e.obs || '—') + '</td>' +
    '<td><button class="btn-ghost btn-small" onclick="removerExtrato(\'' + e.id + '\')">remover</button></td>'
  );

  renderTabelaMensal(tabelaRd, fin.rendimentos, 5, 'Nenhum rendimento mensal lançado ainda.', r =>
    '<td>' + formatMes(r.mes) + '</td>' +
    '<td class="num">' + formatMoeda(r.aplicado) + '</td>' +
    '<td class="num">' + formatMoeda(r.rendimento) + '</td>' +
    '<td>' + escapeHtml(r.obs || '—') + '</td>' +
    '<td><button class="btn-ghost btn-small" onclick="removerRendimento(\'' + r.id + '\')">remover</button></td>'
  );


  // Autorizações
  tabelaAu.innerHTML = '';
  if(!fin.autorizacoes.length){
    tabelaAu.innerHTML = '<tr class="fin-empty-row"><td colspan="5">Nenhuma solicitação de autorização registrada.</td></tr>';
  }else{
    fin.autorizacoes.slice().reverse().forEach(a => {
      const tr = document.createElement('tr');
      const acoes = a.status === 'pendente'
        ? '<button class="btn-ghost btn-small" onclick="decidirAutorizacao(\'' + a.id + '\',\'autorizado\')">marcar autorizado</button> ' +
          '<button class="btn-ghost btn-small" onclick="decidirAutorizacao(\'' + a.id + '\',\'negado\')">marcar negado</button>'
        : '—';
      tr.innerHTML = '<td>' + new Date(a.data).toLocaleDateString('pt-BR') + '</td>' +
        '<td class="num">' + formatMoeda(a.valor) + '</td>' +
        '<td>' + escapeHtml(a.finalidade) + '</td>' +
        '<td><span class="status-badge ' + a.status + '">' + a.status + '</span></td>' +
        '<td>' + acoes + '</td>';
      tabelaAu.appendChild(tr);
    });
  }

  // Usos
  tabelaUs.innerHTML = '';
  if(!fin.usos.length){
    tabelaUs.innerHTML = '<tr class="fin-empty-row"><td colspan="4">Nenhum uso do rendimento registrado ainda.</td></tr>';
  }else{
    fin.usos.slice().reverse().forEach(u => {
      const a = fin.autorizacoes.find(x => x.id === u.autorizacaoId);
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + new Date(u.data).toLocaleDateString('pt-BR') + '</td>' +
        '<td class="num">' + formatMoeda(u.valor) + '</td>' +
        '<td>' + escapeHtml(u.descricao || '—') + '</td>' +
        '<td>' + (a ? escapeHtml(a.finalidade) : '(autorização removida)') + '</td>';
      tabelaUs.appendChild(tr);
    });
  }

  // Select de autorizações
  const autorizadasComSaldo = fin.autorizacoes.filter(a => {
    if(a.status !== 'autorizado') return false;
    const usado = fin.usos.filter(u => u.autorizacaoId === a.id).reduce((s,u) => s+u.valor, 0);
    return (a.valor - usado) > 0.009;
  });
  selectUso.innerHTML = autorizadasComSaldo.length
    ? autorizadasComSaldo.map(a => {
        const usado = fin.usos.filter(u => u.autorizacaoId === a.id).reduce((s,u) => s+u.valor, 0);
        return '<option value="' + a.id + '">' + escapeHtml(a.finalidade) + ' — disponível ' + formatMoeda(a.valor - usado) + '</option>';
      }).join('')
    : '<option value="">nenhuma autorização com saldo disponível</option>';

  // Alerta de autorização
  const alertaEl = document.getElementById('finAlertAutorizacao');
  const pendentes = fin.autorizacoes.filter(a => a.status === 'pendente');
  if(resumo.saldoRendimentoDisponivel > 0.009 && !autorizadasComSaldo.length && !pendentes.length){
    alertaEl.innerHTML = '<div class="alert-box"><b>Atenção:</b> este convênio possui ' + formatMoeda(resumo.saldoRendimentoDisponivel) + ' em rendimento acumulado. Solicite autorização antes de utilizar.</div>';
  }else if(pendentes.length){
    alertaEl.innerHTML = '<div class="alert-box"><b>' + pendentes.length + ' solicitação(ões) pendente(s)</b> aguardando resposta do convenente.</div>';
  }else if(resumo.saldoRendimentoDisponivel > 0.009){
    alertaEl.innerHTML = '<div class="alert-box quiet"><b>Ok:</b> há autorização vigente cobrindo o saldo de rendimento disponível.</div>';
  }else{
    alertaEl.innerHTML = '<div class="alert-box quiet">Nenhum saldo de rendimento pendente de uso.</div>';
  }
}

function renderContratadas(fin){
  const tbody = document.getElementById('tabelaContratadas');
  tbody.innerHTML = (fin.contratadas||[]).length ? fin.contratadas.map(c => {
    const anexo = c.arquivoContrato
      ? '<div class="doc-filename">📎 ' + escapeHtml(c.arquivoContrato) + (c.arquivoContratoDataUrl ? ' <a href="'+c.arquivoContratoDataUrl+'" target="_blank" rel="noopener" style="color:inherit;" download="'+escapeHtml(c.arquivoContrato)+'">(abrir)</a>' : ' <span style="opacity:0.6;">(conteúdo não salvo)</span>') + '</div>'
      : '<span style="color:var(--ink-faint); font-style:italic; font-size:11px;">sem anexo</span>';
    return '<tr><td>' + escapeHtml(c.razaoSocial) + '</td>' +
    '<td>' + escapeHtml(c.cnpj || '—') + '</td>' +
    '<td>' + escapeHtml(c.numeroContrato) + '</td>' +
    '<td>' + escapeHtml(c.objeto || '—') + '</td>' +
    '<td class="num">' + formatMoeda(c.valorContrato) + '</td>' +
    '<td>' + anexo + '<input type="file" style="margin-top:6px;" onchange="anexarContrato(\'' + c.id + '\', this.files[0])" /></td>' +
    '<td><button class="btn-ghost btn-small" onclick="removerContratada(\'' + c.id + '\')">remover</button></td></tr>';
  }).join('') : '<tr class="fin-empty-row"><td colspan="7">Nenhuma contratada cadastrada. Cadastre antes de lançar pagamentos.</td></tr>';

  const selectPg = document.getElementById('pg_contratada');
  selectPg.innerHTML = (fin.contratadas||[]).length
    ? fin.contratadas.map(c => '<option value="' + c.id + '">' + escapeHtml(c.razaoSocial) + ' — contrato ' + escapeHtml(c.numeroContrato) + '</option>').join('')
    : '<option value="">cadastre uma contratada primeiro</option>';

  const alertaEl = document.getElementById('finAlertContratada');
  alertaEl.innerHTML = (fin.contratadas||[]).length
    ? ''
    : '<div class="alert-box"><b>Antes de inserir um pagamento</b>, cadastre a empresa contratada vinculada a este convênio.</div>';
}

function renderPagamentos(fin){
  const wrap = document.getElementById('listaPagamentos');
  if(!(fin.pagamentos||[]).length){
    wrap.innerHTML = '<div class="painel-empty">Nenhum pagamento lançado. Cadastre a contratada e insira o primeiro pagamento.</div>';
    return;
  }
  wrap.innerHTML = '';
  fin.pagamentos.slice().sort((a,b) => a.numero - b.numero).forEach(p => {
    const contratada = (fin.contratadas||[]).find(c => c.id === p.contratadaId);
    const card = document.createElement('div');
    card.className = 'pagamento-card ' + p.status;
    const docsHtml = categoriasPagamentoDocs.map(cat => {
      const item = p.docs[cat.id] || { anexado:false, arquivo:null, arquivoDataUrl:null };
      let arquivoInfoHtml = '';
      if(item.anexado && item.arquivoDataUrl){
        arquivoInfoHtml =
          '<div class="pagdoc-filename-row">' +
            '<a class="doc-list-download" href="'+item.arquivoDataUrl+'" target="_blank" rel="noopener" download="'+escapeHtml(item.arquivo)+'">⬇ baixar</a>' +
            '<button type="button" class="btn-ghost btn-small" onclick="removerDocPagamento(\''+p.id+'\',\''+cat.id+'\')">remover</button>' +
          '</div>';
      } else if(item.anexado){
        arquivoInfoHtml =
          '<div class="pagdoc-filename-row">' +
            '<span class="pagdoc-filename">📎 ' + escapeHtml(item.arquivo) + ' (conteúdo não salvo)</span>' +
            '<button type="button" class="btn-ghost btn-small" onclick="removerDocPagamento(\''+p.id+'\',\''+cat.id+'\')">remover</button>' +
          '</div>';
      }
      return '<div class="pagdoc-card ' + (item.anexado ? 'ok' : '') + '">' +
        '<div class="pagdoc-title"><span>' + cat.nome + '</span><span class="status-badge ' + (item.anexado ? 'autorizado' : 'pendente') + '">' + (item.anexado ? 'anexado' : 'pendente') + '</span></div>' +
        '<input type="file" onchange="anexarDocPagamento(\'' + p.id + '\',\'' + cat.id + '\', this.files[0])" />' +
        arquivoInfoHtml +
        '</div>';
    }).join('');

    card.innerHTML =
      '<div class="pagamento-head">' +
        '<div class="pagamento-title">Pagamento nº ' + p.numero + ' — ' + escapeHtml(contratada ? contratada.razaoSocial : '(contratada removida)') + '</div>' +
        '<div><span class="status-badge ' + (p.status === 'fechado' ? 'autorizado' : 'pendente') + '">' + p.status + '</span></div>' +
      '</div>' +
      '<div class="pagamento-meta">' + new Date(p.data + 'T00:00:00').toLocaleDateString('pt-BR') + ' · ' + formatMoeda(p.valor) + (p.descricao ? ' · ' + escapeHtml(p.descricao) : '') + '</div>' +
      '<div class="fin-action-row">' +
        '<button class="btn-ghost btn-small" onclick="alternarStatusPagamento(\'' + p.id + '\')">' + (p.status === 'aberto' ? 'marcar como fechado' : 'reabrir pagamento') + '</button>' +
        '<button class="btn-ghost btn-small" onclick="removerPagamento(\'' + p.id + '\')">remover pagamento</button>' +
      '</div>' +
      '<div class="pagamento-docs">' + docsHtml + '</div>';
    wrap.appendChild(card);
  });
}

/* ---- OPERAÇÕES FINANCEIRAS ---- */
function adicionarContratada(){
  if(!convenioAtualId) return;
  const razaoSocial = document.getElementById('ct_razaoSocial').value.trim();
  const cnpj = document.getElementById('ct_cnpj').value.trim();
  const numeroContrato = document.getElementById('ct_numeroContrato').value.trim();
  const objeto = document.getElementById('ct_objeto').value.trim();
  const valorContrato = parseMoeda(document.getElementById('ct_valorContrato').value);
  if(!razaoSocial || !numeroContrato){ alert('Informe ao menos a razão social e o número do contrato.'); return; }
  const c = convenios.find(x => x.id === convenioAtualId);
  c.financeiro.contratadas.push({ id: gerarIdLancamento('ct'), razaoSocial, cnpj, numeroContrato, objeto, valorContrato, arquivoContrato: null, arquivoContratoDataUrl: null });
  ['ct_razaoSocial','ct_cnpj','ct_numeroContrato','ct_objeto','ct_valorContrato'].forEach(i => document.getElementById(i).value = '');
  salvarEstado();
  renderFinanceiro();
}

/* Anexa o arquivo do contrato à contratada, seguindo o mesmo padrão usado
 * em anexarDoc/anexarDocPagamento (aviso de tamanho + fallback sem o
 * conteúdo do arquivo caso o navegador não tenha espaço de armazenamento). */
function anexarContrato(contratadaId, file){
  if(!file || !convenioAtualId) return;
  const c = convenios.find(x => x.id === convenioAtualId);
  if(!c) return;
  const contratada = (c.financeiro.contratadas || []).find(x => x.id === contratadaId);
  if(!contratada) return;
  const LIMITE_AVISO = 4 * 1024 * 1024;

  if(file.size > LIMITE_AVISO){
    const continuar = confirm('O arquivo "' + file.name + '" tem ' + (file.size/1024/1024).toFixed(1) + 'MB. Deseja tentar anexar?');
    if(!continuar){
      contratada.arquivoContrato = file.name;
      contratada.arquivoContratoDataUrl = null;
      salvarEstado();
      renderFinanceiro();
      return;
    }
  }

  const reader = new FileReader();
  reader.onload = function(){
    contratada.arquivoContrato = file.name;
    contratada.arquivoContratoDataUrl = reader.result;
    const ok = salvarEstado();
    if(!ok){
      contratada.arquivoContratoDataUrl = null;
      salvarEstado();
      alert('Não foi possível salvar o conteúdo do arquivo (limite do navegador). O nome ficou registrado.');
    }
    renderFinanceiro();
  };
  reader.onerror = function(){
    contratada.arquivoContrato = file.name;
    contratada.arquivoContratoDataUrl = null;
    salvarEstado();
    renderFinanceiro();
  };
  reader.readAsDataURL(file);
}

function removerContratada(id){
  const c = convenios.find(x => x.id === convenioAtualId);
  const emUso = c.financeiro.pagamentos.some(p => p.contratadaId === id);
  if(emUso){ alert('Esta contratada já possui pagamentos e não pode ser removida.'); return; }
  if(!confirm('Remover esta contratada?')) return;
  c.financeiro.contratadas = c.financeiro.contratadas.filter(x => x.id !== id);
  salvarEstado();
  renderFinanceiro();
}

function novoPagamento(){
  if(!convenioAtualId) return;
  const c = convenios.find(x => x.id === convenioAtualId);
  const contratadaId = document.getElementById('pg_contratada').value;
  const valor = parseMoeda(document.getElementById('pg_valor').value);
  const data = document.getElementById('pg_data').value;
  const descricao = document.getElementById('pg_descricao').value.trim();
  if(!contratadaId){ alert('Selecione uma contratada.'); return; }
  if(!valor || !data){ alert('Informe o valor e a data do pagamento.'); return; }

  // BLOQUEIO: pagamento não pode exceder o saldo disponível
  const resumo = calcularResumoFinanceiro(convenioAtualId);
  if(valor > resumo.saldoTotal + 0.009){
    alert('Este pagamento (' + formatMoeda(valor) + ') excede o saldo disponível (' + formatMoeda(resumo.saldoTotal) + '). Reduza o valor ou adicione entradas antes de lançar.');
    return;
  }

  c.financeiro.pagamentos.push({
    id: gerarIdLancamento('pg'),
    numero: c.financeiro.pagamentos.length + 1,
    contratadaId, valor, data, descricao,
    status: 'aberto',
    docs: docsVaziosPagamento()
  });
  document.getElementById('pg_valor').value = '';
  document.getElementById('pg_data').value = '';
  document.getElementById('pg_descricao').value = '';
  salvarEstado();
  renderFinanceiro();
}

function removerPagamento(id){
  if(!confirm('Remover este pagamento e todos os documentos?')) return;
  const c = convenios.find(x => x.id === convenioAtualId);
  c.financeiro.pagamentos = c.financeiro.pagamentos.filter(p => p.id !== id);
  salvarEstado();
  renderFinanceiro();
}

function alternarStatusPagamento(id){
  const c = convenios.find(x => x.id === convenioAtualId);
  const p = c.financeiro.pagamentos.find(x => x.id === id);
  if(!p) return;
  if(p.status === 'aberto'){
    const semINSS = !p.docs.inss.anexado;
    const semTributos = !p.docs.tributos.anexado;
    if((semINSS || semTributos) && !confirm('Este pagamento ainda não tem comprovante de INSS e/ou quitação de tributos. Deseja marcar como fechado?')) return;
    p.status = 'fechado';
  }else{
    p.status = 'aberto';
  }
  salvarEstado();
  renderFinanceiro();
}

function anexarDocPagamento(pagamentoId, catId, file){
  if(!file || !convenioAtualId) return;
  const c = convenios.find(x => x.id === convenioAtualId);
  const p = c.financeiro.pagamentos.find(x => x.id === pagamentoId);
  if(!p) return;
  if(!p.docs[catId]) p.docs[catId] = { anexado:false, arquivo:null, arquivoDataUrl:null };
  const reader = new FileReader();
  reader.onload = function(){
    p.docs[catId].anexado = true;
    p.docs[catId].arquivo = file.name;
    p.docs[catId].arquivoDataUrl = reader.result;
    const ok = salvarEstado();
    if(!ok){
      p.docs[catId].arquivoDataUrl = null;
      salvarEstado();
      alert('Não foi possível salvar o conteúdo do arquivo (limite do navegador).');
    }
    renderFinanceiro();
  };
  reader.onerror = function(){
    p.docs[catId].anexado = true;
    p.docs[catId].arquivo = file.name;
    p.docs[catId].arquivoDataUrl = null;
    salvarEstado();
    renderFinanceiro();
  };
  reader.readAsDataURL(file);
}

/* Remove um único anexo de um pagamento (mantém o pagamento e as demais
 * categorias de documento intactas). */
function removerDocPagamento(pagamentoId, catId){
  if(!convenioAtualId) return;
  const c = convenios.find(x => x.id === convenioAtualId);
  if(!c) return;
  const p = c.financeiro.pagamentos.find(x => x.id === pagamentoId);
  if(!p || !p.docs[catId]) return;
  const cat = categoriasPagamentoDocs.find(x => x.id === catId);
  if(!confirm('Remover o anexo "' + (cat ? cat.nome : catId) + '" deste pagamento?')) return;
  p.docs[catId] = { anexado:false, arquivo:null, arquivoDataUrl:null };
  salvarEstado();
  renderFinanceiro();
}

/* Reúne todos os anexos de pagamentos do convênio atual (inclusive os que
 * vieram de um backup importado) e monta um único .zip para download. */
function baixarTodosAnexosPagamentos(){
  if(!convenioAtualId) return;
  const c = convenios.find(x => x.id === convenioAtualId);
  if(!c) return;
  const pagamentos = (c.financeiro && c.financeiro.pagamentos) || [];

  const arquivos = [];
  pagamentos.slice().sort((a,b) => a.numero - b.numero).forEach(p => {
    categoriasPagamentoDocs.forEach(cat => {
      const item = p.docs && p.docs[cat.id];
      if(item && item.anexado && item.arquivoDataUrl){
        arquivos.push({
          pasta: 'pagamento-' + p.numero,
          nome: item.arquivo || (cat.id + '.bin'),
          dataUrl: item.arquivoDataUrl
        });
      }
    });
  });

  if(!arquivos.length){
    alert('Nenhum anexo com conteúdo salvo foi encontrado nos pagamentos deste convênio.');
    return;
  }
  if(typeof JSZip === 'undefined'){
    alert('Não foi possível carregar o componente de compactação (JSZip). Verifique sua conexão e tente novamente.');
    return;
  }

  const zip = new JSZip();
  const usados = {};
  arquivos.forEach(a => {
    const chave = a.pasta + '/' + a.nome;
    let nomeFinal = a.nome;
    if(usados[chave] !== undefined){
      usados[chave]++;
      const partes = a.nome.split('.');
      const ext = partes.length > 1 ? '.' + partes.pop() : '';
      nomeFinal = partes.join('.') + '-' + usados[chave] + ext;
    } else {
      usados[chave] = 0;
    }
    const base64 = (a.dataUrl.split(',')[1]) || '';
    zip.file(a.pasta + '/' + nomeFinal, base64, { base64: true });
  });

  zip.generateAsync({ type: 'blob' }).then(blob => {
    const url = URL.createObjectURL(blob);
    const el = document.createElement('a');
    el.href = url;
    el.download = 'anexos-pagamentos-' + (c.numero || c.id) + '.zip';
    document.body.appendChild(el);
    el.click();
    el.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }).catch(() => {
    alert('Não foi possível gerar o arquivo .zip com os anexos.');
  });
}

/* Apaga de uma vez o conteúdo de todos os anexos de todos os pagamentos do
 * convênio atual (os pagamentos e os demais dados permanecem intactos). */
function excluirTodosAnexosPagamentos(){
  if(!convenioAtualId) return;
  const c = convenios.find(x => x.id === convenioAtualId);
  if(!c) return;
  const pagamentos = (c.financeiro && c.financeiro.pagamentos) || [];

  let total = 0;
  pagamentos.forEach(p => {
    categoriasPagamentoDocs.forEach(cat => {
      if(p.docs && p.docs[cat.id] && p.docs[cat.id].anexado) total++;
    });
  });

  if(!total){
    alert('Não há anexos de pagamentos para excluir neste convênio.');
    return;
  }
  if(!confirm('Isso vai excluir ' + total + ' anexo(s) de todos os pagamentos deste convênio (os pagamentos em si não serão apagados). Deseja continuar?')) return;

  pagamentos.forEach(p => {
    categoriasPagamentoDocs.forEach(cat => {
      p.docs[cat.id] = { anexado:false, arquivo:null, arquivoDataUrl:null };
    });
  });
  salvarEstado();
  renderFinanceiro();
  alert('Anexos removidos.');
}

/* Lançamentos mensais (extrato bancário e rendimento) compartilham a mesma
 * estrutura — mês + dois valores + observação — por isso usam um único par
 * de funções genéricas em vez de uma cópia para cada tipo. */
const LANCAMENTO_MENSAL_CONFIG = {
  extratos: { prefixo: 'ex', campoA: 'entradas', campoB: 'saidas' },
  rendimentos: { prefixo: 'rd', campoA: 'aplicado', campoB: 'rendimento' }
};

function adicionarLancamentoMensal(tipo){
  if(!convenioAtualId) return;
  const cfg = LANCAMENTO_MENSAL_CONFIG[tipo];
  const mes = document.getElementById(cfg.prefixo + '_mes').value;
  const valorA = parseMoeda(document.getElementById(cfg.prefixo + '_' + cfg.campoA).value);
  const valorB = parseMoeda(document.getElementById(cfg.prefixo + '_' + cfg.campoB).value);
  const obs = document.getElementById(cfg.prefixo + '_obs').value.trim();
  if(!mes){ alert('Informe o mês de referência.'); return; }
  const c = convenios.find(x => x.id === convenioAtualId);
  const lancamento = { id: gerarIdLancamento(cfg.prefixo), mes, obs, criadoEm: new Date().toISOString() };
  lancamento[cfg.campoA] = valorA;
  lancamento[cfg.campoB] = valorB;
  c.financeiro[tipo].push(lancamento);
  document.getElementById(cfg.prefixo + '_' + cfg.campoA).value = '';
  document.getElementById(cfg.prefixo + '_' + cfg.campoB).value = '';
  document.getElementById(cfg.prefixo + '_obs').value = '';
  salvarEstado();
  renderFinanceiro();
}

function removerLancamentoMensal(tipo, id){
  const c = convenios.find(x => x.id === convenioAtualId);
  if(!confirm('Remover este lançamento?')) return;
  c.financeiro[tipo] = c.financeiro[tipo].filter(item => item.id !== id);
  salvarEstado();
  renderFinanceiro();
}

function adicionarExtrato(){ adicionarLancamentoMensal('extratos'); }
function removerExtrato(id){ removerLancamentoMensal('extratos', id); }
function adicionarRendimento(){ adicionarLancamentoMensal('rendimentos'); }
function removerRendimento(id){ removerLancamentoMensal('rendimentos', id); }

function solicitarAutorizacao(){
  if(!convenioAtualId) return;
  const valor = parseMoeda(document.getElementById('au_valor').value);
  const finalidade = document.getElementById('au_finalidade').value.trim();
  if(!valor || !finalidade){ alert('Informe o valor e a finalidade.'); return; }
  const c = convenios.find(x => x.id === convenioAtualId);
  c.financeiro.autorizacoes.push({ id: gerarIdLancamento('au'), data: new Date().toISOString(), valor, finalidade, status: 'pendente' });
  document.getElementById('au_valor').value = '';
  document.getElementById('au_finalidade').value = '';
  salvarEstado();
  renderFinanceiro();
}

function decidirAutorizacao(id, status){
  const c = convenios.find(x => x.id === convenioAtualId);
  const a = c.financeiro.autorizacoes.find(x => x.id === id);
  if(!a) return;
  const msg = status === 'autorizado'
    ? 'Confirma que o convenente autorizou o uso deste valor?'
    : 'Confirma que o convenente negou esta solicitação?';
  if(!confirm(msg)) return;
  a.status = status;
  a.dataDecisao = new Date().toISOString();
  salvarEstado();
  renderFinanceiro();
}

function registrarUsoRendimento(){
  if(!convenioAtualId) return;
  const c = convenios.find(x => x.id === convenioAtualId);
  const autorizacaoId = document.getElementById('us_autorizacao').value;
  const valor = parseMoeda(document.getElementById('us_valor').value);
  const descricao = document.getElementById('us_descricao').value.trim();
  const a = c.financeiro.autorizacoes.find(x => x.id === autorizacaoId);
  if(!a || a.status !== 'autorizado'){ alert('Selecione uma autorização com status "autorizado".'); return; }
  const usadoNaAutorizacao = c.financeiro.usos.filter(u => u.autorizacaoId === a.id).reduce((s,u) => s+u.valor, 0);
  const disponivelNaAutorizacao = a.valor - usadoNaAutorizacao;
  if(!valor || valor > disponivelNaAutorizacao + 0.0001){
    alert('O valor não pode exceder o saldo autorizado (' + formatMoeda(disponivelNaAutorizacao) + ').');
    return;
  }
  c.financeiro.usos.push({ id: gerarIdLancamento('us'), data: new Date().toISOString(), autorizacaoId: a.id, valor, descricao });
  document.getElementById('us_valor').value = '';
  document.getElementById('us_descricao').value = '';
  salvarEstado();
  renderFinanceiro();
}

/* ============================================================
 * RELATÓRIOS — PUXAM DA ESTRUTURA UNIFICADA
 * ============================================================ */
function atualizarViewRelatorio(){
  const select = document.getElementById('relatorioConvenioSelect');
  const vazio = document.getElementById('relatorioConvenioVazio');
  const conteudo = document.getElementById('relatorioConvenioConteudo');

  if(!convenios.length){
    select.innerHTML = '';
    vazio.classList.remove('hidden');
    conteudo.innerHTML = '';
  }else{
    vazio.classList.add('hidden');
    const selecionadoAtual = select.value && convenios.find(c => c.id === select.value) ? select.value : (convenioAtualId || convenios[0].id);
    select.innerHTML = convenios.map(c =>
      '<option value="' + c.id + '"' + (c.id === selecionadoAtual ? ' selected' : '') + '>' +
      escapeHtml((c.numero || '(sem número)') + ' — ' + (c.programa || 'sem programa')) + '</option>'
    ).join('');
    renderRelatorioConvenio();
  }
  renderRelatorioGeral();
}

function renderRelatorioConvenio(){
  const select = document.getElementById('relatorioConvenioSelect');
  const conteudo = document.getElementById('relatorioConvenioConteudo');
  const id = select.value;
  const c = convenios.find(x => x.id === id);
  if(!c){ conteudo.innerHTML = ''; return; }

  const resumo = calcularResumoFinanceiro(id);
  const fin = resumo.fin;

  const linhasExtrato = (fin.extratos||[]).slice().sort((a,b) => a.mes.localeCompare(b.mes)).map(e =>
    '<tr><td>' + formatMes(e.mes) + '</td><td class="num">' + formatMoeda(e.entradas) + '</td><td class="num">' + formatMoeda(e.saidas) + '</td><td class="num">' + formatMoeda(e.entradas - e.saidas) + '</td></tr>'
  ).join('') || '<tr class="fin-empty-row"><td colspan="4">Sem lançamentos de extrato.</td></tr>';

  const linhasRendimento = (fin.rendimentos||[]).slice().sort((a,b) => a.mes.localeCompare(b.mes)).map(r =>
    '<tr><td>' + formatMes(r.mes) + '</td><td class="num">' + formatMoeda(r.aplicado) + '</td><td class="num">' + formatMoeda(r.rendimento) + '</td></tr>'
  ).join('') || '<tr class="fin-empty-row"><td colspan="3">Sem lançamentos de rendimento.</td></tr>';

  const linhasAutorizacao = (fin.autorizacoes||[]).slice().map(a =>
    '<tr><td>' + new Date(a.data).toLocaleDateString('pt-BR') + '</td><td>' + escapeHtml(a.finalidade) + '</td><td class="num">' + formatMoeda(a.valor) + '</td><td><span class="status-badge ' + a.status + '">' + a.status + '</span></td></tr>'
  ).join('') || '<tr class="fin-empty-row"><td colspan="4">Sem solicitações de autorização.</td></tr>';

  const linhasPagamentos = (fin.pagamentos||[]).slice().sort((a,b) => a.numero - b.numero).map(p => {
    const contratada = (fin.contratadas||[]).find(x => x.id === p.contratadaId);
    return '<tr><td>' + p.numero + '</td><td>' + escapeHtml(contratada ? contratada.razaoSocial : '(removida)') + '</td>' +
      '<td>' + new Date(p.data + 'T00:00:00').toLocaleDateString('pt-BR') + '</td>' +
      '<td class="num">' + formatMoeda(p.valor) + '</td>' +
      '<td><span class="status-badge ' + (p.status === 'fechado' ? 'autorizado' : 'pendente') + '">' + p.status + '</span></td></tr>';
  }).join('') || '<tr class="fin-empty-row"><td colspan="5">Sem pagamentos lançados.</td></tr>';

  conteudo.innerHTML =
    '<div class="fin-block-title" style="margin-top:20px;">' + escapeHtml(c.numero || '(sem número)') + ' — ' + escapeHtml(c.programa || '') + '</div>' +
    '<div class="fin-block-sub">Proponente: ' + escapeHtml(c.proponente || '—') + ' · Valor: ' + formatMoeda(resumo.valorConvenio) + ' · Saldo: <b style="color:' + (resumo.saldoTotal < 0 ? 'var(--seal-deep)' : 'var(--teal-deep)') + '">' + formatMoeda(resumo.saldoTotal) + '</b></div>' +
    '<div class="fin-summary-grid">' +
      '<div class="fin-summary-card"><div class="fin-summary-label">Movimento do extrato</div><div class="fin-summary-value teal">' + formatMoeda(resumo.movExtrato) + '</div></div>' +
      '<div class="fin-summary-card"><div class="fin-summary-label">Rendimento acumulado</div><div class="fin-summary-value gold">' + formatMoeda(resumo.totalRendimento) + '</div></div>' +
      '<div class="fin-summary-card"><div class="fin-summary-label">Total pago às contratadas</div><div class="fin-summary-value seal">' + formatMoeda(resumo.totalPago) + '</div></div>' +
      '<div class="fin-summary-card tot"><div class="fin-summary-label">Saldo total</div><div class="fin-summary-value">' + formatMoeda(resumo.saldoTotal) + '</div></div>' +
    '</div>' +
    '<div class="fin-card-title">Pagamentos às contratadas</div>' +
    '<table class="fin-table"><thead><tr><th>Nº</th><th>Contratada</th><th>Data</th><th>Valor</th><th>Status</th></tr></thead><tbody>' + linhasPagamentos + '</tbody></table>' +
    '<div class="fin-card-title" style="margin-top:20px;">Extrato bancário mensal</div>' +
    '<table class="fin-table"><thead><tr><th>Mês</th><th>Entradas</th><th>Saídas</th><th>Saldo do mês</th></tr></thead><tbody>' + linhasExtrato + '</tbody></table>' +
    '<div class="fin-card-title" style="margin-top:20px;">Rendimento mensal</div>' +
    '<table class="fin-table"><thead><tr><th>Mês</th><th>Aplicado</th><th>Rendimento</th></tr></thead><tbody>' + linhasRendimento + '</tbody></table>' +
    '<div class="fin-card-title" style="margin-top:20px;">Autorizações de uso do rendimento</div>' +
    '<table class="fin-table"><thead><tr><th>Data</th><th>Finalidade</th><th>Valor</th><th>Status</th></tr></thead><tbody>' + linhasAutorizacao + '</tbody></table>';
}

function renderRelatorioGeral(){
  const tbody = document.getElementById('tabelaRelatorioGeral');
  if(!tbody) return;
  if(!convenios.length){
    tbody.innerHTML = '<tr class="fin-empty-row"><td colspan="6">Nenhum convênio cadastrado.</td></tr>';
    return;
  }
  tbody.innerHTML = convenios.map(c => {
    const resumo = calcularResumoFinanceiro(c.id);
    return '<tr><td>' + escapeHtml(c.numero || '(sem número)') + '</td>' +
      '<td>' + escapeHtml(c.programa || '—') + '</td>' +
      '<td>' + escapeHtml(c.proponente || '—') + '</td>' +
      '<td class="num">' + formatMoeda(resumo.valorConvenio) + '</td>' +
      '<td class="num"><b style="color:' + (resumo.saldoTotal < 0 ? 'var(--seal-deep)' : 'var(--teal-deep)') + '">' + formatMoeda(resumo.saldoTotal) + '</b></td>' +
      '<td>' + escapeHtml(c.prazoLimitePC || '—') + '</td></tr>';
  }).join('');
}

function exportarCSVFinanceiro(){
  const select = document.getElementById('relatorioConvenioSelect');
  const id = select.value;
  const c = convenios.find(x => x.id === id);
  if(!c){ alert('Selecione um convênio para exportar.'); return; }
  const fin = c.financeiro;

  const linhas = [['tipo','mes_ou_data','campo1','campo2','observacao_status']];
  (fin.contratadas||[]).forEach(ct => linhas.push(['contratada', ct.numeroContrato, ct.valorContrato, '', ct.razaoSocial + ' (' + (ct.cnpj||'sem CNPJ') + ')']));
  (fin.pagamentos||[]).forEach(p => {
    const contratada = (fin.contratadas||[]).find(x => x.id === p.contratadaId);
    linhas.push(['pagamento', p.data, p.valor, '', 'nº ' + p.numero + ' — ' + (contratada ? contratada.razaoSocial : '(removida)') + ' (' + p.status + ')']);
  });
  (fin.extratos||[]).forEach(e => linhas.push(['extrato', e.mes, e.entradas, e.saidas, e.obs || '']));
  (fin.rendimentos||[]).forEach(r => linhas.push(['rendimento', r.mes, r.aplicado, r.rendimento, r.obs || '']));
  (fin.autorizacoes||[]).forEach(a => linhas.push(['autorizacao', new Date(a.data).toLocaleDateString('pt-BR'), a.valor, '', a.finalidade + ' (' + a.status + ')']));
  (fin.usos||[]).forEach(u => linhas.push(['uso_rendimento', new
Date(u.data).toLocaleDateString('pt-BR'), u.valor, '', u.descricao || '']));

  const csv = linhas.map(l => l.map(v => '"' + String(v).replace(/"/g,'""') + '"').join(';')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'financeiro-' + (c.numero || id) + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ============================================================
 * GERAR DOCUMENTO — AUTO-PREENCHIDO PELO CONVÊNIO ATIVO
 * ============================================================ */
function proximoProtocolo(fonte){
  protocoloSeq += 1;
  salvarEstado();
  const ano = new Date().getFullYear();
  return 'GS-' + (fonte || 'GEN').slice(0,3).toUpperCase() + '-' + ano + '-' + String(protocoloSeq).padStart(5,'0');
}

function tentarPreEncherDocumento(){
  const c = convenios.find(x => x.id === convenioAtualId);
  if(!c) return;
  // Extrai município do campo municipioProp (ex: "Itapissuma / PE" -> "Itapissuma")
  const municipioRaw = c.municipioProp || '';
  const municipio = municipioRaw.split('/')[0].trim() || '';
  // Extrai fonte do programa
  const programa = (c.programa || '').toUpperCase();
  let fonte = 'FNDE';
  if(programa.includes('SUDENE')) fonte = 'SUDENE';
  else if(programa.includes('COMPESA')) fonte = 'COMPESA';
  else if(programa.includes('SEDUH')) fonte = 'SEDUH/PE';
  else if(programa.includes('PROMAQ')) fonte = 'PROMAQ';
  
  // Preenche campos automaticamente
  document.getElementById('doc_municipio').value = municipio;
  document.getElementById('doc_fonte').value = fonte;
  document.getElementById('doc_objeto').value = c.programa || '';
  document.getElementById('doc_valor').value = c.valor || '';
  document.getElementById('doc_bairro').value = c.bairroProp || '';
  document.getElementById('doc_situacao').value = '';
  
  // Mostra alerta sutil
  const alert = document.getElementById('docAutoAlert');
  alert.innerHTML = '<b>Campos preenchidos automaticamente</b> a partir do convênio ativo (' + escapeHtml(c.numero || '') + '). Revise e ajuste conforme necessário antes de gerar.';
  alert.classList.remove('quiet');
  alert.style.background = 'var(--teal-soft)';
  alert.style.borderColor = 'rgba(39,99,88,0.35)';
  alert.style.color = 'var(--teal-deep)';
}

function preencherDoConvenio(){
  const c = convenios.find(x => x.id === convenioAtualId);
  if(!c){ alert('Nenhum convênio selecionado. Selecione um convênio no Painel geral primeiro.'); return; }
  tentarPreEncherDocumento();
  alert('Campos preenchidos a partir do convênio "' + (c.numero || 'sem número') + '". Revise antes de gerar.');
}

/* ============================================================
 * MOTOR DE REDAÇÃO LOCAL — 100% offline, sem chamada externa
 * Monta a Justificativa a partir de um banco de frases técnicas
 * (variado por fonte de recurso) combinado com os dados concretos
 * informados pelo usuário. Não depende de internet nem de chave
 * de API — por isso funciona sempre, em qualquer computador.
 * ============================================================ */
const BANCO_FRASES = {
  contextualizacao: {
    FNDE: (d) => `O Município de ${d.municipio} apresenta, na rede de ensino público municipal, demanda por ${d.objeto.toLowerCase()}, tendo em vista o compromisso institucional de ampliação e qualificação do atendimento educacional. A presente proposta busca viabilizar, por meio de recurso do Fundo Nacional de Desenvolvimento da Educação (FNDE), a execução do objeto descrito, em conformidade com as diretrizes do programa correspondente.`,
    SUDENE: (d) => `O Município de ${d.municipio}, integrante da área de atuação da Superintendência do Desenvolvimento do Nordeste (SUDENE), identifica a necessidade de ${d.objeto.toLowerCase()} como medida estruturante para o desenvolvimento regional. A proposta se insere no conjunto de ações voltadas à redução das desigualdades regionais previstas nos instrumentos de fomento da SUDENE.`,
    COMPESA: (d) => `O Município de ${d.municipio} apresenta demanda relacionada a ${d.objeto.toLowerCase()}, no âmbito da infraestrutura de saneamento básico. A parceria com a Companhia Pernambucana de Saneamento (COMPESA) visa assegurar a execução técnica adequada do objeto, em consonância com os padrões de qualidade exigidos para serviços de abastecimento e esgotamento sanitário.`,
    'SEDUH/PE': (d) => `O Município de ${d.municipio} apresenta demanda de infraestrutura urbana relacionada a ${d.objeto.toLowerCase()}, alinhada às diretrizes de desenvolvimento urbano e habitação da Secretaria de Desenvolvimento Urbano e Habitação do Estado de Pernambuco (SEDUH/PE). A proposta busca qualificar o espaço urbano e ampliar o acesso da população aos serviços correspondentes.`,
    PROMAQ: (d) => `O Município de ${d.municipio} apresenta demanda por ${d.objeto.toLowerCase()}, com vistas ao fortalecimento da capacidade operacional da administração municipal. A proposta se enquadra nos objetivos do Programa de Modernização de Máquinas e Equipamentos (PROMAQ), voltado à ampliação da infraestrutura de máquinas, equipamentos e implementos dos entes federativos.`,
  },
  problema: (d) => {
    const local = d.bairro ? ` na localidade de ${d.bairro}` : '';
    const dado = d.numero ? ` Estima-se que a intervenção proposta impacte diretamente o quantitativo de ${d.numero} identificado no diagnóstico local.` : '';
    return `Atualmente${local}, verifica-se a seguinte situação: ${d.situacaoAtual}. Essa condição compromete a plena prestação do serviço à população e demanda intervenção técnica planejada, sob pena de agravamento do quadro identificado.${dado}`;
  },
  solucao: (d) => {
    const valorTxt = d.valor ? ` no valor total de R$ ${d.valor}` : '';
    return `Para equacionar o problema identificado, propõe-se a execução de ${d.objeto.toLowerCase()}${valorTxt}, com recursos oriundos de ${d.fonte}. A intervenção contempla as etapas técnicas necessárias à plena execução do objeto, observados os padrões normativos aplicáveis ao instrumento e a legislação de regência.`;
  },
  beneficio: (d) => {
    const desejada = d.situacaoDesejada ? ` A situação desejada após a intervenção é: ${d.situacaoDesejada}.` : '';
    return `Espera-se, com a execução do objeto, a melhoria efetiva das condições atualmente enfrentadas${d.bairro ? ' em ' + d.bairro : ''}, com benefício direto à população do Município de ${d.municipio}.${desejada} A presente Justificativa integra o processo de instrução do instrumento e subsidia a análise técnica do órgão concedente.`;
  }
};

/* Separa "situação atual x desejada" em duas partes quando o usuário
 * usa "x", "vs" ou quebra de linha para diferenciar; senão usa o texto
 * inteiro como situação atual. */
function separarSituacao(texto){
  const partes = texto.split(/\s+(?:x|vs\.?|→|->)\s+|\n/i).map(s => s.trim()).filter(Boolean);
  if(partes.length >= 2) return { atual: partes[0], desejada: partes.slice(1).join('; ') };
  return { atual: texto.trim(), desejada: '' };
}

function gerarTextoLocal(dados){
  const { atual, desejada } = separarSituacao(dados.situacao || '');
  const d = { ...dados, situacaoAtual: atual || 'não detalhada', situacaoDesejada: desejada };
  const ctxFn = BANCO_FRASES.contextualizacao[dados.fonte] || BANCO_FRASES.contextualizacao.FNDE;
  const paragrafos = [ctxFn(d), BANCO_FRASES.problema(d), BANCO_FRASES.solucao(d), BANCO_FRASES.beneficio(d)];
  return paragrafos.join('\n\n');
}

function gerarDocumento(){
  const btn = document.getElementById('gerarBtn');
  const netStatus = document.getElementById('netStatus');
  const docWrap = document.getElementById('docWrap');
  const paper = document.getElementById('paper');
  const checklist = document.getElementById('checklist');
  const stamp = document.getElementById('stamp');
  const errorBox = document.getElementById('errorBox');

  const dados = {
    municipio: document.getElementById('doc_municipio').value,
    fonte: document.getElementById('doc_fonte').value,
    objeto: document.getElementById('doc_objeto').value,
    valor: document.getElementById('doc_valor').value,
    bairro: document.getElementById('doc_bairro').value,
    numero: document.getElementById('doc_numero').value,
    situacao: document.getElementById('doc_situacao').value,
  };

  const camposFaltando = [];
  if(!dados.municipio.trim()) camposFaltando.push('Município');
  if(!dados.objeto.trim()) camposFaltando.push('Objeto do projeto');
  if(!dados.situacao.trim()) camposFaltando.push('Situação atual x desejada');
  if(camposFaltando.length){
    errorBox.innerHTML = '<div class="error-box"><b>Preencha os campos obrigatórios:</b><br>' + camposFaltando.join(', ') + '</div>';
    docWrap.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  netStatus.innerHTML = '<span class="dot" style="background:var(--gold)"></span>montando texto…';
  docWrap.classList.remove('hidden');
  paper.classList.add('loading');
  paper.textContent = 'Gerando texto a partir dos dados do projeto…';
  checklist.innerHTML = '';
  errorBox.innerHTML = '';
  stamp.textContent = '';

  // Geração local, síncrona — não depende de internet nem de chave de API,
  // por isso funciona sempre, mesmo offline ou fora do ambiente do Claude.
  setTimeout(() => {
    try{
      const texto = gerarTextoLocal(dados);

      paper.classList.remove('loading');
      paper.textContent = texto;

      const temNumero = /\d/.test(texto);
      const temBairro = dados.bairro && texto.toLowerCase().includes(dados.bairro.toLowerCase().split(' ')[0]);
      const temValor = !dados.valor || texto.includes(dados.valor.split(',')[0].slice(0,3)) || /R\$/.test(texto);

      checklist.innerHTML = '';
      checklist.appendChild(chip('Contém dado numérico', temNumero));
      checklist.appendChild(chip('Cita local específico', temBairro));
      checklist.appendChild(chip('Referencia valor do projeto', temValor));

      const protocolo = proximoProtocolo(dados.fonte);
      const hoje = new Date().toLocaleDateString('pt-BR');
      stamp.textContent = 'GERADO EM ' + hoje + '\nPROTOCOLO ' + protocolo;

      netStatus.innerHTML = '<span class="dot" style="background:var(--teal)"></span>gerado localmente — nenhum dado saiu deste computador';
    }catch(err){
      paper.classList.remove('loading');
      paper.textContent = '';
      errorBox.innerHTML = '<div class="error-box"><b>Não foi possível gerar o documento.</b><br>' + escapeHtml(err.message) + '</div>';
      netStatus.innerHTML = '<span class="dot" style="background:var(--seal)"></span>falha ao gerar';
    }finally{
      btn.disabled = false;
    }
  }, 350);
}

function chip(label, ok){
  const el = document.createElement('div');
  el.className = 'chip ' + (ok ? 'ok' : 'fail');
  el.textContent = (ok ? '✓ ' : '✕ ') + label;
  return el;
}

/* ============================================================
 * DOCUMENTOS POR IA — geração multi-tipo vinculada ao convênio
 * ============================================================
 * Cobre os documentos administrativos mais comuns do dia a dia de
 * Carlos: Ofício, Memorando, DFD, ETP, Termo de Referência, Projeto
 * Básico, Matriz de Risco, Justificativa Técnica e, a partir de um
 * edital ou programa anexado, um Plano de Ação com análise SWOT e
 * tabela 5W2H.
 *
 * IMPORTANTE — ONDE ENTRA A IA REAL:
 * Este protótipo HTML roda sozinho, sem backend, então a função
 * `chamarModeloIA()` abaixo por enquanto SIMULA a resposta localmente
 * (mesma lógica de "motor de redação local" já usada na Justificativa
 * do Projeto). Quando o CaptaGov estiver rodando como app Electron,
 * troque o corpo de `chamarModeloIA()` por uma chamada real à API da
 * Anthropic feita no processo principal (main process) do Electron —
 * nunca direto do navegador/renderer, para não expor a chave de API.
 * Exemplo do que entraria lá (não executado aqui):
 *
 *   const resp = await fetch("https://api.anthropic.com/v1/messages", {
 *     method: "POST",
 *     headers: {
 *       "content-type": "application/json",
 *       "x-api-key": CHAVE_API_GUARDADA_NO_MAIN_PROCESS,
 *       "anthropic-version": "2023-06-01"
 *     },
 *     body: JSON.stringify({
 *       model: "claude-sonnet-4-6",
 *       max_tokens: 4000,
 *       messages: [{ role: "user", content: prompt }]
 *     })
 *   });
 *   const data = await resp.json();
 *   const texto = data.content.map(b => b.text || '').join('\n');
 *
 * ============================================================ */

const TIPOS_DOCUMENTO_IA = [
  { id:'oficio', nome:'Ofício', icone:'✉️', desc:'Comunicação oficial a outro órgão, empresa ou autoridade.', temDestinatario:true },
  { id:'memorando', nome:'Memorando', icone:'🗂️', desc:'Comunicação interna entre setores da própria administração.', temDestinatario:true },
  { id:'dfd', nome:'DFD — Formalização da Demanda', icone:'📝', desc:'Formaliza e justifica a necessidade da contratação (Lei nº 14.133/2021).' },
  { id:'etp', nome:'ETP — Estudo Técnico Preliminar', icone:'📐', desc:'Analisa a viabilidade técnica e a melhor solução para a contratação.' },
  { id:'tr', nome:'Termo de Referência (TR)', icone:'📋', desc:'Especifica objeto, requisitos, obrigações e critérios de julgamento.' },
  { id:'projetoBasico', nome:'Projeto Básico', icone:'🏗️', desc:'Detalha tecnicamente a obra ou o serviço de engenharia a executar.' },
  { id:'matrizRisco', nome:'Matriz de Risco', icone:'⚠️', desc:'Identifica riscos do contrato e aloca a responsabilidade entre as partes.' },
  { id:'justificativaTecnica', nome:'Justificativa Técnica', icone:'📄', desc:'Fundamenta a necessidade e a solução do projeto ou convênio.' },
  { id:'planoAcao', nome:'Plano de Ação (SWOT + 5W2H)', icone:'🎯', desc:'A partir de um edital ou programa, analisa a viabilidade e monta o plano de ação.' },
];

let tipoDocIASelecionado = null;
let ultimoDocumentoGeradoIA = null;

function renderTiposDocIA(){
  const wrap = document.getElementById('tipoDocGrid');
  if(!wrap) return;
  wrap.innerHTML = '';
  TIPOS_DOCUMENTO_IA.forEach(t => {
    const card = document.createElement('div');
    card.className = 'tipodoc-card' + (tipoDocIASelecionado === t.id ? ' selecionado' : '');
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.onclick = () => selecionarTipoDocIA(t.id);
    card.onkeydown = (e) => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); selecionarTipoDocIA(t.id); } };
    card.innerHTML = `
      <div class="tipodoc-card-nome">${t.icone} ${t.nome}</div>
      <div class="tipodoc-card-desc">${t.desc}</div>
    `;
    wrap.appendChild(card);
  });
}

function selecionarTipoDocIA(id){
  tipoDocIASelecionado = id;
  renderTiposDocIA();
  const tipo = TIPOS_DOCUMENTO_IA.find(t => t.id === id);
  document.getElementById('campoDestinatarioIA').classList.toggle('campo-hidden', !(tipo && tipo.temDestinatario));
  document.getElementById('blocoSwotIA').classList.toggle('campo-hidden', !(tipo && tipo.id === 'planoAcao'));
  const btn = document.getElementById('gerarBtnIA');
  if(btn) btn.textContent = tipo ? ('✨ Gerar ' + tipo.nome + ' com IA') : '✨ Gerar com IA';
}

/* ---- CONTEXTO: EDITAL / PROGRAMA ANEXADO ---- */
function processarEditalIA(file){
  const nomeEl = document.getElementById('ia_edital_nome');
  const conteudoEl = document.getElementById('ia_edital_conteudo');
  if(!file){ nomeEl.textContent = ''; return; }
  nomeEl.textContent = '📎 ' + file.name;
  if(/\.(txt|md|csv)$/i.test(file.name)){
    const reader = new FileReader();
    reader.onload = function(){
      conteudoEl.value = String(reader.result || '').slice(0, 8000);
    };
    reader.onerror = function(){
      conteudoEl.placeholder = 'Não foi possível ler o conteúdo automaticamente. Cole os principais trechos aqui.';
    };
    reader.readAsText(file);
  }else{
    conteudoEl.value = '';
    conteudoEl.placeholder = 'Este protótipo não extrai texto de PDF/DOCX automaticamente. Cole aqui os principais trechos do edital/programa (objeto, exigências, prazos, valores) para a IA usar como base.';
  }
}

/* ---- PREENCHIMENTO A PARTIR DO CONVÊNIO ATIVO ---- */
function preencherContextoIA(){
  const c = convenios.find(x => x.id === convenioAtualId);
  const alertBox = document.getElementById('iaAutoAlert');
  if(!c){
    alertBox.innerHTML = '<b>Nenhum convênio selecionado.</b> Vá ao Painel geral e selecione um convênio para vincular os documentos gerados aqui a ele.';
    alertBox.classList.add('quiet');
    return;
  }
  document.getElementById('ia_objeto').value = c.programa || '';
  alertBox.innerHTML = '<b>Vinculado ao convênio ' + escapeHtml(c.numero || '(sem número)') + '.</b> Os documentos gerados e salvos aqui ficam organizados dentro dele.';
  alertBox.style.background = 'var(--teal-soft)';
  alertBox.style.borderColor = 'rgba(39,99,88,0.35)';
  alertBox.style.color = 'var(--teal-deep)';
}

/* ---- MONTAGEM DO PROMPT (o que seria enviado à IA) ---- */
function montarPromptDocumentoIA(tipo, d){
  let prompt = `Redija um documento administrativo do tipo "${tipo.nome}" para uso da Prefeitura Municipal de ${d.municipio || '(município não informado)'}, seguindo a linguagem formal própria da administração pública brasileira.\n\n`;
  prompt += `Objeto: ${d.objeto || '(não informado)'}\n`;
  if(d.destinatario) prompt += `Destinatário: ${d.destinatario}\n`;
  if(d.prazo) prompt += `Prazo/data limite: ${d.prazo}\n`;
  if(d.convenioNumero) prompt += `Convênio/instrumento vinculado: ${d.convenioNumero} (${d.programa || ''})\n`;
  if(d.valor) prompt += `Valor envolvido: R$ ${d.valor}\n`;
  if(d.editalConteudo) prompt += `\nTrechos do edital/programa anexado:\n"""${d.editalConteudo}"""\n`;
  if(d.instrucoes) prompt += `\nInstruções adicionais do usuário:\n${d.instrucoes}\n`;
  if(tipo.id === 'planoAcao'){
    prompt += `\nAnálise SWOT fornecida pelo usuário:\n- Forças: ${d.swotForcas || '(não informado)'}\n- Fraquezas: ${d.swotFraquezas || '(não informado)'}\n- Oportunidades: ${d.swotOportunidades || '(não informado)'}\n- Ameaças: ${d.swotAmeacas || '(não informado)'}\n`;
    prompt += `\nA partir disso, avalie a exequibilidade de participar do edital/programa e monte um Plano de Ação estruturado no formato 5W2H (O quê, Por quê, Onde, Quando, Quem, Como, Quanto custa).\n`;
  }
  return prompt;
}

/* ---- SIMULAÇÃO LOCAL DA RESPOSTA DA IA ----
 * Ver comentário no topo do módulo: aqui entra a troca pela chamada real. */
function chamarModeloIA(tipo, d){
  const cab = `${d.municipio ? 'PREFEITURA MUNICIPAL DE ' + d.municipio.toUpperCase() + '\n' : ''}${tipo.nome.toUpperCase()}${d.convenioNumero ? ' — Convênio ' + d.convenioNumero : ''}\n`;

  const corpos = {
    oficio: () => `Ao(À) ${d.destinatario || '(destinatário não informado)'},\n\nDirigimo-nos a Vossa Senhoria para tratar de ${(d.objeto||'assunto não informado').toLowerCase()}${d.convenioNumero ? ', no âmbito do convênio nº ' + d.convenioNumero : ''}.\n\n${d.instrucoes ? d.instrucoes + '\n\n' : ''}Solicitamos a gentileza de análise e manifestação sobre o assunto no prazo ${d.prazo ? 'até ' + d.prazo : 'que se afigurar razoável'}, colocando-nos à disposição para prestar quaisquer esclarecimentos adicionais que se façam necessários.\n\nAtenciosamente,`,
    memorando: () => `Ao setor: ${d.destinatario || '(destinatário não informado)'}\n\nComunicamos, para os devidos fins, o andamento relativo a ${(d.objeto||'assunto não informado').toLowerCase()}${d.convenioNumero ? ' (convênio nº ' + d.convenioNumero + ')' : ''}. ${d.instrucoes || ''}\n\nSolicita-se manifestação ou providências no âmbito da competência desse setor, no prazo ${d.prazo ? 'até ' + d.prazo : 'exequível'}.`,
    dfd: () => `1. OBJETO\n${d.objeto || '(objeto não informado)'}.\n\n2. JUSTIFICATIVA DA NECESSIDADE\nA demanda decorre da necessidade de qualificar a prestação de serviços públicos no Município de ${d.municipio || '(não informado)'}, considerando ${d.instrucoes || 'o diagnóstico técnico levantado pela área requisitante'}.\n\n3. VALOR ESTIMADO\n${d.valor ? 'R$ ' + d.valor : 'A ser apurado em fase de estimativa de preços.'}\n\n4. VINCULAÇÃO\n${d.convenioNumero ? 'Convênio/instrumento nº ' + d.convenioNumero + ' — ' + (d.programa||'') : 'Recursos próprios ou a definir.'}`,
    etp: () => `1. DESCRIÇÃO DA NECESSIDADE\n${d.objeto || '(objeto não informado)'}, no Município de ${d.municipio || '(não informado)'}.\n\n2. REQUISITOS DA CONTRATAÇÃO\n${d.instrucoes || 'A definir junto à área técnica requisitante.'}\n\n3. LEVANTAMENTO E ANÁLISE DE SOLUÇÕES\nForam consideradas alternativas técnicas compatíveis com a disponibilidade orçamentária${d.valor ? ' de R$ ' + d.valor : ''}, optando-se pela solução que melhor atende ao interesse público e à eficiência na aplicação dos recursos.\n\n4. ESTIMATIVA DE VALOR\n${d.valor ? 'R$ ' + d.valor : 'A ser apurado.'}\n\n5. CONCLUSÃO\nConclui-se pela viabilidade técnica e administrativa da contratação, nos termos da Lei nº 14.133/2021.`,
    tr: () => `1. OBJETO\n${d.objeto || '(objeto não informado)'}.\n\n2. JUSTIFICATIVA\n${d.instrucoes || 'Conforme estudo técnico preliminar correspondente.'}\n\n3. ESPECIFICAÇÕES TÉCNICAS\nA definir/detalhar conforme memorial descritivo e projeto anexo.\n\n4. OBRIGAÇÕES DA CONTRATADA E DA CONTRATANTE\nConforme minuta contratual padrão do Município de ${d.municipio || '(não informado)'}.\n\n5. VALOR ESTIMADO\n${d.valor ? 'R$ ' + d.valor : 'A ser apurado em pesquisa de preços.'}\n\n6. CRITÉRIO DE JULGAMENTO\nMenor preço, observadas as especificações técnicas mínimas exigidas.`,
    projetoBasico: () => `1. OBJETO DA OBRA/SERVIÇO\n${d.objeto || '(objeto não informado)'}, localizado em ${d.municipio || '(não informado)'}.\n\n2. MEMORIAL DESCRITIVO\n${d.instrucoes || 'Detalhamento técnico a ser complementado com projetos de engenharia e especificações de materiais.'}\n\n3. ORÇAMENTO ESTIMADO\n${d.valor ? 'R$ ' + d.valor : 'A ser apurado conforme planilha orçamentária (SINAPI/orçamento próprio).'}\n\n4. CRONOGRAMA FÍSICO-FINANCEIRO\nA ser detalhado por etapa executiva, observado o prazo ${d.prazo ? 'até ' + d.prazo : 'a ser definido'}.`,
    matrizRisco: () => `RISCO 1 — Atraso na entrega de materiais/insumos\nAlocação: Contratada. Mitigação: exigência de cronograma detalhado e penalidades contratuais.\n\nRISCO 2 — Variação de preços de insumos\nAlocação: compartilhada, conforme reequilíbrio econômico-financeiro previsto em lei.\n\nRISCO 3 — Alterações de escopo/projeto\nAlocação: Contratante, quando decorrente de interesse público superveniente.\n\nRISCO 4 — Não liberação tempestiva de parcelas do convênio\nAlocação: Contratante/órgão concedente. Mitigação: acompanhamento processual e comunicação formal (ofício) em caso de atraso.\n\nContexto: ${d.objeto || '(objeto não informado)'}${d.convenioNumero ? ', convênio nº ' + d.convenioNumero : ''}.`,
    justificativaTecnica: () => gerarTextoLocal({ municipio: d.municipio, fonte: (d.programa||'').toUpperCase().includes('SUDENE') ? 'SUDENE' : (d.programa||'').toUpperCase().includes('COMPESA') ? 'COMPESA' : (d.programa||'').toUpperCase().includes('SEDUH') ? 'SEDUH/PE' : (d.programa||'').toUpperCase().includes('PROMAQ') ? 'PROMAQ' : 'FNDE', objeto: d.objeto || '(objeto não informado)', valor: d.valor, bairro:'', numero:'', situacao: d.instrucoes || '' }),
    planoAcao: () => `1. CONTEXTO E OBJETO\n${d.objeto || '(objeto não informado)'}${d.editalConteudo ? ', com base no edital/programa anexado' : ''}.\n\n2. ANÁLISE SWOT\nForças: ${d.swotForcas || '(não informado)'}\nFraquezas: ${d.swotFraquezas || '(não informado)'}\nOportunidades: ${d.swotOportunidades || '(não informado)'}\nAmeaças: ${d.swotAmeacas || '(não informado)'}\n\n3. CONCLUSÃO DA ANÁLISE DE EXEQUIBILIDADE\nConsiderando o cruzamento entre as forças/oportunidades identificadas e as fraquezas/ameaças mapeadas, avalia-se que a participação no edital/programa é ${(d.swotFraquezas && d.swotAmeacas) ? 'viável, desde que as fragilidades apontadas sejam mitigadas dentro do prazo' : 'viável, observadas as condições usuais de habilitação e prazo'}.\n\n4. PLANO DE AÇÃO\nDetalhado na tabela 5W2H a seguir.`,
  };

  const gerador = corpos[tipo.id] || (() => `${d.objeto || '(objeto não informado)'}`);
  const texto = cab + '\n' + gerador();

  let tabela5w2h = null;
  if(tipo.id === 'planoAcao'){
    tabela5w2h = [
      { oQue:'Reunir documentação de habilitação', porQue:'Cumprir exigências do edital/programa', onde:'Setor de convênios/licitações', quando: d.prazo || 'a definir', quem:'Equipe técnica responsável', como:'Levantamento e organização junto aos setores competentes', quanto:'Custo administrativo interno' },
      { oQue:'Elaborar plano de trabalho e documentos técnicos', porQue:'Instruir a proposta/plano de ação', onde:'Município de ' + (d.municipio || '(não informado)'), quando: d.prazo || 'a definir', quem:'Setor técnico + assessoria de projetos', como:'Redação de ETP/TR/plano de trabalho conforme objeto', quanto: d.valor ? 'R$ ' + d.valor : 'a estimar' },
      { oQue:'Formalizar submissão ao órgão concedente', porQue:'Garantir tempestividade dentro do prazo do edital', onde:'Plataforma do programa/edital', quando: d.prazo || 'até o prazo final do edital', quem:'Responsável pelo convênio', como:'Protocolo eletrônico ou físico, conforme exigido', quanto:'Sem custo direto' },
      { oQue:'Mitigar fragilidades identificadas na análise SWOT', porQue:'Reduzir risco de inabilitação ou intercorrência', onde:'Áreas internas envolvidas', quando:'Durante todo o processo', quem:'Gestão do convênio', como:'Ações corretivas específicas para cada fraqueza/ameaça mapeada', quanto:'Variável conforme ação' },
    ];
  }

  return { texto, tabela5w2h };
}

function renderTabela5w2hIA(linhas){
  const wrap = document.getElementById('tabela5w2hWrapIA');
  if(!wrap) return;
  if(!linhas || !linhas.length){ wrap.innerHTML = ''; return; }
  let html = '<table class="tabela-5w2h"><thead><tr><th>O quê</th><th>Por quê</th><th>Onde</th><th>Quando</th><th>Quem</th><th>Como</th><th>Quanto</th></tr></thead><tbody>';
  linhas.forEach(l => {
    html += `<tr><td>${escapeHtml(l.oQue)}</td><td>${escapeHtml(l.porQue)}</td><td>${escapeHtml(l.onde)}</td><td>${escapeHtml(l.quando)}</td><td>${escapeHtml(l.quem)}</td><td>${escapeHtml(l.como)}</td><td>${escapeHtml(l.quanto)}</td></tr>`;
  });
  html += '</tbody></table>';
  wrap.innerHTML = html;
}

/* ---- GERAÇÃO PRINCIPAL ---- */
function gerarDocumentoIA(){
  const netStatus = document.getElementById('netStatusIA');
  const docWrap = document.getElementById('docWrapIA');
  const paper = document.getElementById('paperIA');
  const checklist = document.getElementById('checklistIA');
  const errorBox = document.getElementById('errorBoxIA');
  const promptBox = document.getElementById('promptIA');
  const titulo = document.getElementById('docTituloIA');
  const stamp = document.getElementById('stampIA');
  const btn = document.getElementById('gerarBtnIA');

  errorBox.innerHTML = '';
  const tipo = TIPOS_DOCUMENTO_IA.find(t => t.id === tipoDocIASelecionado);
  if(!tipo){
    errorBox.innerHTML = '<div class="error-box"><b>Selecione um tipo de documento</b> antes de gerar.</div>';
    docWrap.classList.remove('hidden');
    return;
  }

  const c = convenios.find(x => x.id === convenioAtualId);
  const d = {
    municipio: (c && (c.municipioProp || '').split('/')[0].trim()) || '',
    convenioNumero: c ? c.numero : '',
    programa: c ? c.programa : '',
    valor: c ? c.valor : '',
    destinatario: document.getElementById('ia_destinatario').value,
    objeto: document.getElementById('ia_objeto').value,
    prazo: document.getElementById('ia_prazo').value ? new Date(document.getElementById('ia_prazo').value + 'T00:00:00').toLocaleDateString('pt-BR') : '',
    editalConteudo: document.getElementById('ia_edital_conteudo').value,
    instrucoes: document.getElementById('ia_instrucoes').value,
    swotForcas: document.getElementById('ia_swot_forcas').value,
    swotFraquezas: document.getElementById('ia_swot_fraquezas').value,
    swotOportunidades: document.getElementById('ia_swot_oportunidades').value,
    swotAmeacas: document.getElementById('ia_swot_ameacas').value,
  };

  if(!d.objeto.trim()){
    errorBox.innerHTML = '<div class="error-box"><b>Preencha o objeto</b> antes de gerar o documento.</div>';
    docWrap.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  netStatus.innerHTML = '<span class="dot" style="background:var(--gold)"></span>montando texto…';
  docWrap.classList.remove('hidden');
  paper.classList.remove('hidden');
  paper.classList.add('loading');
  paper.textContent = 'Gerando documento…';
  document.getElementById('paperEditIA').classList.add('hidden');
  document.getElementById('acoesIANormal').classList.remove('hidden');
  document.getElementById('acoesIAEdicao').classList.add('hidden');
  document.getElementById('statusDocIA').classList.add('hidden');
  document.getElementById('tabela5w2hWrapIA').innerHTML = '';
  checklist.innerHTML = '';
  titulo.textContent = tipo.nome + ' — rascunho gerado';

  const prompt = montarPromptDocumentoIA(tipo, d);
  promptBox.textContent = prompt;

  setTimeout(() => {
    try{
      const resultado = chamarModeloIA(tipo, d);
      paper.classList.remove('loading');
      paper.textContent = resultado.texto;
      renderTabela5w2hIA(resultado.tabela5w2h);

      checklist.innerHTML = '';
      checklist.appendChild(chip('Objeto informado', !!d.objeto));
      checklist.appendChild(chip('Convênio vinculado', !!c));
      checklist.appendChild(chip('Edital/contexto anexado', !!d.editalConteudo));

      const protocolo = proximoProtocolo(tipo.id);
      const hoje = new Date().toLocaleDateString('pt-BR');
      stamp.textContent = 'GERADO EM ' + hoje + '\nPROTOCOLO ' + protocolo;

      ultimoDocumentoGeradoIA = {
        id: gerarIdLancamento('doc'),
        tipoId: tipo.id,
        tipoNome: tipo.nome,
        protocolo,
        dataGeracao: hoje,
        texto: resultado.texto,
        tabela5w2h: resultado.tabela5w2h || null,
        status: 'rascunho',
      };
      atualizarBadgeStatusIA();

      netStatus.innerHTML = '<span class="dot" style="background:var(--teal)"></span>gerado localmente (simulado) — pronto para plugar a IA real';
    }catch(err){
      paper.classList.remove('loading');
      paper.textContent = '';
      errorBox.innerHTML = '<div class="error-box"><b>Não foi possível gerar o documento.</b><br>' + escapeHtml(err.message) + '</div>';
      netStatus.innerHTML = '<span class="dot" style="background:var(--seal)"></span>falha ao gerar';
    }finally{
      btn.disabled = false;
    }
  }, 350);
}

/* ---- EDITAR / CANCELAR / APROVAR / LIMPAR ---- */
function atualizarBadgeStatusIA(){
  const badge = document.getElementById('statusDocIA');
  if(!ultimoDocumentoGeradoIA){ badge.classList.add('hidden'); return; }
  badge.classList.remove('hidden');
  if(ultimoDocumentoGeradoIA.status === 'aprovado'){
    badge.textContent = '✅ aprovado';
    badge.className = 'status-doc-ia aprovado';
  }else{
    badge.textContent = '📝 rascunho';
    badge.className = 'status-doc-ia rascunho';
  }
}

function editarDocumentoIA(){
  if(!ultimoDocumentoGeradoIA){ alert('Gere um documento antes de editar.'); return; }
  const paper = document.getElementById('paperIA');
  const textarea = document.getElementById('paperEditIA');
  textarea.value = ultimoDocumentoGeradoIA.texto;
  paper.classList.add('hidden');
  textarea.classList.remove('hidden');
  document.getElementById('acoesIANormal').classList.add('hidden');
  document.getElementById('acoesIAEdicao').classList.remove('hidden');
  textarea.focus();
}

function salvarEdicaoDocumentoIA(){
  const textarea = document.getElementById('paperEditIA');
  const paper = document.getElementById('paperIA');
  ultimoDocumentoGeradoIA.texto = textarea.value;
  ultimoDocumentoGeradoIA.status = 'rascunho'; // edição manual reabre o status para revisão
  paper.textContent = textarea.value;
  paper.classList.remove('hidden');
  textarea.classList.add('hidden');
  document.getElementById('acoesIANormal').classList.remove('hidden');
  document.getElementById('acoesIAEdicao').classList.add('hidden');
  atualizarBadgeStatusIA();
}

function cancelarEdicaoDocumentoIA(){
  const paper = document.getElementById('paperIA');
  const textarea = document.getElementById('paperEditIA');
  paper.classList.remove('hidden');
  textarea.classList.add('hidden');
  document.getElementById('acoesIANormal').classList.remove('hidden');
  document.getElementById('acoesIAEdicao').classList.add('hidden');
}

function aprovarDocumentoIA(){
  if(!ultimoDocumentoGeradoIA){ alert('Gere um documento antes de aprovar.'); return; }
  ultimoDocumentoGeradoIA.status = 'aprovado';
  atualizarBadgeStatusIA();
}

function limparDocumentoIA(){
  if(ultimoDocumentoGeradoIA && !confirm('Limpar o documento gerado? O que não foi salvo na lista do convênio será perdido.')) return;
  ultimoDocumentoGeradoIA = null;
  document.getElementById('docWrapIA').classList.add('hidden');
  document.getElementById('paperIA').textContent = '';
  document.getElementById('paperEditIA').value = '';
  document.getElementById('paperEditIA').classList.add('hidden');
  document.getElementById('paperIA').classList.remove('hidden');
  document.getElementById('tabela5w2hWrapIA').innerHTML = '';
  document.getElementById('checklistIA').innerHTML = '';
  document.getElementById('errorBoxIA').innerHTML = '';
  document.getElementById('promptIA').textContent = '';
  document.getElementById('stampIA').textContent = '';
  document.getElementById('statusDocIA').classList.add('hidden');
  document.getElementById('acoesIANormal').classList.remove('hidden');
  document.getElementById('acoesIAEdicao').classList.add('hidden');
  document.getElementById('netStatusIA').innerHTML = '<span class="dot" style="background:var(--line)"></span>aguardando';
}

/* ---- SALVAR / BAIXAR / LISTAR DOCUMENTOS GERADOS ---- */
function salvarDocumentoIA(){
  if(!ultimoDocumentoGeradoIA){ alert('Gere um documento antes de salvar.'); return; }
  if(!convenioAtualId){ alert('Selecione um convênio no Painel geral para salvar o documento vinculado a ele.'); return; }
  const c = convenios.find(x => x.id === convenioAtualId);
  if(!c) return;
  if(!c.docsGeradosIA) c.docsGeradosIA = [];
  c.docsGeradosIA.push(Object.assign({}, ultimoDocumentoGeradoIA));
  salvarEstado();
  renderListaDocsIA(c);
  alert('Documento salvo na lista do convênio "' + (c.numero || '') + '".');
}

function baixarDocumentoIA(){
  if(!ultimoDocumentoGeradoIA){ alert('Gere um documento antes de baixar.'); return; }
  baixarTextoComoArquivo(ultimoDocumentoGeradoIA.texto, ultimoDocumentoGeradoIA.tipoNome, ultimoDocumentoGeradoIA.protocolo);
}

function baixarTextoComoArquivo(texto, tipoNome, protocolo){
  const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (tipoNome || 'documento').toLowerCase().replace(/[^a-z0-9]+/g,'-') + '-' + (protocolo || Date.now()) + '.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function renderListaDocsIA(c){
  const wrap = document.getElementById('listaDocsIA');
  if(!wrap) return;
  const lista = (c && c.docsGeradosIA) || [];
  if(!lista.length){
    wrap.innerHTML = '<div class="painel-empty" style="padding:20px;">Nenhum documento gerado salvo ainda neste convênio.</div>';
    return;
  }
  wrap.innerHTML = '';
  lista.slice().reverse().forEach(doc => {
    const item = document.createElement('div');
    item.className = 'doc-list-item pronto';
    const statusBadge = doc.status === 'aprovado'
      ? '<span class="status-doc-ia aprovado">✅ aprovado</span>'
      : '<span class="status-doc-ia rascunho">📝 rascunho</span>';
    item.innerHTML = `
      <div class="doc-list-name">${escapeHtml(doc.tipoNome)} — ${escapeHtml(doc.protocolo)} <span style="font-weight:400; color:var(--ink-faint);">(${escapeHtml(doc.dataGeracao)})</span></div>
      ${statusBadge}
      <button class="btn-ghost btn-small" onclick="baixarDocSalvoIA('${doc.id}')">⬇ baixar</button>
      <button class="btn-ghost btn-small" onclick="removerDocumentoIA('${doc.id}')">remover</button>
    `;
    wrap.appendChild(item);
  });
}

function baixarDocSalvoIA(id){
  const c = convenios.find(x => x.id === convenioAtualId);
  if(!c || !c.docsGeradosIA) return;
  const doc = c.docsGeradosIA.find(x => x.id === id);
  if(!doc) return;
  baixarTextoComoArquivo(doc.texto, doc.tipoNome, doc.protocolo);
}

function removerDocumentoIA(id){
  const c = convenios.find(x => x.id === convenioAtualId);
  if(!c || !c.docsGeradosIA) return;
  const doc = c.docsGeradosIA.find(x => x.id === id);
  if(!doc) return;
  if(!confirm('Remover o documento "' + doc.tipoNome + ' — ' + doc.protocolo + '"?')) return;
  c.docsGeradosIA = c.docsGeradosIA.filter(x => x.id !== id);
  salvarEstado();
  renderListaDocsIA(c);
}

/* ============================================================
 * EXPORTAR / IMPORTAR
 * ============================================================ */
function exportarDados(){
  const payload = {
    formato: 'captagov-backup',
    versao: 2,
    exportadoEm: new Date().toISOString(),
    convenios, convenioAtualId, protocoloSeq, emendas
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'captagov-backup-' + new Date().toISOString().slice(0,10) + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function importarDados(file){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(){
    let payload;
    try{
      payload = JSON.parse(reader.result);
    }catch(e){
      alert('Arquivo inválido: não é um JSON legível.');
      return;
    }
    if(!payload || !Array.isArray(payload.convenios)){
      alert('Arquivo inválido: não parece ser um backup do CaptaGov.');
      return;
    }
    const ok = confirm('Importar este backup vai substituir TODOS os dados atuais (' + convenios.length + ' convênio(s)). Deseja continuar?');
    if(!ok) return;

    convenios = payload.convenios || [];
    convenioAtualId = payload.convenioAtualId || null;
    protocoloSeq = payload.protocoloSeq || 0;
    emendas = payload.emendas || [];

    // Garantir estrutura completa em cada convênio importado
    convenios.forEach(c => {
      if(!c.documentos){
        c.documentos = {};
        categoriasDocumentais.forEach(cat => {
          c.documentos[cat.id] = { anexado:false, arquivo:null, arquivoDataUrl:null, validade:null };
        });
      }
      if(!c.documentosExtras) c.documentosExtras = [];
      if(!c.docsGeradosIA) c.docsGeradosIA = [];
      if(!c.financeiro){
        c.financeiro = { extratos:[], rendimentos:[], autorizacoes:[], usos:[], contratadas:[], pagamentos:[] };
      }
    });

    salvarEstado();
    renderPainel();
    renderEmendas();
    document.getElementById('importInput').value = '';
    alert('Backup importado com sucesso.');
  };
  reader.onerror = function(){
    alert('Não foi possível ler o arquivo.');
  };
  reader.readAsText(file);
}

/* ============================================================
 * NAVEGAÇÃO POR TECLADO
 * ============================================================ */
(function configurarNavegacaoTeclado(){
  const painel = document.querySelector('.folder-tabs');
  if(!painel) return;
  painel.addEventListener('keydown', function(e){
    if(e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const tabs = Array.from(document.querySelectorAll('.tab[data-view]'));
    const idx = tabs.indexOf(document.activeElement);
    if(idx === -1) return;
    e.preventDefault();
    const prox = e.key === 'ArrowDown' ? (idx + 1) % tabs.length : (idx - 1 + tabs.length) % tabs.length;
    tabs[prox].focus();
  });
})();

/* ============================================================
 * EXPORTAR ANEXOS EM ZIP
 * ============================================================ */
function dataUrlToBlob(dataUrl){
  if(!dataUrl) return null;
  try{
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    const n = bstr.length;
    const u8arr = new Uint8Array(n);
    for(let i = 0; i < n; i++){
      u8arr[i] = bstr.charCodeAt(i);
    }
    return new Blob([u8arr], { type: mime });
  }catch(e){
    console.error('Erro ao converter Data URL para Blob:', e);
    return null;
  }
}

function gerarZipAnexos(){
  const select = document.getElementById('relatorioConvenioSelect');
  const id = select.value;
  const c = convenios.find(x => x.id === id);
  if(!c){ alert('Selecione um convênio para exportar anexos.'); return; }
  
  const zip = new JSZip();
  const nomeConvenio = (c.numero || 'convenio').replace(/[^a-zA-Z0-9-_]/g, '_');
  const pastaRaiz = zip.folder(nomeConvenio);
  
  let temAnexo = false;
  
  // ===== DOCUMENTOS GERAIS DO CONVÊNIO =====
  const pastaDocGeral = pastaRaiz.folder('01_Documentos_Gerais');
  if(c.documentos){
    Object.keys(c.documentos).forEach(catId => {
      const doc = c.documentos[catId];
      if(doc.anexado && doc.arquivo && doc.arquivoDataUrl){
        const blob = dataUrlToBlob(doc.arquivoDataUrl);
        if(blob){
          pastaDocGeral.file(doc.arquivo, blob);
          temAnexo = true;
        }
      }
    });
  }
  
  // ===== DOCUMENTOS EXTRAS =====
  if(c.documentosExtras && c.documentosExtras.length > 0){
    const pastaExtras = pastaRaiz.folder('02_Documentos_Extras');
    c.documentosExtras.forEach(doc => {
      if(doc.anexado && doc.arquivo && doc.arquivoDataUrl){
        const blob = dataUrlToBlob(doc.arquivoDataUrl);
        if(blob){
          pastaExtras.file(doc.arquivo, blob);
          temAnexo = true;
        }
      }
    });
  }
  
  // ===== DOCUMENTOS DE PAGAMENTOS =====
  if(c.financeiro && c.financeiro.pagamentos && c.financeiro.pagamentos.length > 0){
    const pastaPagamentos = pastaRaiz.folder('03_Pagamentos');
    c.financeiro.pagamentos.forEach((pagamento, idx) => {
      const contratada = (c.financeiro.contratadas||[]).find(x => x.id === pagamento.contratadaId);
      const nomePagto = 'Pagamento_' + String(pagamento.numero).padStart(3, '0') + '_' + (contratada ? contratada.razaoSocial.slice(0, 20).replace(/[^a-zA-Z0-9-_]/g, '_') : 'removida');
      const pastaPagto = pastaPagamentos.folder(nomePagto);
      
      if(pagamento.docs){
        Object.keys(pagamento.docs).forEach(catId => {
          const doc = pagamento.docs[catId];
          if(doc.anexado && doc.arquivo && doc.arquivoDataUrl){
            const blob = dataUrlToBlob(doc.arquivoDataUrl);
            if(blob){
              pastaPagto.file(doc.arquivo, blob);
              temAnexo = true;
            }
          }
        });
      }
    });
  }
  
  if(!temAnexo){
    alert('Nenhum anexo foi encontrado para este convênio.');
    return;
  }
  
  // Gera e faz download do ZIP
  zip.generateAsync({ type: 'blob' }).then(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'anexos-' + nomeConvenio + '-' + new Date().toISOString().slice(0, 10) + '.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }).catch(e => {
    console.error('Erro ao gerar ZIP:', e);
    alert('Erro ao gerar arquivo ZIP. Verifique o console para detalhes.');
  });
}

/* ============================================================
 * INICIALIZAÇÃO
 * ============================================================ */
(async function iniciarApp(){
  await migrarDeLocalStorage(); // Migra dados do localStorage (v1 ou v2) se existirem
  await carregarEstado();       // Carrega o estado atual do IndexedDB
  calcularPrazos();
  renderPainel();
  atualizarViewChecklist();
  aplicarMascarasMoeda();
  const boot = document.getElementById('captagov-boot');
  if(boot) boot.remove();
})();
