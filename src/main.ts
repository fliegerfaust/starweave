import '@fontsource/forum';
import '@fontsource-variable/manrope';
import './ui/styles.css';

async function boot(): Promise<void> {
  await document.fonts.ready;
  await Promise.all([document.fonts.load("400 40px 'Forum'"), document.fonts.load("600 16px 'Manrope Variable'")]);
  const ui = document.getElementById('ui')!;
  if (new URLSearchParams(location.search).has('gallery')) {
    const { showGallery } = await import('./dev/gallery');
    showGallery(ui);
    return;
  }
  const { startGame } = await import('./game/app');
  startGame();
}

void boot();
