/**
 * Y-app ↔ extension postMessage bridge.
 *
 * The extension runs inside an iframe embedded by Y-app. It cannot
 * directly talk to ERPNext because:
 *   - it's on a different origin (GitHub Pages vs y-app.impertio.app)
 *   - it has no ERPNext session cookie
 *   - the ERPNext credentials live in Y-app's encrypted vault and
 *     never leave the Y-app server process
 *
 * So every ERPNext call becomes a postMessage RPC: we send
 *   { id, type: "erpnext.call", method, args }
 * to window.parent, and Y-app's host page calls ERPNext via its own
 * bridged proxy and replies with
 *   { id, ok: true, result } | { id, ok: false, error }
 *
 * This file is the ONLY place that knows about the host. Everything
 * else in the extension imports from here and stays host-agnostic.
 */

type RpcMethod =
  | "fetchList"
  | "fetchDocument"
  | "updateDocument"
  | "callMethod"
  | "getActiveInstanceId"
  | "getErpNextAppUrl";

interface RpcEnvelope {
  id: string;
  type: "yapp-ext.rpc";
  method: RpcMethod;
  args: unknown[];
}
interface RpcReplyOk  { id: string; type: "yapp-ext.rpc.reply"; ok: true;  result: unknown; }
interface RpcReplyErr { id: string; type: "yapp-ext.rpc.reply"; ok: false; error: { status?: number; message: string }; }
type RpcReply = RpcReplyOk | RpcReplyErr;

const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let seq = 0;
const nextId = () => `rpc-${++seq}-${Date.now()}`;

// The host origin is injected via the `?host=<origin>` query param when
// Y-app loads the iframe. We never `*` the target origin — that would
// leak RPC bodies to any site that happened to be navigated to.
const params = new URLSearchParams(window.location.search);
const HOST_ORIGIN = params.get("host") || "*";
const INSTANCE_ID = params.get("instance") || "";
const ERPNEXT_APP_URL = params.get("erpUrl") || "";

window.addEventListener("message", (e: MessageEvent) => {
  if (HOST_ORIGIN !== "*" && e.origin !== HOST_ORIGIN) return;
  const data = e.data as RpcReply | null;
  if (!data || data.type !== "yapp-ext.rpc.reply") return;
  const waiter = pending.get(data.id);
  if (!waiter) return;
  pending.delete(data.id);
  if (data.ok) waiter.resolve(data.result);
  else waiter.reject(new ApiError(data.error.status ?? 0, data.error.message));
});

function rpc<T>(method: RpcMethod, ...args: unknown[]): Promise<T> {
  if (!window.parent || window.parent === window) {
    return Promise.reject(new Error("Extension loaded outside Y-app iframe"));
  }
  const id = nextId();
  const env: RpcEnvelope = { id, type: "yapp-ext.rpc", method, args };
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    window.parent.postMessage(env, HOST_ORIGIN);
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`RPC timeout (${method})`));
      }
    }, 60_000);
  });
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export function fetchList<T = unknown>(doctype: string, opts: Record<string, unknown> = {}): Promise<T[]> {
  return rpc<T[]>("fetchList", doctype, opts);
}

export function fetchDocument<T = unknown>(doctype: string, name: string): Promise<T> {
  return rpc<T>("fetchDocument", doctype, name);
}

export function updateDocument(doctype: string, name: string, patch: Record<string, unknown>): Promise<void> {
  return rpc<void>("updateDocument", doctype, name, patch);
}

export function callMethod<T = unknown>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  return rpc<T>("callMethod", method, args);
}

/** Convenience — same shape as Y-app's lib/erpnext.getErpNextAppUrl(). */
export function getErpNextAppUrl(): string {
  return ERPNEXT_APP_URL;
}

/** Convenience — same shape as Y-app's lib/instances.getActiveInstanceId(). */
export function getActiveInstanceId(): string {
  return INSTANCE_ID;
}
