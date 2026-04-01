# Turni Pizzeria Arcobaleno

App React per la gestione dei turni del personale.

## Stack
- React 18 + Vite
- Supabase (database cloud)
- Deploy su Vercel

## Setup locale

```bash
npm install
npm run dev
```

## Deploy su Vercel

### 1. Carica su GitHub
1. Vai su github.com → New repository → nome `turni-arcobaleno`
2. Carica tutti i file di questa cartella

### 2. Collega a Vercel
1. Vai su vercel.com → New Project
2. Importa il repository GitHub `turni-arcobaleno`
3. Nella sezione **Environment Variables** aggiungi:
   - `VITE_SUPABASE_URL` = `https://rvzikapecolurexiaoqs.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = (la tua anon key da Supabase)
4. Clicca **Deploy**

### 3. Configura RLS su Supabase
Nella console Supabase → Table Editor → tabella `turni`:
- Assicurati che RLS sia **disabilitato** (per uso interno)
- Oppure aggiungi policy permissive se preferisci tenerlo attivo

## Credenziali
- Password admin: `Arco2026`
- Staff: accesso senza password (sola lettura)
