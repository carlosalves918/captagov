import { Html, Head, Main, NextScript } from 'next/document';
import Script from 'next/script';

export default function Document() {
  return (
    <Html lang="pt-BR">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,400;0,500;0,600;0,700;1,500&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </Head>
      <body>
        <Main />
        <NextScript />
        {/* Dexie precisa estar pronto antes de public/app.js rodar.
            beforeInteractive só é permitido aqui, em _document.js. */}
        <Script
          src="https://unpkg.com/dexie@3.2.7/dist/dexie.js"
          strategy="beforeInteractive"
        />
      </body>
    </Html>
  );
}
