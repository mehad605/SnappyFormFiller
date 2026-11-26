export interface ExtensionMessage<TType extends string = string, TPayload = unknown> {
  type: TType;
  payload?: TPayload;
}

export interface MessageSuccessResponse<T = unknown> {
  ok: true;
  data: T;
}

export interface MessageErrorResponse {
  ok: false;
  error: string;
}

export type MessageResponse<T = unknown> = MessageSuccessResponse<T> | MessageErrorResponse;

export type MessageHandler = (payload: unknown) => Promise<unknown> | unknown;

/**
 * Lightweight message router used by the event-driven background worker to dispatch
 * feature-registered handlers without central coupling.
 */
export class MessageRouter {
  private readonly handlers = new Map<string, MessageHandler>();

  register(type: string, handler: MessageHandler): void {
    if (this.handlers.has(type)) {
      throw new Error(`Duplicate message handler for "${type}"`);
    }
    this.handlers.set(type, handler);
  }

  async dispatch(rawMessage: unknown): Promise<MessageResponse> {
    if (!rawMessage || typeof rawMessage !== 'object' || Array.isArray(rawMessage)) {
      return { ok: false, error: 'Malformed message envelope' };
    }
    const { type, payload } = rawMessage as ExtensionMessage;
    if (typeof type !== 'string' || !type) {
      return { ok: false, error: 'Missing message type' };
    }
    const handler = this.handlers.get(type);
    if (!handler) {
      return { ok: false, error: `Unknown message type: ${type}` };
    }
    try {
      const data = await handler(payload);
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Unexpected handler error',
      };
    }
  }
}
