import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMoeda, formatMoeda, escapeHtml, formatMes,
  calcularPrazoPC, statusConvenio,
  validarCPF, validarCNPJ, validarCpfOuCnpj,
} from '../public/js/utils.js';

test('parseMoeda converte string em formato BR para número', () => {
  assert.equal(parseMoeda('1.234,56'), 1234.56);
  assert.equal(parseMoeda('0,00'), 0);
  assert.equal(parseMoeda(''), 0);
  assert.equal(parseMoeda('abc'), 0);
});

test('formatMoeda formata número como moeda BRL', () => {
  assert.equal(formatMoeda(1234.5), 'R$\u00A01.234,50');
  assert.equal(formatMoeda(0), 'R$\u00A00,00');
  assert.equal(formatMoeda(null), 'R$\u00A00,00');
});

test('escapeHtml neutraliza caracteres perigosos (proteção básica contra XSS)', () => {
  assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(escapeHtml(`O'Brien & "Cia"`), 'O&#39;Brien &amp; &quot;Cia&quot;');
});

test('formatMes converte AAAA-MM em abreviação em português', () => {
  assert.equal(formatMes('2026-03'), 'Mar/2026');
  assert.equal(formatMes(''), '—');
});

test('calcularPrazoPC soma dias corridos à data de fim', () => {
  assert.equal(calcularPrazoPC('2026-01-01', '60'), '02/03/2026');
  assert.equal(calcularPrazoPC('', '60'), '—');
});

test('statusConvenio classifica corretamente vencido/próximo/em execução', () => {
  assert.equal(statusConvenio({ prazoLimitePC: null }).label, 'Sem prazo');
  const ontem = new Date(Date.now() - 86400000);
  const dataOntem = String(ontem.getDate()).padStart(2, '0') + '/' + String(ontem.getMonth() + 1).padStart(2, '0') + '/' + ontem.getFullYear();
  assert.equal(statusConvenio({ prazoLimitePC: dataOntem }).label, 'PC vencida');
});

test('validarCPF aceita CPF válido e rejeita inválido/sequência repetida', () => {
  assert.equal(validarCPF('111.444.777-35'), true); // CPF de teste válido (dígitos verificadores corretos)
  assert.equal(validarCPF('111.111.111-11'), false); // sequência repetida
  assert.equal(validarCPF('123.456.789-00'), false); // dígito verificador errado
  assert.equal(validarCPF(''), false);
});

test('validarCNPJ aceita CNPJ válido e rejeita inválido', () => {
  assert.equal(validarCNPJ('11.222.333/0001-81'), true); // CNPJ de teste válido
  assert.equal(validarCNPJ('11.111.111/1111-11'), false); // sequência repetida
  assert.equal(validarCNPJ('11.222.333/0001-00'), false); // dígito verificador errado
});

test('validarCpfOuCnpj detecta o tipo pelo tamanho e delega a validação', () => {
  assert.deepEqual(validarCpfOuCnpj('111.444.777-35'), { valido: true, tipo: 'CPF' });
  assert.deepEqual(validarCpfOuCnpj('11.222.333/0001-81'), { valido: true, tipo: 'CNPJ' });
  assert.deepEqual(validarCpfOuCnpj(''), { valido: true, tipo: null });
  assert.equal(validarCpfOuCnpj('123').valido, false);
});
