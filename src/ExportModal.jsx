import { useState } from 'react'
import { EMPLOYEES, PRANZO_MAP, CENA_MAP, getMonday, addDays, toDateStr } from './utils'
import styles from './ExportModal.module.css'

function pad(n) { return String(n).padStart(2,'0') }
function fmtDate(d) { return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${String(d.getFullYear()).slice(2)}` }

function shiftLabel(val, service) {
  if (!val) return ''
  if (val === 'F') return 'FERIE'
  const map = service === 'pranzo' ? PRANZO_MAP : CENA_MAP
  return map[val] ? `${map[val]} (${val})` : ''
}

function buildXLS(data, from, to, employees) {
  // Raccoglie tutte le date nel range
  const dates = []
  const cur = new Date(from)
  const end = new Date(to)
  while (cur <= end) {
    dates.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }

  const DOW = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab']

  // Intestazione
  let rows = []
  // Riga 1: date
  let r1 = ['Dipendente', 'Turno']
  dates.forEach(d => r1.push(fmtDate(d), ''))
  rows.push(r1)

  // Riga 2: giorno settimana
  let r2 = ['', '']
  dates.forEach(d => r2.push(DOW[d.getDay()], ''))
  rows.push(r2)

  // Riga 3: P/C
  let r3 = ['', '']
  dates.forEach(() => r3.push('Pranzo', 'Cena'))
  rows.push(r3)

  // Righe dipendenti
  employees.forEach(emp => {
    let row = [emp, '']
    dates.forEach(d => {
      const ds = toDateStr(d)
      const kP = `${emp}::${ds}::pranzo`
      const kC = `${emp}::${ds}::cena`
      row.push(shiftLabel(data[kP], 'pranzo'))
      row.push(shiftLabel(data[kC], 'cena'))
    })
    rows.push(row)
  })

  // Costruisce XML SpreadsheetML (formato .xls compatibile con Excel)
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:x="urn:schemas-microsoft-com:office:excel">
 <Styles>
  <Style ss:ID="hdr"><Font ss:Bold="1"/><Interior ss:Color="#E8E8E8" ss:Pattern="Solid"/></Style>
  <Style ss:ID="dow"><Font ss:Bold="1" ss:Color="#555555"/><Interior ss:Color="#F5F5F5" ss:Pattern="Solid"/></Style>
  <Style ss:ID="pranzo"><Interior ss:Color="#EAF4FB" ss:Pattern="Solid"/></Style>
  <Style ss:ID="ferie"><Font ss:Bold="1" ss:Color="#856404"/><Interior ss:Color="#FEF3CD" ss:Pattern="Solid"/></Style>
  <Style ss:ID="emp"><Font ss:Bold="1"/></Style>
 </Styles>
 <Worksheet ss:Name="Turni">
  <Table>
   ${rows.map((row, ri) => `<Row>${row.map((cell, ci) => {
     let style = ''
     if (ri === 0) style = ' ss:StyleID="hdr"'
     else if (ri === 1) style = ' ss:StyleID="dow"'
     else if (ri === 2) style = ' ss:StyleID="dow"'
     else if (ci === 0) style = ' ss:StyleID="emp"'
     else if (String(cell).startsWith('FERIE')) style = ' ss:StyleID="ferie"'
     return `<Cell${style}><Data ss:Type="String">${String(cell).replace(/&/g,'&amp;').replace(/</g,'&lt;')}</Data></Cell>`
   }).join('')}</Row>`).join('\n   ')}
  </Table>
 </Worksheet>
</Workbook>`

  return xml
}

export default function ExportModal({ data, currentMonday, onClose }) {
  const now = new Date()
  const monStr = currentMonday.toISOString().slice(0,10)
  const sunStr = addDays(currentMonday, 6).toISOString().slice(0,10)

  const [mode, setMode] = useState('settimana')
  const [from, setFrom] = useState(monStr)
  const [to, setTo] = useState(sunStr)
  const [empMode, setEmpMode] = useState('tutti')
  const [selEmp, setSelEmp] = useState(EMPLOYEES[0])

  function doExport() {
    const employees = empMode === 'tutti' ? EMPLOYEES : [selEmp]
    const xml = buildXLS(data, from, to, employees)
    const blob = new Blob([xml], { type: 'application/vnd.ms-excel' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const df = from.split('-').reverse().join('')
    const dt = to.split('-').reverse().join('')
    a.href = url
    a.download = `turni_${df}${from !== to ? '_'+dt : ''}.xls`
    a.click()
    URL.revokeObjectURL(url)
    onClose()
  }

  function handleModeChange(m) {
    setMode(m)
    if (m === 'settimana') { setFrom(monStr); setTo(sunStr) }
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>Scarica turni (.xls)</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.section}>
          <label className={styles.label}>Periodo</label>
          <div className={styles.radios}>
            <label className={styles.radio}>
              <input type="radio" checked={mode==='settimana'} onChange={() => handleModeChange('settimana')} />
              Settimana corrente
            </label>
            <label className={styles.radio}>
              <input type="radio" checked={mode==='custom'} onChange={() => handleModeChange('custom')} />
              Intervallo personalizzato
            </label>
          </div>
          {mode === 'custom' && (
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
          )}
        </div>

        <div className={styles.section}>
          <label className={styles.label}>Dipendenti</label>
          <div className={styles.radios}>
            <label className={styles.radio}>
              <input type="radio" checked={empMode==='tutti'} onChange={() => setEmpMode('tutti')} />
              Tutti i dipendenti
            </label>
            <label className={styles.radio}>
              <input type="radio" checked={empMode==='uno'} onChange={() => setEmpMode('uno')} />
              Solo un dipendente
            </label>
          </div>
          {empMode === 'uno' && (
            <select className={styles.empSel} value={selEmp} onChange={e => setSelEmp(e.target.value)}>
              {EMPLOYEES.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          )}
        </div>

        <button className={styles.exportBtn} onClick={doExport}>⬇ Scarica .xls</button>
      </div>
    </div>
  )
}
