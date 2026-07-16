import { useApp } from '../contexts/AppContext';
import { hojeFormatado } from '../public/js/utils.js';

const NOMES_ABAS = {
  painel: 'Painel Geral',
  cadastro: 'Cadastro',
  prestacao: 'Prestação de Contas',
  documentos: 'Gestão de Documentos',
  relatorios: 'Relatórios',
  emendas: 'Emendas Parlamentares',
  instituicoes: 'Instituições',
  proponentes: 'Proponentes/Convenentes',
  responsaveisTecnicos: 'Responsável Técnico',
  usuarios: 'Usuários',
  backups: 'Backups Automáticos',
};

// Mesmo agrupamento usado no Sidebar — o rótulo da seção acompanha
// o breadcrumb do cabeçalho em todas as abas.
const SECAO_DA_ABA = {
  cadastro: 'Operacional',
  prestacao: 'Operacional',
  documentos: 'Operacional',
  relatorios: 'Operacional',
  emendas: 'Cadastros de Apoio',
  instituicoes: 'Cadastros de Apoio',
  proponentes: 'Cadastros de Apoio',
  responsaveisTecnicos: 'Cadastros de Apoio',
  usuarios: 'Administração',
};

export default function Header({ onToggleMenu }) {
  const { state, mudarView } = useApp();
  if (!state) return null;

  const c = state.convenios?.find((x) => x.id === state.convenioAtualId);
  const secao = SECAO_DA_ABA[state.view];
  const naPainel = state.view === 'painel';

  return (
    <>
      <div className="main-header-left">
        <button
          type="button"
          className="btn-menu-mobile"
          onClick={onToggleMenu}
          aria-label="Abrir menu"
        >
          ☰
        </button>
        {!naPainel && (
          <button
            type="button"
            className="btn-back"
            onClick={() => mudarView('painel')}
            aria-label="Voltar ao Painel Geral"
          >
            ← Voltar
          </button>
        )}
        <div>
          {secao && <div className="main-header-eyebrow">{secao}</div>}
          <div className="main-header-title">{NOMES_ABAS[state.view] || state.view}</div>
          {!naPainel && c && (
            <div className="main-header-breadcrumb">
              {c.conveniente || c.proponente || 'Convenente não informado'} · Convênio nº {c.numero || 'sem número'}
            </div>
          )}
        </div>
      </div>
      <div className="main-header-date">{hojeFormatado()}</div>
    </>
  );
}
