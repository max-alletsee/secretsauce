// frontend/src/api/timeline.ts
import client from './client'
import type { TimelineEntry, TimelineEntryCreate, TimelineEntryUpdate } from '@/types/timeline'

export const listEntries = (fromDate: string, toDate: string) =>
  client.get<{ entries: TimelineEntry[] }>('/timeline/entries', {
    params: { from_date: fromDate, to_date: toDate },
  })

export const createEntry = (data: TimelineEntryCreate) =>
  client.post<TimelineEntry>('/timeline/entries', data)

export const updateEntry = (entryId: string, data: TimelineEntryUpdate) =>
  client.patch<TimelineEntry>(`/timeline/entries/${entryId}`, data)

export const deleteEntry = (entryId: string) =>
  client.delete(`/timeline/entries/${entryId}`)
