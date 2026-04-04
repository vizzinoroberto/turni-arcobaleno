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

// Colore di sfondo leggero per ogni dipendente (stesso ordine di EMPLOYEES)
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

export default function TurniGrid({ isAdmin, onLogout }) {
  const [data, setData] = useState({})
  const [notes, setNotes] = useState({}) // weekKey -> testo
  const [tab, setTab] = useState('turni') // 'turni' | 'statistiche'
  const [mode, setMode] = useState(isAdmin ? 'admin' : 'staff')
  const [currentMonday, setCurrentMonday] = useState(() => getMonday(new Date()))
  const [syncStatus, setSyncStatus] = useState({ msg: '', cls: '' })
  const [showExport, setShowExport] = useState(false)
  const [showFerie, setShowFerie] = useState(false)
  const saveTimer = useRef(null)
  const noteSaveTimer = useRef(null)

  const weekKey = toDateStr(currentMonday)
  // Coda modifiche pendenti: { key -> val } (val='' significa cancella)
  const pendingRef = useRef({})

  const loadData = useCallback(async () => {
    setSyncStatus({ msg: 'Caricamento...', cls: '' })
    const [{ data: rows, error }, { data: noteRows, error: noteErr }] = await Promise.all([
      supabase.from('turni').select('chiave, valore'),
      supabase.from('note_settimana').select('settimana, testo')
    ])
    if (error || noteErr) {
      setSyncStatus({ msg: 'Errore caricamento ✗', cls: styles.err })
      return
    }
    const obj = {}
    rows.forEach(r => { obj[r.chiave] = r.valore })
    setData(obj)
    const noteObj = {}
    noteRows.forEach(r => { noteObj[r.settimana] = r.testo })
    setNotes(noteObj)
    setSyncStatus({ msg: 'Sincronizzato ✓', cls: styles.ok })
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Salva tutto prima di cambiare settimana o chiudere la pagina
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (Object.keys(pendingRef.current).length > 0) flushPending()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // Flush quando si cambia settimana con modifiche in sospeso
  function changeWeek(fn) {
    if (Object.keys(pendingRef.current).length > 0) {
      clearTimeout(saveTimer.current)
      flushPending().then(() => setCurrentMonday(fn))
    } else {
      setCurrentMonday(fn)
    }
  }

  // Flush: salva tutte le modifiche pendenti in un unico batch
  async function flushPending() {
    const batch = { ...pendingRef.current }
    if (Object.keys(batch).length === 0) return
    pendingRef.current = {}

    setSyncStatus({ msg: 'Salvataggio...', cls: '' })

    const toUpsert = []
    const toDelete = []
    Object.entries(batch).forEach(([key, val]) => {
      if (val) toUpsert.push({ chiave: key, valore: val })
      else toDelete.push(key)
    })

    const ops = []
    if (toUpsert.length > 0)
      ops.push(supabase.from('turni').upsert(toUpsert, { onConflict: 'chiave' }))
    if (toDelete.length > 0)
      ops.push(supabase.from('turni').delete().in('chiave', toDelete))

    const results = await Promise.all(ops)
    const hasError = results.some(r => r.error)
    if (hasError) {
      setSyncStatus({ msg: 'Errore salvataggio ✗', cls: styles.err })
      // Rimette in coda le modifiche fallite per riprovare
      Object.entries(batch).forEach(([k, v]) => { pendingRef.current[k] = v })
      return
    }
    setSyncStatus({ msg: 'Salvato ✓', cls: styles.ok })
  }

  function handleChange(key, val) {
    // Aggiorna UI immediatamente
    setData(prev => {
      const next = { ...prev }
      if (val) next[key] = val
      else delete next[key]
      return next
    })
    // Accumula in coda — sovrascrive eventuali valori precedenti per la stessa cella
    pendingRef.current[key] = val
    setSyncStatus({ msg: 'Modifiche in attesa...', cls: '' })
    // Debounce: aspetta 1.5s di inattività poi salva tutto insieme
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
    // Aggiorna stato locale immediatamente
    setData(prev => {
      const next = { ...prev }
      records.forEach(({ key, val }) => { next[key] = val })
      return next
    })
    // Salva su Supabase in batch
    const rows = records.map(({ key, val }) => ({ chiave: key, valore: val }))
    const { error } = await supabase.from('turni').upsert(rows, { onConflict: 'chiave' })
    if (error) { setSyncStatus({ msg: 'Errore salvataggio ✗', cls: styles.err }); return }
    setSyncStatus({ msg: 'Ferie salvate ✓', cls: styles.ok })
  }

  const days = getWeekDays(currentMonday)

  function colClass(d) {
    if (isSunday(d)) return styles.sundayCol
    if (isWeekend(d)) return styles.weekendCol
    return ''
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
    const isPranzo = service === 'pranzo'
    const showNum = !isPranzo && showShiftNum(d)
    return (
      <div className={styles.cellDisplay}>
        <span className={styles.timeStr}>{disp.time}</span>
        {showNum && <span className={styles.shiftNum}>{disp.num}</span>}
      </div>
    )
  }

  const currentNote = notes[weekKey] || ''
  const isStaffView = mode === 'staff'

  return (
    <div className={styles.app}>
      {/* TOP BAR */}
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

      {/* NOTA STAFF */}
      {!isAdmin && tab === 'turni' && (
        <div className={styles.staffNote}>
          Visualizzazione in modalità <strong>sola lettura</strong>.
          <button className={styles.refreshBtn} onClick={loadData}>↻ Aggiorna</button>
        </div>
      )}

      {/* TAB STATISTICHE */}
      {tab === 'statistiche' && isAdmin && (
        <Statistiche data={data} />
      )}

      {/* TAB TURNI */}
      {tab === 'turni' && (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={`${styles.colName} ${styles.hdr}`} rowSpan={2}>Dipendente</th>
                  {days.map((d,i) => (
                    <th key={i} className={`${styles.dayHeader} ${colClass(d)}`}>
                      <span className={styles.dateVertical}>{formatDateVertical(d)}</span>
                      <span className={`${styles.dow} ${isWeekend(d)?styles.weekend:''}`}>{DOW_LABELS[d.getDay()]}</span>
                    </th>
                  ))}
                </tr>
                <tr>
                  {days.map((d,i) => <th key={i} className={`${styles.pcHeader} ${colClass(d)}`}></th>)}
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
                        const cc = colClass(d)
                        const cellBg = cc ? undefined : EMP_COLORS[ei].bg + '88'
                        return (
                          <td key={di} className={`${styles.cellPair} ${cc}`} style={{ backgroundColor: cellBg }}>
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

          {/* NOTE SETTIMANALI */}
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

          {/* NOTA STAFF: mostra le note in sola lettura */}
          {isStaffView && currentNote && (
            <div className={styles.noteDisplay}>
              <span className={styles.noteDisplayLabel}>📝 Note della settimana</span>
              <p className={styles.noteDisplayText}>{currentNote}</p>
            </div>
          )}

          {/* LEGENDA solo admin */}
          {!isStaffView && (
            <div className={styles.legend}>
              <strong>Pranzo:</strong> Q = 11:30 &nbsp; W = 12:00 &nbsp; F = FERIE &nbsp;&nbsp;
              <strong>Cena:</strong> 1-2 = 18:00 &nbsp; 3-4 = 18:30 &nbsp; 5 = 19:00 &nbsp; 6-7 = 19:30 &nbsp; F = FERIE
            </div>
          )}

          {/* EXPORT + FERIE */}
          <div className={styles.exportBar}>
            {isAdmin && mode === 'admin' && (
              <button className={styles.ferieBtn} onClick={() => setShowFerie(true)}>🏖 Imposta FERIE</button>
            )}
            <button className={styles.exportBtn} onClick={() => setShowExport(true)}>⬇ Scarica turni (.xls)</button>
          </div>
        </>
      )}

      {showExport && (
        <ExportModal data={data} currentMonday={currentMonday} onClose={() => setShowExport(false)} />
      )}
      {showFerie && (
        <FerieModal currentMonday={currentMonday} onClose={() => setShowFerie(false)} onApply={applyFerie} />
      )}
    </div>
  )
}
