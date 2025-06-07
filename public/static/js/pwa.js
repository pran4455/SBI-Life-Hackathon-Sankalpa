// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('ServiceWorker registration successful');
            })
            .catch(err => {
                console.error('ServiceWorker registration failed: ', err);
            });
    });
}

// Add to Home Screen functionality
let deferredPrompt;
const installButton = document.getElementById('installButton');

if (installButton) {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        installButton.classList.add('show');
    });

    installButton.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            deferredPrompt = null;
            installButton.classList.remove('show');
        }
    });

    window.addEventListener('appinstalled', () => {
        installButton.style.display = 'none';
    });
}

// Handle offline/online events
window.addEventListener('online', function() {
    document.body.classList.remove('offline');
    // Attempt to sync any stored data
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        navigator.serviceWorker.ready.then(sw => {
            sw.sync.register('syncData');
        });
    }
});

window.addEventListener('offline', function() {
    document.body.classList.add('offline');
});
