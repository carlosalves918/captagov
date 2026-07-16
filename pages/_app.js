import Script from 'next/script';
import '../styles/globals.css';

export default function App({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      <Script src="/js/app.js" type="module" strategy="afterInteractive" />
      <Script src="/js/autofit.js" strategy="afterInteractive" />
    </>
  );
}
