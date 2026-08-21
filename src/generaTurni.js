import { EMPLOYEES, getMonday, addDays, toDateStr, getWeekDays, isFestivo, isSummer, EMPLOYEE_PERIODS } from './utils'

const FRANCESCA = 'Francesca Novello'

// Controllo per-giorno (usato per mar/mer/gio/ven/dom)
function isEmpExcluded(emp, dateStr, eccezioni) {
  const period = EMPLOYEE_PERIODS[emp]
  if (period?.to && dateStr > period.to) return true
  if (period?.from && dateStr < period.from) return true
  return eccezioni.some(e => e.emp === emp && dateStr >= e.from && dateStr <= e.to)
}

// Controllo per la rotazione weekend: esclude chi ha un'eccezione che copre
// sabato O domenica (se manca la domenica, non deve lavorare neanche il sabato)
function isEmpExcludedWeekend(emp, satStr, sunStr, eccezioni) {
  const period = EMPLOYEE_PERIODS[emp]
  if (period?.to && satStr > period.to) return true
  if (period?.from && satStr < period.from) return true
  return eccezioni.some(e =>
    e.emp === emp && (
      (satStr >= e.from && satStr <= e.to) ||
      (sunStr >= e.from && sunStr <= e.to)
    )
  )
}

// Cerca il dipendente con turnoTarget, scendendo se è Francesca o a riposo.
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
  // Ritorna { toUpsert: [{key, val}], toDelete: [key] }
  const toUpsert = []
  const toDelete = []

  let monday = getMonday(fromDate)
  const lastMonday = getMonday(toDate)
  let weekOffset = 0

  while (monday <= lastMonday) {
    const weekStr = toDateStr(monday)
    const days = getWeekDays(monday)
    const satStr = toDateStr(days[5])
    const sundayStr = toDateStr(days[6])

    // Rotazione settimanale basata sul sabato
    const headIdx = weekOffset % startingOrder.length
    const rotatedFull = [...startingOrder.slice(headIdx), ...startingOrder.slice(0, headIdx)]
    const rotated = rotatedFull.filter(emp => !isEmpExcludedWeekend(emp, satStr, sundayStr, eccezioni))

    const n = rotated.length
    if (n === 0) { monday = addDays(monday, 7); weekOffset++; continue }

    const figureAssenti = figureAssenzePerSettimana[weekStr] || []
    const hasWeekendAbsence = eccezioni.some(e =>
      (satStr >= e.from && satStr <= e.to) ||
      (sundayStr >= e.from && sundayStr <= e.to)
    )
    // Figura assente o indisponibilità weekend → tutti i presenti lavorano (maxTurno = n)
    // Nessuna assenza → 1 a riposo (maxTurno = n - 1)
    const maxTurno = (figureAssenti.length > 0 || hasWeekendAbsence) ? n : Math.max(n - 1, 1)

    const satTurno = {}
    rotated.forEach((emp, i) => {
      if (i < maxTurno) satTurno[emp] = i + 1
    })
    const restingEmp = n > maxTurno ? rotated[maxTurno] : null
    const activeEmps = rotated.filter((_, i) => i < maxTurno)

    const sunTurno = {}
    activeEmps.forEach(emp => { sunTurno[emp] = (maxTurno + 1) - satTurno[emp] })

    // Giovedì: ultimo turno sabato (non Francesca, non a riposo)
    const thurEmp = empConTurnoSabato(satTurno, maxTurno, restingEmp)
    // Venerdì: turno 3 sabato (non Francesca, non a riposo)
    const friEmp = empConTurnoSabato(satTurno, Math.min(3, maxTurno), restingEmp)
    // Pranzo domenica/festivi: domenica turno 1 → Q, turno 2 → W
    const pranzoQ = Object.entries(sunTurno).find(([, t]) => t === 1)?.[0]
    const pranzoW = Object.entries(sunTurno).find(([, t]) => t === 2)?.[0]

    // Chi lavora il venerdì (friEmp) sta a casa il sabato e lavora la domenica:
    // il suo turno del sabato viene tolto e chi aveva un turno successivo scala
    // di uno, così non restano buchi nei turni 1-5. Si applica solo se restano
    // almeno un turno attivo il sabato senza friEmp (maxTurno >= 2).
    const friTurno = friEmp ? satTurno[friEmp] : null
    const satEmps = friTurno && maxTurno >= 2
      ? activeEmps.filter(emp => emp !== friEmp)
      : activeEmps
    const satTurnoSab = {}
    satEmps.forEach(emp => {
      const t = satTurno[emp]
      satTurnoSab[emp] = friTurno && maxTurno >= 2 && t > friTurno ? t - 1 : t
    })

    days.forEach(day => {
      if (day < fromDate || day > toDate) return

      const ds = toDateStr(day)
      const dow = day.getDay() // 0=dom 1=lun 2=mar 3=mer 4=gio 5=ven 6=sab
      const summer = isSummer(day)
      const festivo = isFestivo(day)
      const excl = emp => isEmpExcluded(emp, ds, eccezioni)

      // cena[emp] e pranzo[emp]: undefined = cancella, stringa = scrivi
      const cena = {}
      const pranzo = {}

      if (dow === 1 && !festivo) {
        // Lunedì chiuso: tutto cancellato (cena e pranzo rimangono undefined)
      } else if (dow === 6) {
        // Sabato: attivi con il loro turno cena (friEmp escluso, vedi satEmps)
        satEmps.forEach(emp => { if (!excl(emp)) cena[emp] = String(satTurnoSab[emp]) })
      } else if (dow === 0 || (dow === 1 && festivo)) {
        // Domenica o lunedì festivo: attivi con turno domenica
        activeEmps.forEach(emp => { if (!excl(emp)) cena[emp] = String(sunTurno[emp]) })
      } else {
        // Martedì–Venerdì (+ festivi non lun/sab/dom)
        if (dow === 2 && summer && !excl(FRANCESCA)) cena[FRANCESCA] = '5'
        if (dow === 3 && summer && !excl(FRANCESCA)) cena[FRANCESCA] = '5'
        if (dow === 4 && summer && thurEmp && !excl(thurEmp))  cena[thurEmp] = '5'
        if (dow === 5) {
          if (summer && !excl(FRANCESCA)) cena[FRANCESCA] = '5'
          if (friEmp && !excl(friEmp))    cena[friEmp] = '4'
        }
      }

      // Pranzo: solo domenica e festivi (sabato escluso)
      if ((dow === 0 || festivo) && dow !== 6) {
        if (pranzoQ && !excl(pranzoQ)) pranzo[pranzoQ] = 'Q'
        if (pranzoW && !excl(pranzoW)) pranzo[pranzoW] = 'W'
      }

      // Emetti record per tutti i dipendenti
      EMPLOYEES.forEach(emp => {
        const cKey = `${emp}::${ds}::cena`
        const pKey = `${emp}::${ds}::pranzo`
        if (cena[emp] !== undefined) toUpsert.push({ key: cKey, val: cena[emp] })
        else                          toDelete.push(cKey)
        if (pranzo[emp] !== undefined) toUpsert.push({ key: pKey, val: pranzo[emp] })
        else                           toDelete.push(pKey)
      })
    })

    monday = addDays(monday, 7)
    // Se nessuno ha riposato naturalmente (assenza coatta o figura assente),
    // non avanzare la rotazione: la settimana dopo riparte da dove si era rimasti.
    if (!hasWeekendAbsence && figureAssenti.length === 0) weekOffset++
  }

  return { toUpsert, toDelete }
}
