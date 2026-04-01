import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabase'
import {
  EMPLOYEES, DOW_LABELS, getMonday, addDays, toDateStr,
  formatDateVertical, isWeekend, isSunday,
  getWeekDays, shiftToDisplay
} from './utils'
import styles from './TurniGrid.module.css'

const FESTIVI = new Set([
  '04-25', '05-01', '06-02', '08-15',
  '11-01', '12-08', '12-24', '12-25', '12-26', '12-31'
])

function isFestivo(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return FESTIVI.has(`${mm}-${dd}`)
}

function showShiftNum(d) {
  return isWeekend(d) || isFestivo(d)
}

function formatDateFull(d) {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(2)
  return `${dd}/${mm}/${yy}`
}

export default function TurniGrid({ isAdmin, onLogout }) {
  const [data, setData] = useState({})
  const [mode, setMode] = useState(isAdmin ? 'admin' : 'staff')
  const [currentMonday, setCurrentMonday] = useState(() => getMonday(new Date()))
  const [syncStatus, setSyncStatus] = useState({ msg: '', cls: '' })
  const saveTimer = useRef(null)

  const loadData = useCallback(async () => {
    setSyncStatus({ msg: 'Caricamento...', cls: '' })
    const { data: rows, error } = await supabase.from('turni').select('chiave, valore')
    if (error) { setSyncStatus({ msg: 'Errore caricamento ✗', cls: styles.err }); return }
    const obj = {}
    rows.forEach(r => { obj[r.chiave] = r.valore })
    setData(obj)
    setSyncStatus({ msg: 'Sincronizzato ✓', cls: styles.ok })
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function saveCell(key, val) {
    if (val) {
      const { error } = await supabase.from('turni').upsert({ chiave: key, valore: val }, { onConflict: 'chiave' })
      if (error) { setSyncStatus({ msg: 'Errore salvataggio ✗', cls: styles.err }); return }
    } else {
      const { error } = await supabase.from('turni').delete().eq('chiave', key)
      if (error) { setSyncStatus({ msg: 'Errore salvataggio ✗', cls: styles.err }); return }
    }
    setSyncStatus({ msg: 'Salvato ✓', cls: styles.ok })
  }

  function handleChange(key, val) {
    setData(prev => {
      const next = { ...prev }
      if (val) next[key] = val
      else delete next[key]
      return next
    })
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveCell(key, val), 600)
  }

  const days = getWeekDays(currentMonday)

  function colClass(d) {
    if (isSunday(d)) return styles.sundayCol
    if (isWeekend(d)) return styles.weekendCol
    return ''
  }

  function adminOptions(service, val) {
    const opts = service === 'pranzo'
      ? [['', '—'], ['Q', 'Q'], ['W', 'W'], ['F', 'F']]
      : [['', '—'], ['1','1'], ['2','2'], ['3','3'], ['4','4'], ['5','5'], ['6','6'], ['7','7'], ['F','F']]
    return opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)
  }

  function selectClass(val) {
    if (val === 'F') return `${styles.shiftInput} ${styles.hasFerie}`
    if (val) return `${styles.shiftInput} ${styles.hasValue}`
    return styles.shiftInput
  }

  function renderStaffCell(val, service, d) {
    const disp = shiftToDisplay(val, service)
    if (!disp) return <span className={styles.emptyCell}>·</span>
    if (disp.type === 'ferie') return <span className={styles.ferieBadge}>FERIE</span>
    const isPranzo = service === 'pranzo'
    const showNum = !isPranzo && showShiftNum(d)
    return (
      <div className={styles.cellDisplay}>
        <span className={styles.timeStr}>{disp.time}</span>
        {showNum && <span className={styles.shiftNum}>{disp.num}</span>}
      </div>
    )
  }

  const isStaffView = mode === 'staff'

  return (
    <div className={styles.app}>
      <div className={styles.topBar}>
        <span className={styles.titleText}>🍕 Turni Pizzeria Arcobaleno</span>
        <button className={styles.navBtn} onClick={() => setCurrentMonday(m => addDays(m, -7))}>←</button>
        <span className={styles.weekLabel}>
          {formatDateFull(days[0])} – {formatDateFull(days[6])}
        </span>
        <button className={styles.navBtn} onClick={() => setCurrentMonday(m => addDays(m, 7))}>→</button>
        {isAdmin && (
          <div className={styles.modeToggle}>
            <button className={`${styles.modeBtn} ${mode === 'admin' ? styles.active : ''}`} onClick={() => setMode('admin')}>Admin</button>
            <button className={`${styles.modeBtn} ${mode === 'staff' ? styles.active : ''}`} onClick={() => setMode('staff')}>Dipendenti</button>
          </div>
        )}
        <span className={`${styles.syncStatus} ${syncStatus.cls}`}>{syncStatus.msg}</span>
        <button className={styles.logoutBtn} onClick={onLogout}>Esci</button>
      </div>

      {!isAdmin && (
        <div className={styles.staffNote}>
          Stai visualizzando i turni in modalità <strong>sola lettura</strong>.
          <button className={styles.refreshBtn} onClick={loadData}>↻ Aggiorna</button>
        </div>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={`${styles.colName} ${styles.hdr}`} rowSpan={2}>Dipendente</th>
              {days.map((d, i) => (
                <th key={i} className={`${styles.dayHeader} ${colClass(d)}`}>
                  <span className={styles.dateVertical}>{formatDateVertical(d)}</span>
                  <span className={`${styles.dow} ${isWeekend(d) ? styles.weekend : ''}`}>{DOW_LABELS[d.getDay()]}</span>
                </th>
              ))}
            </tr>
            <tr>
              {days.map((d, i) => (
                <th key={i} className={`${styles.pcHeader} ${colClass(d)}`}></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {EMPLOYEES.map(emp =>
              ['pranzo', 'cena'].map((service, si) => (
                <tr key={`${emp}-${service}`} className={si === 0 ? styles.rowPranzo : styles.rowCena}>
                  {si === 0 && <td className={styles.colName} rowSpan={2}>{emp}</td>}
                  {days.map((d, di) => {
                    const key = `${emp}::${toDateStr(d)}::${service}`
                    const val = data[key] || ''
                    return (
                      <td key={di} className={`${styles.cellPair} ${colClass(d)}`}>
                        {mode === 'admin' ? (
                          <select className={selectClass(val)} value={val} onChange={e => handleChange(key, e.target.value)}>
                            {adminOptions(service, val)}
                          </select>
                        ) : (
                          renderStaffCell(val, service, d)
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!isStaffView && (
        <div className={styles.legend}>
          <strong>Pranzo:</strong> Q = 11:30 &nbsp; W = 12:00 &nbsp; F = FERIE &nbsp;&nbsp;
          <strong>Cena:</strong> 1-2 = 18:00 &nbsp; 3-4 = 18:30 &nbsp; 5 = 19:00 &nbsp; 6-7 = 19:30 &nbsp; F = FERIE
        </div>
      )}
    </div>
  )
}
