// Banco online (Supabase). Com os dois campos vazios, o SCHOLA funciona só neste aparelho.
// A chave "anon" é pública por design: a segurança vem das regras (RLS) em supabase/schema.sql.
// Abrir com ?local na URL desliga o banco (testes sem sujar o mural).
const LOCAL = new URLSearchParams(globalThis.location?.search).has('local');
export const SUPABASE_URL = LOCAL ? '' : 'https://yanupbocyviajthxnuqm.supabase.co';
export const SUPABASE_ANON_KEY = LOCAL ? '' :'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhbnVwYm9jeXZpYWp0aHhudXFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxMzcyMDUsImV4cCI6MjEwODcxMzIwNX0.c3sujI1IPcbcgWG-r0fD8njl0393IBlXl5NCVlMFlWk';
