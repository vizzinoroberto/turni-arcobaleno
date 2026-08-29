import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabase'
import {
  EMPLOYEES, EMPLOYEE_PERIODS, DOW_LABELS, getMonday, addDays, toDateStr,
  formatDateVertical, isWeekend, isSunday, getWeekDays, shiftToDisplay
} from './utils'
import Statistiche from './Statistiche.jsx'
import ExportModal from './ExportModal.jsx'
import FerieModal from './FerieModal.jsx'
import RichiestaCambioModal from './RichiestaCambioModal.jsx'
import RichiestaAssenzaModal from './RichiestaAssenzaModal.jsx'
import RichiesteAdmin from './RichiesteAdmin.jsx'
import FigureTab from './FigureTab.jsx'
import GeneraTurniModal from './GeneraTurniModal.jsx'
import styles from './TurniGrid.module.css'
import { FESTIVI } from './utils'

const EMP_COLORS = [
  { bg: '#DBEAFE', border: '#93C5FD' },
  { bg: '#D1FAE5', border: '#6EE7B7' },
  { bg: '#FEF9C3', border: '#FDE047' },
  { bg: '#FCE7F3', border: '#F9A8D4' },
  { bg: '#E0E7FF', border: '#A5B4FC' },
  { bg: '#FFEDD5', border: '#FDB888' },
  { bg: '#F3E8FF', border: '#C4B5FD' },
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

const DOW_FULL = ['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato']

function fmtHintDate(str) {
  const [y, m, d] = str.split('-').map(Number)
  const date = new Date(y, m - 1, d, 12)
  return `${DOW_FULL[date.getDay()]} ${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${String(y).slice(2)}`
}

function darken(hex, amount) {
  const r = Math.max(0, parseInt(hex.slice(1,3),16) - amount)
  const g = Math.max(0, parseInt(hex.slice(3,5),16) - amount)
  const b = Math.max(0, parseInt(hex.slice(5,7),16) - amount)
  return `rgb(${r},${g},${b})`
}

function cellBg(ei, d) {
  const base = EMP_COLORS[ei].bg
  if (isSunday(d)) return darken(base, 20)
  if (isWeekend(d)) return darken(base, 10)
  return base
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
  const [showCambio, setShowCambio] = useState(false)
  const [showAssenza, setShowAssenza] = useState(false)
  const [showGenera, setShowGenera] = useState(false)
  const [cutoffConfig, setCutoffConfig] = useState({ data: '', messaggio: '' })
  const [richiestePending, setRichiestePending] = useState(0)
  const [assenze, setAssenze] = useState([])
  const [openHint, setOpenHint] = useState(null)
  const [figureAssentiWeek, setFigureAssentiWeek] = useState({}) // { figura: [dateStr, ...] }
  const [openFigureHint, setOpenFigureHint] = useState(null) // nome figura col popover aperto
  const saveTimer = useRef(null)
  const noteSaveTimer = useRef(null)
  const pendingRef = useRef({})
  const hintRef = useRef(null)
  const figureHintRef = useRef(null)

  const weekKey = toDateStr(currentMonday)
  const days = getWeekDays(currentMonday)

  // Funzione separata per caricare solo il conteggio richieste (anche al cambio tab)
  const loadRichiestePending = useCallback(async () => {
    if (!isAdmin) return
    const [{ count: countCambio }, { count: countAssenza }] = await Promise.all([
      supabase.from('richieste_cambio').select('id', { count: 'exact', head: true }).eq('stato', 'in_sospeso'),
      supabase.from('richieste_assenza').select('id', { count: 'exact', head: true }).eq('stato', 'in_sospeso'),
    ])
    setRichiestePending((countCambio || 0) + (countAssenza || 0))
  }, [isAdmin])

  // Carica le richieste di assenza in sospeso/approvate, per mostrare un hint
  // di fianco al nome del dipendente nelle settimane in cui ha chiesto un permesso.
  const loadAssenze = useCallback(async () => {
    if (!isAdmin) return
    const { data } = await supabase
      .from('richieste_assenza')
      .select('id, nome_richiedente, data_inizio, data_fine, stato, note')
      .in('stato', ['in_sospeso', 'approvata'])
      .order('data_inizio', { ascending: true })
      .limit(300)
    setAssenze(data || [])
  }, [isAdmin])

  // Carica le figure (extra rispetto ai dipendenti) assenti nella settimana
  // visualizzata, con l'elenco esatto dei giorni, per mostrare un hint cliccabile
  // (uno per figura mancante) a chi scrive i turni a mano.
  const loadFigureAssenti = useCallback(async () => {
    if (!isAdmin) return
    const weekStart = toDateStr(currentMonday)
    const weekEnd = toDateStr(addDays(currentMonday, 6))
    const { data } = await supabase
      .from('figure_assenze')
      .select('figura, data')
      .gte('data', weekStart)
      .lte('data', weekEnd)
      .order('data', { ascending: true })
    const obj = {}
    ;(data || []).forEach(({ figura, data: ds }) => {
      if (!obj[figura]) obj[figura] = []
      obj[figura].push(ds)
    })
    setFigureAssentiWeek(obj)
  }, [isAdmin, currentMonday])

  useEffect(() => { loadFigureAssenti() }, [loadFigureAssenti])

  const loadData = useCallback(async () => {
    setSyncStatus({ msg: 'Caricamento...', cls: '' })
    const ops = [
      supabase.from('turni').select('chiave, valore'),
      supabase.from('note_settimana').select('settimana, testo')
    ]
    const results = await Promise.all(ops)
    if (results[0].error || results[1].error) { setSyncStatus({ msg: 'Errore caricamento ✗', cls: styles.err }); return }
    const obj = {}
    const cfg = { data: '', messaggio: '' }
    results[0].data.forEach(r => {
      if (r.chiave === '__config__::data') cfg.data = r.valore
      else if (r.chiave === '__config__::messaggio') cfg.messaggio = r.valore
      else obj[r.chiave] = r.valore
    })
    setData(obj)
    setCutoffConfig(cfg)
    const noteObj = {}
    results[1].data.forEach(r => { noteObj[r.settimana] = r.testo })
    setNotes(noteObj)
    setSyncStatus({ msg: 'Sincronizzato ✓', cls: styles.ok })
    loadRichiestePending()
    loadAssenze()
  }, [loadRichiestePending, loadAssenze])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    const fn = () => { if (Object.keys(pendingRef.current).length > 0) flushPending() }
    window.addEventListener('beforeunload', fn)
    return () => window.removeEventListener('beforeunload', fn)
  }, [])

  useEffect(() => {
    if (!openHint) return
    const fn = (e) => { if (hintRef.current && !hintRef.current.contains(e.target)) setOpenHint(null) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [openHint])

  useEffect(() => {
    if (!openFigureHint) return
    const fn = (e) => { if (figureHintRef.current && !figureHintRef.current.contains(e.target)) setOpenFigureHint(null) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [openFigureHint])

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

  async function saveCutoffConfig() {
    const ops = []
    if (cutoffConfig.data) {
      ops.push(supabase.from('turni').upsert({ chiave: '__config__::data', valore: cutoffConfig.data }, { onConflict: 'chiave' }))
    } else {
      ops.push(supabase.from('turni').delete().eq('chiave', '__config__::data'))
    }
    if (cutoffConfig.messaggio) {
      ops.push(supabase.from('turni').upsert({ chiave: '__config__::messaggio', valore: cutoffConfig.messaggio }, { onConflict: 'chiave' }))
    } else {
      ops.push(supabase.from('turni').delete().eq('chiave', '__config__::messaggio'))
    }
    await Promise.all(ops)
    setSyncStatus({ msg: 'Impostazioni salvate ✓', cls: styles.ok })
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

  // Quando viene approvata/rifiutata/eliminata una richiesta, ricarico anche i dati turni
  // perché un'approvazione modifica il database.
  // Deve restare stabile (useCallback + ref, non lo state `richiestePending` nelle deps):
  // altrimenti la sua identità cambia a ogni render, il che rompe la memoizzazione di
  // loadRichieste in RichiesteAdmin e fa ripartire il fetch a Supabase in loop infinito.
  const richiestePendingRef = useRef(richiestePending)
  richiestePendingRef.current = richiestePending
  const handlePendingCountChange = useCallback((newCount) => {
    const changed = newCount !== richiestePendingRef.current
    setRichiestePending(newCount)
    // Ricarica i turni se siamo in admin (potrebbero essere stati modificati da un'approvazione)
    if (changed) {
      supabase.from('turni').select('chiave, valore').then(({ data: rows }) => {
        if (rows) {
          const obj = {}
          rows.forEach(r => { if (!r.chiave.startsWith('__config__::')) obj[r.chiave] = r.valore })
          setData(obj)
        }
      })
    }
    // Ricarico sempre le assenze (non solo quando cambia il conteggio "in sospeso"):
    // eliminare o cambiare stato a una richiesta già approvata/rifiutata non tocca il
    // conteggio ma deve comunque aggiornare/rimuovere l'hint nel calendario.
    loadAssenze()
  }, [loadAssenze])

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

  const currentNote = notes[weekKey] || ''
  const isStaffView = mode === 'staff'

  function fmtConfigDate(str) {
    if (!str) return ''
    const [y, m, d] = str.split('-')
    const months = ['gennaio','febbraio','marzo','aprile','maggio','giugno',
                    'luglio','agosto','settembre','ottobre','novembre','dicembre']
    return `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`
  }

  const isWeekHidden = !isAdmin && !!cutoffConfig.data && toDateStr(currentMonday) > cutoffConfig.data

  // Filtra dipendenti attivi per la settimana visualizzata (usa il lunedì come riferimento)
  const visibleEmployees = EMPLOYEES.filter(emp => {
    const period = EMPLOYEE_PERIODS[emp]
    if (!period) return true
    if (period.to && toDateStr(currentMonday) > period.to) return false
    if (period.from && toDateStr(addDays(currentMonday, 6)) < period.from) return false
    return true
  })

  // Richieste di assenza (in sospeso o approvate) che si sovrappongono alla settimana visualizzata
  const weekStartStr = toDateStr(currentMonday)
  const weekEndStr = toDateStr(addDays(currentMonday, 6))
  function assenzeForEmp(emp) {
    return assenze.filter(a =>
      a.nome_richiedente === emp && a.data_inizio <= weekEndStr && a.data_fine >= weekStartStr
    )
  }

  return (
    <div className={styles.app}>
      <div className={styles.topBar}>
        <span className={styles.titleText}>🍕 Turni Pizzeria Arcobaleno</span>

        {isAdmin && (
          <div className={styles.mainTabs}>
            <button className={`${styles.mainTab} ${tab==='turni'?styles.mainTabActive:''}`} onClick={() => setTab('turni')}>Turni</button>
            <button className={`${styles.mainTab} ${tab==='statistiche'?styles.mainTabActive:''}`} onClick={() => setTab('statistiche')}>Statistiche</button>
            <button className={`${styles.mainTab} ${tab==='richieste'?styles.mainTabActive:''}`} onClick={() => setTab('richieste')}>
              Richieste {richiestePending > 0 && <span className={styles.tabBadge}>{richiestePending}</span>}
            </button>
            <button className={`${styles.mainTab} ${tab==='figure'?styles.mainTabActive:''}`} onClick={() => setTab('figure')}>Figure</button>
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

      {tab === 'richieste' && isAdmin && <RichiesteAdmin onPendingCountChange={handlePendingCountChange} />}

      {tab === 'figure' && isAdmin && <FigureTab />}

      {tab === 'turni' && (
        <>
          {isAdmin && mode === 'admin' && Object.keys(figureAssentiWeek).length > 0 && (
            <div className={styles.figureHintRow}>
              <span className={styles.figureHintLabel}>Figure assenti questa settimana:</span>
              {Object.entries(figureAssentiWeek).map(([figura, giorni]) => {
                const isOpen = openFigureHint === figura
                return (
                  <span key={figura} className={styles.hintWrap} ref={isOpen ? figureHintRef : null}>
                    <button
                      type="button"
                      className={styles.figureHintBadge}
                      onClick={() => setOpenFigureHint(isOpen ? null : figura)}
                    >
                      👤 {figura}
                    </button>
                    {isOpen && (
                      <div className={styles.hintPopover}>
                        <div className={styles.hintPopoverTitle}>{figura} assente:</div>
                        {giorni.map(ds => (
                          <div key={ds} className={styles.hintPopoverItem}>{fmtHintDate(ds)}</div>
                        ))}
                      </div>
                    )}
                  </span>
                )
              })}
            </div>
          )}

          {isWeekHidden && (
            <div className={styles.wipCard}>
              <div className={styles.wipIcon}>📅</div>
              <p className={styles.wipTitle}>Calendario in preparazione</p>
              <p className={styles.wipText}>
                Il calendario per questa settimana è in fase di preparazione.
                {cutoffConfig.messaggio && (
                  <><br />Sarà disponibile entro il <strong>{fmtConfigDate(cutoffConfig.messaggio)}</strong>.</>
                )}
              </p>
              <p className={styles.wipText}>Per comunicare eventuali assenze usa il form apposito:</p>
              <button className={styles.assenzaBtn} onClick={() => setShowAssenza(true)}>
                🏠 Richiedi periodo assenza
              </button>
            </div>
          )}

          {!isWeekHidden && (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={`${styles.colName} ${styles.hdr}`} rowSpan={2}>Dipendente</th>
                    {days.map((d,i) => (
                      <th key={i} className={styles.dayHeader}>
                        <span className={styles.dateVertical}>{formatDateVertical(d)}</span>
                        <span className={`${styles.dow} ${isWeekend(d)?styles.weekend:''}`}>{DOW_LABELS[d.getDay()]}</span>
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {days.map((d,i) => <th key={i} className={styles.pcHeader}></th>)}
                  </tr>
                </thead>
                <tbody>
                  {visibleEmployees.map((emp, ei) =>
                    ['pranzo','cena'].map((service, si) => {
                      const empAssenze = si === 0 && isAdmin ? assenzeForEmp(emp) : []
                      return (
                      <tr key={`${emp}-${service}`} className={si===0?styles.rowPranzo:styles.rowCena}>
                        {si===0 && (
                          <td
                            className={styles.colName}
                            rowSpan={2}
                            style={{ backgroundColor: EMP_COLORS[ei].bg, borderLeft: `4px solid ${EMP_COLORS[ei].border}` }}
                          >
                            <div className={styles.nameWrap}>
                              <span>{emp}</span>
                              {empAssenze.length > 0 && (
                                <span className={styles.hintWrap} ref={openHint === emp ? hintRef : null}>
                                  <button
                                    type="button"
                                    className={`${styles.hintBadge} ${empAssenze.some(a => a.stato === 'approvata') ? styles.hintApprovata : styles.hintSospeso}`}
                                    title="Richiesta assenza in questa settimana"
                                    onClick={() => setOpenHint(openHint === emp ? null : emp)}
                                  >🏖</button>
                                  {openHint === emp && (
                                    <div className={styles.hintPopover}>
                                      {empAssenze.map(a => (
                                        <div key={a.id} className={styles.hintPopoverItem}>
                                          <div className={styles.hintPopoverPeriod}>
                                            {a.data_inizio === a.data_fine
                                              ? fmtHintDate(a.data_inizio)
                                              : <>da {fmtHintDate(a.data_inizio)}<br/>a {fmtHintDate(a.data_fine)}</>}
                                          </div>
                                          <div className={a.stato === 'approvata' ? styles.hintPopoverApprovata : styles.hintPopoverSospeso}>
                                            {a.stato === 'approvata' ? '✓ Approvata' : '🕓 In sospeso'}
                                          </div>
                                          {a.note && <div className={styles.hintPopoverNote}>{a.note}</div>}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </span>
                              )}
                            </div>
                          </td>
                        )}
                        {days.map((d, di) => {
                          const key = `${emp}::${toDateStr(d)}::${service}`
                          const val = data[key] || ''
                          return (
                            <td
                              key={di}
                              className={styles.cellPair}
                              style={{ backgroundColor: cellBg(ei, d) }}
                            >
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
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {isAdmin && mode === 'admin' && (
            <div className={styles.exportBar} style={{marginTop: 0, marginBottom: 0}}>
              <button className={styles.generaBtn} onClick={() => setShowGenera(true)}>⚡ Genera turni</button>
            </div>
          )}

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

          {isStaffView && currentNote && !isWeekHidden && (
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
            {!isAdmin && !isWeekHidden && (
              <>
                <button className={styles.cambioBtn} onClick={() => setShowCambio(true)}>🔄 Richiedi cambio turno</button>
                <button className={styles.assenzaBtn} onClick={() => setShowAssenza(true)}>🏠 Richiedi periodo assenza</button>
              </>
            )}
            {!isWeekHidden && (
              <button className={styles.exportBtn} onClick={() => setShowExport(true)}>⬇ Scarica turni</button>
            )}
          </div>

          {isAdmin && mode === 'admin' && (
            <div className={styles.cutoffBox}>
              <span className={styles.cutoffTitle}>🔒 Visibilità calendario dipendenti</span>
              <div className={styles.cutoffRow}>
                <span className={styles.cutoffLabel}>Turni visibili fino al:</span>
                <input
                  type="date"
                  className={styles.cutoffDate}
                  value={cutoffConfig.data}
                  onChange={e => setCutoffConfig(prev => ({ ...prev, data: e.target.value }))}
                />
                {cutoffConfig.data && (
                  <button className={styles.cutoffClearBtn} onClick={() => setCutoffConfig(prev => ({ ...prev, data: '' }))}>
                    ✕ Nessun limite
                  </button>
                )}
              </div>
              <div className={styles.cutoffRow}>
                <span className={styles.cutoffLabel}>«Disponibile entro il» (nel messaggio ai dipendenti):</span>
                <input
                  type="date"
                  className={styles.cutoffDate}
                  value={cutoffConfig.messaggio}
                  onChange={e => setCutoffConfig(prev => ({ ...prev, messaggio: e.target.value }))}
                />
                {cutoffConfig.messaggio && (
                  <button className={styles.cutoffClearBtn} onClick={() => setCutoffConfig(prev => ({ ...prev, messaggio: '' }))}>✕</button>
                )}
              </div>
              <button className={styles.cutoffSaveBtn} onClick={saveCutoffConfig}>Salva impostazioni visibilità</button>
            </div>
          )}
        </>
      )}

      {showExport && <ExportModal data={data} currentMonday={currentMonday} onClose={() => setShowExport(false)} />}
      {showFerie && <FerieModal currentMonday={currentMonday} onClose={() => setShowFerie(false)} onApply={applyFerie} />}
      {showCambio && <RichiestaCambioModal data={data} onClose={() => setShowCambio(false)} />}
      {showAssenza && <RichiestaAssenzaModal onClose={() => setShowAssenza(false)} />}
      {showGenera && (
        <GeneraTurniModal
          onClose={() => setShowGenera(false)}
          onApply={() => { setShowGenera(false); loadData() }}
        />
      )}
    </div>
  )
}
