// Run before first paint. The no-JS answer remains visible when scripts are disabled.
if (location.pathname !== '/' && location.pathname !== '/index.html') {
  document.documentElement.classList.add('spa-booting');
  // The frame route() will draw (showPanel in app.js): every panel but Ask is
  // compact, and Search keeps the hero. Drawing it before the app boots keeps
  // the hero and the breadcrumb strip from moving the page when it does.
  const search = /^\/ask(?:\/|$)/.test(location.pathname) && new URLSearchParams(location.search).get('view') === 'search';
  if (search || !/^\/ask(?:\/|$)/.test(location.pathname)) document.documentElement.classList.add('spa-boot-compact');
  if (search) document.documentElement.classList.add('spa-boot-search');
  setTimeout(() => {
    if (!document.documentElement.classList.contains('spa-ready')) {
      // The app never routed: give the reader the whole server answer.
      document.documentElement.classList.remove('spa-booting', 'spa-boot-compact', 'spa-boot-search');
      document.documentElement.classList.add('spa-failed');
    }
  }, 10000);
}
