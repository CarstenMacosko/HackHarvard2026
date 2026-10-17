/** Channel-agnostic messaging surface. Photon 2.0 is the production channel; the dev adapter
 * lets everyone test the conversation locally without a phone. */

export interface InboundMessage {
  /** stable address for the participant on this channel (phone number, email, chat id) */
  from: string;
  text: string;
  /** URLs (or local paths in dev) of attached photos/videos */
  media: { url: string; contentType: string }[];
  receivedAt: Date;
}

export interface ChannelAdapter {
  readonly name: string;
  start(onMessage: (msg: InboundMessage) => Promise<void>): Promise<void>;
  send(to: string, text: string): Promise<void>;
  stop(): Promise<void>;
}
