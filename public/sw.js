// Dummy Service Worker to satisfy PWA install requirements on some Android browsers
self.addEventListener('fetch', function(event) {
  // Empty fetch handler allows the browser to show the installation prompt
});
