/* ============================================================
 * AppContext — ponte entre o React "de verdade" (Sidebar, Header,
 * Painel Geral, e as próximas telas a migrar) e o motor antigo em
 * public/js/app.js (que ainda dona as telas não migradas).
 *
 * COMO FUNCIONA
 * public/js/app.js roda como módulo nativo do navegador (carregado via
 * <Script src="/js/app.js" type="module"> em pages/_app.js) — ele NÃO passa
 * pelo bundler do Next. Por isso, componentes React não podem fazer
 * `import { STATE } from '.../app.js'` (isso criaria uma SEGUNDA cópia do
 * módulo, com um STATE desconectado do que está rodando de verdade).
 *
 * Em vez disso, app.js expõe o STATE (mutável) e suas funções de ação em
 * `window`, e dispara o evento `captagov:changed` toda vez que algo muda.
 * Este contexto escuta esse evento e força um re-render do React.
 *
 * QUANDO UMA TELA FOR MIGRADA PARA REACT DE VERDADE:
 * ela deixa de chamar as funções de `window.*` e passa a usar estado e
 * lógica React locais (ou um reducer aqui no contexto, se o estado precisar
 * ser compartilhado). Este arquivo deve encolher com o tempo, até sumir
 * quando app.js for aposentado por completo.
 * ============================================================ */
import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';

const AppCtx = createContext(null);

export function AppProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    function sync() {
      setReady(!!window.STATE);
      setTick((t) => t + 1);
    }
    // Pode ser que o app.js já tenha rodado antes deste efeito montar
    // (ou ainda vá rodar depois) — cobre os dois casos.
    if (window.STATE) sync();
    window.addEventListener('captagov:changed', sync);
    return () => window.removeEventListener('captagov:changed', sync);
  }, []);

  // Ações "em ponte": chamam a função global exposta por app.js, se existir.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const call = useCallback((name) => (...args) => {
    if (typeof window[name] === 'function') return window[name](...args);
    console.warn(`[AppContext] window.${name} ainda não está disponível.`);
    return undefined;
  }, []);

  const actions = useMemo(() => ({
    mudarView: call('mudarView'),
    mudarSubView: call('mudarSubView'),
    novoConvenio: call('novoConvenio'),
    editarConvenio: call('editarConvenio'),
    duplicarConvenio: call('duplicarConvenio'),
    excluirConvenio: call('excluirConvenio'),
    abrirPrestacaoContas: call('abrirPrestacaoContas'),
    abrirAditivoDireto: call('abrirAditivoDireto'),
    abrirTelaBackups: call('abrirTelaBackups'),
    exportarDados: call('exportarDados'),
    importarDados: call('importarDados'),
    renderBody: call('renderBody'),
    // Funções puras de leitura (também expostas em window para as telas legadas)
    calcularResumoFinanceiro: call('calcularResumoFinanceiro'),
    statusConvenio: call('statusConvenio'),
  }), [call]);

  const value = useMemo(() => ({
    ready,
    tick,
    state: typeof window !== 'undefined' ? window.STATE : null,
    ...actions,
  }), [ready, tick, actions]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp precisa ser usado dentro de <AppProvider>.');
  return ctx;
}
