export default function Home() {
  return (
    <>
      <div className="app-layout">
        <aside id="sidebar" className="sidebar" />
        <div className="main-content">
          <header id="mainHeader" className="main-header" />
          <main id="mainBody" className="main-body">
            <div id="captagov-boot" style={{
              position: 'fixed', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, #0B1B33 0%, #1B3A5C 100%)',
              color: '#5EEAD4', fontFamily: "'IBM Plex Sans', sans-serif",
              fontSize: 16, zIndex: 9999, flexDirection: 'column', gap: 12,
            }}>
              <div style={{ width: 40, height: 40, borderRadius: '10px', background: 'linear-gradient(135deg, #22C55E, #14B8A6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 20, color: '#fff' }}>C</div>
              <div>Carregando CaptaGov...</div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
