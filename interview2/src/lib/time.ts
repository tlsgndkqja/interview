import { holidays } from '@kyungseopk1m/holidays-kr'

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
  return buildHourlySlotsExcludingDates(startDate, endDate, new Set<string>())
}

export function buildHourlySlotsExcludingDates(
  startDate: string,
  endDate: string,
  excludedDates: Set<string>,
): SlotTemplate[] {
  if (!startDate || !endDate || endDate < startDate) {
    return []
  }

  const result: SlotTemplate[] = []
  const cursor = new Date(`${startDate}T00:00:00`)
  const last = new Date(`${endDate}T00:00:00`)

  while (cursor <= last) {
    const dateText = toDateInputValue(cursor)
    const day = cursor.getDay()
    const isWeekend = day === 0 || day === 6

    if (!isWeekend && !excludedDates.has(dateText)) {
      for (let hour = 10; hour < 17; hour += 1) {
        result.push({
          slot_date: dateText,
          start_time: `${String(hour).padStart(2, '0')}:00`,
          end_time: `${String(hour + 1).padStart(2, '0')}:00`,
        })
      }
    }

    cursor.setDate(cursor.getDate() + 1)
  }

  return result
}

export function randomCode() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

export function randomPin() {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0')
}

export function formatDateRange(startDate: string, endDate: string) {
  return `${formatDate(startDate)} ~ ${formatDate(endDate)}`
}

export function formatDate(dateText: string) {
  return dateFormatter.format(new Date(`${dateText}T00:00:00`))
}

export function formatSlotLabel(slot: SlotTemplate) {
  return `${formatDate(slot.slot_date)} ${formatTimeValue(slot.start_time)} - ${formatTimeValue(slot.end_time)}`
}

export function formatTimeValue(value: string) {
  return value.slice(0, 5)
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

export async function loadExcludedHolidayDates(startDate: string, endDate: string) {
  if (!startDate || !endDate || endDate < startDate) {
    return new Set<string>()
  }

  const startYear = Number(startDate.slice(0, 4))
  const endYear = Number(endDate.slice(0, 4))
  const result = await holidays(String(startYear), String(endYear))

  if (!result.success) {
    throw new Error(result.message || '공휴일 정보를 불러오지 못했습니다.')
  }

  return new Set(
    result.data
      .map((item) => String(item.date))
      .map((value) => `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`),
  )
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
