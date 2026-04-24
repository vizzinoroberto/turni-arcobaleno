export const PASSWORD_ADMIN = 'Arco2026'
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

export function toDateStr(d) { return d.toISOString().slice(0, 10) }

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
