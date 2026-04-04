import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabase'
import {
  EMPLOYEES, DOW_LABELS, getMonday, addDays, toDateStr,
  formatDateVertical, isWeekend, isSunday, getWeekDays, shiftToDisplay
} from './utils'
import Statistiche from './Statistiche.jsx'
import ExportModal from './ExportModal.jsx'
import FerieModal from './FerieModal.jsx'
import styles from './TurniGrid.module.css'

const FESTIVI = new Set(['04-25','05-01','06-02','08-15','11-01','12-08','12-24','12-25','12-26','12-31'])

const EMP_COLORS = [
  { bg: '#DBEAFE', border: '#93C5FD' }, // azzurro   - Francesca
  { bg: '#D1FAE5', border: '#6EE7B7' }, // verde     - Benedetta
  { bg: '#FEF9C3', border: '#FDE047' }, // giallo    - Giulia
  { bg: '#FCE7F3', border: '#F9A8D4' }, // rosa      - Aurora
  { bg: '#E0E7FF', border: '#A5B4FC' }, // indaco    - Sara
  { bg: '#FFEDD5', border: '#FDB888' }, // arancio   - Ilaria
  { bg: '#F3E8FF', border: '#C4B5FD' }, // viola     - Nicole
]

function isFestivo(d) {
  const mm = String(d.getMonth()+1).padStart(2,'0')
  const dd = String(d.getDate()).padStart(2,'0')
  return FESTIVI.has(`${mm}-${dd}`)
}

function showShiftNum(d) { return isWeekend(d) || isFestivo(d) }

function formatDateFull(d) {
  const dd = String(d.getDate()).padStart(2,'0')
  const mm = String(d.getMonth()+1).padStart(2,'0')
  const yy = String(d.getFullYear()).slice(2)
  return `${dd}/${mm}/${yy}`
}

// Scurisce leggermente il colore hex per weekend/domenica
function darken(hex, amount) {
  const r = Math.max(0, parseInt(hex.slice(1,3),16) - amount)
  const g = Math.max(0, parseInt(hex.slice(3,5),16) - amount)
  const b = Math.max(0, parseInt(hex.slice(5,7),16) - amount)
  return `rgb(${r},${g},${b})`
}

