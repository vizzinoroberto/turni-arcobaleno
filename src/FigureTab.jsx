import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { getMonday, addDays, toDateStr } from './utils'
import styles from './FigureTab.module.css'

const FIGURE = ['Roberto', 'Marco', 'Mauro', 'Enrico', 'Ivana', 'Daiana']

function formatWeek(monday) {
  const sun = addDays(monday, 6)
  const fmt = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
  return `${fmt(monday)} – ${fmt(sun)}`
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

  const weeks = getWeeksAround(centerMonday, 10)

  const loadAssenze = useCallback(async () => {
    const from = toDateStr(weeks[0])
    const to = toDateStr(weeks[weeks.length - 1])
    const { data, error } = await supabase
      .from('figure_assenze')
      .select('settimana, figura')
      .gte('settimana', from)
      .lte('settimana', to)
    if (error) { setStatus('Errore caricamento'); return }
    const obj = {}
    data.forEach(({ settimana, figura }) => {
      if (!obj[settimana]) obj[settimana] = new Set()
      obj[settimana].add(figura)
    })
    setAssenze(obj)
  }, [centerMonday])

  useEffect(() => { loadAssenze() }, [loadAssenze])

  async function toggle(mondayStr, figura) {
    setSaving(true)
    const current = assenze[mondayStr] || new Set()
    const isAssente = current.has(figura)

    if (isAssente) {
      await supabase.from('figure_assenze')
        .delete()
        .eq('settimana', mondayStr)
        .eq('figura', figura)
      setAssenze(prev => {
        const next = { ...prev }
        const s = new Set(next[mondayStr] || [])
        s.delete(figura)
        if (s.size === 0) delete next[mondayStr]
        else next[mondayStr] = s
        return next
      })
    } else {
      await supabase.from('figure_assenze')
        .insert({ settimana: mondayStr, figura })
      setAssenze(prev => {
        const next = { ...prev }
        next[mondayStr] = new Set([...(next[mondayStr] || []), figura])
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
          <span className={styles.hint}>Spunta chi è <strong>assente</strong> quella settimana → tutti i 7 dipendenti lavorano il weekend</span>
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
              const assentiSet = assenze[mondayStr] || new Set()
              const assentiCount = assentiSet.size
              const isCurrentWeek = toDateStr(getMonday(new Date())) === mondayStr

              return (
                <tr key={mondayStr} className={isCurrentWeek ? styles.currentWeek : ''}>
                  <td className={styles.weekCell}>
                    {isCurrentWeek && <span className={styles.todayDot} />}
                    {formatWeek(monday)}
                  </td>
                  {FIGURE.map(figura => (
                    <td key={figura} className={styles.checkCell}>
                      <input
                        type="checkbox"
                        className={styles.check}
                        checked={assentiSet.has(figura)}
                        onChange={() => toggle(mondayStr, figura)}
                      />
                    </td>
                  ))}
                  <td className={styles.noteCell}>
                    {assentiCount > 0
                      ? <span className={styles.badgeAssente}>Turno 7 attivo — nessuno a casa</span>
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
