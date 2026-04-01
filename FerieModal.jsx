import { useState } from 'react'
import { EMPLOYEES, addDays, toDateStr } from './utils'
import styles from './FerieModal.module.css'

function pad(n) { return String(n).padStart(2,'0') }
function fmtDate(str) {
  const [y,m,d] = str.split('-')
  return `${d}/${m}/${String(y).slice(2)}`
}

export default function FerieModal({ currentMonday, onClose, onApply }) {
  const monStr = toDateStr(currentMonday)
  const sunStr = toDateStr(addDays(currentMonday, 6))

  const [mode, setMode] = useState('settimana')
  const [from, setFrom] = useState(monStr)
  const [to, setTo] = useState(sunStr)
  const [empMode, setEmpMode] = useState('tutti')
  const [selEmps, setSelEmps] = useState([])
  const [confirm, setConfirm] = useState(false)

  function toggleEmp(emp) {
    setSelEmps(prev =>
      prev.includes(emp) ? prev.filter(e => e !== emp) : [...prev, emp]
    )
  }

  function handleModeChange(m) {
    setMode(m)
    if (m === 'settimana') { setFrom(monStr); setTo(sunStr) }
  }

  const employees = empMode === 'tutti' ? EMPLOYEES : selEmps

  function countDays() {
    let count = 0
    const cur = new Date(from)
    const end = new Date(to)
    while (cur <= end) { count++; cur.setDate(cur.getDate()+1) }
    return count
  }

  function doApply() {
    if (!confirm) { setConfirm(true); return }
    // Costruisce tutte le chiavi da settare a F
    const records = []
    const cur = new Date(from)
    const end = new Date(to)
    while (cur <= end) {
      const ds = toDateStr(cur)
      employees.forEach(emp => {
        records.push({ key: `${emp}::${ds}::pranzo`, val: 'F' })
        records.push({ key: `${emp}::${ds}::cena`, val: 'F' })
      })
      cur.setDate(cur.getDate()+1)
    }
    onApply(records)
    onClose()
  }

  const disabled = empMode === 'singoli' && selEmps.length === 0

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>🏖 Imposta FERIE</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.section}>
          <label className={styles.label}>Periodo</label>
          <div className={styles.radios}>
            <label className={styles.radio}>
              <input type="radio" checked={mode==='settimana'} onChange={() => handleModeChange('settimana')} />
              Settimana corrente ({fmtDate(monStr)} – {fmtDate(sunStr)})
            </label>
            <label className={styles.radio}>
              <input type="radio" checked={mode==='custom'} onChange={() => handleModeChange('custom')} />
              Periodo personalizzato
            </label>
          </div>
          {mode === 'custom' && (
            <div className={styles.dateRow}>
              <div className={styles.dateField}>
                <span className={styles.dateLabel}>Dal</span>
                <input type="date" className={styles.dateInput} value={from} onChange={e => { setFrom(e.target.value); setConfirm(false) }} />
              </div>
              <div className={styles.dateField}>
                <span className={styles.dateLabel}>Al</span>
                <input type="date" className={styles.dateInput} value={to} onChange={e => { setTo(e.target.value); setConfirm(false) }} />
              </div>
            </div>
          )}
        </div>

        <div className={styles.section}>
          <label className={styles.label}>Dipendenti</label>
          <div className={styles.radios}>
            <label className={styles.radio}>
              <input type="radio" checked={empMode==='tutti'} onChange={() => { setEmpMode('tutti'); setConfirm(false) }} />
              Tutti i dipendenti
            </label>
            <label className={styles.radio}>
              <input type="radio" checked={empMode==='singoli'} onChange={() => { setEmpMode('singoli'); setConfirm(false) }} />
              Seleziona dipendenti
            </label>
          </div>
          {empMode === 'singoli' && (
            <div className={styles.empList}>
              {EMPLOYEES.map(emp => (
                <label key={emp} className={styles.empCheck}>
                  <input
                    type="checkbox"
                    checked={selEmps.includes(emp)}
                    onChange={() => { toggleEmp(emp); setConfirm(false) }}
                  />
                  {emp}
                </label>
              ))}
            </div>
          )}
        </div>

        {!confirm ? (
          <button className={styles.applyBtn} onClick={doApply} disabled={disabled}>
            Imposta FERIE
          </button>
        ) : (
          <div className={styles.confirmBox}>
            <p className={styles.confirmText}>
              Verranno impostati <strong>FERIE</strong> per{' '}
              <strong>{empMode === 'tutti' ? 'tutti i dipendenti' : `${selEmps.length} dipendent${selEmps.length === 1 ? 'e' : 'i'}`}</strong>{' '}
              per <strong>{countDays()} giorn{countDays() === 1 ? 'o' : 'i'}</strong> ({fmtDate(from)} – {fmtDate(to)}).
              <br />Le celle già compilate verranno sovrascritte.
            </p>
            <div className={styles.confirmBtns}>
              <button className={styles.cancelBtn} onClick={() => setConfirm(false)}>Annulla</button>
              <button className={styles.confirmBtn} onClick={doApply}>Conferma</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
