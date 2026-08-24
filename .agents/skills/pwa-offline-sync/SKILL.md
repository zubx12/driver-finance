---
name: pwa-offline-sync
description: Use when building or editing the driver module's ride/expense entry flow, which must work fully offline and sync automatically on reconnect, including receipt photos.
---

# Skill: Offline-First Entry Sync (Driver Module Only)

## When to use this
Any work on `app/driver/` entry screens (Add Ride, Add Expense) or the sync queue.

## Required behavior
1. On submit, the entry is written to a local IndexedDB store (via Dexie.js) **first**, and immediately reflected in the UI — never block the UI on a network round-trip.
2. If the entry is an expense, the receipt photo is compressed client-side, then stored locally alongside the entry data as part of the same queued record — the two must sync together, never separately, so a synced expense can never end up without its receipt.
3. A background sync process pushes queued entries to Supabase as soon as connectivity is detected (via the Background Sync API, or a reconnect-triggered retry).
4. Each locally created entry gets a client-generated UUID at creation time, so syncing is always an `INSERT`, never a conflict-prone update.
5. On partial failure (e.g. image upload fails, entry data succeeds), retry only the failed piece — don't discard or duplicate the successful piece.

## Testing checklist (do not skip)
- Put the device/browser in airplane mode.
- Log a ride. Confirm it appears in the UI instantly.
- Log an expense with a photo. Confirm it appears with the photo visible locally.
- Reconnect. Confirm both sync and appear correctly on another device/session logged into the same account.
- Kill and reopen the app while offline with queued entries pending — confirm the queue survives (persisted storage, not memory).

## Common mistake to avoid
Treating the receipt image as a separate upload from the expense record. If they sync independently, a race condition can leave an expense row referencing an image that hasn't uploaded yet (or never will). They must be one atomic unit in the sync queue.
