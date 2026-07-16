import { useState } from 'react';
import { AppProvider } from '../contexts/AppContext';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import MainBody from '../components/MainBody';

export default function Home() {
  const [menuAberto, setMenuAberto] = useState(false);

  return (
    <AppProvider>
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
    </AppProvider>
  );
}
