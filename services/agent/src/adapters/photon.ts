import type { ChannelAdapter, InboundMessage } from "./types";

/**
 * Photon 2.0 adapter: the production channel (iMessage / SMS / RCS / WhatsApp).
 *
 * TODO(C): wire this up after the Photon workshop (Fri 4–5 PM). Photon's docs recommend
 * starting with **Spectrum** (one API across channels); `@photon-ai/advanced-imessage` is
 * the low-level iMessage SDK (TypeScript, gRPC, addresses chats by GUID). Things to map:
 *   - inbound message handler → onMessage({ from, text, media, receivedAt })
 *   - attachments → downloadable URLs (upload to Supabase Storage, pass a signed URL to CV)
 *   - send(to, text) → Photon send; iMessage replies are whole messages, not streamed
 *   - quotas: ~50 new conversations per line per day, so stagger first-contact messages
 * Keep everything else channel-agnostic so the conversation logic never changes.
 */
export class PhotonAdapter implements ChannelAdapter {
  readonly name = "photon";

  constructor(private readonly opts: { apiKey: string; phoneNumber: string }) {
    if (!opts.apiKey) throw new Error("PHOTON_API_KEY is required for AGENT_CHANNEL=photon");
  }

  async start(_onMessage: (msg: InboundMessage) => Promise<void>): Promise<void> {
    throw new Error("PhotonAdapter.start not implemented yet. See TODO in src/adapters/photon.ts");
  }

  async send(_to: string, _text: string): Promise<void> {
    throw new Error("PhotonAdapter.send not implemented yet");
  }

  async stop(): Promise<void> {}
}
