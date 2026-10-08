// Run before first paint. The no-JS answer remains visible when scripts are disabled.
if (location.pathname !== '/' && location.pathname !== '/index.html') {
  document.documentElement.classList.add('spa-booting');
  setTimeout(() => {
    if (!document.documentElement.classList.contains('spa-ready')) {
      document.documentElement.classList.remove('spa-booting');
      document.documentElement.classList.add('spa-failed');
    }
  }, 10000);
}
