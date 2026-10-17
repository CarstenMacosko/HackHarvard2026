import readline from "node:readline";
import type { ChannelAdapter, InboundMessage } from "./types";

/**
 * Local stdin chat that plays the participant. Commands:
 *   /photo <path-or-url>   send a photo
 *   /video <path-or-url>   send a video
 *   /due <taskId>          make a task due now (handled by index.ts)
 *   anything else          sent as a text message
 */
export class DevAdapter implements ChannelAdapter {
  readonly name = "dev";
  private rl?: readline.Interface;
  constructor(private readonly participantAddress = "+15550000001") {}

  async start(onMessage: (msg: InboundMessage) => Promise<void>): Promise<void> {
    this.rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "you> " });
    this.rl.prompt();
    this.rl.on("line", async (line) => {
      const [cmd, ...rest] = line.trim().split(/\s+/);
      const arg = rest.join(" ");
      const media =
        cmd === "/photo"
          ? [{ url: arg, contentType: "image/jpeg" }]
          : cmd === "/video"
            ? [{ url: arg, contentType: "video/mp4" }]
            : [];
      await onMessage({ from: this.participantAddress, text: media.length ? "" : line.trim(), media, receivedAt: new Date() });
      this.rl?.prompt();
    });
  }

  async send(to: string, text: string): Promise<void> {
    process.stdout.write(`\n\x1b[36magent → ${to}:\x1b[0m ${text}\n`);
  }

  async stop(): Promise<void> {
    this.rl?.close();
  }
}
