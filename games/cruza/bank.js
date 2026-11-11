// CRUZA — banco de palavras. Cada categoria tem um arquivo em ./words/ (o primeiro lote,
// sempre disponível) e o Supabase pode acrescentar ou corrigir palavras na tabela
// public.cruza_words (supabase/cruza.sql), sem precisar publicar o site de novo.
import { L, lang } from '../../js/i18n.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../js/config.js';
import ia from './words/ia.js';
import atualidades from './words/atualidades.js';
import ciencia from './words/ciencia.js';
import dinheiro from './words/dinheiro.js';
import bemestar from './words/bemestar.js';

export const CATS = [
  { id: 'atualidades', name: L('Atualidades', 'Current Affairs'), color: '#FF8A5B', icon: '🗞️' },
  { id: 'ia', name: L('Inteligência Artificial', 'Artificial Intelligence'), color: '#A78BFA', icon: '🤖' },
  { id: 'ciencia', name: L('Ciência e Tecnologia', 'Science & Technology'), color: '#38BDF8', icon: '🔭' },
  { id: 'dinheiro', name: L('Dinheiro e Economia', 'Money & Economy'), color: '#FFD23F', icon: '💰' },
  { id: 'bemestar', name: L('Bem-estar', 'Well-being'), color: '#3EDBB0', icon: '🌿' },
];
export const catById = (id) => CATS.find((c) => c.id === id) || CATS[0];

// "Inflação" → "INFLACAO": a grade usa só A–Z.
export const normalize = (w) => String(w).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');

const BUNDLED = [
  ...ia.map((e) => ({ ...e, cat: 'ia' })),
  ...atualidades.map((e) => ({ ...e, cat: 'atualidades' })),
  ...ciencia.map((e) => ({ ...e, cat: 'ciencia' })),
  ...dinheiro.map((e) => ({ ...e, cat: 'dinheiro' })),
  ...bemestar.map((e) => ({ ...e, cat: 'bemestar' })),
];

const prepare = (e) => ({ ...e, answer: normalize(e.word) });
const valid = (e) => e && e.id && e.word && e.clue && e.explain && e.analogy && /^[A-Z]{3,13}$/.test(normalize(e.word));

let all = BUNDLED.filter(valid).map(prepare);
let remoteDone = null;

// Busca a tabela do Supabase uma vez por sessão (até 3 s). Sem tabela ou offline: segue com o banco local.
export function loadRemote() {
  if (remoteDone) return remoteDone;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || typeof fetch !== 'function') return (remoteDone = Promise.resolve(false));
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 3000);
  remoteDone = fetch(`${SUPABASE_URL}/rest/v1/cruza_words?select=id,lang,cat,word,clue,clue2,explain,analogy&active=eq.true&limit=5000`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    signal: ctl.signal,
  })
    .then((r) => (r.ok ? r.json() : []))
    .then((rows) => {
      const byId = new Map(all.map((e) => [e.id, e]));
      for (const row of rows || []) if (valid(row) && CATS.some((c) => c.id === row.cat)) byId.set(row.id, prepare(row));
      all = [...byId.values()];
      return true;
    })
    .catch(() => false)
    .finally(() => clearTimeout(timer));
  return remoteDone;
}

// Palavras de um idioma (padrão: o do jogador), opcionalmente de uma categoria.
export const words = (cat, lg = lang) => all.filter((e) => e.lang === lg && (!cat || e.cat === cat));
export const wordById = (id) => all.find((e) => e.id === id);
