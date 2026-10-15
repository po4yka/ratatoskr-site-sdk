// A parser of `text/event-stream`, after the "Server-sent events" section of the HTML Living
// Standard. It takes the text in chunks of any size and gives back each event when the blank line
// that ends it arrives.

export interface SseFrame {
  // The last event id after this event, or `undefined` when the stream has sent none yet.
  id: string | undefined;
  event: string;
  data: string;
}

export class SseParser {
  // The last event id that an event committed. A reconnect sends it as `Last-Event-ID`.
  lastEventId: string | undefined;
  // The reconnection time that the stream asked for with a `retry` field.
  retryMs: number | undefined;

  private buffer = '';
  private data: string[] = [];
  private event = '';
  private idBuffer: string | undefined;

  push(text: string): SseFrame[] {
    this.buffer += text;
    const frames: SseFrame[] = [];
    for (;;) {
      const end = /\r\n|\n|\r/.exec(this.buffer);
      // A `\r` at the end can be the first half of `\r\n`, so it waits for the next chunk.
      if (end === null || (end[0] === '\r' && end.index === this.buffer.length - 1)) break;
      const line = this.buffer.slice(0, end.index);
      this.buffer = this.buffer.slice(end.index + end[0].length);
      const frame = this.line(line);
      if (frame !== undefined) frames.push(frame);
    }
    return frames;
  }

  private line(line: string): SseFrame | undefined {
    if (line === '') return this.dispatch();
    if (line.startsWith(':')) return undefined;
    const colon = line.indexOf(':');
    const name = colon < 0 ? line : line.slice(0, colon);
    const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
    this.field(name, value);
    return undefined;
  }

  private field(name: string, value: string): void {
    if (name === 'data') this.data.push(value);
    else if (name === 'event') this.event = value;
    else if (name === 'id' && !value.includes('\0')) this.idBuffer = value;
    else if (name === 'retry' && /^\d+$/.test(value)) this.retryMs = Number(value);
  }

  private dispatch(): SseFrame | undefined {
    this.lastEventId = this.idBuffer;
    const frame =
      this.data.length === 0
        ? undefined
        : { id: this.lastEventId, event: this.event || 'message', data: this.data.join('\n') };
    this.data = [];
    this.event = '';
    return frame;
  }
}
