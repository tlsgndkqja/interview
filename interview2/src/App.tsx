import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { BrowserRouter, Link, Route, Routes, useParams } from 'react-router-dom'
import './App.css'
import { supabase } from './lib/supabase'
import type {
  AvailabilityRow,
  EventInsert,
  EventRow,
  ParticipantInsert,
  ParticipantRow,
  SlotInsert,
  SlotRow,
} from './types'
import {
  buildHourlySlots,
  formatDate,
  formatDateRange,
  formatSlotLabel,
  getBaseUrl,
  getSlotKey,
  getTodayInputValue,
  randomCode,
} from './lib/time'

type EventBundle = {
  event: EventRow
  participants: ParticipantRow[]
  slots: SlotRow[]
  availability: AvailabilityRow[]
}

type CreatedLinks = {
  managementLink: string
  participantLinks: Array<{ name: string; link: string }>
}

const defaultParticipants = ['', '', '']
const participantExamples = ['예: 김민수', '예: 박서연', '예: 이도현']

function groupSlotsByDate<T extends { slot_date: string }>(slots: T[]) {
  const groups = new Map<string, T[]>()

  slots.forEach((slot) => {
    const current = groups.get(slot.slot_date) ?? []
    current.push(slot)
    groups.set(slot.slot_date, current)
  })

  return Array.from(groups.entries()).map(([date, items]) => ({
    date,
    items,
  }))
}

async function fetchManageBundle(managementCode: string): Promise<EventBundle> {
  const { data: eventRow, error: eventError } = await supabase
    .from('interview_events')
    .select('*')
    .eq('management_code', managementCode)
    .single()

  if (eventError || !eventRow) {
    throw eventError ?? new Error('일정을 찾을 수 없습니다.')
  }

  const [{ data: participants, error: participantError }, { data: slots, error: slotError }] =
    await Promise.all([
      supabase
        .from('interview_participants')
        .select('*')
        .eq('event_id', eventRow.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('interview_slots')
        .select('*')
        .eq('event_id', eventRow.id)
        .order('slot_date', { ascending: true })
        .order('start_time', { ascending: true }),
    ])

  if (participantError) {
    throw participantError
  }

  if (slotError) {
    throw slotError
  }

  const participantIds = (participants ?? []).map((participant) => participant.id)
  const { data: availability, error: availabilityError } = participantIds.length
    ? await supabase
        .from('participant_availability')
        .select('*')
        .in('participant_id', participantIds)
    : { data: [], error: null }

  if (availabilityError) {
    throw availabilityError
  }

  return {
    event: eventRow,
    participants: participants ?? [],
    slots: slots ?? [],
    availability: availability ?? [],
  }
}

async function fetchInviteBundle(inviteCode: string) {
  const { data: participantRow, error: participantError } = await supabase
    .from('interview_participants')
    .select('*')
    .eq('invite_code', inviteCode)
    .single()

  if (participantError || !participantRow) {
    throw participantError ?? new Error('초대 링크를 찾을 수 없습니다.')
  }

  const [{ data: eventRow, error: eventError }, { data: slots, error: slotError }] =
    await Promise.all([
      supabase.from('interview_events').select('*').eq('id', participantRow.event_id).single(),
      supabase
        .from('interview_slots')
        .select('*')
        .eq('event_id', participantRow.event_id)
        .order('slot_date', { ascending: true })
        .order('start_time', { ascending: true }),
    ])

  if (eventError || !eventRow) {
    throw eventError ?? new Error('일정 정보를 불러오지 못했습니다.')
  }

  if (slotError) {
    throw slotError
  }

  const { data: participants, error: participantsError } = await supabase
    .from('interview_participants')
    .select('*')
    .eq('event_id', participantRow.event_id)
    .order('created_at', { ascending: true })

  if (participantsError) {
    throw participantsError
  }

  const participantIds = (participants ?? []).map((item) => item.id)
  const { data: availability, error: availabilityError } = participantIds.length
    ? await supabase
        .from('participant_availability')
        .select('*')
        .in('participant_id', participantIds)
    : { data: [], error: null }

  if (availabilityError) {
    throw availabilityError
  }

  return {
    participant: participantRow,
    bundle: {
      event: eventRow,
      participants: participants ?? [],
      slots: slots ?? [],
      availability: availability ?? [],
    },
  }
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/manage/:managementCode" element={<ManagePage />} />
        <Route path="/invite/:inviteCode" element={<InvitePage />} />
      </Routes>
    </BrowserRouter>
  )
}

