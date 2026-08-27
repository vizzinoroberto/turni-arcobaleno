import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabase'
import { getMonday, addDays, toDateStr } from './utils'
import styles from './FigureTab.module.css'

const FIGURE = ['Roberto', 'Marco', 'Mauro', 'Enrico', 'Ivana', 'Daiana']
const DOW_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

function formatWeek(monday) {
  const sun = addDays(monday, 6)
  const fmt = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
  return `${fmt(monday)} – ${fmt(sun)}`
}

function formatDay(d) {
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
}

function getWeeksAround(centerMonday, count = 8) {
  const weeks = []
  const start = addDays(centerMonday, -((Math.floor(count / 2)) * 7))
  for (let i = 0; i < count; i++) {
    weeks.push(addDays(start, i * 7))
  }
  return weeks
}

export default function FigureTab() {
  const [assenze, setAssenze] = useState({}) // { 'YYYY-MM-DD': Set<figura> }
  const [centerMonday, setCenterMonday] = useState(() => getMonday(new Date()))
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [openCell, setOpenCell] = useState(null) // { weekStr, figura } | null
  const popoverRef = useRef(null)

  const weeks = getWeeksAround(centerMonday, 10)

  const loadAssenze = useCallback(async () => {
    const from = toDateStr(weeks[0])
    const to = toDateStr(addDays(weeks[weeks.length - 1], 6))
    const { data, error } = await supabase
      .from('figure_assenze')
      .select('data, figura')
      .gte('data', from)
      .lte('data', to)
    if (error) { setStatus('Errore caricamento'); return }
    const obj = {}
    data.forEach(({ data: giorno, figura }) => {
      if (!obj[giorno]) obj[giorno] = new Set()
      obj[giorno].add(figura)
    })
    setAssenze(obj)
  }, [centerMonday])

  useEffect(() => { loadAssenze() }, [loadAssenze])

  useEffect(() => {
    if (!openCell) return
    const fn = (e) => { if (popoverRef.current && !popoverRef.current.contains(e.target)) setOpenCell(null) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [openCell])

  function isAssente(dateStr, figura) {
    return !!assenze[dateStr]?.has(figura)
  }

  function countAssenti(monday, figura) {
    let n = 0
    for (let i = 0; i < 7; i++) if (isAssente(toDateStr(addDays(monday, i)), figura)) n++
    return n
  }

  function figureAssentiWeekend(monday) {
    const satStr = toDateStr(addDays(monday, 5))
    const sunStr = toDateStr(addDays(monday, 6))
    return FIGURE.filter(f => isAssente(satStr, f) || isAssente(sunStr, f))
  }

  async function toggleDay(dateStr, figura) {
    setSaving(true)
    const assente = isAssente(dateStr, figura)
    if (assente) {
      await supabase.from('figure_assenze').delete().eq('data', dateStr).eq('figura', figura)
      setAssenze(prev => {
        const next = { ...prev }
        const s = new Set(next[dateStr] || [])
        s.delete(figura)
        if (s.size === 0) delete next[dateStr]
        else next[dateStr] = s
        return next
      })
    } else {
      await supabase.from('figure_assenze').insert({ data: dateStr, figura })
      setAssenze(prev => {
        const next = { ...prev }
        next[dateStr] = new Set([...(next[dateStr] || []), figura])
        return next
      })
    }
    setSaving(false)
    setStatus('Salvato ✓')
    setTimeout(() => setStatus(''), 1500)
  }

  async function toggleWeek(monday, figura, markAbsent) {
    setSaving(true)
    const giorni = Array.from({ length: 7 }, (_, i) => toDateStr(addDays(monday, i)))
    if (markAbsent) {
      await supabase.from('figure_assenze')
        .upsert(giorni.map(data => ({ data, figura })), { onConflict: 'data,figura' })
      setAssenze(prev => {
        const next = { ...prev }
        giorni.forEach(d => { next[d] = new Set([...(next[d] || []), figura]) })
        return next
      })
    } else {
      await supabase.from('figure_assenze')
        .delete()
        .eq('figura', figura)
        .gte('data', giorni[0])
        .lte('data', giorni[6])
      setAssenze(prev => {
        const next = { ...prev }
        giorni.forEach(d => {
          if (!next[d]) return
          const s = new Set(next[d])
          s.delete(figura)
          if (s.size === 0) delete next[d]
          else next[d] = s
        })
        return next
      })
    }
    setSaving(false)
    setStatus('Salvato ✓')
    setTimeout(() => setStatus(''), 1500)
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <span className={styles.title}>Figure nascoste — presenze settimanali</span>
          <span className={styles.hint}>Spunta i giorni in cui è <strong>assente</strong> → se manca sabato o domenica, quel weekend lavorano tutti i 7 dipendenti</span>
        </div>
        <div className={styles.navRow}>
          <button className={styles.navBtn} onClick={() => setCenterMonday(m => addDays(m, -35))}>← 5 sett.</button>
          <button className={styles.navBtn} onClick={() => setCenterMonday(getMonday(new Date()))}>Oggi</button>
          <button className={styles.navBtn} onClick={() => setCenterMonday(m => addDays(m, 35))}>5 sett. →</button>
          {status && <span className={styles.status}>{status}</span>}
          {saving && <span className={styles.status}>Salvataggio...</span>}
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.weekCol}>Settimana</th>
              {FIGURE.map(f => <th key={f} className={styles.figCol}>{f}</th>)}
              <th className={styles.noteCol}>Effetto</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map(monday => {
              const mondayStr = toDateStr(monday)
              const isCurrentWeek = toDateStr(getMonday(new Date())) === mondayStr
              const assentiWeekend = figureAssentiWeekend(monday)

              return (
                <tr key={mondayStr} className={isCurrentWeek ? styles.currentWeek : ''}>
                  <td className={styles.weekCell}>
                    {isCurrentWeek && <span className={styles.todayDot} />}
                    {formatWeek(monday)}
                  </td>
                  {FIGURE.map(figura => {
                    const n = countAssenti(monday, figura)
                    const isOpen = openCell && openCell.weekStr === mondayStr && openCell.figura === figura
                    return (
                      <td key={figura} className={styles.checkCell}>
                        <span className={styles.cellWrap} ref={isOpen ? popoverRef : null}>
                          <button
                            type="button"
                            className={`${styles.dayBadge} ${n === 0 ? styles.dayBadgeNone : n === 7 ? styles.dayBadgeFull : styles.dayBadgePart}`}
                            onClick={() => setOpenCell(isOpen ? null : { weekStr: mondayStr, figura })}
                          >
                            {n === 0 ? '—' : n === 7 ? '✓ tutta' : `${n}g`}
                          </button>
                          {isOpen && (
                            <div className={styles.dayPopover}>
                              <div className={styles.dayPopoverTitle}>{figura} — {formatWeek(monday)}</div>
                              <div className={styles.dayPopoverList}>
                                {Array.from({ length: 7 }, (_, i) => {
                                  const d = addDays(monday, i)
                                  const ds = toDateStr(d)
                                  return (
                                    <label key={ds} className={styles.dayPopoverItem}>
                                      <input
                                        type="checkbox"
                                        checked={isAssente(ds, figura)}
                                        onChange={() => toggleDay(ds, figura)}
                                      />
                                      {DOW_SHORT[i]} {formatDay(d)}
                                    </label>
                                  )
                                })}
                              </div>
                              <div className={styles.dayPopoverBtns}>
                                <button className={styles.dayPopoverBtn} onClick={() => toggleWeek(monday, figura, false)}>Nessun giorno</button>
                                <button className={styles.dayPopoverBtn} onClick={() => toggleWeek(monday, figura, true)}>Tutta la settimana</button>
                              </div>
                            </div>
                          )}
                        </span>
                      </td>
                    )
                  })}
                  <td className={styles.noteCell}>
                    {assentiWeekend.length > 0
                      ? <span className={styles.badgeAssente}>Turno 7 attivo — manca {assentiWeekend.join(', ')}</span>
                      : <span className={styles.badgeNormal}>Max turno 6 — 1 dipendente a riposo</span>
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
