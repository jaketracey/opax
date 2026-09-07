/* Google Tag Manager loader.
   Kept in its own file rather than inline in index.html so the page's content
   security policy needs no 'unsafe-inline' for scripts: the only allowance is
   the googletagmanager.com origin. Container GTM-PNDM87LW. */
(function (w, d, s, l, i) {
  w[l] = w[l] || [];
  w[l].push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
  const f = d.getElementsByTagName(s)[0];
  const j = d.createElement(s);
  const dl = l !== "dataLayer" ? "&l=" + l : "";
  j.async = true;
  j.src = "https://www.googletagmanager.com/gtm.js?id=" + i + dl;
  f.parentNode.insertBefore(j, f);
})(window, document, "script", "dataLayer", "GTM-PNDM87LW");
