import { useState, useMemo } from 'react'
import { supabase } from './supabase'
import { EMPLOYEES, addDays, toDateStr, getMonday, formatDateVertical, getWeekDays } from './utils'
import styles from './RichiestaCambioModal.module.css'

const DOW = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab']

function fmtSlot(dateStr, service) {
  const [y,m,d] = dateStr.split('-').map(Number)
  const date = new Date(y, m-1, d, 12)
  return `${DOW[date.getDay()]} ${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')} - ${service === 'pranzo' ? 'Pranzo' : 'Cena'}`
}

export default function RichiestaCambioModal({ data, onClose }) {
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState('scambio') // 'scambio' | 'cessione'
  const [dataCedo, setDataCedo] = useState('')
  const [servizioCedo, setServizioCedo] = useState('cena')
  const [collega, setCollega] = useState('')
  const [dataCollega, setDataCollega] = useState('')
  const [servizioCollega, setServizioCollega] = useState('cena')
  const [note, setNote] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [errore, setErrore] = useState('')
  const [inviata, setInviata] = useState(false)

  // Mostra le prossime 4 settimane di slot disponibili per scegliere
  const today = new Date()
  const fromMonday = getMonday(today)
  const upcomingDates = useMemo(() => {
    const dates = []
    for (let i = 0; i < 28; i++) {
      const d = addDays(fromMonday, i)
      dates.push({ str: toDateStr(d), date: d })
    }
    return dates
  }, [fromMonday])

  // Slot del richiedente: solo i turni esistenti del nome inserito
  const turniRichiedente = useMemo(() => {
    if (!nome.trim()) return []
    const slots = []
    upcomingDates.forEach(({ str, date }) => {
      ['pranzo','cena'].forEach(service => {
        const val = data[`${nome.trim()}::${str}::${service}`]
        if (val && val !== 'F') {
          slots.push({ dateStr: str, service, label: fmtSlot(str, service) })
        }
      })
    })
    return slots
  }, [nome, data, upcomingDates])

  const isValid = nome.trim() && dataCedo && servizioCedo && collega &&
    (tipo === 'cessione' || (dataCollega && servizioCollega))

  async function inviaRichiesta() {
    if (!isValid) return
    setSalvando(true)
    setErrore('')

    const payload = {
      nome_richiedente: nome.trim(),
      tipo,
      data_turno_da_cedere: dataCedo,
      servizio_da_cedere: servizioCedo,
      nome_collega: collega,
      data_turno_collega: tipo === 'scambio' ? dataCollega : null,
      servizio_collega: tipo === 'scambio' ? servizioCollega : null,
      note: note.trim() || null,
      stato: 'in_sospeso',
    }

    const { error } = await supabase.from('richieste_cambio').insert(payload)
    setSalvando(false)
    if (error) {
      setErrore('Errore nell\'invio: ' + error.message)
      return
    }

    // Notifica email admin (fire & forget)
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
          <span className={styles.title}>🔄 Richiedi cambio turno</span>
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
              <input
                type="text"
                className={styles.input}
                placeholder="Es. Francesca Novello"
                value={nome}
                onChange={e => setNome(e.target.value)}
              />
            </div>

            <div className={styles.section}>
              <label className={styles.label}>Tipo di richiesta</label>
              <div className={styles.tipoTabs}>
                <button
                  className={`${styles.tipoTab} ${tipo === 'scambio' ? styles.tipoActive : ''}`}
                  onClick={() => setTipo('scambio')}
                >🔄 Scambio</button>
                <button
                  className={`${styles.tipoTab} ${tipo === 'cessione' ? styles.tipoActive : ''}`}
                  onClick={() => setTipo('cessione')}
                >➡️ Cessione</button>
              </div>
              <p className={styles.hint}>
                {tipo === 'scambio'
                  ? 'Scambi il tuo turno con uno del collega.'
                  : 'Cedi il tuo turno al collega senza prendere nulla in cambio.'}
              </p>
            </div>

            <div className={styles.section}>
              <label className={styles.label}>Turno che cedo *</label>
              {nome.trim() === '' ? (
                <p className={styles.hintWarn}>Inserisci prima il tuo nome</p>
              ) : turniRichiedente.length === 0 ? (
                <p className={styles.hintWarn}>Nessun turno trovato per "{nome}" nelle prossime 4 settimane</p>
              ) : (
                <select
                  className={styles.select}
                  value={`${dataCedo}|${servizioCedo}`}
                  onChange={e => {
                    const [d, s] = e.target.value.split('|')
                    setDataCedo(d || '')
                    setServizioCedo(s || 'cena')
                  }}
                >
                  <option value="|">— Seleziona un turno —</option>
                  {turniRichiedente.map(s => (
                    <option key={s.dateStr + s.service} value={`${s.dateStr}|${s.service}`}>{s.label}</option>
                  ))}
                </select>
              )}
            </div>

            <div className={styles.section}>
              <label className={styles.label}>Collega coinvolto *</label>
              <select
                className={styles.select}
                value={collega}
                onChange={e => setCollega(e.target.value)}
              >
                <option value="">— Seleziona collega —</option>
                {EMPLOYEES.filter(e => e !== nome.trim()).map(e => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </div>

            {tipo === 'scambio' && (
              <div className={styles.section}>
                <label className={styles.label}>Turno del collega che prendo io *</label>
                <div className={styles.row}>
                  <input
                    type="date"
                    className={styles.dateInput}
                    value={dataCollega}
                    onChange={e => setDataCollega(e.target.value)}
                  />
                  <select
                    className={styles.selectSmall}
                    value={servizioCollega}
                    onChange={e => setServizioCollega(e.target.value)}
                  >
                    <option value="pranzo">Pranzo</option>
                    <option value="cena">Cena</option>
                  </select>
                </div>
              </div>
            )}

            <div className={styles.section}>
              <label className={styles.label}>Note (opzionale)</label>
              <textarea
                className={styles.textarea}
                placeholder="Es. compleanno di mia sorella, visita medica..."
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
