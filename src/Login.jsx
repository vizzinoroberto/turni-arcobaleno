import { useState } from 'react'
import logo from './logo.js'
import styles from './Login.module.css'

const ADMIN_PASS = 'Arco2026'
const STAFF_PASS = 'arcoturni'

export default function Login({ onAdmin, onStaff }) {
  const [tab, setTab] = useState('staff')
  const [pwd, setPwd] = useState('')
  const [error, setError] = useState(false)

  function handleLogin() {
    if (tab === 'admin' && pwd === ADMIN_PASS) { setError(false); onAdmin() }
    else if (tab === 'staff' && pwd === STAFF_PASS) { setError(false); onStaff() }
    else setError(true)
  }

  function switchTab(t) { setTab(t); setPwd(''); setError(false) }

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
          onChange={e => { setPwd(e.target.value); setError(false) }}
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
          autoFocus
        />
        {error && <p className={styles.error}>Password errata</p>}
        <button className={styles.btnPrimary} onClick={handleLogin}>Accedi</button>
      </div>
    </div>
  )
}
