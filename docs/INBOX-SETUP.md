# NW Inbox setup (voice memos to text, Fireflies to Drive)

This is a separate Google Apps Script project named **NW Inbox**. It is not part of the app and not part of the Drive backup script.
Code: `tools/inbox/` (`Code.gs`, `Voice.gs`, `Fireflies.gs`, `appsscript.json`). It makes no Claude or Anthropic calls. It never touches Firestore.
Transcription is Gemini on Vertex AI, billed to the Google Cloud project `nikhils-world` (Blaze plan, your cloud credits). Google does not train on Vertex AI data. The free Gemini API tier is never used.

## 1. Create the project
1. Open https://script.google.com and sign in as your own Google account (the one that owns "Transcripts of Voice Recordings").
2. Click **New project**. Click the name at the top and rename it **NW Inbox**.
3. Open the file `Code.gs` that is already there. Select all, delete, and paste in the contents of `tools/inbox/Code.gs` from the repo.
4. Click **+** next to Files, choose **Script**, name it `Voice`. Paste in `tools/inbox/Voice.gs`.
5. Do the same for `Fireflies`, pasting `tools/inbox/Fireflies.gs`.
6. Click the gear (**Project Settings**). Tick **Show "appsscript.json" manifest file in editor**. Go back to Editor, open `appsscript.json`, replace everything with `tools/inbox/appsscript.json`. Press Ctrl+S (Cmd+S).

## 2. Link it to the nikhils-world Cloud project
1. Open https://console.cloud.google.com/, choose the project **nikhils-world** in the top bar. Click the top bar's project name again: the **Project number** (digits only) is shown in the list. Copy it.
2. In Apps Script: **Project Settings** (gear) → **Google Cloud Platform (GCP) Project** → **Change project**. Paste the project number. Click **Set project**.
3. In the Cloud console, search for **Vertex AI API** and click **Enable**. Search for **Cloud Storage API** (usually already on) and make sure it says enabled.

## 3. Script Properties
Project Settings → **Script Properties** → **Add script property**. Names must match exactly.

| Name | Needed? | What it is |
|---|---|---|
| `FIREFLIES_API_KEY` | For Fireflies | Make it in Fireflies: **Settings → Developer Settings → API key**. Copy it straight into this box. Never paste it in a chat or the repo. |
| `FIREFLIES_DOC_NAME` | Optional | Name template for new Fireflies docs. `{date}` = meeting date `YYYY-MM-DD`, `{context}` = "Session with Dr. Shobha" or the Fireflies title. Default: `Fireflies Transcript {date} {context}`. To change it, edit this value; it only affects docs made afterwards. Old docs are never renamed. |
| `TIME_ZONE` | Optional | Default `America/Anchorage`. For India (Dec 16 to Mar 5) use `Asia/Kolkata`, and change it back after. |
| `VERTEX_MODEL` | Optional | Default `gemini-2.5-flash` (Flash tier, takes audio). Newer Flash ids (for example `gemini-3.5-flash`) can be put here. |
| `VERTEX_REGION` | Optional | Default `us-central1`. `global` also works. |
| `GCP_PROJECT` | Optional | Default `nikhils-world`. |
| `DAILY_CAP_MINUTES` | Optional | Audio minutes per day, default 180. |
| `BUCKET_NAME` | Optional | Default `nikhils-world-nw-inbox-temp`. Used for long memos, emptied after 1 day. |
| `FIREFLIES_START_DATE` | Optional | `YYYY-MM-DD`. Fireflies meetings before this are ignored. Default: the day you run setup. |
| `TRANSCRIPTS_DOC_ID` | Optional | The id of "Transcripts of Voice Recordings" (the long text in its web address between `/d/` and `/edit`). Use it only if the doc is not found by its exact title. |
| `VOICE_INBOX_FOLDER_ID`, `FIREFLIES_FOLDER_ID` | Optional | Folder ids (the text after `/folders/` in the address). When set, used instead of searching by name. |

Keys and ids live only here. Nothing secret is in the repo.

## 4. Run setup
1. In the editor, pick the function **setupInbox** in the dropdown at the top. Click **Run**.
2. Click **Review permissions**, choose your account, **Advanced → Go to NW Inbox (unsafe)** (it is your own script), **Allow**.
3. Open **Execution log**. It lists what was made and any **MISSING Script Property**. Running it again is safe.
4. Setup makes: the folder "Nikhil's World Voice Inbox" with "Done" and "Problem", the folder "Fireflies Meetings" (if missing), the sheet "NW Inbox log", the doc "Nikhil's World — Voice, last 7 days", the Cloud Storage bucket with a 1-day delete rule, and two timers: voice every 15 minutes, Fireflies every 2 hours.

## 5. iPhone
1. In Voice Memos, open a recording → tap **⋯** or the share icon → **Save to Files** → **Google Drive** → **Nikhil's World Voice Inbox** → **Save**.
2. Within about 15 minutes the text appears in "Transcripts of Voice Recordings" and the audio moves to **Done**. If it fails 3 times it moves to **Problem** with the error in the file's description.
3. Optional Shortcut (Shortcuts app): **+** → **Find Files** (the folder your Voice Memos are saved in, sort by newest, limit 1) → **Save File** → Google Drive → Nikhil's World Voice Inbox, with **Ask Where to Save** off. Add it to the Home Screen.

Notes: the memo's date and time come from the Voice Memos file name (`20261103 091400-…`) when it has one, otherwise from the file's modified time. Your own text above the first date heading is never read or changed.

## 6. What the numbers are (looked up Nov 4, 2026)
- Model: `gemini-2.5-flash`, Flash tier, generally available on Vertex AI, accepts audio. Regional endpoints (like `us-central1`) or `global`.
- Vertex inline limit: 256 MB per inline part, 500 MiB per request; Cloud Storage files up to 2 GiB; audio up to about 8.4 hours.
- Apps Script `UrlFetchApp`: 50 MB per request and response, 20,000 calls a day, no published fetch timeout, 6 minutes per run.
- So the script sends memos up to `INLINE_MAX_MB` (20 MB) inline, and copies bigger ones to the bucket in 8 MiB pieces, then sends a `gs://` address and deletes the copy. A 60-minute memo is usually 30 to 60 MB: that goes through the bucket.
- Fireflies free plan: 500 requests a day, 30 a minute, reset at midnight UTC. The first request starts a 14-day trial at 5,000 a day. The script stops at 400 a day regardless.

## 7. Cost
Gemini Flash audio costs roughly a cent or two per hour of audio (audio is counted at 32 tokens a second, about 115,000 tokens an hour, plus the transcript as output). A few hours of audio a week is about **$0.10 to $0.50 a month**, drawn from your Cloud credits. The bucket and the Apps Script cost nothing noticeable. Check current prices at cloud.google.com/vertex-ai/generative-ai/pricing.

## 8. Trigger time budget
A Gmail-account Apps Script gets **90 minutes of trigger time per day, shared by all your scripts** (the Drive backup uses some). The voice timer runs 96 times a day; with nothing to do each run takes a couple of seconds (about 3 to 5 minutes a day). Fireflies runs 12 times a day (about 1 minute). A 60-minute memo takes a minute or two. If you hit the limit, change the voice timer to every 30 minutes in the Triggers page (clock icon).

## 9. Problems
- Look at the sheet "NW Inbox log" (time, file, minutes, tokens, status).
- A file in **Problem** has the error in its description. Move it back to the Inbox to try again.
- "Waiting: daily cap" means the day's minutes are used; it goes through tomorrow.