function HomePage() {
  const today = getTodayInputValue()
  const [title, setTitle] = useState('백엔드 개발자 1차 면접')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [participants, setParticipants] = useState(defaultParticipants)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdLinks, setCreatedLinks] = useState<CreatedLinks | null>(null)

  const slotPreview = useMemo(
    () => buildHourlySlots(startDate, endDate).slice(0, 6),
    [endDate, startDate],
  )
  const totalSlotCount = useMemo(
    () => buildHourlySlots(startDate, endDate).length,
    [endDate, startDate],
  )

  const updateParticipant = (index: number, value: string) => {
    setParticipants((current) =>
      current.map((name, nameIndex) => (nameIndex === index ? value : name)),
    )
  }

  const addParticipant = () => {
    setParticipants((current) => [...current, ''])
  }

  const removeParticipant = (index: number) => {
    setParticipants((current) => current.filter((_, nameIndex) => nameIndex !== index))
  }

  const handleSubmit = async (submitEvent: FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault()
    setError(null)

    const trimmedParticipants = participants.map((name) => name.trim()).filter(Boolean)

    if (!title.trim()) {
      setError('면접 일정 이름을 입력해 주세요.')
      return
    }

    if (!startDate || !endDate || endDate < startDate) {
      setError('시작일과 종료일을 다시 확인해 주세요.')
      return
    }

    if (trimmedParticipants.length === 0) {
      setError('최소 한 명 이상의 면접관 이름이 필요합니다.')
      return
    }

    const slotTemplates = buildHourlySlots(startDate, endDate)
    if (slotTemplates.length === 0) {
      setError('선택된 기간에 생성할 수 있는 시간이 없습니다.')
      return
    }

    setIsSubmitting(true)

    try {
      const managementCode = randomCode()
      const eventPayload: EventInsert = {
        title: title.trim(),
        start_date: startDate,
        end_date: endDate,
        management_code: managementCode,
      }

      const { data: insertedEvent, error: eventError } = await supabase
        .from('interview_events')
        .insert(eventPayload)
        .select('*')
        .single()

      if (eventError || !insertedEvent) {
        throw eventError ?? new Error('일정을 저장하지 못했습니다.')
      }

      const participantPayload: ParticipantInsert[] = trimmedParticipants.map((name) => ({
        event_id: insertedEvent.id,
        invite_code: randomCode(),
        name,
      }))

      const { data: insertedParticipants, error: participantError } = await supabase
        .from('interview_participants')
        .insert(participantPayload)
        .select('*')

      if (participantError || !insertedParticipants) {
        throw participantError ?? new Error('면접관 정보를 저장하지 못했습니다.')
      }

      const slotPayload: SlotInsert[] = slotTemplates.map((slot) => ({
        event_id: insertedEvent.id,
        slot_date: slot.slot_date,
        start_time: slot.start_time,
        end_time: slot.end_time,
      }))

      const { error: slotError } = await supabase.from('interview_slots').insert(slotPayload)
      if (slotError) {
        throw slotError
      }

      const baseUrl = getBaseUrl()
      setCreatedLinks({
        managementLink: `${baseUrl}/manage/${managementCode}`,
        participantLinks: insertedParticipants.map((participant) => ({
          name: participant.name,
          link: `${baseUrl}/invite/${participant.invite_code}`,
        })),
      })
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : '일정을 생성하는 중 오류가 발생했습니다.'
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="page-shell">
      <section className="hero-panel">
        <div className="eyebrow">채용 면접 일정 조율</div>
        <h1>로그인 없이 링크만으로 면접 시간을 모으고 확정하세요.</h1>
        <p className="hero-copy">
          인사 담당자가 기간만 입력하면 업무 코어 타임인 10:00~17:00 기준으로 1시간 단위
          슬롯이 자동 생성됩니다. 생성 후에는 관리 링크 1개와 면접관별 초대 링크가 바로
          준비됩니다.
        </p>
        <div className="hero-stats">
          <div>
            <strong>기본 시간대</strong>
            <span>10:00 ~ 17:00</span>
          </div>
          <div>
            <strong>생성 방식</strong>
            <span>1시간 단위 자동 생성</span>
          </div>
          <div>
            <strong>참여 방식</strong>
            <span>로그인 없는 URL 참여</span>
          </div>
        </div>
      </section>

      <section className="content-grid">
        <form className="card form-card" onSubmit={handleSubmit}>
          <div className="card-head">
            <div>
              <h2>면접 일정 만들기</h2>
              <p>시작일과 종료일을 넣으면 날짜별 시간 슬롯을 자동으로 생성합니다.</p>
            </div>
            <span className="chip">{totalSlotCount}개 시간대 예정</span>
          </div>

          <label className="field">
            <span>일정 이름</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          <div className="field-grid">
            <label className="field">
              <span>시작일</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <label className="field">
              <span>종료일</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          </div>

          <div className="participant-block">
            <div className="participant-head">
              <div>
                <h3>면접관</h3>
                <p>기본값은 A, B, C이며 필요하면 더 추가할 수 있습니다.</p>
              </div>
              <button className="secondary-button" type="button" onClick={addParticipant}>
                면접관 추가
              </button>
            </div>

            <div className="participant-list">
              {participants.map((participant, index) => (
                <div className="participant-row" key={index}>
                  <div className="participant-input-group">
                    <span className="participant-label">
                      면접관 {String.fromCharCode(65 + index)}
                    </span>
                    <input
                      value={participant}
                      placeholder={participantExamples[index] ?? '면접관 이름을 입력해 주세요'}
                      onChange={(e) => updateParticipant(index, e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => removeParticipant(index)}
                    disabled={participants.length === 1}
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="preview-box">
            <h3>자동 생성 예시</h3>
            <p>{formatDateRange(startDate, endDate)} 기준으로 아래와 같은 시간이 만들어집니다.</p>
            <div className="preview-slots">
              {slotPreview.map((slot) => (
                <span key={getSlotKey(slot)}>{formatSlotLabel(slot)}</span>
              ))}
              {totalSlotCount > slotPreview.length ? <span>...</span> : null}
            </div>
          </div>

          {error ? <p className="error-text">{error}</p> : null}

          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? '생성 중...' : '면접 일정 생성'}
          </button>
        </form>

        <aside className="card result-card">
          <div className="card-head">
            <div>
              <h2>생성 결과</h2>
              <p>일정을 만들면 관리 링크와 초대 링크가 여기에 표시됩니다.</p>
            </div>
          </div>

          {createdLinks ? (
            <div className="link-result">
              <div className="link-group">
                <h3>인사 담당자 관리 링크</h3>
                <a href={createdLinks.managementLink}>{createdLinks.managementLink}</a>
              </div>

              <div className="link-group">
                <h3>면접관 초대 링크</h3>
                {createdLinks.participantLinks.map((item) => (
                  <div className="invite-link-row" key={item.link}>
                    <strong>{item.name}</strong>
                    <a href={item.link}>{item.link}</a>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <p>아직 생성된 일정이 없습니다.</p>
              <p>오른쪽 폼을 제출하면 바로 링크를 확인할 수 있습니다.</p>
            </div>
          )}
        </aside>
      </section>
    </main>
  )
}

function ManagePage() {
  const { managementCode = '' } = useParams()
  const [bundle, setBundle] = useState<EventBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingSlotId, setSavingSlotId] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      setLoading(true)
      setError(null)

      try {
        setBundle(await fetchManageBundle(managementCode))
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : '관리 페이지를 불러오지 못했습니다.'
        setError(message)
      } finally {
        setLoading(false)
      }
    })()
  }, [managementCode])

  const availabilityBySlot = useMemo(() => {
    if (!bundle) {
      return new Map<string, Set<string>>()
    }

    const map = new Map<string, Set<string>>()
    bundle.availability.forEach((row) => {
      const current = map.get(row.slot_id) ?? new Set<string>()
      current.add(row.participant_id)
      map.set(row.slot_id, current)
    })
    return map
  }, [bundle])

  const commonSlotIds = useMemo(() => {
    if (!bundle || bundle.participants.length === 0) {
      return new Set<string>()
    }

    return new Set(
      bundle.slots
        .filter(
          (slot) => (availabilityBySlot.get(slot.id)?.size ?? 0) === bundle.participants.length,
        )
        .map((slot) => slot.id),
    )
  }, [availabilityBySlot, bundle])

  const highestOverlapCount = useMemo(() => {
    if (!bundle || bundle.slots.length === 0) {
      return 0
    }

    return Math.max(
      ...bundle.slots.map((slot) => availabilityBySlot.get(slot.id)?.size ?? 0),
      0,
    )
  }, [availabilityBySlot, bundle])

  const prioritySlotIds = useMemo(() => {
    if (!bundle || highestOverlapCount === 0) {
      return new Set<string>()
    }

    return new Set(
      bundle.slots
        .filter((slot) => (availabilityBySlot.get(slot.id)?.size ?? 0) === highestOverlapCount)
        .map((slot) => slot.id),
    )
  }, [availabilityBySlot, bundle, highestOverlapCount])

  const groupedManageSlots = useMemo(
    () => groupSlotsByDate(bundle?.slots ?? []),
    [bundle?.slots],
  )

  const loadBundle = async () => {
    setLoading(true)
    setError(null)

    try {
      setBundle(await fetchManageBundle(managementCode))
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : '관리 페이지를 불러오지 못했습니다.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const finalizeSlot = async (slotId: string | null) => {
    if (!bundle) {
      return
    }

    setSavingSlotId(slotId ?? 'clear')
    setError(null)

    const { error: updateError } = await supabase
      .from('interview_events')
      .update({ finalized_slot_id: slotId })
      .eq('id', bundle.event.id)

    if (updateError) {
      setError(updateError.message)
    } else {
      await loadBundle()
    }

    setSavingSlotId(null)
  }

  if (loading) {
    return <PageState title="불러오는 중..." description="면접 일정 정보를 가져오고 있습니다." />
  }

  if (error || !bundle) {
    return (
      <PageState
        title="일정을 찾을 수 없습니다."
        description={error ?? '관리 링크를 다시 확인해 주세요.'}
      />
    )
  }

  return (
    <main className="page-shell inner-page">
      <div className="page-topbar">
        <Link to="/">새 일정 만들기</Link>
      </div>

      <section className="card detail-header">
        <div>
          <div className="eyebrow">인사 담당자 관리 화면</div>
          <h1>{bundle.event.title}</h1>
          <p>{formatDateRange(bundle.event.start_date, bundle.event.end_date)} 일정입니다.</p>
        </div>
        <div className="summary-badges">
          <span className="chip">{bundle.participants.length}명 참여</span>
          <span className="chip">{bundle.slots.length}개 시간대</span>
        </div>
      </section>

      <section className="content-grid single-column">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>면접관 응답 현황</h2>
              <p>각 시간대마다 누가 가능하다고 체크했는지 바로 확인할 수 있습니다.</p>
            </div>
          </div>

          <div className="calendar-grid">
            {groupedManageSlots.map((group) => (
              <section className="calendar-day" key={group.date}>
                <div className="calendar-day-head">
                  <h3>{formatDate(group.date)}</h3>
                  <span>{group.items.length}개 시간대</span>
                </div>

                <div className="calendar-slot-list">
                  {group.items.map((slot) => {
                    const matchedIds = availabilityBySlot.get(slot.id) ?? new Set<string>()
                    const participantNames = bundle.participants
                      .filter((participant) => matchedIds.has(participant.id))
                      .map((participant) => participant.name)
                    const isCommon = commonSlotIds.has(slot.id)
                    const isPriority = prioritySlotIds.has(slot.id)
                    const isFinal = bundle.event.finalized_slot_id === slot.id

                    return (
                      <article
                        className={`calendar-slot manage-slot${isCommon ? ' common' : ''}${isPriority ? ' priority' : ''}${isFinal ? ' final' : ''}`}
                        key={slot.id}
                      >
                        <div className="calendar-slot-top">
                          <strong>
                            {slot.start_time} - {slot.end_time}
                          </strong>
                          <span>
                            {matchedIds.size}/{bundle.participants.length}명 가능
                          </span>
                        </div>
                        <div className="name-tags">
                          {participantNames.length > 0 ? (
                            participantNames.map((name) => <span key={name}>{name}</span>)
                          ) : (
                            <span>아직 응답 없음</span>
                          )}
                        </div>
                        <div className="slot-actions">
                          <div className="pill-row">
                            {isPriority ? <span className="pill danger">1순위 겹침</span> : null}
                            {isCommon ? <span className="pill success">모두 가능</span> : null}
                            {isFinal ? <span className="pill accent">최종 확정</span> : null}
                          </div>
                          <button
                            className="primary-button"
                            type="button"
                            onClick={() => finalizeSlot(slot.id)}
                            disabled={savingSlotId !== null}
                          >
                            {savingSlotId === slot.id ? '저장 중...' : '이 시간으로 확정'}
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>

          <div className="finalize-bar">
            <div>
              <h3>확정 해제</h3>
              <p>다시 검토하려면 현재 확정된 시간을 비울 수 있습니다.</p>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => finalizeSlot(null)}
              disabled={savingSlotId !== null}
            >
              {savingSlotId === 'clear' ? '해제 중...' : '확정 해제'}
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}

function InvitePage() {
  const { inviteCode = '' } = useParams()
  const [bundle, setBundle] = useState<EventBundle | null>(null)
  const [participant, setParticipant] = useState<ParticipantRow | null>(null)
  const [selectedSlotIds, setSelectedSlotIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      setLoading(true)
      setError(null)
      setSuccessMessage(null)

      try {
        const result = await fetchInviteBundle(inviteCode)
        const currentSelections = new Set(
          result.bundle.availability
            .filter((row) => row.participant_id === result.participant.id)
            .map((row) => row.slot_id),
        )

        setParticipant(result.participant)
        setSelectedSlotIds(currentSelections)
        setBundle(result.bundle)
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : '초대 페이지를 불러오지 못했습니다.'
        setError(message)
      } finally {
        setLoading(false)
      }
    })()
  }, [inviteCode])

  const load = async () => {
    setLoading(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const { data: participantRow, error: participantError } = await supabase
        .from('interview_participants')
        .select('*')
        .eq('invite_code', inviteCode)
        .single()

      if (participantError || !participantRow) {
        throw participantError ?? new Error('초대 링크를 찾을 수 없습니다.')
      }

      const [{ data: eventRow, error: eventError }, { data: slots, error: slotError }] =
        await Promise.all([
          supabase
            .from('interview_events')
            .select('*')
            .eq('id', participantRow.event_id)
            .single(),
          supabase
            .from('interview_slots')
            .select('*')
            .eq('event_id', participantRow.event_id)
            .order('slot_date', { ascending: true })
            .order('start_time', { ascending: true }),
        ])

      if (eventError || !eventRow) {
        throw eventError ?? new Error('일정 정보를 불러오지 못했습니다.')
      }

      if (slotError) {
        throw slotError
      }

      const { data: participants, error: participantsError } = await supabase
        .from('interview_participants')
        .select('*')
        .eq('event_id', participantRow.event_id)
        .order('created_at', { ascending: true })

      if (participantsError) {
        throw participantsError
      }

      const participantIds = (participants ?? []).map((item) => item.id)
      const { data: availability, error: availabilityError } = participantIds.length
        ? await supabase
            .from('participant_availability')
            .select('*')
            .in('participant_id', participantIds)
        : { data: [], error: null }

      if (availabilityError) {
        throw availabilityError
      }

      const currentSelections = new Set(
        (availability ?? [])
          .filter((row) => row.participant_id === participantRow.id)
          .map((row) => row.slot_id),
      )

      setParticipant(participantRow)
      setSelectedSlotIds(currentSelections)
      setBundle({
        event: eventRow,
        participants: participants ?? [],
        slots: slots ?? [],
        availability: availability ?? [],
      })
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : '초대 페이지를 불러오지 못했습니다.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const toggleSlot = (slotId: string) => {
    setSelectedSlotIds((current) => {
      const next = new Set(current)
      if (next.has(slotId)) {
        next.delete(slotId)
      } else {
        next.add(slotId)
      }
      return next
    })
  }

  const selectAllSlots = () => {
    setSelectedSlotIds(new Set(visibleSlots.map((slot) => slot.id)))
  }

  const clearAllSlots = () => {
    setSelectedSlotIds(new Set())
  }

  const participantOrder = useMemo(() => {
    if (!bundle || !participant) {
      return -1
    }

    return bundle.participants.findIndex((item) => item.id === participant.id)
  }, [bundle, participant])

  const previousParticipantIds = useMemo(
    () =>
      new Set(
        bundle?.participants
          .slice(0, Math.max(participantOrder, 0))
          .map((item) => item.id) ?? [],
      ),
    [bundle?.participants, participantOrder],
  )

  const previousOverlapBySlot = useMemo(() => {
    const map = new Map<string, Set<string>>()

    bundle?.availability.forEach((row) => {
      if (!previousParticipantIds.has(row.participant_id)) {
        return
      }

      const current = map.get(row.slot_id) ?? new Set<string>()
      current.add(row.participant_id)
      map.set(row.slot_id, current)
    })

    return map
  }, [bundle?.availability, previousParticipantIds])

  const visibleSlots = useMemo(() => {
    if (!bundle) {
      return []
    }

    if (participantOrder <= 0) {
      return bundle.slots
    }

    return bundle.slots.filter(
      (slot) => (previousOverlapBySlot.get(slot.id)?.size ?? 0) === participantOrder,
    )
  }, [bundle, participantOrder, previousOverlapBySlot])

  const visibleSlotIds = useMemo(
    () => new Set(visibleSlots.map((slot) => slot.id)),
    [visibleSlots],
  )

  const visibleSelectedCount = useMemo(
    () => Array.from(selectedSlotIds).filter((slotId) => visibleSlotIds.has(slotId)).length,
    [selectedSlotIds, visibleSlotIds],
  )

  useEffect(() => {
    setSelectedSlotIds((current) => {
      if (participantOrder <= 0) {
        return current
      }

      const filtered = Array.from(current).filter((slotId) => visibleSlotIds.has(slotId))

      if (filtered.length === current.size) {
        return current
      }

      return new Set(filtered)
    })
  }, [participantOrder, visibleSlotIds])

  const saveAvailability = async () => {
    if (!participant) {
      return
    }

    setSaving(true)
    setError(null)
    setSuccessMessage(null)

    const { error: deleteError } = await supabase
      .from('participant_availability')
      .delete()
      .eq('participant_id', participant.id)

    if (deleteError) {
      setError(deleteError.message)
      setSaving(false)
      return
    }

    const slotIdsToSave = Array.from(selectedSlotIds).filter((slotId) => visibleSlotIds.has(slotId))

    if (slotIdsToSave.length > 0) {
      const insertRows = slotIdsToSave.map((slotId) => ({
        participant_id: participant.id,
        slot_id: slotId,
      }))

      const { error: insertError } = await supabase
        .from('participant_availability')
        .insert(insertRows)

      if (insertError) {
        setError(insertError.message)
        setSaving(false)
        return
      }
    }

    setSuccessMessage('가능한 시간이 저장되었습니다.')
    await load()
    setSaving(false)
  }

  if (loading) {
    return <PageState title="불러오는 중..." description="초대 정보를 가져오고 있습니다." />
  }

  if (error || !bundle || !participant) {
    return (
      <PageState
        title="초대 링크를 찾을 수 없습니다."
        description={error ?? '링크 주소를 다시 확인해 주세요.'}
      />
    )
  }

  const finalizedSlot =
    bundle.slots.find((slot) => slot.id === bundle.event.finalized_slot_id) ?? null
  const groupedInviteSlots = groupSlotsByDate(visibleSlots)

  return (
    <main className="page-shell inner-page">
      <div className="page-topbar">
        <Link to="/">새 일정 만들기</Link>
      </div>

      <section className="card detail-header">
        <div>
          <div className="eyebrow">면접관 응답 화면</div>
          <h1>{participant.name}님 가능한 시간을 선택해 주세요.</h1>
          <p>
            {bundle.event.title} · {formatDateRange(bundle.event.start_date, bundle.event.end_date)}
          </p>
        </div>
        <div className="summary-badges">
          <span className="chip">{visibleSelectedCount}개 선택됨</span>
        </div>
      </section>

      {finalizedSlot ? (
        <section className="card notice-card">
          <h2>최종 확정 시간</h2>
          <p>{formatSlotLabel(finalizedSlot)}로 일정이 확정되었습니다.</p>
        </section>
      ) : null}

      {participantOrder > 0 ? (
        <section className="card overlap-guide-card">
          <h2>선순위 기준 시간대</h2>
          <p>
            지금 보이는 시간은 앞선 면접관들이 모두 선택한 슬롯만 추린 결과입니다. 이 안에서만
            선택하면 교집합을 빠르게 확정할 수 있습니다.
          </p>
        </section>
      ) : null}

      <section className="content-grid single-column">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>가능 시간 선택</h2>
              <p>가능한 시간대만 체크한 뒤 저장해 주세요.</p>
            </div>
            <div className="bulk-action-row">
              <button
                className="secondary-button"
                type="button"
                onClick={selectAllSlots}
                disabled={visibleSlots.length === 0 || visibleSelectedCount === visibleSlots.length}
              >
                전체 선택
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={clearAllSlots}
                disabled={visibleSelectedCount === 0}
              >
                전체 해제
              </button>
            </div>
          </div>

          {visibleSlots.length > 0 ? (
            <div className="calendar-grid">
              {groupedInviteSlots.map((group) => (
                <section className="calendar-day" key={group.date}>
                  <div className="calendar-day-head">
                    <h3>{formatDate(group.date)}</h3>
                    <span>{group.items.length}개 시간대</span>
                  </div>

                  <div className="calendar-slot-list">
                    {group.items.map((slot) => {
                      const checked = selectedSlotIds.has(slot.id)
                      const previousOverlapCount = previousOverlapBySlot.get(slot.id)?.size ?? 0
                      const projectedOverlapCount = previousOverlapCount + (checked ? 1 : 0)
                      return (
                        <label
                          className={`calendar-slot select-slot${checked ? ' checked' : ''}`}
                          key={slot.id}
                        >
                          <input
                            checked={checked}
                            type="checkbox"
                            onChange={() => toggleSlot(slot.id)}
                          />
                          <div className="calendar-slot-top">
                            <strong>
                              {slot.start_time} - {slot.end_time}
                            </strong>
                            <span>{checked ? '선택됨' : '선택 가능'}</span>
                          </div>
                          {participantOrder > 0 ? (
                            <div className="slot-overlap-guide">
                              <div className="overlap-dots" aria-hidden="true">
                                {Array.from({ length: projectedOverlapCount }).map((_, index) => (
                                  <span className="overlap-dot" key={index} />
                                ))}
                              </div>
                              <p>
                                {checked
                                  ? `${projectedOverlapCount}명 교집합 후보`
                                  : `앞선 면접관 ${previousOverlapCount}명이 모두 고른 시간`}
                              </p>
                            </div>
                          ) : null}
                        </label>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="filtered-empty-state">
              <h3>앞선 면접관들의 공통 시간이 아직 없습니다.</h3>
              <p>선순위 응답을 조정하거나 관리 화면에서 후보 시간을 다시 확인해 주세요.</p>
            </div>
          )}

          {error ? <p className="error-text">{error}</p> : null}
          {successMessage ? <p className="success-text">{successMessage}</p> : null}

          <div className="action-row">
            <button
              className="primary-button"
              type="button"
              onClick={saveAvailability}
              disabled={saving}
            >
              {saving ? '저장 중...' : '가능 시간 저장'}
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}

function PageState({ title, description }: { title: string; description: string }) {
  return (
    <main className="page-shell state-page">
      <div className="card state-card">
        <h1>{title}</h1>
        <p>{description}</p>
        <Link className="primary-button inline-link" to="/">
          홈으로 이동
        </Link>
      </div>
    </main>
  )
}

export default App
