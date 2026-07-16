import { useState } from 'react';
import { AppProvider, useApp } from '../contexts/AppContext';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import MainBody from '../components/MainBody';
import LoginScreen from '../components/LoginScreen';

export default function Home() {
  return (
    <AppProvider>
      <AppGate />
    </AppProvider>
  );
}

function AppGate() {
  const [menuAberto, setMenuAberto] = useState(false);
  const { ready, state, algumUsuarioTemSenha } = useApp();

  if (!ready || !state) return null;

  const precisaLogin = algumUsuarioTemSenha() && !state.usuarioLogadoId;
  if (precisaLogin) return <LoginScreen />;

  return (
    <div className="app-layout">
      <aside className={`sidebar ${menuAberto ? 'sidebar-open' : ''}`}>
        <Sidebar onNavigate={() => setMenuAberto(false)} />
      </aside>
      {menuAberto && (
        <div
          className="sidebar-overlay"
          onClick={() => setMenuAberto(false)}
          aria-hidden="true"
        />
      )}
      <div className="main-content">
        <header className="main-header">
          <Header onToggleMenu={() => setMenuAberto((v) => !v)} />
        </header>
        <main className="main-body">
          <MainBody />
        </main>
      </div>
    </div>
  );
}
