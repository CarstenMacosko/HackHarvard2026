import { randomUUID } from "node:crypto";
import {
  balance,
  computeStreak,
  lifetimePoints,
  rewardMessage,
  rewardsForAcceptedSubmission,
  tierFor,
  type Observation,
  type RewardEvent,
} from "@vf/shared";
import { DevAdapter } from "./adapters/dev";
import { PhotonAdapter } from "./adapters/photon";
import type { ChannelAdapter, InboundMessage } from "./adapters/types";
import { handle, type ConvEvent, type Effect } from "./conversation";
import { analyze } from "./cvClient";
import { startScheduler } from "./scheduler";
import { byAddress, save, seedDemoParticipants, type ParticipantRecord } from "./store";

const WEB_URL = process.env.WEB_URL ?? "http://localhost:3000";

const channel: ChannelAdapter =
  process.env.AGENT_CHANNEL === "photon"
    ? new PhotonAdapter({ apiKey: process.env.PHOTON_API_KEY ?? "", phoneNumber: process.env.PHOTON_PHONE_NUMBER ?? "" })
    : new DevAdapter();

/** Feed one event through the state machine, send replies, run effects (which may feed more events). */
export async function dispatch(p: ParticipantRecord, event: ConvEvent): Promise<void> {
  const r = handle(p.conv, event);
  p.conv = r.state;
  save(p);
  for (const m of r.messages) await channel.send(p.address, m);
  for (const e of r.effects) await runEffect(p, e);
}

async function runEffect(p: ParticipantRecord, e: Effect): Promise<void> {
  switch (e.type) {
    case "analyze":
      try {
        const observation = await analyze({ participant: p, task: e.task, submissionId: e.submissionId, mediaUrl: e.mediaUrl, attempt: e.attempt });
        // unusable attempts are recorded too, so researchers see the retry funnel
        if (!observation.quality.accepted) void postObservation(observation, e.attempt, e.task.id);
        await dispatch(p, { type: "analysis_result", observation });
      } catch (err) {
        console.error(err);
        await dispatch(p, { type: "analysis_error", error: String(err) });
      }
      return;
    case "complete": {
      const now = new Date();
      p.acceptedAt.push(now.toISOString());
      // the web app owns the reward ledger; fall back to a local estimate if it is unreachable
      const ingested = await postObservation(e.observation, e.attempts, e.task.id);
      if (ingested) {
        p.rewardEvents.push(...ingested.reward_events);
        p.ledger = { balance: ingested.points_balance, tier: ingested.tier, lifetime: ingested.lifetime_points, nextTier: ingested.next_tier };
        save(p);
        await channel.send(p.address, ingested.message ?? rewardMessage(ingested.reward_events, ingested.streak));
        return;
      }
      const streak = computeStreak(p.acceptedAt, e.task.cadence, now);
      const events = rewardsForAcceptedSubmission(p.rewards, {
        participantId: p.id,
        submissionId: e.observation.submission_id,
        onTime: true,
        streak,
        totalAccepted: p.acceptedAt.length,
        at: now,
      });
      p.rewardEvents.push(...events);
      save(p);
      await channel.send(p.address, rewardMessage(events, streak));
      return;
    }
    case "escalate":
      console.warn(`[escalate] ${p.id} ${e.task.id}: ${e.reason}`); // TODO: flag in researcher dashboard
      return;
    case "show_points": {
      if (p.ledger) {
        const { balance: bal, tier, lifetime, nextTier } = p.ledger;
        const toNext = nextTier ? ` · ${nextTier.points - lifetime} pts to ${nextTier.name}` : "";
        await channel.send(p.address, `You have ${bal} pts (${tier} tier${toNext}).`);
        return;
      }
      const { current, next } = tierFor(p.rewards, lifetimePoints(p.rewardEvents));
      const toNext = next ? ` · ${next.points - lifetimePoints(p.rewardEvents)} pts to ${next.name}` : "";
      await channel.send(p.address, `You have ${balance(p.rewardEvents)} pts (${current.name} tier${toNext}).`);
      return;
    }
  }
}

interface IngestResponse {
  accepted: boolean;
  reward_events: RewardEvent[];
  streak: number;
  message: string | null;
  points_balance: number;
  tier: string;
  lifetime_points: number;
  next_tier: { name: string; points: number } | null;
}

/** Hand every analysed attempt to the web app, which owns database writes and the reward ledger. */
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

export async function promptTask(p: ParticipantRecord, taskId: string): Promise<void> {
  const task = p.tasks.find((t) => t.id === taskId) ?? p.tasks[0];
  p.lastPromptedAt[task.id] = new Date().toISOString();
  await dispatch(p, { type: "task_due", task, submissionId: `sub_${randomUUID().slice(0, 8)}` });
}

/** Messages from one participant are processed strictly in order, even while a CV call is in flight. */
const queues = new Map<string, Promise<void>>();
function onMessage(msg: InboundMessage): Promise<void> {
  const next = (queues.get(msg.from) ?? Promise.resolve()).then(() => processMessage(msg)).catch(console.error);
  queues.set(msg.from, next);
  return next;
}

async function processMessage(msg: InboundMessage): Promise<void> {
  const p = byAddress(msg.from);
  if (!p) {
    await channel.send(msg.from, "Hi! This number is for study participants. Join from your study's invite link to get started.");
    return;
  }
  const due = msg.text.match(/^\/due\s*(\S*)/);
  if (channel.name === "dev" && due) return promptTask(p, due[1]);
  for (const m of msg.media) await dispatch(p, { type: "media", url: m.url, contentType: m.contentType });
  if (msg.text) await dispatch(p, { type: "text", text: msg.text });
}

async function main() {
  seedDemoParticipants();
  await channel.start(onMessage);
  if (channel.name === "dev") {
    console.log("Dev chat as +15550000001 (PD demo). Try: /due  then  /video blurry.mp4  then  /video good.mp4");
  } else {
    startScheduler(promptTask);
  }
}

if (process.env.VITEST === undefined) void main();
