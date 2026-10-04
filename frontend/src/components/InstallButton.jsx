import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';

/**
 * PWA Install Button.
 * Only rendered when the browser triggers the `beforeinstallprompt` event.
 */
export function InstallButton() {
  const [installPrompt, setInstallPrompt] = useState(null);

  useEffect(() => {
    const handleBeforeInstall = (e) => {
      // Prevent default mini-infobar on mobile
      e.preventDefault();
      setInstallPrompt(e);
    };

    const handleAppInstalled = () => {
      setInstallPrompt(null);
      console.log('[FIELDNOTE PWA] Application successfully installed.');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  if (!installPrompt) {
    return null;
  }

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    console.log(`[FIELDNOTE PWA] User install choice: ${outcome}`);
    setInstallPrompt(null);
  };

  return (
    <button
      type="button"
      onClick={handleInstallClick}
      className="btn-tactile inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all duration-200 cursor-pointer"
      title="Install FIELDNOTE as a standalone desktop/mobile app"
    >
      <Download className="h-3.5 w-3.5" />
      <span>Install App</span>
    </button>
  );
}
