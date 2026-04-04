import { useState } from 'react'
import { EMPLOYEES, PRANZO_MAP, CENA_MAP, addDays, toDateStr } from './utils'
import styles from './ExportModal.module.css'

function pad(n) { return String(n).padStart(2,'0') }
function fmtDate(d) {
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${String(d.getFullYear()).slice(2)}`
}

const DOW_IT = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab']

const EMP_COLORS = [
  { bg: '#DBEAFE', fg: '#1E3A5F' },
  { bg: '#D1FAE5', fg: '#064E3B' },
  { bg: '#FEF9C3', fg: '#78350F' },
  { bg: '#FCE7F3', fg: '#831843' },
  { bg: '#E0E7FF', fg: '#312E81' },
  { bg: '#FFEDD5', fg: '#7C2D12' },
  { bg: '#F3E8FF', fg: '#581C87' },
]

function hexToRgb(hex) {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)]
}

function shiftLabel(val, service) {
  if (!val) return ''
  if (val === 'F') return 'FERIE'
  const map = service === 'pranzo' ? PRANZO_MAP : CENA_MAP
  return map[val] || ''
}

function getDates(from, to) {
  const dates = []
  const cur = new Date(from)
  const end = new Date(to)
  while (cur <= end) { dates.push(new Date(cur)); cur.setDate(cur.getDate()+1) }
  return dates
}

// ── XLS ──────────────────────────────────────────────────────────────────────
function buildAndDownloadXLS(data, from, to, employees) {
  const XLSX = window.XLSX
  if (!XLSX) { alert('Libreria XLSX non caricata, riprova.'); return }
  const dates = getDates(from, to)
  const wb = XLSX.utils.book_new()
  const wsData = []

  const hdrDate = ['Dipendente', '']
  dates.forEach(d => { hdrDate.push(fmtDate(d)); hdrDate.push('') })
  wsData.push(hdrDate)

  const hdrDow = ['', '']
  dates.forEach(d => { hdrDow.push(DOW_IT[d.getDay()]); hdrDow.push('') })
  wsData.push(hdrDow)

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
  const colWidths = [{ wch: 22 }, { wch: 4 }]
  dates.forEach(() => { colWidths.push({ wch: 9 }); colWidths.push({ wch: 9 }) })
  ws['!cols'] = colWidths
  XLSX.utils.book_append_sheet(wb, ws, 'Turni')
  const df = from.replace(/-/g,'')
  const dt = to.replace(/-/g,'')
  XLSX.writeFile(wb, `turni_${df}${from !== to ? '_'+dt : ''}.xlsx`)
}

// ── PDF — 2 settimane per pagina impilate verticalmente ───────────────────────
function renderWeekTable(doc, dates, employees, data, startY, pageW, margin, nameColW, totalPages, pageNum) {
  const available = pageW - margin * 2 - nameColW
  const dayW = available / dates.length
  const subW = dayW / 2

  const headRow1 = ['Dipendente', ...dates.flatMap(d => [`${fmtDate(d)} ${DOW_IT[d.getDay()]}`, ''])]
  const headRow2 = ['', ...dates.flatMap(() => ['P', 'C'])]

  const body = employees.map((emp, ei) => {
    const row = [emp]
    dates.forEach(d => {
      const ds = toDateStr(d)
      row.push(shiftLabel(data[`${emp}::${ds}::pranzo`], 'pranzo') || '—')
      row.push(shiftLabel(data[`${emp}::${ds}::cena`], 'cena') || '—')
    })
    return row
  })

  const columnStyles = { 0: { cellWidth: nameColW, halign: 'left', fontStyle: 'bold' } }
  dates.forEach((_, di) => {
    columnStyles[1 + di*2]     = { cellWidth: subW, halign: 'center' }
    columnStyles[1 + di*2 + 1] = { cellWidth: subW, halign: 'center' }
  })

  doc.autoTable({
    startY,
    head: [headRow1, headRow2],
    body,
    columnStyles,
    styles: { fontSize: 7.5, cellPadding: 1.8, valign: 'middle', overflow: 'hidden' },
    headStyles: { fillColor: [40, 40, 40], textColor: 255, fontStyle: 'bold', fontSize: 7, halign: 'center', valign: 'middle' },
    didParseCell(hookData) {
      if (hookData.section === 'body') {
        const ei = hookData.row.index
        const { bg, fg } = EMP_COLORS[ei % EMP_COLORS.length]
        hookData.cell.styles.fillColor = hexToRgb(bg)
        hookData.cell.styles.textColor = hexToRgb(fg)
        if (hookData.cell.raw === 'FERIE') {
          hookData.cell.styles.fillColor = [254, 243, 205]
          hookData.cell.styles.textColor = [133, 100, 4]
          hookData.cell.styles.fontStyle = 'bold'
          hookData.cell.styles.fontSize = 6.5
        }
      }
      if (hookData.section === 'head' && hookData.row.index === 0 && hookData.column.index >= 1) {
        const dateIdx = Math.floor((hookData.column.index - 1) / 2)
        if (dateIdx < dates.length) {
          const dow = dates[dateIdx].getDay()
          if (dow === 0) hookData.cell.styles.fillColor = [160, 30, 30]
          else if (dow === 6) hookData.cell.styles.fillColor = [60, 60, 140]
        }
      }
    },
    margin: { left: margin, right: margin },
  })

  return doc.lastAutoTable.finalY
}

function buildAndDownloadPDF(data, from, to, employees) {
  const { jsPDF } = window.jspdf
  if (!jsPDF) { alert('Libreria PDF non caricata, riprova.'); return }

  const allDates = getDates(from, to)

  // Raggruppa in settimane spezzando alla domenica
  const weeks = []
  let cur = []
  allDates.forEach(d => {
    cur.push(d)
    if (d.getDay() === 0) { weeks.push(cur); cur = [] }
  })
  if (cur.length > 0) weeks.push(cur)

  // Raggruppa in coppie: 2 settimane per pagina
  const pages = []
  for (let i = 0; i < weeks.length; i += 2) {
    pages.push(weeks.slice(i, i + 2))
  }

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = 277
  const margin = 12
  const nameColW = 36

  pages.forEach((pageWeeks, pi) => {
    if (pi > 0) doc.addPage()

    // Intestazione pagina
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Turni Pizzeria Arcobaleno', margin, 10)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    if (pages.length > 1) {
      doc.text(`(pagina ${pi+1} di ${pages.length})`, pageW - margin, 10, { align: 'right' })
    }

    let currentY = 13
    pageWeeks.forEach((weekDates, wi) => {
      // Etichetta mini sopra ogni tabella
      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(80, 80, 80)
      doc.text(`Settimana: ${fmtDate(weekDates[0])} – ${fmtDate(weekDates[weekDates.length-1])}`, margin, currentY + 3)
      doc.setTextColor(0, 0, 0)
      currentY = renderWeekTable(doc, weekDates, employees, data, currentY + 5, pageW, margin, nameColW, pages.length, pi + 1)
      currentY += 6 // spazio tra le due tabelle
    })
  })

  const df = fmtDate(new Date(from)).replace(/\//g,'')
  const dt = fmtDate(new Date(to)).replace(/\//g,'')
  doc.save(`turni_${df}${from !== to ? '_'+dt : ''}.pdf`)
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
