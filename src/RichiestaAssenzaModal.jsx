import { useState } from 'react'
import { supabase } from './supabase'
import { EMPLOYEES, toDateStr } from './utils'
import styles from './RichiestaCambioModal.module.css'

export default function RichiestaAssenzaModal({ onClose }) {
  const [nome, setNome] = useState('')
  const [dataInizio, setDataInizio] = useState('')
  const [dataFine, setDataFine] = useState('')
  const [note, setNote] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [errore, setErrore] = useState('')
  const [inviata, setInviata] = useState(false)

  const todayStr = toDateStr(new Date())

  const isValid = nome.trim() && dataInizio && dataFine && dataFine >= dataInizio

  async function inviaRichiesta() {
    if (!isValid) return
    setSalvando(true)
    setErrore('')

    const payload = {
      nome_richiedente: nome.trim(),
      tipo: 'assenza',
      data_inizio: dataInizio,
      data_fine: dataFine,
      note: note.trim() || null,
      stato: 'in_sospeso',
    }

    const { error } = await supabase.from('richieste_assenza').insert(payload)
    setSalvando(false)
    if (error) {
      setErrore("Errore nell'invio: " + error.message)
      return
    }

    fetch('https://rvzikapecolurexiaoqs.supabase.co/functions/v1/notifica-richiesta', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2emtapeY29sdXJleGlhb3FzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwMzY1MTUsImV4cCI6MjA5MDYxMjUxNX0.BmWfgJ7ycRA3O5zSC4q2bba6VBtxOUjUSO7e1xHxpf4',
      },
      body: JSON.stringify(payload),
    }).catch(() => {})

    setInviata(true)
    setTimeout(() => onClose(), 1800)
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>🏠 Richiedi periodo assenza</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {inviata ? (
          <div className={styles.successBox}>
            <div className={styles.successIcon}>✓</div>
            <p className={styles.successText}>Richiesta inviata!</p>
            <p className={styles.successSub}>Riceverai conferma quando l'admin la valuterà.</p>
          </div>
        ) : (
          <>
            <div className={styles.section}>
              <label className={styles.label}>Il tuo nome *</label>
              <select className={styles.select} value={nome} onChange={e => setNome(e.target.value)}>
                <option value="">— Seleziona il tuo nome —</option>
                {EMPLOYEES.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>

            <div className={styles.section}>
              <label className={styles.label}>Periodo richiesto *</label>
              <div className={styles.row}>
                <input
                  type="date"
                  className={styles.dateInput}
                  min={todayStr}
                  value={dataInizio}
                  onChange={e => {
                    setDataInizio(e.target.value)
                    if (dataFine && dataFine < e.target.value) setDataFine(e.target.value)
                  }}
                />
                <span style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap' }}>→</span>
                <input
                  type="date"
                  className={styles.dateInput}
                  min={dataInizio || todayStr}
                  value={dataFine}
                  onChange={e => setDataFine(e.target.value)}
                />
              </div>
              {dataInizio && dataFine && dataFine < dataInizio && (
                <p className={styles.hintWarn}>La data fine deve essere uguale o successiva all'inizio</p>
              )}
            </div>

            <div className={styles.section}>
              <label className={styles.label}>Note (opzionale)</label>
              <textarea
                className={styles.textarea}
                placeholder="Es. ferie, visita medica, impegno personale..."
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={2}
              />
            </div>

            {errore && <p className={styles.errore}>{errore}</p>}

            <button
              className={styles.sendBtn}
              onClick={inviaRichiesta}
              disabled={!isValid || salvando}
            >
              {salvando ? 'Invio...' : 'Invia richiesta'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
