// Idioma do SCHOLA. A escolha acontece na tela de abertura, antes de o app ser carregado,
// então cada módulo pode resolver seus textos com L(pt, en) já no idioma certo.
// Trocar de idioma depois recarrega a página.
const KEY = 'schola.lang';

const saved = () => {
  try { return globalThis.localStorage?.getItem(KEY); } catch { return null; }
};

export let lang = saved() || (String(globalThis.navigator?.language || 'pt').toLowerCase().startsWith('pt') ? 'pt' : 'en');
export const hasChosen = () => Boolean(saved());

export function setLang(l) {
  lang = l === 'en' ? 'en' : 'pt';
  try { globalThis.localStorage?.setItem(KEY, lang); } catch { /* ignora */ }
  if (globalThis.document) document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR';
}

export const L = (pt, en) => (lang === 'en' ? en : pt);
export const locale = () => (lang === 'en' ? 'en-US' : 'pt-BR');
