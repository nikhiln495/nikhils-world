import * as functions from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

initializeApp();
const db = getFirestore();

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const ALLOWED_ORIGINS = [
  "https://nikhils-world.web.app",
  "https://nikhils-world.firebaseapp.com",
  "http://localhost:5000",
];

// Matches the app's own sanitiseKey() in index.html — keep in lockstep.
function sanitiseKey(key: string): string {
  return key.replace(/[:/.#$[\]]/g, "_");
}

async function storageGet(key: string): Promise<string | null> {
  const snap = await db.collection("appdata").doc(sanitiseKey(key)).get();
  return snap.exists ? (snap.data()?.value ?? null) : null;
}

async function storageSet(key: string, value: string): Promise<void> {
  await db.collection("appdata").doc(sanitiseKey(key)).set({
    value,
    key,
    updatedAt: Timestamp.now(),
  });
}

// ── Spend guard: simple per-day call ceiling (chat-delta A.1) ──
const DAILY_CALL_CEILING = 200; // generous for one user; raise if it ever trips
async function checkAndIncrementBudget(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const ref = db.collection("appdata").doc(`_proxy_usage_${today}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = snap.exists ? (snap.data()?.count ?? 0) : 0;
    if (count >= DAILY_CALL_CEILING) {
      throw new functions.HttpsError(
        "resource-exhausted",
        `Daily proxy call ceiling (${DAILY_CALL_CEILING}) reached.`
      );
    }
    tx.set(ref, { count: count + 1, date: today }, { merge: true });
  });
}

const CLASSIFY_SYSTEM_PROMPT = `Classify the input into STRICT JSON only, no other text:
{"kind":"<task|journal|creative|session|body-need|idea|other>",
 "urgency":"<today|week|month|someday>",
 "entity":"<short string or null>",
 "tags":["<tag>", ...],
 "summary":"<one sentence>",
 "notes":"<flag ambiguity for human review here, or empty string>"}`;

// Routing table: kind -> storage key (+ how to merge). Verified against the
// live SK map and SESSIONS_KEY/body-needs constants in index.html — do not
// rename these without updating the front-end's own key map in lockstep.
async function routeClassified(kind: string, row: Record<string, unknown>, rawText: string) {
  const today = new Date().toISOString().slice(0, 10);
  switch (kind) {
    case "task": {
      const existing = JSON.parse((await storageGet("kaizen3:tasks")) ?? "[]");
      existing.push({
        id: Math.random().toString(36).slice(2, 9),
        name: row.summary ?? rawText.slice(0, 80),
        status: "open",
        source: "capture",
        createdAt: new Date().toISOString(),
      });
      await storageSet("kaizen3:tasks", JSON.stringify(existing));
      return "kaizen3:tasks";
    }
    case "journal": {
      const logs = JSON.parse((await storageGet("kaizen4:logs")) ?? "{}");
      const day = logs[today] ?? { brainDump: "", highlight: "", micro: "", done: [], reflection: "" };
      day.brainDump = day.brainDump ? `${day.brainDump}\n${rawText}` : rawText;
      logs[today] = day;
      await storageSet("kaizen4:logs", JSON.stringify(logs));
      return "kaizen4:logs";
    }
    case "creative":
    case "idea": {
      const entries = JSON.parse((await storageGet("creative-catch")) ?? "[]");
      entries.unshift({ id: `cap-${Date.now()}`, text: rawText, kind, at: new Date().toISOString() });
      await storageSet("creative-catch", JSON.stringify(entries));
      return "creative-catch";
    }
    case "session": {
      const summaries = JSON.parse((await storageGet("session-summaries")) ?? "[]");
      summaries.unshift({
        id: `cap-${Date.now()}`, date: today, type: "other",
        title: (row.summary as string) ?? "Captured session note",
        key_insight: rawText.slice(0, 300), manual: true, raw_notes: rawText,
      });
      await storageSet("session-summaries", JSON.stringify(summaries.slice(0, 50)));
      return "session-summaries";
    }
    case "body-need": {
      const needs = JSON.parse((await storageGet("body-needs")) ?? "[]");
      const id = (row.entity as string) || "unspecified";
      if (!needs.includes(id)) needs.push(id);
      await storageSet("body-needs", JSON.stringify(needs));
      return "body-needs";
    }
    default:
      return null; // "other" — classified + audited, not auto-routed
  }
}

export const capture = functions.onRequest(
  { secrets: [ANTHROPIC_API_KEY], cors: ALLOWED_ORIGINS },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "POST only" });
      return;
    }
    try {
      await checkAndIncrementBudget();
    } catch (e) {
      res.status(429).json({ error: (e as Error).message });
      return;
    }

    const { mode } = req.body ?? {};
    const key = ANTHROPIC_API_KEY.value();

    // ── mode: "proxy" — raw passthrough for the two legacy custom calls ──
    // (SessionsPanel.syncFireflies + analyzeFoci in index.html). Forwards the
    // exact body the client built (system prompt, mcp_servers, etc.) and just
    // injects auth. No reshaping — those call sites already parse their own
    // response text client-side.
    if (mode === "proxy") {
      const { body } = req.body;
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      };
      if (body?.mcp_servers) headers["anthropic-beta"] = "mcp-client-2025-04-04";
      const upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const data = await upstream.json();
      res.status(upstream.status).json(data);
      return;
    }

    // ── mode: "classify" (default) — the actual capture/classify spine ──
    const { text, source } = req.body ?? {};
    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "text (string) required" });
      return;
    }
    if (source && !["app", "voice", "doc"].includes(source)) {
      res.status(400).json({ error: "source must be app|voice|doc" });
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      const upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 500,
          system: CLASSIFY_SYSTEM_PROMPT,
          messages: [{ role: "user", content: text }],
        }),
      });
      const data = await upstream.json();
      const raw = (data.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
      const match = raw.match(/\{[\s\S]*\}/); // defensive: strip code fences / stray text
      if (!match) throw new Error("no JSON in classify response");
      parsed = JSON.parse(match[0]);
    } catch (e) {
      logger.error("classify failed", e);
      res.status(502).json({ error: "classify_failed", detail: (e as Error).message });
      return;
    }

    const routedTo = await routeClassified(parsed.kind as string, parsed, text);

    await db.collection("appdata").doc(`audit_log_${Date.now()}`).set({
      ts: Timestamp.now(),
      source: source ?? "app",
      kind: parsed.kind,
      routedTo,
    });

    res.status(200).json({ ...parsed, routedTo });
  }
);
