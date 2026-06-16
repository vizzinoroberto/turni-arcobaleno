import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { EMPLOYEES, getMonday, addDays, toDateStr } from './utils'
import { generaTurni } from './generaTurni'
import styles from './GeneraTurniModal.module.css'

function getNextSaturday(from) {
  const d = new Date(from)
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1)
  return d
}

function fmt(dateStr) {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

function countWeeks(fromStr, toStr) {
  const from = new Date(fromStr)
  const to = new Date(toStr)
  return Math.max(1, Math.ceil((to - from) / (7 * 86400000)) + 1)
}

export default function GeneraTurniModal({ onClose, onApply }) {
  const today = toDateStr(new Date())
  const defaultTo = toDateStr(addDays(new Date(), 27)) // ~4 settimane

  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(defaultTo)

  // Ordine iniziale: ogni dipendente ha un turno sabato 1-7
  // startingPos[emp] = numero turno (1-7)
  const [startingPos, setStartingPos] = useState(() => {
    const obj = {}
    EMPLOYEES.forEach((emp, i) => { obj[emp] = i + 1 })
    return obj
  })

  const [figureAssenze, setFigureAssenze] = useState({})
  const [step, setStep] = useState('config') // 'config' | 'confirm'
  const [preview, setPreview] = useState(null)
  const [saving, setSaving] = useState(false)

  // Carica le figure assenze nel range selezionato
  useEffect(() => {
    if (!from || !to) return
    supabase.from('figure_assenze')
      .select('settimana, figura')
      .gte('settimana', from)
      .lte('settimana', to)
      .then(({ data }) => {
        if (!data) return
        const obj = {}
        data.forEach(({ settimana, figura }) => {
          if (!obj[settimana]) obj[settimana] = []
          obj[settimana].push(figura)
        })
        setFigureAssenze(obj)
      })
  }, [from, to])

  function setPos(emp, val) {
    const num = parseInt(val)
    if (isNaN(num) || num < 1 || num > 7) return
    setStartingPos(prev => ({ ...prev, [emp]: num }))
  }

  function hasDuplicates() {
    const vals = Object.values(startingPos)
    return vals.length !== new Set(vals).size
  }

  function buildStartingOrder() {
    // Array di 7 dipendenti ordinati per turno crescente
    return [...EMPLOYEES].sort((a, b) => startingPos[a] - startingPos[b])
  }

  function handlePreview() {
    if (hasDuplicates()) return
    const startingOrder = buildStartingOrder()
    const records = generaTurni(
      new Date(from), new Date(to),
      startingOrder,
      figureAssenze
    )
    setPreview(records)
    setStep('confirm')
  }

  async function handleConfirm() {
    if (!preview) return
    setSaving(true)

    const toUpsert = preview
      .filter(r => r.val)
      .map(r => ({ chiave: r.key, valore: r.val }))

    const { error } = await supabase
      .from('turni')
      .upsert(toUpsert, { onConflict: 'chiave' })

    setSaving(false)
    if (error) { alert('Errore salvataggio: ' + error.message); return }

    onApply(preview)
    onClose()
  }

  const duplicates = hasDuplicates()

  // Conta assegnazioni per anteprima
  const previewStats = preview ? (() => {
    const byEmp = {}
    EMPLOYEES.forEach(e => { byEmp[e] = 0 })
    preview.forEach(r => {
      const emp = r.key.split('::')[0]
      if (byEmp[emp] !== undefined) byEmp[emp]++
    })
    return byEmp
  })() : null

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>Genera turni automaticamente</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {step === 'config' && (
          <>
            <div className={styles.section}>
              <label className={styles.label}>Periodo da generare</label>
              <div className={styles.dateRow}>
                <div className={styles.dateField}>
                  <span className={styles.dateLabel}>Dal</span>
                  <input type="date" className={styles.dateInput} value={from} onChange={e => setFrom(e.target.value)} />
                </div>
                <div className={styles.dateField}>
                  <span className={styles.dateLabel}>Al</span>
                  <input type="date" className={styles.dateInput} value={to} onChange={e => setTo(e.target.value)} />
                </div>
              </div>
              {from && to && (
                <span className={styles.weekCount}>
                  ~{countWeeks(from, to)} settimane · {fmt(from)} – {fmt(to)}
                </span>
              )}
            </div>

            <div className={styles.section}>
              <label className={styles.label}>
                Turno sabato iniziale
                <span className={styles.labelHint}>— assegna a ciascun dipendente il turno del primo sabato nel periodo</span>
              </label>

              {duplicates && (
                <div className={styles.warning}>Attenzione: ci sono turni duplicati. Ogni dipendente deve avere un turno diverso (1–7).</div>
              )}

              <div className={styles.rotTable}>
                <div className={styles.rotHeader}>
                  <span>Dipendente</span>
                  <span>Turno sabato</span>
                  <span>Turno domenica</span>
                  <span>Note</span>
                </div>
                {EMPLOYEES.map(emp => {
                  const satT = startingPos[emp]
                  const sunT = 7 - satT // con max=6 standard; varia se figura assente
                  const isLast = satT === 6 || satT === 7
                  const isThird = satT === 3
                  return (
                    <div key={emp} className={styles.rotRow}>
                      <span className={styles.empName}>{emp}</span>
                      <input
                        type="number"
                        min={1} max={7}
                        className={`${styles.posInput} ${hasDuplicates() ? styles.posInputErr : ''}`}
                        value={satT}
                        onChange={e => setPos(emp, e.target.value)}
                      />
                      <span className={styles.sunTurno}>{sunT > 0 ? sunT : '—'}</span>
                      <span className={styles.noteTag}>
                        {emp === 'Francesca Novello'
                          ? <span className={styles.tagBlue}>Mar/Mer/Ven fissi</span>
                          : isLast
                            ? <span className={styles.tagGreen}>Viene giovedì</span>
                            : isThird
                              ? <span className={styles.tagOrange}>Viene venerdì</span>
                              : null
                        }
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className={styles.infoBox}>
              Le assenze delle figure nascoste vengono lette automaticamente dalla tab "Figure".
              Settimane con almeno una figura assente avranno turno massimo 7 (nessuno a riposo).
            </div>

            <button
              className={styles.primaryBtn}
              onClick={handlePreview}
              disabled={duplicates || !from || !to}
            >
              Anteprima →
            </button>
          </>
        )}

        {step === 'confirm' && preview && (
          <>
            <div className={styles.section}>
              <label className={styles.label}>Riepilogo generazione</label>
              <div className={styles.previewGrid}>
                {EMPLOYEES.map(emp => (
                  <div key={emp} className={styles.previewRow}>
                    <span className={styles.previewEmp}>{emp}</span>
                    <span className={styles.previewCount}>{previewStats[emp]} celle</span>
                  </div>
                ))}
              </div>
              <div className={styles.previewTotal}>
                Totale: <strong>{preview.length} celle</strong> da scrivere nel periodo {fmt(from)} – {fmt(to)}
              </div>
              <div className={styles.warning}>
                Le celle già compilate nel database verranno sovrascritte.
              </div>
            </div>

            <div className={styles.btnRow}>
              <button className={styles.secondaryBtn} onClick={() => setStep('config')}>← Modifica</button>
              <button className={styles.confirmBtn} onClick={handleConfirm} disabled={saving}>
                {saving ? 'Salvataggio...' : 'Conferma e salva'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
