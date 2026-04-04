import { useState } from 'react'
import { EMPLOYEES, PRANZO_MAP, CENA_MAP, addDays, toDateStr } from './utils'
import styles from './ExportModal.module.css'

function pad(n) { return String(n).padStart(2,'0') }
function fmtDate(d) {
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${String(d.getFullYear()).slice(2)}`
}

const DOW_IT = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab']

// Colori per dipendente: sfondo leggero + testo scuro abbinato
const EMP_COLORS = [
  { bg: '#DBEAFE', fg: '#1E3A5F' }, // azzurro
  { bg: '#D1FAE5', fg: '#064E3B' }, // verde
  { bg: '#FDE68A', fg: '#78350F' }, // giallo
  { bg: '#FCE7F3', fg: '#831843' }, // rosa
  { bg: '#E0E7FF', fg: '#312E81' }, // indaco
  { bg: '#FFEDD5', fg: '#7C2D12' }, // arancio
  { bg: '#F3E8FF', fg: '#581C87' }, // viola
]

function shiftLabel(val, service) {
  if (!val) return ''
  if (val === 'F') return 'FERIE'
  const map = service === 'pranzo' ? PRANZO_MAP : CENA_MAP
  return map[val] ? map[val] : ''
}

function getDates(from, to) {
  const dates = []
  const cur = new Date(from)
  const end = new Date(to)
  while (cur <= end) { dates.push(new Date(cur)); cur.setDate(cur.getDate()+1) }
  return dates
}

// ── XLS (formato XLSX reale via SheetJS) ──────────────────────────────────────
function buildAndDownloadXLS(data, from, to, employees) {
  const dates = getDates(from, to)

  // Layout: righe dipendenti × date, impaginazione verticale (dipendenti in righe, date in colonne)
  // Struttura: nome | P/C | data1 | data2 | ...
  const XLSX = window.XLSX
  if (!XLSX) { alert('Libreria XLSX non caricata, riprova tra qualche secondo.'); return }

  const wb = XLSX.utils.book_new()
  const wsData = []

  // Riga 1 - date
  const hdrDate = ['Dipendente', '']
  dates.forEach(d => { hdrDate.push(fmtDate(d)); hdrDate.push('') })
  wsData.push(hdrDate)

  // Riga 2 - giorno settimana
  const hdrDow = ['', '']
  dates.forEach(d => { hdrDow.push(DOW_IT[d.getDay()]); hdrDow.push('') })
  wsData.push(hdrDow)

  // Riga 3 - P/C
  const hdrPC = ['', '']
  dates.forEach(() => { hdrPC.push('Pranzo'); hdrPC.push('Cena') })
  wsData.push(hdrPC)

  employees.forEach(emp => {
    const row = [emp, '']
    dates.forEach(d => {
      const ds = toDateStr(d)
      row.push(shiftLabel(data[`${emp}::${ds}::pranzo`], 'pranzo'))
      row.push(shiftLabel(data[`${emp}::${ds}::cena`], 'cena'))
    })
    wsData.push(row)
  })

  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Larghezze colonne
  const colWidths = [{ wch: 22 }, { wch: 4 }]
  dates.forEach(() => { colWidths.push({ wch: 9 }); colWidths.push({ wch: 9 }) })
  ws['!cols'] = colWidths

  XLSX.utils.book_append_sheet(wb, ws, 'Turni')

  const df = from.replace(/-/g,'')
  const dt = to.replace(/-/g,'')
  XLSX.writeFile(wb, `turni_${df}${from !== to ? '_'+dt : ''}.xlsx`)
}

// ── PDF (jsPDF + autoTable) ───────────────────────────────────────────────────
function buildAndDownloadPDF(data, from, to, employees) {
  const { jsPDF } = window.jspdf
  if (!jsPDF) { alert('Libreria PDF non caricata, riprova.'); return }

  const dates = getDates(from, to)
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  // Titolo
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('Turni Pizzeria Arcobaleno', 14, 14)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Periodo: ${fmtDate(new Date(from))} – ${fmtDate(new Date(to))}`, 14, 20)

  // Intestazioni colonne: Data + giorno su due righe
  const head = [['Dipendente', ...dates.flatMap(d => [`${fmtDate(d)}\n${DOW_IT[d.getDay()]}`, ''])]]

  // Sub-header P/C
  const subHead = [['', ...dates.flatMap(() => ['Pranzo', 'Cena'])]]

  // Dati
  const body = employees.map((emp, ei) => {
    const { bg, fg } = EMP_COLORS[ei % EMP_COLORS.length]
    const row = [emp, ...dates.flatMap(d => {
      const ds = toDateStr(d)
      return [
        shiftLabel(data[`${emp}::${ds}::pranzo`], 'pranzo') || '—',
        shiftLabel(data[`${emp}::${ds}::cena`], 'cena') || '—',
      ]
    })]
    return row
  })

  // Calcola larghezze colonne in base alle date
  const pageWidth = 277 // A4 landscape
  const nameCol = 32
  const remaining = pageWidth - 14 - 14 - nameCol
  const dayW = remaining / dates.length
  const colW = [nameCol, ...dates.flatMap(() => [dayW/2, dayW/2])]

  doc.autoTable({
    startY: 24,
    head: [...head, ...subHead],
    body,
    columnStyles: Object.fromEntries(colW.map((w, i) => [i, { cellWidth: w }])),
    styles: { fontSize: 7, cellPadding: 1.5, halign: 'center', valign: 'middle' },
    headStyles: { fillColor: [50, 50, 50], textColor: 255, fontStyle: 'bold', fontSize: 7 },
    bodyStyles: { textColor: [40, 40, 40] },
    didParseCell(hookData) {
      if (hookData.section === 'body') {
        const empIdx = hookData.row.index
        const { bg, fg } = EMP_COLORS[empIdx % EMP_COLORS.length]
        const bgRgb = hexToRgb(bg)
        const fgRgb = hexToRgb(fg)
        hookData.cell.styles.fillColor = bgRgb
        hookData.cell.styles.textColor = fgRgb
        // Nome dipendente in grassetto
        if (hookData.column.index === 0) hookData.cell.styles.fontStyle = 'bold'
        // FERIE evidenziato
        if (hookData.cell.raw === 'FERIE') {
          hookData.cell.styles.fillColor = [254, 243, 205]
          hookData.cell.styles.textColor = [133, 100, 4]
          hookData.cell.styles.fontStyle = 'bold'
        }
      }
    },
    margin: { left: 14, right: 14 },
  })

  const df = fmtDate(new Date(from)).replace(/\//g,'')
  const dt = fmtDate(new Date(to)).replace(/\//g,'')
  doc.save(`turni_${df}${from !== to ? '_'+dt : ''}.pdf`)
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16)
  const g = parseInt(hex.slice(3,5),16)
  const b = parseInt(hex.slice(5,7),16)
  return [r, g, b]
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function ExportModal({ data, currentMonday, onClose }) {
  const monStr = currentMonday.toISOString().slice(0,10)
  const sunStr = addDays(currentMonday, 6).toISOString().slice(0,10)

  const [mode, setMode] = useState('settimana')
  const [from, setFrom] = useState(monStr)
  const [to, setTo] = useState(sunStr)
  const [empMode, setEmpMode] = useState('tutti')
  const [selEmp, setSelEmp] = useState(EMPLOYEES[0])

  function getEmployees() { return empMode === 'tutti' ? EMPLOYEES : [selEmp] }

  function handleModeChange(m) {
    setMode(m)
    if (m === 'settimana') { setFrom(monStr); setTo(sunStr) }
  }

  function doXLS() { buildAndDownloadXLS(data, from, to, getEmployees()); onClose() }
  function doPDF() { buildAndDownloadPDF(data, from, to, getEmployees()); onClose() }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>Scarica turni</span>
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

        <div className={styles.btnRow}>
          <button className={styles.xlsBtn} onClick={doXLS}>⬇ Scarica .xlsx</button>
          <button className={styles.pdfBtn} onClick={doPDF}>⬇ Scarica PDF</button>
        </div>
      </div>
    </div>
  )
}
