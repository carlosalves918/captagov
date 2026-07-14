import { AppProvider } from '../contexts/AppContext';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import MainBody from '../components/MainBody';

export default function Home() {
  return (
    <AppProvider>
      <div className="app-layout">
        <aside className="sidebar">
          <Sidebar />
        </aside>
        <div className="main-content">
          <header className="main-header">
            <Header />
          </header>
          <main className="main-body">
            <MainBody />
          </main>
        </div>
      </div>
    </AppProvider>
  );
}
