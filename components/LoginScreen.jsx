import { useState } from 'react';
import { useApp } from '../contexts/AppContext';

// Tela de login local — só aparece quando pelo menos um usuário tem senha
// cadastrada (ver Usuários > Acesso ao sistema). Enquanto ninguém tiver
// senha, o app abre direto no Painel Geral, sem pedir login.
export default function LoginScreen() {
  const { state, fazerLogin } = useApp();
  const [usuarioId, setUsuarioId] = useState('');
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);

  const usuariosComLogin = (state?.usuarios || []).filter((u) => u.senhaHash);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!usuarioId || !senha) return;
    setEnviando(true);
    try {
      await fazerLogin(usuarioId, senha);
    } finally {
      setEnviando(false);
      setSenha('');
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <img src="/logo.png" alt="CaptaGov" className="login-logo" />
        <div className="login-title">Entrar no CaptaGov</div>
        <div className="login-subtitle">Selecione seu usuário e informe sua senha para continuar.</div>
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginTop: 20 }}>
            <label className="form-label">Usuário</label>
            <select
              className="form-input form-select"
              value={usuarioId}
              onChange={(e) => setUsuarioId(e.target.value)}
              required
            >
              <option value="">— selecione —</option>
              {usuariosComLogin.map((u) => (
                <option key={u.id} value={u.id}>{u.nome}{u.cargo ? ' — ' + u.cargo : ''}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginTop: 14 }}>
            <label className="form-label">Senha</label>
            <input
              className="form-input"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoFocus
              required
            />
          </div>
          <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 20 }} disabled={enviando}>
            {enviando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
        <div className="login-footnote">
          Login local, guardado só neste navegador — controla o uso do computador compartilhado, mas não substitui um servidor de autenticação.
        </div>
      </div>
    </div>
  );
}
