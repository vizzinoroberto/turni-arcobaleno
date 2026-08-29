import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { EMPLOYEES, getMonday, addDays, toDateStr } from './utils'
import { generaTurni } from './generaTurni'
import styles from './GeneraTurniModal.module.css'

const DOW_LABEL = { 0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mer', 4: 'Gio', 5: 'Ven', 6: 'Sab' }

function fmt(dateStr) {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

function turniFissiLabel(emp, turniFissi) {
  const rules = turniFissi.filter(r => r.emp === emp)
  if (rules.length === 0) return null
  return rules
    .map(r => [...r.giorni].sort().map(d => DOW_LABEL[d]).join('/') + ' fissi')
    .join(', ')
}

// True se il periodo [fromStr, toStr] è interamente coperto da almeno uno dei
// periodi di attività del dipendente (nessun periodo configurato = sempre attivo).
function isFullyCovered(emp, fromStr, toStr, periodiAttivi) {
  const periodi = periodiAttivi[emp]
  if (!periodi || periodi.length === 0) return true
  return periodi.some(p => (!p.from || fromStr >= p.from) && (!p.to || toStr <= p.to))
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

  // Richieste di assenza già approvate, lette automaticamente da Supabase
  const [assenzeApprovate, setAssenzeApprovate] = useState([])

  const [figureAssenze, setFigureAssenze] = useState({})
  const [turniFissi, setTurniFissi] = useState([])
  const [periodiAttivi, setPeriodiAttivi] = useState({})
  const [step, setStep] = useState('config')
  const [preview, setPreview] = useState(null) // { toUpsert, toDelete }
  const [saving, setSaving] = useState(false)

  const periodoWarnings = Object.keys(periodiAttivi).filter(emp => !isFullyCovered(emp, from, to, periodiAttivi))

  useEffect(() => {
    supabase.from('dipendenti_config').select('*').then(({ data }) => {
      const rows = data || []
      setTurniFissi(
        rows.filter(r => r.tipo === 'turno_fisso').map(r => ({
          emp: r.dipendente,
          giorni: r.giorni || [],
          turno: r.turno,
          from: r.data_inizio,
          to: r.data_fine,
        }))
      )
      const periodi = {}
      rows.filter(r => r.tipo === 'periodo_attivo').forEach(r => {
        if (!periodi[r.dipendente]) periodi[r.dipendente] = []
        periodi[r.dipendente].push({ from: r.data_inizio, to: r.data_fine })
      })
      setPeriodiAttivi(periodi)
    })
  }, [])

  useEffect(() => {
    if (!from || !to) return
    // La rotazione weekend è settimanale, quindi ciò che conta è solo se una
    // figura manca sabato o domenica: aggreghiamo le assenze per-giorno su quei
    // due giorni di ogni settimana, ignorando le assenze infrasettimanali.
    const fromMondayDate = getMonday(new Date(from))
    const toMondayDate = getMonday(new Date(to))
    const fromMonday = toDateStr(fromMondayDate)
    const toSunday = toDateStr(addDays(toMondayDate, 6))
    supabase.from('figure_assenze')
      .select('data, figura')
      .gte('data', fromMonday)
      .lte('data', toSunday)
      .then(({ data }) => {
        if (!data) return
        const byDate = {}
        data.forEach(({ data: giorno, figura }) => {
          if (!byDate[giorno]) byDate[giorno] = []
          byDate[giorno].push(figura)
        })
        const obj = {}
        let monday = fromMondayDate
        while (monday <= toMondayDate) {
          const weekStr = toDateStr(monday)
          const satStr = toDateStr(addDays(monday, 5))
          const sunStr = toDateStr(addDays(monday, 6))
          const assenti = [...new Set([...(byDate[satStr] || []), ...(byDate[sunStr] || [])])]
          if (assenti.length > 0) obj[weekStr] = assenti
          monday = addDays(monday, 7)
        }
        setFigureAssenze(obj)
      })
  }, [from, to])

  useEffect(() => {
    if (!from || !to) return
    supabase.from('richieste_assenza')
      .select('nome_richiedente, data_inizio, data_fine, note')
      .eq('stato', 'approvata')
      .lte('data_inizio', to)
      .gte('data_fine', from)
      .then(({ data }) => setAssenzeApprovate(data || []))
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
    const eccezioni = [
      ...assenzeApprovate.map(({ nome_richiedente, data_inizio, data_fine }) =>
        ({ emp: nome_richiedente, from: data_inizio, to: data_fine })),
      ...indisponibilita.map(({ emp, from: f, to: t }) => ({ emp, from: f, to: t })),
    ]
    const result = generaTurni(new Date(from), new Date(to), startingOrder, figureAssenze, eccezioni, turniFissi, periodiAttivi)
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

    onApply()
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
              {periodoWarnings.length > 0 && (
                <div className={styles.infoBox}>
                  Il periodo include date fuori dai periodi di attività configurati per <strong>{periodoWarnings.join(', ')}</strong>: verrà esclusa/o automaticamente in quei giorni. Modificabile in "⚙️ Impostazioni dipendenti".
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
                        {turniFissiLabel(emp, turniFissi)
                          ? <span className={styles.tagBlue}>{turniFissiLabel(emp, turniFissi)}</span>
                          : isLast ? <span className={styles.tagGreen}>Viene giovedì</span>
                          : isThird ? <span className={styles.tagOrange}>Viene venerdì</span>
                          : null}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ASSENZE APPROVATE (automatiche) */}
            <div className={styles.section}>
              <label className={styles.label}>
                Assenze approvate
                <span className={styles.labelHint}>— lette automaticamente dalle richieste già approvate</span>
              </label>
              {assenzeApprovate.length === 0 && (
                <span className={styles.emptyHint}>Nessuna richiesta di assenza approvata nel periodo selezionato.</span>
              )}
              {assenzeApprovate.map((a, i) => (
                <div key={i} className={styles.indispSummary}>
                  {a.nome_richiedente} — {fmt(a.data_inizio)} → {fmt(a.data_fine)}{a.note ? ` (${a.note})` : ''}
                </div>
              ))}
            </div>

            {/* INDISPONIBILITÀ */}
            <div className={styles.section}>
              <div className={styles.indispHeader}>
                <label className={styles.label}>Altre indisponibilità</label>
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
              {assenzeApprovate.length > 0 && (
                <div className={styles.indispSummary}>
                  Assenze approvate applicate: {assenzeApprovate.map(a => `${a.nome_richiedente.split(' ')[0]} (${fmt(a.data_inizio)}–${fmt(a.data_fine)})`).join(', ')}
                </div>
              )}
              {indisponibilita.length > 0 && (
                <div className={styles.indispSummary}>
                  Altre indisponibilità applicate: {indisponibilita.map(e => `${e.emp.split(' ')[0]} (${fmt(e.from)}–${fmt(e.to)})`).join(', ')}
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
