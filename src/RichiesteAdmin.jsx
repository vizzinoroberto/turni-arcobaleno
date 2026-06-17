import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import styles from './RichiesteAdmin.module.css'

const DOW = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab']

function fmtDate(dateStr) {
  if (!dateStr) return ''
  const [y,m,d] = dateStr.split('-').map(Number)
  const date = new Date(y, m-1, d, 12)
  return `${DOW[date.getDay()]} ${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${String(y).slice(2)}`
}

function fmtServizio(s) {
  if (!s) return ''
  return s === 'pranzo' ? 'Pranzo' : 'Cena'
}

function fmtRichiestaDate(iso) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

export default function RichiesteAdmin({ onPendingCountChange }) {
  const [richieste, setRichieste] = useState([])
  const [richiesteAssenza, setRichiesteAssenza] = useState([])
  const [loading, setLoading] = useState(true)
  const [showStorico, setShowStorico] = useState(false)
  const [actionLoading, setActionLoading] = useState(null)
  const [motivoRifiuto, setMotivoRifiuto] = useState({})
  const [showMotivoFor, setShowMotivoFor] = useState(null)

  const loadRichieste = useCallback(async () => {
    setLoading(true)
    const [{ data: dataCambio }, { data: dataAssenza }] = await Promise.all([
      supabase.from('richieste_cambio').select('*').order('data_richiesta', { ascending: false }),
      supabase.from('richieste_assenza').select('*').order('data_richiesta', { ascending: false }),
    ])
    const listaCambio = dataCambio || []
    const listaAssenza = dataAssenza || []
    setRichieste(listaCambio)
    setRichiesteAssenza(listaAssenza)
    setLoading(false)
    if (onPendingCountChange) {
      const pending = listaCambio.filter(r => r.stato === 'in_sospeso').length
                    + listaAssenza.filter(r => r.stato === 'in_sospeso').length
      onPendingCountChange(pending)
    }
  }, [onPendingCountChange])

  useEffect(() => { loadRichieste() }, [loadRichieste])

  const inSospeso = richieste.filter(r => r.stato === 'in_sospeso')
  const storico = richieste.filter(r => r.stato !== 'in_sospeso')
  const inSospesoAssenza = richiesteAssenza.filter(r => r.stato === 'in_sospeso')
  const storicoAssenza = richiesteAssenza.filter(r => r.stato !== 'in_sospeso')

  async function approva(r) {
    if (!confirm(`Approvare la richiesta di ${r.nome_richiedente}? I turni verranno modificati automaticamente.`)) return
    setActionLoading(r.id)

    const keyA = `${r.nome_richiedente}::${r.data_turno_da_cedere}::${r.servizio_da_cedere}`
    const valoreA = (await supabase.from('turni').select('valore').eq('chiave', keyA).maybeSingle()).data?.valore

    if (!valoreA) {
      alert('Errore: il turno da cedere non esiste più nel database. Forse è stato modificato.')
      setActionLoading(null)
      return
    }

    if (r.tipo === 'cessione') {
      const keyB = `${r.nome_collega}::${r.data_turno_da_cedere}::${r.servizio_da_cedere}`
      const ops = [
        supabase.from('turni').delete().eq('chiave', keyA),
        supabase.from('turni').upsert({ chiave: keyB, valore: valoreA }, { onConflict: 'chiave' }),
      ]
      const results = await Promise.all(ops)
      if (results.some(x => x.error)) {
        alert('Errore durante la modifica dei turni: ' + results.find(x => x.error).error.message)
        setActionLoading(null)
        return
      }
    } else {
      const keyB = `${r.nome_collega}::${r.data_turno_collega}::${r.servizio_collega}`
      const valoreB = (await supabase.from('turni').select('valore').eq('chiave', keyB).maybeSingle()).data?.valore

      const newKeyA = `${r.nome_richiedente}::${r.data_turno_collega}::${r.servizio_collega}`
      const newKeyB = `${r.nome_collega}::${r.data_turno_da_cedere}::${r.servizio_da_cedere}`

      const ops = [
        supabase.from('turni').delete().eq('chiave', keyA),
        supabase.from('turni').upsert({ chiave: newKeyB, valore: valoreA }, { onConflict: 'chiave' }),
      ]
      if (valoreB) {
        ops.push(supabase.from('turni').delete().eq('chiave', keyB))
        ops.push(supabase.from('turni').upsert({ chiave: newKeyA, valore: valoreB }, { onConflict: 'chiave' }))
      }
      const results = await Promise.all(ops)
      if (results.some(x => x.error)) {
        alert('Errore durante lo scambio: ' + results.find(x => x.error).error.message)
        setActionLoading(null)
        return
      }
    }

    await supabase.from('richieste_cambio').update({
      stato: 'approvata',
      data_gestione: new Date().toISOString()
    }).eq('id', r.id)

    setActionLoading(null)
    loadRichieste()
  }

  async function rifiuta(r) {
    const motivo = motivoRifiuto[r.id] || ''
    setActionLoading(r.id)
    await supabase.from('richieste_cambio').update({
      stato: 'rifiutata',
      motivo_rifiuto: motivo || null,
      data_gestione: new Date().toISOString()
    }).eq('id', r.id)
    setActionLoading(null)
    setShowMotivoFor(null)
    loadRichieste()
  }

  async function elimina(r) {
    if (!confirm(`Eliminare definitivamente la richiesta di ${r.nome_richiedente}?`)) return
    setActionLoading(r.id)
    await supabase.from('richieste_cambio').delete().eq('id', r.id)
    setActionLoading(null)
    loadRichieste()
  }

  async function approvaAssenza(r) {
    if (!confirm(`Approvare la richiesta di assenza di ${r.nome_richiedente}?`)) return
    setActionLoading(r.id)
    await supabase.from('richieste_assenza').update({
      stato: 'approvata',
      data_gestione: new Date().toISOString()
    }).eq('id', r.id)
    setActionLoading(null)
    loadRichieste()
  }

  async function rifiutaAssenza(r) {
    const motivo = motivoRifiuto[r.id] || ''
    setActionLoading(r.id)
    await supabase.from('richieste_assenza').update({
      stato: 'rifiutata',
      motivo_rifiuto: motivo || null,
      data_gestione: new Date().toISOString()
    }).eq('id', r.id)
    setActionLoading(null)
    setShowMotivoFor(null)
    loadRichieste()
  }

  async function eliminaAssenza(r) {
    if (!confirm(`Eliminare definitivamente la richiesta di assenza di ${r.nome_richiedente}?`)) return
    setActionLoading(r.id)
    await supabase.from('richieste_assenza').delete().eq('id', r.id)
    setActionLoading(null)
    loadRichieste()
  }

  function renderCardAssenza(r, isStorico = false) {
    const isLoading = actionLoading === r.id
    const periodoLabel = r.data_inizio === r.data_fine
      ? fmtDate(r.data_inizio)
      : `${fmtDate(r.data_inizio)} → ${fmtDate(r.data_fine)}`
    return (
      <div key={r.id} className={`${styles.card} ${styles.cardAssenza} ${isStorico ? styles[r.stato] : ''}`}>
        <div className={styles.cardHeader}>
          <div>
            <span className={styles.nome}>{r.nome_richiedente}</span>
            <span className={styles.tipoBadge}>🏠 Assenza</span>
          </div>
          <span className={styles.dataRichiesta}>{fmtRichiestaDate(r.data_richiesta)}</span>
        </div>

        <div className={styles.scambioBlock}>
          <div className={styles.scambioRow}>
            <span className={styles.scambioLabel}>Periodo:</span>
            <span className={styles.scambioVal}>{periodoLabel}</span>
          </div>
        </div>

        {r.note && (
          <div className={styles.note}>
            <span className={styles.noteLabel}>Note:</span> {r.note}
          </div>
        )}

        {isStorico ? (
          <div className={styles.statoBox}>
            <span className={`${styles.statoBadge} ${styles[r.stato]}`}>
              {r.stato === 'approvata' ? '✓ Approvata' : '✗ Rifiutata'}
            </span>
            {r.motivo_rifiuto && <span className={styles.motivoText}>Motivo: {r.motivo_rifiuto}</span>}
          </div>
        ) : (
          <>
            {showMotivoFor === r.id && (
              <div className={styles.motivoBox}>
                <input
                  type="text"
                  className={styles.motivoInput}
                  placeholder="Motivo rifiuto (opzionale)"
                  value={motivoRifiuto[r.id] || ''}
                  onChange={e => setMotivoRifiuto({...motivoRifiuto, [r.id]: e.target.value})}
                />
                <div className={styles.motivoBtns}>
                  <button className={styles.btnAnnulla} onClick={() => setShowMotivoFor(null)}>Annulla</button>
                  <button className={styles.btnRifiuta} onClick={() => rifiutaAssenza(r)} disabled={isLoading}>Conferma rifiuto</button>
                </div>
              </div>
            )}
            {showMotivoFor !== r.id && (
              <div className={styles.actions}>
                <button className={styles.btnApprova} onClick={() => approvaAssenza(r)} disabled={isLoading}>
                  {isLoading ? 'Attendere...' : '✓ Approva'}
                </button>
                <button className={styles.btnRifiutaOpen} onClick={() => setShowMotivoFor(r.id)} disabled={isLoading}>
                  ✗ Rifiuta
                </button>
                <button className={styles.btnElimina} onClick={() => eliminaAssenza(r)} disabled={isLoading}>
                  Elimina
                </button>
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  function renderCard(r, isStorico = false) {
    const isLoading = actionLoading === r.id
    return (
      <div key={r.id} className={`${styles.card} ${isStorico ? styles[r.stato] : ''}`}>
        <div className={styles.cardHeader}>
          <div>
            <span className={styles.nome}>{r.nome_richiedente}</span>
            <span className={styles.tipoBadge}>{r.tipo === 'scambio' ? '🔄 Scambio' : '➡️ Cessione'}</span>
          </div>
          <span className={styles.dataRichiesta}>{fmtRichiestaDate(r.data_richiesta)}</span>
        </div>

        <div className={styles.scambioBlock}>
          <div className={styles.scambioRow}>
            <span className={styles.scambioLabel}>Cede:</span>
            <span className={styles.scambioVal}>
              <strong>{r.nome_richiedente}</strong> – {fmtDate(r.data_turno_da_cedere)} {fmtServizio(r.servizio_da_cedere)}
            </span>
          </div>
          {r.tipo === 'scambio' && r.data_turno_collega && (
            <div className={styles.scambioRow}>
              <span className={styles.scambioLabel}>Prende:</span>
              <span className={styles.scambioVal}>
                <strong>{r.nome_collega}</strong> – {fmtDate(r.data_turno_collega)} {fmtServizio(r.servizio_collega)}
              </span>
            </div>
          )}
          {r.tipo === 'cessione' && (
            <div className={styles.scambioRow}>
              <span className={styles.scambioLabel}>A:</span>
              <span className={styles.scambioVal}><strong>{r.nome_collega}</strong></span>
            </div>
          )}
        </div>

        {r.note && (
          <div className={styles.note}>
            <span className={styles.noteLabel}>Note:</span> {r.note}
          </div>
        )}

        {isStorico ? (
          <div className={styles.statoBox}>
            <span className={`${styles.statoBadge} ${styles[r.stato]}`}>
              {r.stato === 'approvata' ? '✓ Approvata' : '✗ Rifiutata'}
            </span>
            {r.motivo_rifiuto && <span className={styles.motivoText}>Motivo: {r.motivo_rifiuto}</span>}
          </div>
        ) : (
          <>
            {showMotivoFor === r.id && (
              <div className={styles.motivoBox}>
                <input
                  type="text"
                  className={styles.motivoInput}
                  placeholder="Motivo rifiuto (opzionale)"
                  value={motivoRifiuto[r.id] || ''}
                  onChange={e => setMotivoRifiuto({...motivoRifiuto, [r.id]: e.target.value})}
                />
                <div className={styles.motivoBtns}>
                  <button className={styles.btnAnnulla} onClick={() => setShowMotivoFor(null)}>Annulla</button>
                  <button className={styles.btnRifiuta} onClick={() => rifiuta(r)} disabled={isLoading}>Conferma rifiuto</button>
                </div>
              </div>
            )}

            {showMotivoFor !== r.id && (
              <div className={styles.actions}>
                <button className={styles.btnApprova} onClick={() => approva(r)} disabled={isLoading}>
                  {isLoading ? 'Attendere...' : '✓ Approva'}
                </button>
                <button className={styles.btnRifiutaOpen} onClick={() => setShowMotivoFor(r.id)} disabled={isLoading}>
                  ✗ Rifiuta
                </button>
                <button className={styles.btnElimina} onClick={() => elimina(r)} disabled={isLoading}>
                  Elimina
                </button>
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  const totSospeso = inSospeso.length + inSospesoAssenza.length
  const totStorico = storico.length + storicoAssenza.length

  return (
    <div className={styles.wrap}>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>
            🔔 In sospeso {totSospeso > 0 && <span className={styles.badge}>{totSospeso}</span>}
          </h3>
          <button className={styles.refreshBtn} onClick={loadRichieste}>↻ Aggiorna</button>
        </div>
        {loading ? (
          <p className={styles.empty}>Caricamento...</p>
        ) : totSospeso === 0 ? (
          <p className={styles.empty}>Nessuna richiesta in sospeso</p>
        ) : (
          <div className={styles.list}>
            {inSospeso.map(r => renderCard(r))}
            {inSospesoAssenza.map(r => renderCardAssenza(r))}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <button className={styles.storicoToggle} onClick={() => setShowStorico(!showStorico)}>
          {showStorico ? '▼' : '▶'} Storico ({totStorico})
        </button>
        {showStorico && (
          totStorico === 0 ? (
            <p className={styles.empty}>Nessuna richiesta nello storico</p>
          ) : (
            <div className={styles.list}>
              {storico.map(r => renderCard(r, true))}
              {storicoAssenza.map(r => renderCardAssenza(r, true))}
            </div>
          )
        )}
      </div>
    </div>
  )
}
