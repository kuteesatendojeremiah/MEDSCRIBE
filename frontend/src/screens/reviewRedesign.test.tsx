// Redesigned Review (Blueprint §4.4, FR-09): required vs advisory items are distinct, the summary can
// never be hidden, sources are shown, uncertain speakers are marked, and note edits never touch the
// transcript.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { katoDraftNote, katoSetup, katoTranscript } from '../fixtures/kato'
import { ReviewFooter, ReviewItemsPanel } from '../components/ReviewItemsPanel'
import { sessionStore } from '../session/store'
import { Review, UNCERTAIN_BELOW } from './Review'

afterEach(() => {
  cleanup()
  sessionStore.dispatch({ type: 'END_SESSION' })
})

function toReview(transcript = katoTranscript) {
  sessionStore.dispatch({ type: 'START_SESSION', setup: katoSetup })
  sessionStore.dispatch({ type: 'STOP' })
  sessionStore.dispatch({ type: 'PROCESS_OK', transcript, note: katoDraftNote() })
}

describe('needs-attention panel', () => {
  it('shows the open count, split into required and advisory, and keeps Preview gated', () => {
    toReview()
    render(
      <>
        <ReviewItemsPanel state={sessionStore.getState()} />
        <ReviewFooter state={sessionStore.getState()} />
      </>,
    )
    const summary = screen.getByTestId('review-summary')
    expect(summary.textContent).toMatch(/5 items/)
    expect(summary.getAttribute('aria-label')).toMatch(/2 required items open, 3 advisory open/)
    expect(
      (screen.getByRole('button', { name: /continue to preview/i }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(screen.getByText(/Open every required item to unlock Preview \(2 left\)/)).toBeTruthy()
  })

  it('a HIGH card is labelled Required and explains why; a CHECK card is Advisory', () => {
    toReview()
    const { rerender } = render(<ReviewItemsPanel state={sessionStore.getState()} />)
    fireEvent.click(screen.getByRole('button', { name: /HIGH review item: Bisoprolol/i }))
    rerender(<ReviewItemsPanel state={sessionStore.getState()} />)
    const card = screen.getByTestId('review-r-001')
    expect(within(card).getByText('Required')).toBeTruthy()
    expect(within(card).getByText(/Approval is blocked/)).toBeTruthy()
    const check = sessionStore.getState().note!.review_items.find((r) => r.level !== 'HIGH')
    if (check) {
      fireEvent.click(
        screen.getAllByRole('button', { name: new RegExp(`${check.level} review item`) })[0],
      )
      rerender(<ReviewItemsPanel state={sessionStore.getState()} />)
      expect(screen.getAllByText('Advisory').length).toBeGreaterThan(0)
    }
  })

  it('shows the source time and speaker, and asks the transcript to highlight it', () => {
    toReview()
    let located: string | null = null
    const { rerender } = render(
      <ReviewItemsPanel state={sessionStore.getState()} onLocate={(id) => (located = id)} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /HIGH review item: Bisoprolol/i }))
    rerender(<ReviewItemsPanel state={sessionStore.getState()} onLocate={(id) => (located = id)} />)
    const card = screen.getByTestId('review-r-001')
    expect(within(card).getByText(/Source: \d\d:\d\d/)).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: /show source of r-001/i }))
    expect(located).toMatch(/^s-\d+$/)
  })
})

describe('review workspace', () => {
  it('marks the note as a draft and the transcript as a separate panel', () => {
    toReview()
    render(<Review state={sessionStore.getState()} />)
    expect(screen.getByTestId('draft-pill').textContent).toMatch(/Draft/)
    expect(screen.getByRole('region', { name: 'Clinical note' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Transcript' })).toBeTruthy()
  })

  it('marks unknown or low-confidence speakers as uncertain, and confident ones not', () => {
    const transcript = katoTranscript.map((t, i) =>
      i === 0
        ? { ...t, speaker_role: 'unknown' as const }
        : i === 1
          ? { ...t, confidence: UNCERTAIN_BELOW - 0.1 }
          : { ...t, speaker_role: 'doctor' as const, confidence: 0.95 },
    )
    toReview(transcript)
    render(<Review state={sessionStore.getState()} />)
    expect(screen.getByTestId(`uncertain-${transcript[0].id}`)).toBeTruthy()
    expect(screen.getByTestId(`uncertain-${transcript[1].id}`)).toBeTruthy()
    expect(screen.queryByTestId(`uncertain-${transcript[2].id}`)).toBeNull()
  })

  it('editing a note item never changes the transcript, and reassigning a speaker never edits the note', () => {
    toReview()
    const before = sessionStore.getState()
    const item = before.note!.items[0]
    sessionStore.dispatch({ type: 'EDIT_NOTE_ITEM', id: item.id, text: 'edited in the note' })
    expect(sessionStore.getState().transcript).toBe(before.transcript)
    const afterEdit = sessionStore.getState()
    sessionStore.dispatch({
      type: 'REASSIGN_ROLE',
      segmentId: before.transcript![0].id,
      role: 'relative',
    })
    expect(sessionStore.getState().note!.items).toEqual(afterEdit.note!.items)
  })
})
