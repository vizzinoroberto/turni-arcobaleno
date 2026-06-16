export const PASSWORD_ADMIN = 'Arco2026'

export const FESTIVI = new Set([
  '01-01','01-06','04-25','05-01','06-02',
  '08-15','11-01','12-08','12-24','12-25','12-26','12-31'
])

export function isFestivo(d) {
  const mm = String(d.getMonth()+1).padStart(2,'0')
  const dd = String(d.getDate()).padStart(2,'0')
  return FESTIVI.has(`${mm}-${dd}`)
}

export function isSummer(d) {
  const m = d.getMonth() + 1 // 1-12
  return m >= 6 && m <= 9
}

// Data di fine contratto per dipendenti con validità limitata
export const EMPLOYEE_PERIODS = {
  'Nicole Cavalli': { to: '2026-09-30' }
}
export const PASSWORD_STAFF = 'arcoturni'

export const EMPLOYEES = [
  'Francesca Novello',
  'Benedetta Pagliarusco',
  'Giulia Nascinguerra',
  'Aurora Nascinguerra',
  'Sara Tondo',
  'Ilaria Pontarollo',
  'Nicole Cavalli',
]

export const DOW_LABELS = ['D', 'L', 'M', 'M', 'G', 'V', 'S']

export const PRANZO_MAP = { Q: '11:30', W: '12:00' }

export const CENA_MAP = {
  '1': '18:00', '2': '18:00', '3': '18:30', '4': '18:30',
  '5': '19:00', '6': '19:30', '7': '19:30',
}

function pad(n) { return String(n).padStart(2, '0') }

export function getMonday(d) {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const m = new Date(d)
  m.setDate(d.getDate() + diff)
  m.setHours(0, 0, 0, 0)
  return m
}

export function addDays(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

// FIX BUG: usa data locale invece di toISOString() che converte in UTC
// causando shift di -1 giorno nei fusi orari positivi (Italia UTC+1/+2)
export function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
}

export function formatDateVertical(d) {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(2)
  return `${dd}/${mm}/${yy}`
}

export function formatDateShort(d) { return `${d.getDate()}/${d.getMonth() + 1}` }

export function isWeekend(d) { return d.getDay() === 6 || d.getDay() === 0 }
export function isSunday(d) { return d.getDay() === 0 }

export function getWeekDays(monday) {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

export function shiftToDisplay(val, service) {
  if (!val) return null
  if (val === 'F') return { type: 'ferie' }
  const map = service === 'pranzo' ? PRANZO_MAP : CENA_MAP
  const time = map[val]
  if (!time) return null
  return { type: 'shift', time, num: val }
}
