import Head from 'next/head';
import { getBodyHtml } from '../lib/bodyHtml';

export default function Home({ bodyHtml }) {
  return (
    <>
      <Head>
        <title>CaptaGov — Protótipo Refatorado</title>
      </Head>
      <div id="captagov-boot" style={bootOverlayStyle}>
        Carregando dados locais…
      </div>
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </>
  );
}

const bootOverlayStyle = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#F5F6FA',
  color: '#4B5768',
  fontFamily: "'IBM Plex Sans', sans-serif",
  fontSize: 14,
  zIndex: 9999,
};

// Lê o markup original no servidor (sem precisar reescrever tudo em JSX).
// O restante da lógica (onclick="funcName()") continua funcionando pois
// public/app.js expõe essas funções no escopo global do navegador.
export async function getServerSideProps() {
  const bodyHtml = getBodyHtml();
  return { props: { bodyHtml } };
}