export default function TurniGrid({ isAdmin, onLogout }) {
  const [data, setData] = useState({})
  const [notes, setNotes] = useState({})
  const [tab, setTab] = useState('turni')
  const [mode, setMode] = useState(isAdmin ? 'admin' : 'staff')
  const [currentMonday, setCurrentMonday] = useState(() => getMonday(new Date()))
  const [syncStatus, setSyncStatus] = useState({ msg: '', cls: '' })
  const [showExport, setShowExport] = useState(false)
  const [showFerie, setShowFerie] = useState(false)
  const saveTimer = useRef(null)
  const noteSaveTimer = useRef(null)
  const pendingRef = useRef({})

  const weekKey = toDateStr(currentMonday)
  const days = getWeekDays(currentMonday)

  const loadData = useCallback(async () => {
    setSyncStatus({ msg: 'Caricamento...', cls: '' })
    const [{ data: rows, error }, { data: noteRows, error: noteErr }] = await Promise.all([
      supabase.from('turni').select('chiave, valore'),
      supabase.from('note_settimana').select('settimana, testo')
    ])
    if (error || noteErr) { setSyncStatus({ msg: 'Errore caricamento ✗', cls: styles.err }); return }
    const obj = {}
    rows.forEach(r => { obj[r.chiave] = r.valore })
    setData(obj)
    const noteObj = {}
    noteRows.forEach(r => { noteObj[r.settimana] = r.testo })
    setNotes(noteObj)
    setSyncStatus({ msg: 'Sincronizzato ✓', cls: styles.ok })
  }, [])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    const fn = () => { if (Object.keys(pendingRef.current).length > 0) flushPending() }
    window.addEventListener('beforeunload', fn)
    return () => window.removeEventListener('beforeunload', fn)
  }, [])

  async function flushPending() {
    const batch = { ...pendingRef.current }
    if (Object.keys(batch).length === 0) return
    pendingRef.current = {}
    setSyncStatus({ msg: 'Salvataggio...', cls: '' })
    const toUpsert = [], toDelete = []
    Object.entries(batch).forEach(([key, val]) => {
      if (val) toUpsert.push({ chiave: key, valore: val })
      else toDelete.push(key)
    })
    const ops = []
    if (toUpsert.length > 0) ops.push(supabase.from('turni').upsert(toUpsert, { onConflict: 'chiave' }))
    if (toDelete.length > 0) ops.push(supabase.from('turni').delete().in('chiave', toDelete))
    const results = await Promise.all(ops)
    if (results.some(r => r.error)) {
      setSyncStatus({ msg: 'Errore salvataggio ✗', cls: styles.err })
      Object.entries(batch).forEach(([k, v]) => { pendingRef.current[k] = v })
      return
    }
    setSyncStatus({ msg: 'Salvato ✓', cls: styles.ok })
  }

  function changeWeek(fn) {
    if (Object.keys(pendingRef.current).length > 0) {
      clearTimeout(saveTimer.current)
      flushPending().then(() => setCurrentMonday(fn))
    } else {
      setCurrentMonday(fn)
    }
  }

  function handleChange(key, val) {
    setData(prev => {
      const next = { ...prev }
      if (val) next[key] = val
      else delete next[key]
      return next
    })
    pendingRef.current[key] = val
    setSyncStatus({ msg: 'Modifiche in attesa...', cls: '' })
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flushPending, 1500)
  }

  async function saveNote(wk, testo) {
    if (testo.trim()) {
      await supabase.from('note_settimana').upsert({ settimana: wk, testo }, { onConflict: 'settimana' })
    } else {
      await supabase.from('note_settimana').delete().eq('settimana', wk)
    }
    setSyncStatus({ msg: 'Salvato ✓', cls: styles.ok })
  }

  function handleNoteChange(val) {
    setNotes(prev => ({ ...prev, [weekKey]: val }))
    clearTimeout(noteSaveTimer.current)
    noteSaveTimer.current = setTimeout(() => saveNote(weekKey, val), 800)
  }

  async function applyFerie(records) {
    setSyncStatus({ msg: 'Salvataggio ferie...', cls: '' })
    setData(prev => {
      const next = { ...prev }
      records.forEach(({ key, val }) => { next[key] = val })
      return next
    })
    const rows = records.map(({ key, val }) => ({ chiave: key, valore: val }))
    const { error } = await supabase.from('turni').upsert(rows, { onConflict: 'chiave' })
    if (error) { setSyncStatus({ msg: 'Errore salvataggio ✗', cls: styles.err }); return }
    setSyncStatus({ msg: 'Ferie salvate ✓', cls: styles.ok })
  }

  function adminOptions(service, val) {
    const opts = service === 'pranzo'
      ? [['','—'],['Q','Q'],['W','W'],['F','F']]
      : [['','—'],['1','1'],['2','2'],['3','3'],['4','4'],['5','5'],['6','6'],['7','7'],['F','F']]
    return opts.map(([v,l]) => <option key={v} value={v}>{l}</option>)
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
    const showNum = service !== 'pranzo' && showShiftNum(d)
    return (
      <div className={styles.cellDisplay}>
        <span className={styles.timeStr}>{disp.time}</span>
        {showNum && <span className={styles.shiftNum}>{disp.num}</span>}
      </div>
    )
  }

  // Calcola colore cella: colore dipendente, leggermente scurito per weekend/domenica
  function cellBg(ei, d) {
    const base = EMP_COLORS[ei].bg
    if (isSunday(d)) return darken(base, 18)
    if (isWeekend(d)) return darken(base, 10)
    return base
  }

  const currentNote = notes[weekKey] || ''
  const isStaffView = mode === 'staff'

  return (
    <div className={styles.app}>
      <div className={styles.topBar}>
        <span className={styles.titleText}>🍕 Turni Pizzeria Arcobaleno</span>

        {isAdmin && (
          <div className={styles.mainTabs}>
            <button className={`${styles.mainTab} ${tab==='turni'?styles.mainTabActive:''}`} onClick={() => setTab('turni')}>Turni</button>
            <button className={`${styles.mainTab} ${tab==='statistiche'?styles.mainTabActive:''}`} onClick={() => setTab('statistiche')}>Statistiche</button>
          </div>
        )}

        {tab === 'turni' && <>
          <button className={styles.navBtn} onClick={() => changeWeek(m => addDays(m,-7))}>←</button>
          <span className={styles.weekLabel}>{formatDateFull(days[0])} – {formatDateFull(days[6])}</span>
          <button className={styles.navBtn} onClick={() => changeWeek(m => addDays(m,7))}>→</button>
        </>}

        {isAdmin && tab === 'turni' && (
          <div className={styles.modeToggle}>
            <button className={`${styles.modeBtn} ${mode==='admin'?styles.active:''}`} onClick={() => setMode('admin')}>Admin</button>
            <button className={`${styles.modeBtn} ${mode==='staff'?styles.active:''}`} onClick={() => setMode('staff')}>Dipendenti</button>
          </div>
        )}

        <span className={`${styles.syncStatus} ${syncStatus.cls}`}>{syncStatus.msg}</span>
        <button className={styles.logoutBtn} onClick={onLogout}>Esci</button>
      </div>

      {!isAdmin && tab === 'turni' && (
        <div className={styles.staffNote}>
          Visualizzazione in modalità <strong>sola lettura</strong>.
          <button className={styles.refreshBtn} onClick={loadData}>↻ Aggiorna</button>
        </div>
      )}

      {tab === 'statistiche' && isAdmin && <Statistiche data={data} />}

      {tab === 'turni' && (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={`${styles.colName} ${styles.hdr}`} rowSpan={2}>Dipendente</th>
                  {days.map((d,i) => (
                    <th key={i} className={`${styles.dayHeader}`} style={{ background: '#f0f0f0' }}>
                      <span className={styles.dateVertical}>{formatDateVertical(d)}</span>
                      <span className={`${styles.dow} ${isWeekend(d)?styles.weekend:''}`}>{DOW_LABELS[d.getDay()]}</span>
                    </th>
                  ))}
                </tr>
                <tr>
                  {days.map((d,i) => <th key={i} className={styles.pcHeader} style={{ background: '#f5f5f5' }}></th>)}
                </tr>
              </thead>
              <tbody>
                {EMPLOYEES.map((emp, ei) =>
                  ['pranzo','cena'].map((service, si) => (
                    <tr key={`${emp}-${service}`} className={si===0?styles.rowPranzo:styles.rowCena}>
                      {si===0 && (
                        <td
                          className={styles.colName}
                          rowSpan={2}
                          style={{ backgroundColor: EMP_COLORS[ei].bg, borderLeft: `4px solid ${EMP_COLORS[ei].border}` }}
                        >{emp}</td>
                      )}
                      {days.map((d, di) => {
                        const key = `${emp}::${toDateStr(d)}::${service}`
                        const val = data[key] || ''
                        return (
                          <td key={di} className={styles.cellPair} style={{ backgroundColor: cellBg(ei, d) }}>
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

          {isAdmin && mode === 'admin' && (
            <div className={styles.noteBox}>
              <label className={styles.noteLabel}>📝 Note settimana {formatDateFull(days[0])} – {formatDateFull(days[6])}</label>
              <textarea
                className={styles.noteInput}
                placeholder="Aggiungi note per questa settimana (visibili ai dipendenti)..."
                value={currentNote}
                onChange={e => handleNoteChange(e.target.value)}
                rows={3}
              />
            </div>
          )}

          {isStaffView && currentNote && (
            <div className={styles.noteDisplay}>
              <span className={styles.noteDisplayLabel}>📝 Note della settimana</span>
              <p className={styles.noteDisplayText}>{currentNote}</p>
            </div>
          )}

          {!isStaffView && (
            <div className={styles.legend}>
              <strong>Pranzo:</strong> Q = 11:30 &nbsp; W = 12:00 &nbsp; F = FERIE &nbsp;&nbsp;
              <strong>Cena:</strong> 1-2 = 18:00 &nbsp; 3-4 = 18:30 &nbsp; 5 = 19:00 &nbsp; 6-7 = 19:30 &nbsp; F = FERIE
            </div>
          )}

          <div className={styles.exportBar}>
            {isAdmin && mode === 'admin' && (
              <button className={styles.ferieBtn} onClick={() => setShowFerie(true)}>🏖 Imposta FERIE</button>
            )}
            <button className={styles.exportBtn} onClick={() => setShowExport(true)}>⬇ Scarica turni</button>
          </div>
        </>
      )}

      {showExport && <ExportModal data={data} currentMonday={currentMonday} onClose={() => setShowExport(false)} />}
      {showFerie && <FerieModal currentMonday={currentMonday} onClose={() => setShowFerie(false)} onApply={applyFerie} />}
    </div>
  )
}
