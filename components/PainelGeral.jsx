import { useMemo, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { formatMoeda, parseMoeda, statusConvenio, formatData, statusVigencia, contarVigenciasAVencer, listarContratosAVencer } from '../public/js/utils.js';

export default function PainelGeral() {
  const { state, tick, novoConvenio, editarConvenio, selecionarConvenio, abrirPrestacaoContas, abrirAditivoDireto, duplicarConvenio, excluirConvenio, calcularResumoFinanceiro } = useApp();
  const [termo, setTermo] = useState('');
  const [alertaAberto, setAlertaAberto] = useState(true);
  const [ordenarPor, setOrdenarPor] = useState('recente');
  const [ordemDesc, setOrdemDesc] = useState(true);

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
  const vigenciasAVencer = contarVigenciasAVencer(convenios, 30);
  const contratosAVencer = useMemo(
    () => listarContratosAVencer(convenios, 30),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );

  const termoBusca = termo.trim().toLowerCase();
  const lista = termoBusca
    ? convenios.filter(
      (c) =>
        (c.numero || '').toLowerCase().includes(termoBusca) ||
        (c.programa || '').toLowerCase().includes(termoBusca) ||
        (c.conveniente || c.proponente || '').toLowerCase().includes(termoBusca),
    )
    : convenios;

  // Ordenação: "Mais recente" mantém a ordem de cadastro (mais novo primeiro,
  // igual ao comportamento original). Os demais critérios comparam valores
  // numéricos e respeitam o botão de direção (maior→menor / menor→maior).
  const listaOrdenada = useMemo(() => {
    if (ordenarPor === 'recente') return lista.slice().reverse();
    const comMetrica = lista.map((c) => {
      const res = calcularResumoFinanceiro(c.id);
      let metrica = 0;
      if (ordenarPor === 'valorTotal') metrica = res ? res.valorTotal : 0;
      else if (ordenarPor === 'saldo') metrica = res ? res.saldoTotal : 0;
      else if (ordenarPor === 'repasse') metrica = res ? res.valor : 0;
      else if (ordenarPor === 'contrapartida') metrica = res ? res.contrapartida : 0;
      else if (ordenarPor === 'vigencia') metrica = c.dataFim ? new Date(c.dataFim).getTime() : 0;
      return { c, metrica };
    });
    comMetrica.sort((a, b) => (ordemDesc ? b.metrica - a.metrica : a.metrica - b.metrica));
    return comMetrica.map((x) => x.c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista, tick, ordenarPor, ordemDesc]);

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
        <div className="stat-card">
          <div className="stat-icon danger">📅</div>
          <div className="stat-content">
            <div className="stat-value">{vigenciasAVencer}</div>
            <div className="stat-label">Vigências a Vencer (30d) / Vencidas</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon danger">📑</div>
          <div className="stat-content">
            <div className="stat-value">{contratosAVencer.length}</div>
            <div className="stat-label">Contratos a Vencer (30d) sem Aditivo</div>
          </div>
        </div>
      </div>

      {contratosAVencer.length > 0 && alertaAberto && (
        <div className="alert alert-warning mb-6" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontWeight: 600 }}>
              ⚠️ {contratosAVencer.length} contrato{contratosAVencer.length > 1 ? 's' : ''} com vigência vencida ou perto de vencer — considere registrar um aditivo de prazo.
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ flexShrink: 0 }}
              onClick={() => setAlertaAberto(false)}
              title="Ocultar alerta"
            >
              ✕
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {contratosAVencer.slice(0, 8).map((item) => (
              <div
                key={item.contratadaId}
                style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--white)', border: '1px solid #FCD34D', borderRadius: 'var(--radius-sm)', padding: '8px 12px' }}
              >
                <span className={`badge ${item.cls}`} style={{ fontSize: 10.5 }}>{item.label}</span>
                <strong>{item.razaoSocial}</strong>
                <span style={{ color: 'var(--gray-500)', fontSize: 13 }}>
                  {item.numeroContrato ? `contrato nº ${item.numeroContrato} · ` : ''}convênio {item.convenioNumero} · vence {formatData(item.dataFim)}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => abrirAditivoDireto(item.convenioId, item.contratadaId)}
                >
                  📑 Registrar aditivo
                </button>
              </div>
            ))}
            {contratosAVencer.length > 8 && (
              <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>
                + {contratosAVencer.length - 8} outro(s) contrato(s) — abra o Extrato de Aditivos de cada convênio para ver todos.
              </div>
            )}
          </div>
        </div>
      )}

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
            <select
              className="form-input form-select"
              style={{ width: 'auto' }}
              value={ordenarPor}
              onChange={(e) => setOrdenarPor(e.target.value)}
              title="Ordenar convênios por"
            >
              <option value="recente">Mais recente</option>
              <option value="valorTotal">Valor Total</option>
              <option value="repasse">Repasse</option>
              <option value="contrapartida">Contrapartida</option>
              <option value="saldo">Saldo</option>
              <option value="vigencia">Vigência (data fim)</option>
            </select>
            {ordenarPor !== 'recente' && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setOrdemDesc((v) => !v)}
                title={ordemDesc ? 'Maior para menor' : 'Menor para maior'}
              >
                {ordemDesc ? '↓ Maior → Menor' : '↑ Menor → Maior'}
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={() => novoConvenio('convenio')}>
              + Novo Convênio
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => novoConvenio('projeto')}>
              + Novo Projeto
            </button>
          </div>
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
          listaOrdenada.map((c) => {
            const st = statusConvenio(c);
            const res = calcularResumoFinanceiro(c.id);
            const saldo = res ? formatMoeda(res.saldoTotal) : formatMoeda(0);
            const saldoClass = res && res.saldoTotal < 0 ? 'negative' : 'positive';
            const repasse = res ? res.valor : 0;
            const contrapartida = res ? res.contrapartida : 0;
            const totalConvenio = res ? res.valorTotal : 0;
            const vig = statusVigencia(c);
            const ativo = c.id === state.convenioAtualId;
            return (
              <div
                className={`convenio-card ${ativo ? 'convenio-card-ativo' : ''}`}
                key={c.id}
                role="button"
                tabIndex={0}
                aria-pressed={ativo}
                onClick={() => selecionarConvenio(c.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') selecionarConvenio(c.id); }}
              >
                <div className="convenio-card-left">
                  <div className="convenio-card-title">
                    <span className={`badge ${c.tipo === 'projeto' ? 'badge-info' : 'badge-ok'}`}>
                      {c.tipo === 'projeto' ? 'Projeto' : 'Convênio'}
                    </span>{' '}
                    {ativo && <span className="badge badge-ok" style={{ marginRight: 4 }}>● Selecionado</span>}
                    {c.numero || 'sem número'} — {c.programa || 'Sem programa'}
                  </div>
                  <div className="convenio-card-sub">{c.conveniente || c.proponente || 'Convenente não informado'}</div>
                  <div className="convenio-card-vigencia">
                    <span>📅 Vigência: {formatData(c.dataInicio)} a {formatData(c.dataFim)}</span>
                    <span className={`badge ${vig.cls}`}>{vig.label}</span>
                  </div>
                </div>
                <div className="convenio-card-right" onClick={(e) => e.stopPropagation()}>
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
