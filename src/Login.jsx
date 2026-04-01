import { useState } from 'react'
import styles from './Login.module.css'

export default function Login({ onAdmin, onStaff }) {
  const [pwd, setPwd] = useState('')
  const [error, setError] = useState(false)

  function handleLogin() {
    if (pwd === 'Arco2026') {
      setError(false)
      onAdmin()
    } else {
      setError(true)
    }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.box}>
        <div className={styles.logo}>🍕</div>
        <h2 className={styles.title}>Pizzeria Arcobaleno</h2>
        <p className={styles.subtitle}>Gestione turni del personale</p>
        <input
          type="password"
          className={styles.input}
          placeholder="Password admin"
          value={pwd}
          onChange={e => { setPwd(e.target.value); setError(false) }}
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
          autoFocus
        />
        {error && <p className={styles.error}>Password errata</p>}
        <button className={styles.btnPrimary} onClick={handleLogin}>
          Accedi come Admin
        </button>
        <button className={styles.btnSecondary} onClick={onStaff}>
          Visualizza turni (sola lettura)
        </button>
      </div>
    </div>
  )
}
