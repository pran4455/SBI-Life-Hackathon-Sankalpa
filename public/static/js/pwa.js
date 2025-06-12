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
    // Show install button if PWA is not already installed
    if (!window.matchMedia('(display-mode: standalone)').matches) {
        installButton.style.display = 'inline-block';
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        installButton.style.display = 'inline-block';
        installButton.classList.add('show');
    });

    installButton.addEventListener('click', async () => {
        if (deferredPrompt) {
            // Show the install prompt
            deferredPrompt.prompt();
            
            // Wait for the user to respond to the prompt
            const { outcome } = await deferredPrompt.userChoice;
            
            // We no longer need the prompt. Clear it up
            deferredPrompt = null;
            
            // Hide the install button
            installButton.style.display = 'none';
            
            // Log the outcome
            console.log(`User response to the install prompt: ${outcome}`);
        }
    });

    window.addEventListener('appinstalled', (evt) => {
        // Log install event
        console.log('App was installed', evt);
        // Hide the install button
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
