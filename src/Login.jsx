import { useState } from 'react'
import { supabase } from './supabase'
import logo from './logo.js'
import styles from './Login.module.css'

// Account condivisi su Supabase Auth: la password viene verificata dal server,
// non è più scritta nel codice. Il ruolo (admin/staff) è in app_metadata.role
// dell'utente e viene usato dalle policy RLS del database.
const ACCOUNT_EMAIL = {
  staff: 'staff@turni-arcobaleno.app',
  admin: 'admin@turni-arcobaleno.app',
}

export default function Login() {
  const [tab, setTab] = useState('staff')
  const [pwd, setPwd] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!pwd || loading) return
    setLoading(true)
    setError('')
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: ACCOUNT_EMAIL[tab],
      password: pwd,
    })
    setLoading(false)
    if (authError) {
      setError(authError.message === 'Invalid login credentials' ? 'Password errata' : 'Errore di accesso: ' + authError.message)
    }
    // In caso di successo App.jsx riceve la nuova sessione da onAuthStateChange.
  }

  function switchTab(t) { setTab(t); setPwd(''); setError('') }

  return (
    <div className={styles.screen}>
      <div className={styles.box}>
        <img src={logo} alt="Pizzeria Arcobaleno" className={styles.logo} />
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === 'staff' ? styles.activeTab : ''}`} onClick={() => switchTab('staff')}>Dipendenti</button>
          <button className={`${styles.tab} ${tab === 'admin' ? styles.activeTab : ''}`} onClick={() => switchTab('admin')}>Admin</button>
        </div>
        <p className={styles.subtitle}>
          {tab === 'admin' ? 'Accesso riservato alla direzione' : 'Visualizza i tuoi turni'}
        </p>
        <input
          type="password"
          className={styles.input}
          placeholder="Password"
          value={pwd}
          onChange={e => { setPwd(e.target.value); setError('') }}
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
          autoFocus
        />
        {error && <p className={styles.error}>{error}</p>}
        <button className={styles.btnPrimary} onClick={handleLogin} disabled={loading}>
          {loading ? 'Accesso...' : 'Accedi'}
        </button>
      </div>
    </div>
  )
}
