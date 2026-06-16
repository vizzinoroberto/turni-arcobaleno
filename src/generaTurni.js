import { EMPLOYEES, getMonday, addDays, toDateStr, getWeekDays, isFestivo, isSummer, EMPLOYEE_PERIODS } from './utils'

const FRANCESCA = 'Francesca Novello'

function isEmpExcluded(emp, dateStr, eccezioni) {
  // Controlla fine contratto
  const period = EMPLOYEE_PERIODS[emp]
  if (period?.to && dateStr > period.to) return true
  if (period?.from && dateStr < period.from) return true
  // Controlla eccezioni manuali
  return eccezioni.some(e => e.emp === emp && dateStr >= e.from && dateStr <= e.to)
}

// Trova il dipendente con il turno sabato più vicino a turnoTarget,
// scendendo se il target è occupato da Francesca o da chi è a riposo.
function empConTurnoSabato(satTurno, turnoTarget, restingEmp) {
  let t = turnoTarget
  while (t >= 1) {
    const emp = Object.entries(satTurno).find(([, v]) => v === t)?.[0]
    if (emp && emp !== FRANCESCA && emp !== restingEmp) return emp
    t--
  }
  return null
}

export function generaTurni(fromDate, toDate, startingOrder, figureAssenzePerSettimana, eccezioni = []) {
  // startingOrder: array di dipendenti ordinati per turno sabato (index 0 = turno 1) nella prima settimana
  // figureAssenzePerSettimana: { 'YYYY-MM-DD' (lunedì): [nomi figure assenti] }
  // eccezioni: [{ emp, from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }]

  const records = []
  let monday = getMonday(fromDate)
  const lastMonday = getMonday(toDate)
  let weekOffset = 0

  while (monday <= lastMonday) {
    const weekStr = toDateStr(monday)
    const days = getWeekDays(monday)
    const saturdayStr = toDateStr(days[5])

    // Rotazione: il "capo" di questa settimana è startingOrder[weekOffset % n]
    // Poi filtriamo gli esclusi (Nicole dopo il 30/09, eccezioni manuali)
    const headIdx = weekOffset % startingOrder.length
    const rotatedFull = [...startingOrder.slice(headIdx), ...startingOrder.slice(0, headIdx)]
    const rotated = rotatedFull.filter(emp => !isEmpExcluded(emp, saturdayStr, eccezioni))

    const n = rotated.length
    if (n === 0) { monday = addDays(monday, 7); weekOffset++; continue }

    const figureAssenti = figureAssenzePerSettimana[weekStr] || []
    const hasAbsentFigure = figureAssenti.length > 0
    // Con figura assente: tutti lavorano (nessuno a riposo)
    // Senza figura assente: 1 a riposo
    const maxTurno = hasAbsentFigure ? n : Math.max(n - 1, 1)

    // Assegna turni sabato: rotated[0]=turno1 … rotated[maxTurno-1]=turnoMax
    const satTurno = {}
    rotated.forEach((emp, i) => {
      if (i < maxTurno) satTurno[emp] = i + 1
    })
    const restingEmp = n > maxTurno ? rotated[maxTurno] : null
    const activeEmps = rotated.slice(0, maxTurno)

    // Turni domenica: speculare al sabato
    const sunTurno = {}
    activeEmps.forEach(emp => {
      sunTurno[emp] = (maxTurno + 1) - satTurno[emp]
    })

    // Chi viene giovedì: ultimo turno sabato (non Francesca)
    const thurEmp = empConTurnoSabato(satTurno, maxTurno, restingEmp)

    // Chi viene venerdì: turno 3 sabato (non Francesca)
    const friEmp = empConTurnoSabato(satTurno, Math.min(3, maxTurno), restingEmp)

    // Pranzo domenica: domenica turno 1 → Q, turno 2 → W
    const pranzoQ = Object.entries(sunTurno).find(([, t]) => t === 1)?.[0]
    const pranzoW = Object.entries(sunTurno).find(([, t]) => t === 2)?.[0]

    days.forEach(day => {
      if (day < fromDate || day > toDate) return

      const ds = toDateStr(day)
      const dow = day.getDay()
      const summer = isSummer(day)
      const festivo = isFestivo(day)

      const excluded = emp => isEmpExcluded(emp, ds, eccezioni)

      if (dow === 1 && !festivo) return // Lunedì chiuso

      if (dow === 2 && summer && !excluded(FRANCESCA)) {
        records.push({ key: `${FRANCESCA}::${ds}::cena`, val: '5' })
      }

      if (dow === 3 && summer && !excluded(FRANCESCA)) {
        records.push({ key: `${FRANCESCA}::${ds}::cena`, val: '5' })
      }

      if (dow === 4 && thurEmp && !excluded(thurEmp)) {
        records.push({ key: `${thurEmp}::${ds}::cena`, val: '5' })
      }

      if (dow === 5) {
        if (summer && !excluded(FRANCESCA)) {
          records.push({ key: `${FRANCESCA}::${ds}::cena`, val: '5' })
        }
        if (friEmp && !excluded(friEmp)) {
          records.push({ key: `${friEmp}::${ds}::cena`, val: '4' })
        }
      }

      if (dow === 6) {
        activeEmps.forEach(emp => {
          records.push({ key: `${emp}::${ds}::cena`, val: String(satTurno[emp]) })
        })
      }

      if (dow === 0 || (festivo && dow !== 6)) {
        // Domenica o festivo: ricontrolla esclusioni per il giorno specifico
        const activeSun = activeEmps.filter(emp => !excluded(emp))
        activeSun.forEach(emp => {
          records.push({ key: `${emp}::${ds}::cena`, val: String(sunTurno[emp]) })
        })
        if (pranzoQ && !excluded(pranzoQ)) {
          records.push({ key: `${pranzoQ}::${ds}::pranzo`, val: 'Q' })
        }
        if (pranzoW && !excluded(pranzoW)) {
          records.push({ key: `${pranzoW}::${ds}::pranzo`, val: 'W' })
        }
      }
    })

    monday = addDays(monday, 7)
    weekOffset++
  }

  return records
}
