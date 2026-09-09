import { useState } from 'react'
import { PRANZO_MAP, CENA_MAP, addDays, toDateStr, isActivePeriod } from './utils'
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

// Crea date puramente locali dal formato YYYY-MM-DD senza mai passare per UTC
function localDate(str) {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0) // mezzogiorno locale, mai mezzanotte
}

function getDates(from, to) {
  const dates = []
  const cur = localDate(from)
  const end = localDate(to)
  while (cur <= end) {
    dates.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

// Converte data locale in stringa YYYY-MM-DD senza usare toISOString()
function localDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
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
      const ds = localDateStr(d)
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

// ── PDF ───────────────────────────────────────────────────────────────────────
function renderWeekTable(doc, dates, employees, data, startY, pageW, margin, nameColW) {
  const available = pageW - margin * 2 - nameColW
  const dayW = available / dates.length
  const subW = dayW / 2

  const headRow1 = ['Dipendente', ...dates.map(d => ({ content: fmtDate(d), colSpan: 2 }))]
  const headRow2 = ['', ...dates.map(d => ({ content: DOW_IT[d.getDay()], colSpan: 2 }))]
  const headRow3 = ['', ...dates.flatMap(() => ['P', 'C'])]

  const body = employees.map((emp) => {
    const row = [emp]
    dates.forEach(d => {
      const ds = localDateStr(d)
      row.push(shiftLabel(data[`${emp}::${ds}::pranzo`], 'pranzo') || '—')

      const cenaVal = data[`${emp}::${ds}::cena`]
      const cenaTime = shiftLabel(cenaVal, 'cena')
      // Sotto l'orario aggiunge il numero di turno (1-7), più piccolo — non
      // richiesto per il pranzo, che ha solo Q/W.
      const cenaTurno = cenaVal && cenaVal !== 'F' && cenaVal in CENA_MAP ? cenaVal : null
      row.push(cenaTurno ? `${cenaTime}\n${cenaTurno}` : (cenaTime || '—'))
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
    head: [headRow1, headRow2, headRow3],
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
      if (hookData.section === 'head' && (hookData.row.index === 0 || hookData.row.index === 1) && hookData.column.index >= 1) {
        const dateIdx = Math.floor((hookData.column.index - 1) / 2)
        if (dateIdx < dates.length) {
          const dow = dates[dateIdx].getDay()
          if (dow === 0) hookData.cell.styles.fillColor = [160, 30, 30]
          else if (dow === 6) hookData.cell.styles.fillColor = [60, 60, 140]
        }
      }
    },
    // Le celle cena con turno (raw = "orario\nturno") vengono ridisegnate a
    // mano per mostrare il numero di turno più piccolo sotto l'orario: la
    // resa di default userebbe lo stesso corpo per entrambe le righe.
    didDrawCell(hookData) {
      if (hookData.section !== 'body') return
      const raw = hookData.cell.raw
      if (typeof raw !== 'string' || !raw.includes('\n')) return
      const [timeStr, turnoStr] = raw.split('\n')
      const { x, y, width, height } = hookData.cell
      const ei = hookData.row.index
      const { bg, fg } = EMP_COLORS[ei % EMP_COLORS.length]
      const [br, bgn, bb] = hexToRgb(bg)
      const [fr, fgn, fb] = hexToRgb(fg)

      doc.setFillColor(br, bgn, bb)
      doc.rect(x, y, width, height, 'F')
      doc.setTextColor(fr, fgn, fb)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.text(timeStr, x + width / 2, y + height / 2 - 0.6, { align: 'center', baseline: 'middle' })
      doc.setFontSize(5)
      doc.text(turnoStr, x + width / 2, y + height - 1.3, { align: 'center', baseline: 'alphabetic' })
    },
    margin: { left: margin, right: margin },
  })

  return doc.lastAutoTable.finalY
}

function buildAndDownloadPDF(data, from, to, employees, periodiDip) {
  const { jsPDF } = window.jspdf
  if (!jsPDF) { alert('Libreria PDF non caricata, riprova.'); return }

  const allDates = getDates(from, to)

  const weeks = []
  let cur = []
  allDates.forEach(d => {
    cur.push(d)
    if (d.getDay() === 0) { weeks.push(cur); cur = [] }
  })
  if (cur.length > 0) weeks.push(cur)

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
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Turni Pizzeria Arcobaleno', margin, 10)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    if (pages.length > 1) {
      doc.text(`(pagina ${pi+1} di ${pages.length})`, pageW - margin, 10, { align: 'right' })
    }

    let currentY = 13
    pageWeeks.forEach((weekDates) => {
      // Un dipendente compare nella settimana solo se attivo in almeno uno dei
      // suoi giorni (stesso criterio della griglia a schermo): fuori dal suo
      // periodo di attività, o assente per tutta la settimana, la riga sparisce.
      const weekEmployees = employees.filter(emp =>
        weekDates.some(d => isActivePeriod(emp, localDateStr(d), periodiDip))
      )
      if (weekEmployees.length === 0) return
      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(80, 80, 80)
      doc.text(`Settimana: ${fmtDate(weekDates[0])} – ${fmtDate(weekDates[weekDates.length-1])}`, margin, currentY + 3)
      doc.setTextColor(0, 0, 0)
      currentY = renderWeekTable(doc, weekDates, weekEmployees, data, currentY + 5, pageW, margin, nameColW)
      currentY += 6
    })
  })

  const df = fmtDate(localDate(from)).replace(/\//g,'')
  const dt = fmtDate(localDate(to)).replace(/\//g,'')
  doc.save(`turni_${df}${from !== to ? '_'+dt : ''}.pdf`)
}

// ── ICS — fuso orario Europe/Rome, date costruite localmente ──────────────────
async function buildAndDownloadICS(data, from, to, employees) {
  const dates = getDates(from, to)

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pizzeria Arcobaleno//Turni//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-TIMEZONE:Europe/Rome',
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Rome',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10',
    'END:STANDARD',
    'END:VTIMEZONE',
  ]

  let eventCount = 0
  const uid_base = Date.now()

  employees.forEach(emp => {
    dates.forEach(d => {
      const ds = localDateStr(d)
      ;['pranzo', 'cena'].forEach(service => {
        const val = data[`${emp}::${ds}::${service}`]
        if (!val || val === 'F') return
        const map = service === 'pranzo' ? PRANZO_MAP : CENA_MAP
        const timeStr = map[val]
        if (!timeStr) return

        const [h, m] = timeStr.split(':').map(Number)
        const duration = service === 'pranzo' ? 2.5 : 3.5
        let endH = h + Math.floor(duration)
        let endM = m + Math.round((duration % 1) * 60)
        if (endM >= 60) { endH += 1; endM -= 60 }

        const y = d.getFullYear()
        const mo = pad(d.getMonth() + 1)
        const dy = pad(d.getDate())
        const startStr = `${y}${mo}${dy}T${pad(h)}${pad(m)}00`
        const endStr   = `${y}${mo}${dy}T${pad(endH)}${pad(endM)}00`

        const empShort = emp.split(' ')[0]
        const summary = `${empShort} - ${service === 'pranzo' ? 'Pranzo' : 'Cena'} ${timeStr}`

        lines.push('BEGIN:VEVENT')
        lines.push(`UID:${uid_base}-${eventCount++}@arcobaleno`)
        lines.push(`DTSTART;TZID=Europe/Rome:${startStr}`)
        lines.push(`DTEND;TZID=Europe/Rome:${endStr}`)
        lines.push(`SUMMARY:${summary}`)
        lines.push(`DESCRIPTION:Turno ${service} - ${emp}`)
        lines.push('END:VEVENT')
      })
    })
  })

  lines.push('END:VCALENDAR')

  const filename = `turni_${from.replace(/-/g,'')}${from !== to ? '_'+to.replace(/-/g,'') : ''}.ics`
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })

  // Su Android Chrome la Web Share API apre direttamente il foglio di condivisione
  // del sistema (incluso Google Calendar), evitando il problema del file scaricato
  // che Android non associa automaticamente all'app calendario.
  if (navigator.canShare) {
    const file = new File([blob], filename, { type: 'text/calendar' })
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Turni' })
        return
      } catch (e) {
        if (e.name === 'AbortError') return
        // in caso di errore inatteso cade nel download classico
      }
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function ExportModal({ data, currentMonday, employees, periodiDip, onClose }) {
  const monStr = localDateStr(currentMonday)
  const sunStr = localDateStr(addDays(currentMonday, 6))

  const [mode, setMode] = useState('settimana')
  const [from, setFrom] = useState(monStr)
  const [to, setTo] = useState(sunStr)
  const [empMode, setEmpMode] = useState('uno')
  const [selEmp, setSelEmp] = useState(employees[0])

  function getEmployees() {
    if (empMode !== 'tutti') return [selEmp]
    // Esclude chi non è mai attivo in tutto il periodo esportato (es. assente
    // o fuori dal proprio periodo di attività): stesso criterio della griglia.
    const dates = getDates(from, to)
    return employees.filter(emp => dates.some(d => isActivePeriod(emp, localDateStr(d), periodiDip)))
  }

  function handleModeChange(m) {
    setMode(m)
    if (m === 'settimana') { setFrom(monStr); setTo(sunStr) }
  }

  function doXLS() { buildAndDownloadXLS(data, from, to, getEmployees()); onClose() }
  function doPDF() { buildAndDownloadPDF(data, from, to, getEmployees(), periodiDip); onClose() }
  async function doICS() { await buildAndDownloadICS(data, from, to, getEmployees()); onClose() }

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
              {employees.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          )}
        </div>

        <div className={styles.btnRow}>
          <button className={styles.xlsBtn} onClick={doXLS}>⬇ .xlsx</button>
          <button className={styles.pdfBtn} onClick={doPDF}>⬇ PDF</button>
        </div>
        <button className={styles.icsBtn} onClick={doICS}>📅 Esporta su Calendario (.ics)</button>
        <p className={styles.icsNote}>
          Compatibile con Apple Calendario, Google Calendar, Outlook.
          Pranzo: 2h 30min · Cena: 3h 30min
        </p>
      </div>
    </div>
  )
}
