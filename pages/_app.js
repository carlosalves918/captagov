import Script from 'next/script';
import '../styles/globals.css';

export default function App({ Component, pageProps }) {
  return (
    <>
      {/* Dexie é carregado em pages/_document.js (beforeInteractive só é
          permitido lá). Aqui só carregamos a lógica do app, depois que
          o Dexie já está disponível. */}
      <Component {...pageProps} />
      <Script src="/app.js" strategy="afterInteractive" />
    </>
  );
}
