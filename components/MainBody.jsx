import { useEffect, useRef } from 'react';
import { useApp } from '../contexts/AppContext';
import PainelGeral from './PainelGeral';

// Telas React de verdade entram aqui conforme forem migradas.
const TELAS_REACT = {
  painel: PainelGeral,
};

export default function MainBody() {
  const { ready, state, tick, renderBody } = useApp();
  const legacyDivRef = useRef(null);

  const view = state?.view;
  const TelaReact = view ? TELAS_REACT[view] : null;

  // Para telas que ainda não foram migradas, delega a renderização pro
  // motor antigo (public/js/app.js) — mas só depois que a div #mainBody
  // já existe no DOM (senão renderBody() não acha onde desenhar).
  useEffect(() => {
    if (ready && !TelaReact && legacyDivRef.current) {
      renderBody();
    }
  }, [ready, TelaReact, tick, renderBody]);

  if (!ready) {
    return (
      <div className="empty-state" style={{ padding: 60 }}>
        <div className="empty-state-title">Carregando CaptaGov...</div>
      </div>
    );
  }

  if (TelaReact) return <TelaReact />;

  // id="mainBody" precisa existir para o motor antigo conseguir escrever nele
  return <div id="mainBody" className="main-body-legacy" ref={legacyDivRef} />;
}
