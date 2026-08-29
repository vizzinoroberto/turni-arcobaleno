import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { EMPLOYEES } from './utils'
import styles from './DipendentiConfigModal.module.css'

const GIORNI = [
  { dow: 1, label: 'Lun' },
  { dow: 2, label: 'Mar' },
  { dow: 3, label: 'Mer' },
  { dow: 4, label: 'Gio' },
  { dow: 5, label: 'Ven' },
  { dow: 6, label: 'Sab' },
  { dow: 0, label: 'Dom' },
]

const TURNI_CENA = ['1', '2', '3', '4', '5', '6', '7']

let localIdSeq = 0
function localId() { return `new-${Date.now()}-${localIdSeq++}` }

export default function DipendentiConfigModal({ onClose, onSaved }) {
  const [turniFissi, setTurniFissi] = useState([])
  const [periodi, setPeriodi] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState('') // '' | 'ok' | 'err'

  useEffect(() => {
    supabase.from('dipendenti_config').select('*').then(({ data }) => {
      const rows = data || []
      setTurniFissi(
        rows.filter(r => r.tipo === 'turno_fisso').map(r => ({
          id: r.id,
          emp: r.dipendente,
          giorni: r.giorni || [],
          turno: r.turno || '5',
          from: r.data_inizio || '',
          to: r.data_fine || '',
        }))
      )
      setPeriodi(
        rows.filter(r => r.tipo === 'periodo_attivo').map(r => ({
          id: r.id,
          emp: r.dipendente,
          from: r.data_inizio || '',
          to: r.data_fine || '',
        }))
      )
      setLoading(false)
    })
  }, [])

  function addTurnoFisso() {
    setTurniFissi(prev => [...prev, { id: localId(), emp: EMPLOYEES[0], giorni: [], turno: '5', from: '', to: '' }])
  }
  function updateTurnoFisso(id, field, value) {
    setTurniFissi(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  }
  function toggleGiorno(id, dow) {
    setTurniFissi(prev => prev.map(r => {
      if (r.id !== id) return r
      const giorni = r.giorni.includes(dow) ? r.giorni.filter(g => g !== dow) : [...r.giorni, dow]
      return { ...r, giorni }
    }))
  }
  function removeTurnoFisso(id) {
    setTurniFissi(prev => prev.filter(r => r.id !== id))
  }

  function addPeriodo() {
    setPeriodi(prev => [...prev, { id: localId(), emp: EMPLOYEES[0], from: '', to: '' }])
  }
  function updatePeriodo(id, field, value) {
    setPeriodi(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  }
  function removePeriodo(id) {
    setPeriodi(prev => prev.filter(r => r.id !== id))
  }

  async function handleSave() {
    setSaving(true)
    setSaveStatus('')

    const rows = [
      ...turniFissi
        .filter(r => r.giorni.length > 0)
        .map(r => ({
          dipendente: r.emp,
          tipo: 'turno_fisso',
          data_inizio: r.from || null,
          data_fine: r.to || null,
          giorni: r.giorni,
          turno: r.turno,
        })),
      ...periodi.map(r => ({
        dipendente: r.emp,
        tipo: 'periodo_attivo',
        data_inizio: r.from || null,
        data_fine: r.to || null,
        giorni: null,
        turno: null,
      })),
    ]

    // Sostituzione completa: la tabella è piccola e gestita solo da qui,
    // più semplice e affidabile di un diff riga per riga.
    const { error: delError } = await supabase.from('dipendenti_config').delete().not('id', 'is', null)
    if (delError) { setSaving(false); setSaveStatus('err'); return }

    if (rows.length > 0) {
      const { error: insError } = await supabase.from('dipendenti_config').insert(rows)
      if (insError) { setSaving(false); setSaveStatus('err'); return }
    }

    setSaving(false)
    setSaveStatus('ok')
    if (onSaved) onSaved()
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>⚙️ Impostazioni dipendenti</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <p className={styles.emptyHint}>Caricamento...</p>
        ) : (
          <>
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <label className={styles.label}>
                  Turni fissi
                  <span className={styles.labelHint}>— dipendente in turno cena fisso in certi giorni e periodo (es. Novello mar/mer/ven in estate)</span>
                </label>
                <button className={styles.addBtn} onClick={addTurnoFisso}>+ Aggiungi</button>
              </div>
              {turniFissi.length === 0 && (
                <span className={styles.emptyHint}>Nessun turno fisso configurato.</span>
              )}
              {turniFissi.map(r => (
                <div key={r.id} className={styles.ruleCard}>
                  <div className={styles.ruleRow}>
                    <select className={styles.empSelect} value={r.emp} onChange={e => updateTurnoFisso(r.id, 'emp', e.target.value)}>
                      {EMPLOYEES.map(emp => <option key={emp} value={emp}>{emp}</option>)}
                    </select>
                    <span className={styles.ruleLabel}>turno cena</span>
                    <select className={styles.turnoSelect} value={r.turno} onChange={e => updateTurnoFisso(r.id, 'turno', e.target.value)}>
                      {TURNI_CENA.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button className={styles.removeBtn} onClick={() => removeTurnoFisso(r.id)}>✕</button>
                  </div>
                  <div className={styles.ruleRow}>
                    <span className={styles.ruleLabel}>Giorni:</span>
                    {GIORNI.map(g => (
                      <button
                        key={g.dow}
                        type="button"
                        className={`${styles.dayChip} ${r.giorni.includes(g.dow) ? styles.dayChipActive : ''}`}
                        onClick={() => toggleGiorno(r.id, g.dow)}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                  <div className={styles.ruleRow}>
                    <span className={styles.ruleLabel}>dal</span>
                    <input type="date" className={styles.dateInput} value={r.from} onChange={e => updateTurnoFisso(r.id, 'from', e.target.value)} />
                    <span className={styles.ruleLabel}>al</span>
                    <input type="date" className={styles.dateInput} value={r.to} onChange={e => updateTurnoFisso(r.id, 'to', e.target.value)} />
                  </div>
                  {r.giorni.length === 0 && (
                    <span className={styles.warningText}>Seleziona almeno un giorno, altrimenti la regola viene ignorata al salvataggio.</span>
                  )}
                </div>
              ))}
            </div>

            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <label className={styles.label}>
                  Periodi di attività limitata
                  <span className={styles.labelHint}>— un dipendente senza periodi qui è sempre attivo; con uno o più periodi è visibile e disponibile solo in quelle finestre</span>
                </label>
                <button className={styles.addBtn} onClick={addPeriodo}>+ Aggiungi</button>
              </div>
              {periodi.length === 0 && (
                <span className={styles.emptyHint}>Nessuna limitazione: tutti i dipendenti sono sempre attivi.</span>
              )}
              {periodi.map(r => (
                <div key={r.id} className={styles.ruleRow}>
                  <select className={styles.empSelect} value={r.emp} onChange={e => updatePeriodo(r.id, 'emp', e.target.value)}>
                    {EMPLOYEES.map(emp => <option key={emp} value={emp}>{emp}</option>)}
                  </select>
                  <span className={styles.ruleLabel}>dal</span>
                  <input type="date" className={styles.dateInput} value={r.from} onChange={e => updatePeriodo(r.id, 'from', e.target.value)} />
                  <span className={styles.ruleLabel}>al</span>
                  <input type="date" className={styles.dateInput} value={r.to} onChange={e => updatePeriodo(r.id, 'to', e.target.value)} />
                  <span className={styles.ruleHint}>(vuoto = senza limite)</span>
                  <button className={styles.removeBtn} onClick={() => removePeriodo(r.id)}>✕</button>
                </div>
              ))}
            </div>

            <div className={styles.saveRow}>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                {saving ? 'Salvataggio...' : 'Salva impostazioni'}
              </button>
              {saveStatus === 'ok' && <span className={styles.saveOk}>✓ OK, attivato</span>}
              {saveStatus === 'err' && <span className={styles.saveErr}>✗ Errore, riprova</span>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
