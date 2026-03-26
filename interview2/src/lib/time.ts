type SlotTemplate = {
  slot_date: string
  start_time: string
  end_time: string
}

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  month: 'long',
  day: 'numeric',
  weekday: 'short',
})

export function buildHourlySlots(startDate: string, endDate: string): SlotTemplate[] {
  if (!startDate || !endDate || endDate < startDate) {
    return []
  }

  const result: SlotTemplate[] = []
  const cursor = new Date(`${startDate}T00:00:00`)
  const last = new Date(`${endDate}T00:00:00`)

  while (cursor <= last) {
    const dateText = toDateInputValue(cursor)
    for (let hour = 10; hour < 17; hour += 1) {
      result.push({
        slot_date: dateText,
        start_time: `${String(hour).padStart(2, '0')}:00`,
        end_time: `${String(hour + 1).padStart(2, '0')}:00`,
      })
    }
    cursor.setDate(cursor.getDate() + 1)
  }

  return result
}

export function randomCode() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

export function formatDateRange(startDate: string, endDate: string) {
  return `${formatDate(startDate)} ~ ${formatDate(endDate)}`
}

export function formatDate(dateText: string) {
  return dateFormatter.format(new Date(`${dateText}T00:00:00`))
}

export function formatSlotLabel(slot: SlotTemplate) {
  return `${formatDate(slot.slot_date)} ${slot.start_time} - ${slot.end_time}`
}

export function getSlotKey(slot: SlotTemplate) {
  return `${slot.slot_date}-${slot.start_time}`
}

export function getBaseUrl() {
  return window.location.origin
}

export function getTodayInputValue() {
  return toDateInputValue(new Date())
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
