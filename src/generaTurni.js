import { EMPLOYEES, getMonday, addDays, toDateStr, getWeekDays, isFestivo, isSummer } from './utils'

const FRANCESCA = 'Francesca Novello'

// Restituisce l'impiegato con il turno sabato richiesto, escludendo Francesca.
// Se quella posizione è occupata da Francesca, prende quella precedente.
function empConTurnoSabato(satTurno, turnoTarget, restingEmp) {
  // cerca il target, poi scala di 1 se è Francesca o se è a riposo
  let t = turnoTarget
  while (t >= 1) {
    const emp = Object.entries(satTurno).find(([e, v]) => v === t)?.[0]
    if (emp && emp !== FRANCESCA && emp !== restingEmp) return emp
    t--
  }
  return null
}

export function generaTurni(fromDate, toDate, startingOrder, figureAssenzePerSettimana) {
  // startingOrder: array di 7 nomi dipendenti, index 0 = sabato turno 1 nella prima settimana
  // figureAssenzePerSettimana: { 'YYYY-MM-DD' (lunedì): [nomi figure assenti] }

  const records = []

  // Prima settimana: il lunedì che contiene fromDate
  let monday = getMonday(fromDate)
  const lastMonday = getMonday(toDate)

  let weekOffset = 0

  while (monday <= lastMonday) {
    const weekStr = toDateStr(monday)
    const days = getWeekDays(monday) // [Lun, Mar, Mer, Gio, Ven, Sab, Dom]

    const figureAssenti = figureAssenzePerSettimana[weekStr] || []
    const hasAbsentFigure = figureAssenti.length > 0
    const maxTurno = hasAbsentFigure ? 7 : 6

    // Calcola turno sabato per ogni dipendente questa settimana
    // index i → turno ((i + weekOffset) % 7) + 1
    const satTurno = {}
    startingOrder.forEach((emp, i) => {
      satTurno[emp] = ((i + weekOffset) % 7) + 1
    })

    // Chi è a riposo: chi ha turno 7 (solo quando maxTurno === 6)
    const restingEmp = maxTurno === 6
      ? Object.entries(satTurno).find(([, t]) => t === 7)?.[0]
      : null

    // Dipendenti attivi al weekend
    const activeEmps = EMPLOYEES.filter(e => e !== restingEmp)

    // Turno domenica: speculare al sabato → sunTurno = (maxTurno + 1) - satTurno
    const sunTurno = {}
    activeEmps.forEach(emp => {
      sunTurno[emp] = (maxTurno + 1) - satTurno[emp]
    })

    // Chi viene giovedì: chi ha l'ultimo turno sabato (maxTurno), non Francesca
    const thurEmp = empConTurnoSabato(satTurno, maxTurno, restingEmp)

    // Chi viene venerdì con turno 4: chi ha turno 3 sabato, non Francesca
    const friEmp = empConTurnoSabato(satTurno, 3, restingEmp)

    // Chi fa pranzo domenica: domenica turno 1 → Q, domenica turno 2 → W
    const pranzoQ = Object.entries(sunTurno).find(([, t]) => t === 1)?.[0]
    const pranzoW = Object.entries(sunTurno).find(([, t]) => t === 2)?.[0]

    days.forEach(day => {
      // Salta giorni fuori dal range richiesto
      if (day < fromDate || day > toDate) return

      const ds = toDateStr(day)
      const dow = day.getDay() // 0=dom, 1=lun, 2=mar, 3=mer, 4=gio, 5=ven, 6=sab
      const summer = isSummer(day)
      const festivo = isFestivo(day)

      if (dow === 1 && !festivo) return // Lunedì: chiuso

      if (dow === 2 && summer) {
        // Martedì estate: solo Francesca cena=5
        records.push({ key: `${FRANCESCA}::${ds}::cena`, val: '5' })
      }

      if (dow === 3 && summer) {
        // Mercoledì estate: solo Francesca cena=5
        records.push({ key: `${FRANCESCA}::${ds}::cena`, val: '5' })
      }

      if (dow === 4) {
        // Giovedì: chi ha l'ultimo turno sabato (non Francesca), cena=5
        if (thurEmp) records.push({ key: `${thurEmp}::${ds}::cena`, val: '5' })
      }

      if (dow === 5) {
        // Venerdì: Francesca cena=5 (solo estate), + chi ha turno 3 sabato cena=4
        if (summer) records.push({ key: `${FRANCESCA}::${ds}::cena`, val: '5' })
        if (friEmp) records.push({ key: `${friEmp}::${ds}::cena`, val: '4' })
      }

      if (dow === 6) {
        // Sabato: tutti gli attivi con il loro turno, cena
        activeEmps.forEach(emp => {
          records.push({ key: `${emp}::${ds}::cena`, val: String(satTurno[emp]) })
        })
      }

      if (dow === 0 || (festivo && dow !== 6)) {
        // Domenica e festivi (non sabato): cena con turni domenica + pranzo Q/W
        const empsToUse = dow === 0 ? activeEmps : activeEmps
        empsToUse.forEach(emp => {
          records.push({ key: `${emp}::${ds}::cena`, val: String(sunTurno[emp]) })
        })
        if (pranzoQ) records.push({ key: `${pranzoQ}::${ds}::pranzo`, val: 'Q' })
        if (pranzoW) records.push({ key: `${pranzoW}::${ds}::pranzo`, val: 'W' })
      }
    })

    monday = addDays(monday, 7)
    weekOffset++
  }

  return records
}
