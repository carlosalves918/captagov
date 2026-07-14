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

export default function Header() {
  const { state } = useApp();
  if (!state) return null;

  const c = state.convenios?.find((x) => x.id === state.convenioAtualId);

  return (
    <>
      <div className="main-header-left">
        <div>
          <div className="main-header-title">{NOMES_ABAS[state.view] || state.view}</div>
          {c && (
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
