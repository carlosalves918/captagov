/* ============================================================
 * CAPTAGOV v2 — Notificações (toast)
 * Substitui alert() nativo (bloqueia a tela inteira, parece "sistema
 * quebrado") por um aviso discreto no canto da tela, empilhável,
 * que some sozinho.
 * ============================================================ */

let _container = null;

function getContainer() {
  if (_container && document.body.contains(_container)) return _container;
  _container = document.createElement('div');
  _container.id = 'captagov-toast-container';
  _container.style.cssText = [
    'position:fixed', 'top:16px', 'right:16px', 'z-index:99999',
    'display:flex', 'flex-direction:column', 'gap:8px',
    'max-width:360px', 'pointer-events:none',
  ].join(';');
  document.body.appendChild(_container);
  return _container;
}

const CORES = {
  sucesso: { bg: '#DCFCE7', borda: '#16A34A', texto: '#14532D' },
  erro: { bg: '#FEE2E2', borda: '#DC2626', texto: '#7F1D1D' },
  aviso: { bg: '#FEF3C7', borda: '#D97706', texto: '#78350F' },
};

function mostrarToast(mensagem, tipo) {
  const cont = getContainer();
  const cor = CORES[tipo] || CORES.aviso;
  const el = document.createElement('div');
  el.style.cssText = [
    `background:${cor.bg}`, `border-left:4px solid ${cor.borda}`, `color:${cor.texto}`,
    'padding:12px 14px', 'border-radius:8px', 'font-family:"IBM Plex Sans",sans-serif',
    'font-size:14px', 'box-shadow:0 4px 12px rgba(0,0,0,0.15)', 'pointer-events:auto',
    'opacity:0', 'transform:translateX(12px)', 'transition:opacity .2s ease, transform .2s ease',
  ].join(';');
  el.textContent = mensagem;
  cont.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateX(0)'; });
  const remover = () => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(12px)';
    setTimeout(() => el.remove(), 200);
  };
  el.addEventListener('click', remover);
  setTimeout(remover, tipo === 'erro' ? 6000 : 3500);
}

export function toastSucesso(msg) { mostrarToast(msg, 'sucesso'); }
export function toastErro(msg) { mostrarToast(msg, 'erro'); }
export function toastAviso(msg) { mostrarToast(msg, 'aviso'); }
