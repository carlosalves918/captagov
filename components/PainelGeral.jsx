import { useMemo, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { formatMoeda, parseMoeda, statusConvenio } from '../public/js/utils.js';

export default function PainelGeral() {
  const { state, tick, novoConvenio, editarConvenio, abrirPrestacaoContas, duplicarConvenio, excluirConvenio, calcularResumoFinanceiro } = useApp();
  const [termo, setTermo] = useState('');

  const convenios = state?.convenios || [];

  const resumos = useMemo(
    () => convenios.map((c) => calcularResumoFinanceiro(c.id)).filter(Boolean),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );

  const totalSaldo = resumos.reduce((a, r) => a + r.saldoTotal, 0);
  const totalPago = resumos.reduce((a, r) => a + r.totalPago, 0);
  const pendentesPC = convenios.filter((c) => {
    const st = statusConvenio(c);
    return st.cls === 'badge-warn' || st.cls === 'badge-danger';
  }).length;

  const termoBusca = termo.trim().toLowerCase();
  const lista = termoBusca
    ? convenios.filter(
      (c) =>
        (c.numero || '').toLowerCase().includes(termoBusca) ||
        (c.programa || '').toLowerCase().includes(termoBusca) ||
        (c.conveniente || c.proponente || '').toLowerCase().includes(termoBusca),
    )
    : convenios;

  const totalGeralValor = lista.reduce(
    (acc, c) => {
      const res = calcularResumoFinanceiro(c.id);
      return acc + (res ? res.valorTotal : 0);
    },
    0,
  );

  return (
    <>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue">📋</div>
          <div className="stat-content">
            <div className="stat-value">{convenios.length}</div>
            <div className="stat-label">Convênios / Projetos</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">💰</div>
          <div className="stat-content">
            <div className="stat-value">{formatMoeda(totalSaldo)}</div>
            <div className="stat-label">Saldo Total</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon teal">💳</div>
          <div className="stat-content">
            <div className="stat-value">{formatMoeda(totalPago)}</div>
            <div className="stat-label">Total Pago</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon warning">⚠️</div>
          <div className="stat-content">
            <div className="stat-value">{pendentesPC}</div>
            <div className="stat-label">PC Pendente / Vencida</div>
          </div>
        </div>
      </div>

      <div className="card mb-6">
        <div className="painel-toolbar" style={{ marginBottom: 20 }}>
          <div className="card-title" style={{ marginBottom: 0, flex: '1 1 auto' }}>Convênios e Projetos</div>
          <div className="painel-toolbar" style={{ gap: 12 }}>
            <div className="search-input">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Buscar convênio..."
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
              />
            </div>
            <button type="button" className="btn btn-primary" onClick={() => novoConvenio('convenio')}>
              + Novo Convênio
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => novoConvenio('projeto')}>
              + Novo Projeto
            </button>
          </div>
        </div>

        <div className="valor-total-lista">
          <span>💰 Valor Total (Repasse + Contrapartida){termoBusca ? ' — resultado da busca' : ''}</span>
          <strong>{formatMoeda(totalGeralValor)}</strong>
        </div>

        {lista.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📂</div>
            <div className="empty-state-title">
              {convenios.length === 0 ? 'Nenhum convênio cadastrado' : 'Nenhum resultado encontrado'}
            </div>
            <div className="empty-state-text">
              {convenios.length === 0 ? 'Clique em "Novo Convênio" para começar.' : 'Tente uma busca diferente.'}
            </div>
          </div>
        ) : (
          lista.slice().reverse().map((c) => {
            const st = statusConvenio(c);
            const res = calcularResumoFinanceiro(c.id);
            const saldo = res ? formatMoeda(res.saldoTotal) : formatMoeda(0);
            const saldoClass = res && res.saldoTotal < 0 ? 'negative' : 'positive';
            const repasse = res ? res.valor : 0;
            const contrapartida = res ? res.contrapartida : 0;
            const totalConvenio = res ? res.valorTotal : 0;
            return (
              <div className="convenio-card" key={c.id}>
                <div className="convenio-card-left">
                  <div className="convenio-card-title">
                    <span className={`badge ${c.tipo === 'projeto' ? 'badge-info' : 'badge-ok'}`}>
                      {c.tipo === 'projeto' ? 'Projeto' : 'Convênio'}
                    </span>{' '}
                    {c.numero || 'sem número'} — {c.programa || 'Sem programa'}
                  </div>
                  <div className="convenio-card-sub">{c.conveniente || c.proponente || 'Convenente não informado'}</div>
                </div>
                <div className="convenio-card-right">
                  <div className="convenio-card-valores">
                    <span className="font-mono">Repasse: <strong>{formatMoeda(repasse)}</strong></span>
                    <span className="font-mono">Contrapartida: <strong>{formatMoeda(contrapartida)}</strong></span>
                    <span className="font-mono">Total: <strong>{formatMoeda(totalConvenio)}</strong></span>
                  </div>
                  <span className="font-mono" style={{ fontSize: 14 }}>
                    Saldo: <strong className={saldoClass}>{saldo}</strong>
                  </span>
                  <span className={`badge ${st.cls}`}>{st.label}</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => editarConvenio(c.id)}>Abrir</button>
                  {c.tipo !== 'projeto' && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => abrirPrestacaoContas(c.id)}>📂 PC</button>
                  )}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => duplicarConvenio(c.id)}>⧉</button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => excluirConvenio(c.id)}
                  >
                    🗑
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
