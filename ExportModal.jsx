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

// ── PDF — layout verticale: righe = giorni, colonne = dipendenti ──────────────
function buildAndDownloadPDF(data, from, to, employees) {
  const { jsPDF } = window.jspdf
  if (!jsPDF) { alert('Libreria PDF non caricata, riprova.'); return }

  const dates = getDates(from, to)

  // Ogni colonna dipendente ha 2 sotto-colonne: Pranzo | Cena
  // Colonne: Data | Giorno | Pran_1 | Cena_1 | Pran_2 | Cena_2 | ...
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  // Titolo
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Turni Pizzeria Arcobaleno', 14, 12)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(`Periodo: ${fmtDate(new Date(from))} – ${fmtDate(new Date(to))}`, 14, 18)

  // Intestazione: prima riga = nomi dipendenti (su 2 colonne ciascuno)
  // Seconda riga = Pranzo / Cena per ciascun dipendente
  const headRow1 = ['Data', 'G', ...employees.flatMap(emp => [emp, ''])]
  const headRow2 = ['', '', ...employees.flatMap(() => ['Pranzo', 'Cena'])]

  // Righe dati: una per ogni giorno
  const body = dates.map(d => {
    const ds = toDateStr(d)
    const row = [fmtDate(d), DOW_IT[d.getDay()]]
    employees.forEach(emp => {
      row.push(shiftLabel(data[`${emp}::${ds}::pranzo`], 'pranzo') || '—')
      row.push(shiftLabel(data[`${emp}::${ds}::cena`], 'cena') || '—')
    })
    return row
  })

  // Larghezze colonne
  const pageW = 277
  const margin = 14
  const dateColW = 16
  const dowColW = 7
  const remaining = pageW - margin * 2 - dateColW - dowColW
  const empW = remaining / employees.length
  const subW = empW / 2

  const columnStyles = {
    0: { cellWidth: dateColW, halign: 'center' },
    1: { cellWidth: dowColW, halign: 'center' },
    ...Object.fromEntries(employees.flatMap((_, ei) => [
      [2 + ei*2,     { cellWidth: subW, halign: 'center' }],
      [2 + ei*2 + 1, { cellWidth: subW, halign: 'center' }],
    ]))
  }

  doc.autoTable({
    startY: 22,
    head: [headRow1, headRow2],
    body,
    columnStyles,
    styles: { fontSize: 7, cellPadding: 1.2, valign: 'middle' },
    headStyles: { fillColor: [50, 50, 50], textColor: 255, fontStyle: 'bold', fontSize: 7, halign: 'center' },
    bodyStyles: { textColor: [40, 40, 40] },
    didParseCell(hookData) {
      if (hookData.section === 'head' && hookData.row.index === 0) {
        // Colora intestazione nome dipendente col colore del dipendente
        const col = hookData.column.index
        if (col >= 2 && (col - 2) % 2 === 0) {
          const ei = Math.floor((col - 2) / 2)
          hookData.cell.styles.fillColor = hexToRgb(EMP_COLORS[ei % EMP_COLORS.length].bg)
          hookData.cell.styles.textColor = hexToRgb(EMP_COLORS[ei % EMP_COLORS.length].fg)
          hookData.cell.styles.fontStyle = 'bold'
        }
      }
      if (hookData.section === 'body') {
        const col = hookData.column.index
        if (col >= 2) {
          const ei = Math.floor((col - 2) / 2)
          const { bg, fg } = EMP_COLORS[ei % EMP_COLORS.length]
          hookData.cell.styles.fillColor = hexToRgb(bg)
          hookData.cell.styles.textColor = hexToRgb(fg)
        }
        // Giorno della settimana: colorazione leggera per weekend
        if (col === 1) {
          const dow = hookData.cell.raw
          if (dow === 'Dom') hookData.cell.styles.fillColor = [255, 235, 235]
          else if (dow === 'Sab') hookData.cell.styles.fillColor = [245, 245, 255]
        }
        // FERIE in giallo
        if (hookData.cell.raw === 'FERIE') {
          hookData.cell.styles.fillColor = [254, 243, 205]
          hookData.cell.styles.textColor = [133, 100, 4]
          hookData.cell.styles.fontStyle = 'bold'
        }
      }
    },
    margin: { left: margin, right: margin },
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
