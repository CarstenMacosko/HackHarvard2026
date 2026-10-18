import { randomUUID } from "node:crypto";
import { type Observation } from "@vf/shared";
import { DevAdapter } from "./adapters/dev";
import type { ChannelAdapter, InboundMessage } from "./adapters/types";
import { handle, type ConvEvent, type Effect } from "./conversation";
import { analyze } from "./cvClient";
import { startScheduler, tick } from "./scheduler";
import { MemoryStore, type DueCheckIn, type ParticipantRecord, type Store } from "./store";
import { SupabaseStore, supabaseFromEnv } from "./supabaseStore";

const WEB_URL = process.env.WEB_URL ?? "http://localhost:3000";

const supabase = supabaseFromEnv();
export const store: Store = supabase ? new SupabaseStore(supabase) : new MemoryStore();

const channel: ChannelAdapter = new DevAdapter();

/** Feed one event through the state machine, send replies, run effects (which may feed more events). */
export async function dispatch(p: ParticipantRecord, event: ConvEvent): Promise<void> {
  const r = handle(p.conv, event);
  p.conv = r.state;
  await store.save(p);
  for (const m of r.messages) await say(p, m);
  for (const e of r.effects) await runEffect(p, e);
}

/** Send a message and keep it in the conversation log (messages). */
async function say(p: ParticipantRecord, text: string): Promise<void> {
  await channel.send(p.address, text);
  await store.logMessage({ participantId: p.id, direction: "outbound", body: text, checkInId: p.checkInId });
}

async function runEffect(p: ParticipantRecord, e: Effect): Promise<void> {
  switch (e.type) {
    case "analyze":
      try {
        // keep the attachment (Supabase Storage) before analysis; the CV service reads it from a signed URL
        const media = await store.storeMedia(p, e.mediaUrl, e.task.media_type === "photo" ? "image/jpeg" : "video/mp4");
        const analysed = await analyze({ participant: p, task: e.task, submissionId: e.submissionId, mediaUrl: media.analyzeUrl, attempt: e.attempt });
        const observation = { ...analysed, media_url: media.mediaUrl };
        // unusable attempts are recorded too, so researchers see the retry funnel
        if (!observation.quality.accepted) void postObservation(observation, e.attempt, e.task.id);
        await dispatch(p, { type: "analysis_result", observation });
      } catch (err) {
        console.error(err);
        await dispatch(p, { type: "analysis_error", error: String(err) });
      }
      return;
    case "complete": {
      p.acceptedAt.push(new Date().toISOString());
      const ingested = await postObservation(e.observation, e.attempts, e.task.id);
      await store.save(p);
      await say(p, ingested?.message ?? "Perfect, that's a usable capture — sent to your study team for review.");
      return;
    }
    case "escalate":
      await store.escalate(p, e.task.id, e.reason); // the check-in shows as escalated in the researcher dashboard
      return;
  }
}

interface IngestResponse {
  accepted: boolean;
  streak: number;
  message: string | null;
}

/** Hand every analysed attempt to the web app, which owns database writes. */
async function postObservation(observation: Observation, attempt: number, taskId: string): Promise<IngestResponse | null> {
  try {
    const res = await fetch(`${WEB_URL}/api/cv-callback`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-callback-secret": process.env.CV_CALLBACK_SECRET ?? "" },
      body: JSON.stringify({ observation, attempt, task_id: taskId }),
    });
    if (!res.ok) {
      console.warn(`cv-callback ${res.status}: ${await res.text()}`);
      return null;
    }
    return (await res.json()) as IngestResponse;
  } catch {
    console.warn(`web app not reachable at ${WEB_URL}; observation kept locally`);
    return null;
  }
}

export async function promptTask(p: ParticipantRecord, taskId: string, checkInId: string | null = null): Promise<void> {
  const task = p.tasks.find((t) => t.id === taskId) ?? p.tasks[0];
  p.lastPromptedAt[task.id] = new Date().toISOString();
  p.checkInId = checkInId;
  await dispatch(p, { type: "task_due", task, submissionId: `sub_${randomUUID().slice(0, 8)}` });
}

/** Messages from one participant are processed strictly in order, even while a CV call is in flight. */
const queues = new Map<string, Promise<void>>();
function onMessage(msg: InboundMessage): Promise<void> {
  const next = (queues.get(msg.from) ?? Promise.resolve()).then(() => processMessage(msg)).catch(console.error);
  queues.set(msg.from, next);
  return next;
}

const promptDue = (due: DueCheckIn) => promptTask(due.participant, due.taskId, due.checkInId);

async function processMessage(msg: InboundMessage): Promise<void> {
  const p = await store.byAddress(msg.from);
  if (p && channel.name === "dev") {
    // local testing commands, not part of the conversation
    const due = msg.text.match(/^\/due\s*(\S*)/);
    if (due) return promptTask(p, due[1]);
    if (/^\/tick\b/.test(msg.text)) {
      console.log(`scheduler: ${await tick(store, promptDue)} participant(s) prompted`);
      return;
    }
  }
  await store.logMessage({
    participantId: p?.id ?? null,
    direction: "inbound",
    body: msg.text || null,
    mediaPath: msg.media[0]?.url ?? null,
    checkInId: p?.checkInId,
    meta: msg.media.length ? { media: msg.media } : p ? {} : { from: msg.from },
  });
  if (!p) {
    await channel.send(msg.from, "Hi! This number is for study participants. Join from your study's invite link to get started.");
    return;
  }
  for (const m of msg.media) await dispatch(p, { type: "media", url: m.url, contentType: m.contentType });
  if (msg.text) await dispatch(p, { type: "text", text: msg.text });
}

async function main() {
  await channel.start(onMessage);
  console.log(`agent store: ${store.kind}${store.kind === "supabase" ? " (participants, conversations and messages in Postgres; media in Storage)" : " (in memory)"}`);
  if (channel.name === "dev") {
    console.log("Dev chat as +15550000001 (PD demo). Try: /due  then  /video dark.mp4  then  /video good.mp4  (/tick runs the scheduler once)");
  }
  if (channel.name !== "dev" || process.env.AGENT_SCHEDULER === "1") startScheduler(store, promptDue);
}

if (process.env.VITEST === undefined) void main();
