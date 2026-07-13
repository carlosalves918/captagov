import Script from 'next/script';
import '../styles/globals.css';

export default function App({ Component, pageProps }) {
  return (
    <>
      {/* Dexie primeiro (beforeInteractive garante ordem), depois a lógica
          original do app (afterInteractive, já com Dexie disponível). */}
      <Script
        src="https://unpkg.com/dexie@3.2.7/dist/dexie.js"
        strategy="beforeInteractive"
      />
      <Component {...pageProps} />
      <Script src="/app.js" strategy="afterInteractive" />
    </>
  );
}
