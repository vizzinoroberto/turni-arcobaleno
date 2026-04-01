import { useState, useMemo } from 'react'
import { EMPLOYEES, PRANZO_MAP, CENA_MAP } from './utils'
import styles from './Statistiche.module.css'

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
               'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

function parseKey(key) {
  const parts = key.split('::')
  if (parts.length !== 3) return null
  return { emp: parts[0], date: parts[1], service: parts[2] }
}

function isValidShift(val, service) {
  if (!val || val === 'F') return false
  if (service === 'pranzo') return val in PRANZO_MAP
  return val in CENA_MAP
}

function dateInRange(dateStr, from, to) {
  return dateStr >= from && dateStr <= to
}

function pad(n) { return String(n).padStart(2, '0') }

export default function Statistiche({ data }) {
  const now = new Date()
  const [mode, setMode] = useState('settimana') // settimana | mese | anno | custom
  const [selWeek, setSelWeek] = useState(() => {
    const d = new Date()
    const day = d.getDay()
    const diff = day === 0 ? -6 : 1 - day
    d.setDate(d.getDate() + diff)
    return d.toISOString().slice(0, 10)
  })
  const [selMonth, setSelMonth] = useState(now.getMonth())
  const [selYear, setSelYear] = useState(now.getFullYear())
  const [selYearOnly, setSelYearOnly] = useState(now.getFullYear())
  const [customFrom, setCustomFrom] = useState(now.toISOString().slice(0, 10))
  const [customTo, setCustomTo] = useState(now.toISOString().slice(0, 10))

  const { from, to } = useMemo(() => {
    if (mode === 'settimana') {
      const mon = new Date(selWeek)
      const sun = new Date(selWeek)
      sun.setDate(sun.getDate() + 6)
      return { from: mon.toISOString().slice(0,10), to: sun.toISOString().slice(0,10) }
    }
    if (mode === 'mese') {
      const f = `${selYear}-${pad(selMonth+1)}-01`
      const last = new Date(selYear, selMonth+1, 0)
      return { from: f, to: `${selYear}-${pad(selMonth+1)}-${pad(last.getDate())}` }
    }
    if (mode === 'anno') {
      return { from: `${selYearOnly}-01-01`, to: `${selYearOnly}-12-31` }
    }
    return { from: customFrom, to: customTo }
  }, [mode, selWeek, selMonth, selYear, selYearOnly, customFrom, customTo])

  const stats = useMemo(() => {
    return EMPLOYEES.map(emp => {
      let pranzo = 0, cena = 0
      Object.entries(data).forEach(([key, val]) => {
        const parsed = parseKey(key)
        if (!parsed) return
        if (parsed.emp !== emp) return
        if (!dateInRange(parsed.date, from, to)) return
        if (!isValidShift(val, parsed.service)) return
        if (parsed.service === 'pranzo') pranzo++
        else cena++
      })
      return { emp, pranzo, cena, totale: pranzo + cena }
    })
  }, [data, from, to])

  const totals = useMemo(() => ({
    pranzo: stats.reduce((s, r) => s + r.pranzo, 0),
    cena: stats.reduce((s, r) => s + r.cena, 0),
    totale: stats.reduce((s, r) => s + r.totale, 0),
  }), [stats])

  const years = []
  for (let y = 2024; y <= now.getFullYear() + 1; y++) years.push(y)

  function getMondayStr(offset) {
    const d = new Date(selWeek)
    d.setDate(d.getDate() + offset * 7)
    return d.toISOString().slice(0, 10)
  }

  function fmtWeek(str) {
    const d = new Date(str)
    const sun = new Date(str)
    sun.setDate(sun.getDate() + 6)
    return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${String(d.getFullYear()).slice(2)} – ${pad(sun.getDate())}/${pad(sun.getMonth()+1)}/${String(sun.getFullYear()).slice(2)}`
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.controls}>
        <div className={styles.modeTabs}>
          {['settimana','mese','anno','custom'].map(m => (
            <button key={m} className={`${styles.modeTab} ${mode===m?styles.active:''}`} onClick={() => setMode(m)}>
              {m === 'custom' ? 'Intervallo' : m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        <div className={styles.selectors}>
          {mode === 'settimana' && (
            <div className={styles.weekNav}>
              <button className={styles.navBtn} onClick={() => setSelWeek(getMondayStr(-1))}>←</button>
              <span className={styles.weekStr}>{fmtWeek(selWeek)}</span>
              <button className={styles.navBtn} onClick={() => setSelWeek(getMondayStr(1))}>→</button>
            </div>
          )}
          {mode === 'mese' && (
            <div className={styles.row}>
              <select className={styles.sel} value={selMonth} onChange={e => setSelMonth(+e.target.value)}>
                {MESI.map((m,i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <select className={styles.sel} value={selYear} onChange={e => setSelYear(+e.target.value)}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          )}
          {mode === 'anno' && (
            <select className={styles.sel} value={selYearOnly} onChange={e => setSelYearOnly(+e.target.value)}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
          {mode === 'custom' && (
            <div className={styles.row}>
              <input type="date" className={styles.dateInput} value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
              <span style={{color:'#888', fontSize:12}}>–</span>
              <input type="date" className={styles.dateInput} value={customTo} onChange={e => setCustomTo(e.target.value)} />
            </div>
          )}
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thName}>Dipendente</th>
              <th className={styles.th}>Pranzo</th>
              <th className={styles.th}>Cena</th>
              <th className={`${styles.th} ${styles.thTotal}`}>Totale</th>
            </tr>
          </thead>
          <tbody>
            {stats.map(({ emp, pranzo, cena, totale }) => (
              <tr key={emp} className={styles.tr}>
                <td className={styles.tdName}>{emp}</td>
                <td className={styles.td}>{pranzo > 0 ? pranzo : <span className={styles.zero}>—</span>}</td>
                <td className={styles.td}>{cena > 0 ? cena : <span className={styles.zero}>—</span>}</td>
                <td className={`${styles.td} ${styles.tdTotal}`}>{totale > 0 ? totale : <span className={styles.zero}>—</span>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={styles.tfootRow}>
              <td className={styles.tdName}><strong>Totale</strong></td>
              <td className={styles.td}><strong>{totals.pranzo}</strong></td>
              <td className={styles.td}><strong>{totals.cena}</strong></td>
              <td className={`${styles.td} ${styles.tdTotal}`}><strong>{totals.totale}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
