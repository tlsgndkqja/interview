export type EventRow = {
  id: string
  title: string
  start_date: string
  end_date: string
  core_start: string
  core_end: string
  management_code: string
  management_pin: string | null
  finalized_slot_id: string | null
  created_at: string
}

export type EventInsert = {
  title: string
  start_date: string
  end_date: string
  management_code: string
  management_pin: string
}

export type ParticipantRow = {
  id: string
  event_id: string
  name: string
  invite_code: string
  access_pin: string | null
  created_at: string
}

export type ParticipantInsert = {
  event_id: string
  name: string
  invite_code: string
  access_pin: string
}

export type SlotRow = {
  id: string
  event_id: string
  slot_date: string
  start_time: string
  end_time: string
  created_at: string
}

export type SlotInsert = {
  event_id: string
  slot_date: string
  start_time: string
  end_time: string
}

export type AvailabilityRow = {
  participant_id: string
  slot_id: string
  created_at: string
}
