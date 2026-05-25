declare const EdgeRuntime: string | undefined;

declare class WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}

declare module "cloudflare:sockets" {
  type SocketAddress = {
    hostname: string;
    port: number;
  };

  type SocketOptions = {
    secureTransport?: "off" | "on" | "starttls";
    allowHalfOpen?: boolean;
  };

  type CloudflareSocket = {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    opened: Promise<void>;
    closed: Promise<void>;
    close: () => Promise<void>;
    startTls?: () => CloudflareSocket;
  };

  export function connect(address: SocketAddress, options?: SocketOptions): CloudflareSocket;
}
