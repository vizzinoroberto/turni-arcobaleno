import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { EMPLOYEES, getMonday, addDays, toDateStr } from './utils'
import { generaTurni } from './generaTurni'
import styles from './GeneraTurniModal.module.css'

const NICOLE_END = '2026-09-30'

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
  const defaultTo = toDateStr(addDays(new Date(), 27))

  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(defaultTo)

  const [startingPos, setStartingPos] = useState(() => {
    const obj = {}
    EMPLOYEES.forEach((emp, i) => { obj[emp] = i + 1 })
    return obj
  })

  // Indisponibilità manuali: [{ id, emp, from, to }]
  const [indisponibilita, setIndisponibilita] = useState([])

  const [figureAssenze, setFigureAssenze] = useState({})
  const [step, setStep] = useState('config')
  const [preview, setPreview] = useState(null) // { toUpsert, toDelete }
  const [saving, setSaving] = useState(false)

  const nicoleWarning = to > NICOLE_END

  useEffect(() => {
    if (!from || !to) return
    // Usa i lunedì come riferimento, come fa la tab Figure
    const fromMonday = toDateStr(getMonday(new Date(from)))
    const toMonday = toDateStr(getMonday(new Date(to)))
    supabase.from('figure_assenze')
      .select('settimana, figura')
      .gte('settimana', fromMonday)
      .lte('settimana', toMonday)
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
    return [...EMPLOYEES].sort((a, b) => startingPos[a] - startingPos[b])
  }

  function addIndisponibilita() {
    setIndisponibilita(prev => [...prev, {
      id: Date.now(),
      emp: EMPLOYEES[0],
      from: today,
      to: today
    }])
  }

  function updateIndisp(id, field, value) {
    setIndisponibilita(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e))
  }

  function removeIndisp(id) {
    setIndisponibilita(prev => prev.filter(e => e.id !== id))
  }

  function handlePreview() {
    if (hasDuplicates()) return
    const startingOrder = buildStartingOrder()
    const eccezioni = indisponibilita.map(({ emp, from: f, to: t }) => ({ emp, from: f, to: t }))
    const result = generaTurni(new Date(from), new Date(to), startingOrder, figureAssenze, eccezioni)
    setPreview(result)
    setStep('confirm')
  }

  async function handleConfirm() {
    if (!preview) return
    setSaving(true)
    const { toUpsert, toDelete } = preview

    const ops = []
    if (toUpsert.length > 0) {
      ops.push(supabase.from('turni').upsert(
        toUpsert.map(r => ({ chiave: r.key, valore: r.val })),
        { onConflict: 'chiave' }
      ))
    }
    // Cancella in batch da 200 per non superare i limiti URL di Supabase
    for (let i = 0; i < toDelete.length; i += 200) {
      ops.push(supabase.from('turni').delete().in('chiave', toDelete.slice(i, i + 200)))
    }

    const results = await Promise.all(ops)
    setSaving(false)
    if (results.some(r => r.error)) { alert('Errore salvataggio'); return }

    onApply(toUpsert)
    onClose()
  }

  const duplicates = hasDuplicates()

  const previewStats = preview ? (() => {
    const byEmp = {}
    EMPLOYEES.forEach(e => { byEmp[e] = 0 })
    preview.toUpsert.forEach(r => {
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
            {/* PERIODO */}
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
                <span className={styles.weekCount}>~{countWeeks(from, to)} settimane · {fmt(from)} – {fmt(to)}</span>
              )}
              {nicoleWarning && (
                <div className={styles.infoBox}>
                  Il periodo supera il 30/09/2026 — <strong>Nicole Cavalli</strong> verrà esclusa automaticamente dal 01/10/2026 in poi.
                </div>
              )}
            </div>

            {/* ROTAZIONE INIZIALE */}
            <div className={styles.section}>
              <label className={styles.label}>
                Turno sabato iniziale
                <span className={styles.labelHint}>— turno di ciascun dipendente nel primo sabato del periodo</span>
              </label>
              {duplicates && (
                <div className={styles.warning}>Turni duplicati: ogni dipendente deve avere un turno diverso (1–7).</div>
              )}
              <div className={styles.rotTable}>
                <div className={styles.rotHeader}>
                  <span>Dipendente</span>
                  <span>Sab</span>
                  <span>Dom</span>
                  <span>Note</span>
                </div>
                {EMPLOYEES.map(emp => {
                  const satT = startingPos[emp]
                  const sunT = 7 - satT
                  const isLast = satT === 6 || satT === 7
                  const isThird = satT === 3
                  return (
                    <div key={emp} className={styles.rotRow}>
                      <span className={styles.empName}>{emp}</span>
                      <input
                        type="number" min={1} max={7}
                        className={`${styles.posInput} ${duplicates ? styles.posInputErr : ''}`}
                        value={satT}
                        onChange={e => setPos(emp, e.target.value)}
                      />
                      <span className={styles.sunTurno}>{sunT > 0 ? sunT : '—'}</span>
                      <span className={styles.noteTag}>
                        {emp === 'Francesca Novello'
                          ? <span className={styles.tagBlue}>Mar/Mer/Ven fissi</span>
                          : isLast ? <span className={styles.tagGreen}>Viene giovedì</span>
                          : isThird ? <span className={styles.tagOrange}>Viene venerdì</span>
                          : null}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* INDISPONIBILITÀ */}
            <div className={styles.section}>
              <div className={styles.indispHeader}>
                <label className={styles.label}>Indisponibilità</label>
                <button className={styles.addBtn} onClick={addIndisponibilita}>+ Aggiungi</button>
              </div>
              {indisponibilita.length === 0 && (
                <span className={styles.emptyHint}>Nessuna — aggiungi se un dipendente non può lavorare in un certo periodo.</span>
              )}
              {indisponibilita.map(entry => (
                <div key={entry.id} className={styles.indispRow}>
                  <select
                    className={styles.indispSelect}
                    value={entry.emp}
                    onChange={e => updateIndisp(entry.id, 'emp', e.target.value)}
                  >
                    {EMPLOYEES.map(emp => <option key={emp} value={emp}>{emp}</option>)}
                  </select>
                  <span className={styles.indispLabel}>dal</span>
                  <input type="date" className={styles.indispDate} value={entry.from} onChange={e => updateIndisp(entry.id, 'from', e.target.value)} />
                  <span className={styles.indispLabel}>al</span>
                  <input type="date" className={styles.indispDate} value={entry.to} onChange={e => updateIndisp(entry.id, 'to', e.target.value)} />
                  <button className={styles.removeBtn} onClick={() => removeIndisp(entry.id)}>✕</button>
                </div>
              ))}
            </div>

            <div className={styles.infoBoxBottom}>
              Le assenze delle figure nascoste vengono lette automaticamente dalla tab "Figure".
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
                <strong>{preview.toUpsert.length} celle scritte</strong> · <strong>{preview.toDelete.length} celle cancellate</strong> · {fmt(from)} – {fmt(to)}
              </div>
              {indisponibilita.length > 0 && (
                <div className={styles.indispSummary}>
                  Indisponibilità applicate: {indisponibilita.map(e => `${e.emp.split(' ')[0]} (${fmt(e.from)}–${fmt(e.to)})`).join(', ')}
                </div>
              )}
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
