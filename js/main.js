// Abertura do SCHOLA: o jogador escolhe o idioma. O resto do app (js/app.js) só é carregado
// depois dessa escolha, para que todos os textos L(pt, en) já nasçam no idioma certo.
// Trocar de idioma nos Ajustes recarrega a página e volta para esta tela.
import { lang, hasChosen, setLang } from './i18n.js';
import { SoundEngine } from './audio.js';

const app = document.getElementById('app');

function savedSettings() {
  try { return JSON.parse(localStorage.getItem('schola.v2'))?.settings || {}; } catch { return {}; }
}

function splash() {
  const last = hasChosen() ? lang : null;
  const t = document.createElement('template');
  t.innerHTML = `
    <section class="screen splash" aria-label="SCHOLA">
      <div class="splash-emblem"><img src="brand/schola-emblem-glow.png" alt=""></div>
      <img class="splash-word" src="brand/schola-wordmark.png" alt="SCHOLA">
      <p class="splash-sub">Treino cognitivo em forma de jogo.<span>Cognitive training, played.</span></p>
      <p class="lang-q">Escolha o idioma · Choose your language</p>
      <div class="lang-pick">
        <button class="lang-btn ${last === 'pt' ? 'last' : ''}" data-lang="pt" lang="pt-BR">
          <span class="lang-code">PT</span><span><b>Português</b><small>Jogar em português</small></span>
        </button>
        <button class="lang-btn ${last === 'en' ? 'last' : ''}" data-lang="en" lang="en">
          <span class="lang-code">EN</span><span><b>English</b><small>Play in English</small></span>
        </button>
      </div>
    </section>`.trim();
  const el = t.content.firstElementChild;
  app.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));

  el.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-lang]');
    if (!btn || el.dataset.busy) return;
    el.dataset.busy = '1';
    setLang(btn.dataset.lang);
    // O áudio precisa nascer dentro deste toque.
    const audio = new SoundEngine();
    const st = savedSettings();
    audio.soundOn = st.sound ?? true;
    audio.musicOn = st.music ?? true;
    audio.init();
    audio.arpeggio(5);
    if (st.haptics !== false && navigator.vibrate) navigator.vibrate(15);
    el.classList.add('out');
    const { start } = await import('./app.js');
    setTimeout(() => start({ audio }), 300);
  });
}

splash();
