/* ============================================================
 * CAPTAGOV v2 — Utilitários puros
 * Funções sem dependência de STATE/DOM — testáveis isoladamente.
 * (ver /test/utils.test.mjs)
 * ============================================================ */

export function gerarId(prefixo) {
  return prefixo + '_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
}

export function parseMoeda(v) {
  return parseFloat(String(v).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
}

export function formatMoeda(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}

export function formatMes(mes) {
  if (!mes) return '—';
  const [ano, m] = mes.split('-');
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return nomes[parseInt(m, 10) - 1] + '/' + ano;
}

export function hojeFormatado() {
  return new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

// ==================== MÁSCARAS ====================
export function mascararValor(e) {
  let d = e.value.replace(/\D/g, '');
  d = d.replace(/^0+(?=\d)/, '');
  while (d.length < 3) d = '0' + d;
  const cent = d.slice(-2);
  let int = d.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  e.value = int + ',' + cent;
}

export function mascararCNPJ(e) {
  let v = e.value.replace(/\D/g, '').slice(0, 14);
  v = v.replace(/^(\d{2})(\d)/, '$1.$2');
  v = v.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
  v = v.replace(/\.(\d{3})(\d)/, '.$1/$2');
  v = v.replace(/(\d{4})(\d)/, '$1-$2');
  e.value = v;
}

export function mascararCPF(e) {
  let v = e.value.replace(/\D/g, '').slice(0, 11);
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  e.value = v;
}

export function mascararCEP(e) {
  let v = e.value.replace(/\D/g, '').slice(0, 8);
  v = v.replace(/(\d{5})(\d)/, '$1-$2');
  e.value = v;
}

// ==================== PRAZO / STATUS ====================
export function calcularPrazoPC(dataFim, prazoDias) {
  if (!dataFim) return '—';
  const fim = new Date(dataFim + 'T00:00:00');
  const dias = parseInt(prazoDias || '60', 10);
  const limite = new Date(fim.getTime() + dias * 24 * 60 * 60 * 1000);
  return limite.toLocaleDateString('pt-BR');
}

export function statusConvenio(c) {
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

// ==================== VIGÊNCIA (dataInicio / dataFim) ====================
// Formata uma data ISO (YYYY-MM-DD) para pt-BR (DD/MM/AAAA).
export function formatData(dataISO) {
  if (!dataISO) return '—';
  const d = new Date(dataISO + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

// Calcula quantos dias faltam (ou já passaram) até o fim da vigência
// e devolve um badge (mesma lógica visual de statusConvenio, mas
// olhando para dataFim em vez de prazoLimitePC).
export function statusVigencia(c) {
  if (!c.dataFim) return { label: 'Sem vigência definida', cls: 'badge-info', dias: null };
  const fim = new Date(c.dataFim + 'T00:00:00');
  if (Number.isNaN(fim.getTime())) return { label: 'Sem vigência definida', cls: 'badge-info', dias: null };
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const diff = Math.floor((fim - hoje) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { label: 'Vigência encerrada', cls: 'badge-danger', dias: diff };
  if (diff === 0) return { label: 'Encerra hoje', cls: 'badge-danger', dias: diff };
  if (diff <= 30) return { label: diff + 'd para encerrar', cls: 'badge-warn', dias: diff };
  return { label: 'Vigente', cls: 'badge-ok', dias: diff };
}

// Convênios cuja vigência já venceu ou vence em até `limiteDias` dias.
export function contarVigenciasAVencer(convenios, limiteDias = 30) {
  return (convenios || []).filter((c) => {
    const v = statusVigencia(c);
    return v.dias !== null && v.dias <= limiteDias;
  }).length;
}

// ==================== VALIDAÇÃO (NOVO) ====================
// Antes o app só mascarava CPF/CNPJ visualmente, sem checar o dígito
// verificador. Isso permitia salvar convênios com CNPJ/CPF inválido,
// que geram problemas lá na frente (prestação de contas, PDF oficial).

export function validarCPF(cpfRaw) {
  const cpf = String(cpfRaw || '').replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(cpf[i], 10) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  if (resto !== parseInt(cpf[9], 10)) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(cpf[i], 10) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  return resto === parseInt(cpf[10], 10);
}

export function validarCNPJ(cnpjRaw) {
  const cnpj = String(cnpjRaw || '').replace(/\D/g, '');
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calcDigito = (base) => {
    const pesos = base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split('').reduce((acc, d, i) => acc + parseInt(d, 10) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = calcDigito(cnpj.slice(0, 12));
  if (d1 !== parseInt(cnpj[12], 10)) return false;
  const d2 = calcDigito(cnpj.slice(0, 12) + d1);
  return d2 === parseInt(cnpj[13], 10);
}

// Detecta automaticamente se é CPF (11 dígitos) ou CNPJ (14 dígitos) e valida.
// Campo de "conveniente" pode ser pessoa física ou jurídica dependendo do caso.
export function validarCpfOuCnpj(valor) {
  const digitos = String(valor || '').replace(/\D/g, '');
  if (!digitos) return { valido: true, tipo: null }; // vazio é tratado por "obrigatório" à parte
  if (digitos.length === 11) return { valido: validarCPF(digitos), tipo: 'CPF' };
  if (digitos.length === 14) return { valido: validarCNPJ(digitos), tipo: 'CNPJ' };
  return { valido: false, tipo: null };
}
