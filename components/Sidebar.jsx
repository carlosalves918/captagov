import { useApp } from '../contexts/AppContext';

const ITEMS = [
  { id: 'painel', icon: '📊', label: 'Painel Geral' },
  { id: 'cadastro', icon: '📝', label: 'Cadastro' },
  { id: 'prestacao', icon: '📋', label: 'Prestação de Contas' },
  { id: 'documentos', icon: '📁', label: 'Gestão de Documentos' },
  { id: 'relatorios', icon: '📈', label: 'Relatórios' },
  { id: 'emendas', icon: '🏛️', label: 'Emendas Parlamentares' },
  { id: 'instituicoes', icon: '🏢', label: 'Instituições' },
  { id: 'proponentes', icon: '🤝', label: 'Proponentes/Convenentes' },
  { id: 'responsaveisTecnicos', icon: '👷', label: 'Responsável Técnico' },
  { id: 'usuarios', icon: '👤', label: 'Usuários' },
];

export default function Sidebar() {
  const { state, mudarView, exportarDados, importarDados, abrirTelaBackups } = useApp();
  const viewAtual = state?.view;
  const ehProjetoAtual = (() => {
    const atual = state?.convenios?.find((x) => x.id === state.convenioAtualId);
    return !!(atual && atual.tipo === 'projeto');
  })();

  return (
    <>
      <div className="sidebar-header">
        <div className="sidebar-logo-panel">
          <img src="/logo.png" alt="CaptaGov" className="sidebar-logo-img" />
        </div>
        <div className="sidebar-slogan">
          Conectando projetos a recursos.
          <br />
          Transformando municípios.
        </div>
      </div>
      <nav className="sidebar-nav">
        {ITEMS.map((item) => {
          if (item.id === 'prestacao' && ehProjetoAtual) return null;
          return (
            <button
              key={item.id}
              type="button"
              className={`sidebar-nav-item ${viewAtual === item.id ? 'active' : ''}`}
              onClick={() => mudarView(item.id)}
            >
              <span className="icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <div style={{ marginBottom: 8 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ width: '100%', marginBottom: 6 }}
            onClick={() => exportarDados()}
          >
            ⬇ Exportar Backup (JSON)
          </button>
          <label
            className="btn btn-secondary btn-sm"
            style={{ width: '100%', display: 'block', textAlign: 'center', marginBottom: 6 }}
          >
            ⬆ Importar Backup
            <input
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={(e) => importarDados(e.target.files[0])}
            />
          </label>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ width: '100%' }}
            onClick={() => abrirTelaBackups()}
          >
            🕐 Backups Automáticos
          </button>
        </div>
        <div>CaptaGov v3 — Dados locais</div>
      </div>
    </>
  );
}
