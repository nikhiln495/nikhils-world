# The Ledger and the Brain Dump, from the app (build v3, Part 2)

The Ledger is a Google Sheet and the Brain Dump is a Google Doc. The app is a phone-friendly front end for both.
It does **not** keep a second task list and does **not** sort the Brain Dump (his Gemini sorter does that).

## Sign-in

The app reuses the Drive sign-in (`NW-TOKEN-CACHE`, scope `https://www.googleapis.com/auth/drive`). That scope
already covers the Sheets and Docs APIs, so **no new scope** is requested. If there is no token the Ledger strip and
the Dump panel show **Connect Google**, which opens the same Google sign-in as "Sync to Google Drive".

## One-time setup (Google Cloud, once)

The Google Cloud project that owns the Drive sign-in (OAuth client `55888993304-…`) must have two more APIs on:

1. Open https://console.cloud.google.com/apis/library, choose the project that owns that OAuth client.
2. Search **Google Sheets API** → **Enable**.
3. Search **Google Docs API** → **Enable**.
4. In the app: System tab → paste the Ledger link → **Save link**. Then **Connect Google** if it asks.

If an API is off, the app says so in one line ("The Google Sheets API is not turned on for the project that owns the
Drive sign-in.") and everything else keeps working.

## What stays on the device (never Firestore)

`NW-DEVICE-CACHE` in `index.html`: the Ledger link (`__nw_ledger_link`), the last read with its time and the Rules
text (`__nw_ledger_cache`, work rows already removed), changes waiting to be sent (`__nw_ledger_pending`), Brain
Dump captures with their status (`__nw_dump_queue`), and drafts of Ledger / Brain Dump text (`__nw_dev_draft:*`).
appdata is publicly readable, so none of it may be written there. The only Ledger text that can reach Firestore is
inside saved **What now?** results and the first step he saves for tomorrow, and only from rows the work filter allows.

## Reading

`values:batchGet` for the `Ledger` and `Rules` tabs. Columns are found by the **header name in row 1**
(`Done, Auto_Status, Bucket, Domain, Parent_Task, Step_Num, Step_Action, First_Physical_Step, Hands_On_Mins,
Waiting_Time, Deadline, Priority_Labels, Completed_At, Trello_Board, Status_Flags, Comments, AI_Queue, Actual_Mins,
Flow_Order`), never by position.

**Work filter.** A row is dropped when its `Bucket`, `Domain` or `Trello_Board` contains the whole word VINE, ASMP,
STARR, RTI or Work (any case; "Homework" does not match). If any row of a `Parent_Task` is a work row, the whole task
is dropped. Dropped rows are never shown, cached, sent to Claude or written.

## The strip

Open rows (`Done` is not TRUE) in `1. 🎯 TODAY SPARK (Max 3)` and `2. 🔥 THIS WEEK (Hard Deadlines)`, plus open rows
with a `Deadline` in the next 14 days, grouped by `Parent_Task`, ordered by `Flow_Order` then `Step_Num`. Tap a task for
all its steps (done ones too) and comments.

## Writes (each shows a preview; one tap confirms)

| Action | Cells written |
|---|---|
| Mark a step done | `Done` = TRUE, `Completed_At` = ISO time (`toISOString()`), `Actual_Mins` = "N mins" only when a timer ran |
| Add a comment | `Comments` = what was there + a new line `[Nov 3 08:10] his words (from Nikhil's World)` |
| Add a step | one new row at the end: same `Parent_Task`, `Bucket`, `Domain`, next `Step_Num`, `Step_Action` (+ `Hands_On_Mins` if given) |
| Add a task | new rows at the end, first physical step = `Step_Num` 1: `Parent_Task`, `Bucket`, `Domain`, `Step_Num`, `Step_Action` |

Rules every write follows:

- Before the first write in a session the tab is read with `valueRenderOption=FORMULA`. A column that holds a
  formula is **never written**; the app says which column and writes nothing.
- Before each write the target row is read again and `Parent_Task`, `Step_Num`, `Step_Action` must still match. If
  the row moved it is found again by those three fields; if there is not exactly one match, nothing is written and
  the app says so.
- Never deletes rows, never changes other cells, never writes `My_*` columns or `Pin`.
- Appended rows send `null` for every cell the app does not name, so formulas and checkboxes are left alone.
- Offline, the change is kept on the device and listed; **Send to Ledger** sends it when back online.

## Brain Dump

The newest Google Doc named exactly `Brain Dump <Mon> <YYYY>` (for example `Brain Dump Nov 2026`) is found with the Drive
API. New text goes to the top: under today's H1 heading (`Monday, Nov 2, 2026` format) when that is the document's
first heading, otherwise a new H1 heading for today is inserted first. Each paragraph ends with
`(from Nikhil's World, 8:10 AM)`; an optional tag (`task:`, `note:`, `class:`, `geog:`, `stagecraft:`, `work:`,
`life:`, `private:`) goes in front. The write uses the Docs API with `writeControl.requiredRevisionId` from a fresh read
(if the revision is stale it reads again and retries, up to 3 times). It only inserts text; it never edits or deletes.
The first send of a session shows a preview. Offline captures stay on the device and go out, oldest first, when back
online (if signed in).
