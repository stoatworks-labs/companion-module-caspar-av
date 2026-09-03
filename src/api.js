import WebSocket from "ws";
import { InstanceStatus } from "@companion-module/base";

// caspar-avd exposes one type — Snapshot — as its entire read interface, pushed
// over /ws/ui on a 200 ms tick but only when the serialised form changed. So
// this module holds no authoritative state of its own, exactly as the console
// does not.
//
// Three health signals live in there and are deliberately NOT the same thing.
// Conflating them sends people to the wrong fault:
//
//   this socket        the module's connection to caspar-avd
//   snapshot.health    caspar-avd's connection to CasparCG
//   channels empty     CasparCG is up and commands work, but no telemetry is
//                      arriving (OSC SUBSCRIBE refused, or a firewall)
//
// All three get their own feedback.

const RECONNECT_MS = 3000;

function base(self) {
  return `http://${self.config.host}:${self.config.port}`;
}

export async function getJson(self, path) {
  const res = await fetch(`${base(self)}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: HTTP ${res.status}`);
  return res.json();
}

export async function send(self, method, path, body) {
  const res = await fetch(`${base(self)}${path}`, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const parsed = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      parsed.error || `${method} ${path} failed: HTTP ${res.status}`,
    );
  }
  return parsed;
}

export const post = (self, path, body) => send(self, "POST", path, body);
export const patch = (self, path, body) => send(self, "PATCH", path, body);
export const put = (self, path, body) => send(self, "PUT", path, body);
export const del = (self, path) => send(self, "DELETE", path);

/**
 * Send one raw AMCP command.
 *
 * The reply carries CasparCG's own code and status, and a 400 there means the
 * command was malformed — most often the two-word trap: a two-word command puts
 * its target BETWEEN the words. `MIXER 1-10 FILL ...` is right;
 * `MIXER FILL 1-10 ...` answers 400 ERROR and looks like a broken module.
 * The error message says so, because that mistake costs an hour otherwise.
 */
export async function rawCommand(self, command) {
  const body = await post(self, "/api/command", { command });
  const code = Number(body.code);
  if (code >= 400) {
    throw new Error(
      `CasparCG answered ${body.code} ${body.status ?? ""}`.trim() +
        (code === 400
          ? " — a malformed command. Note a two-word AMCP command puts its target BETWEEN the words: 'MIXER 1-10 FILL', not 'MIXER FILL 1-10'."
          : ""),
    );
  }
  return body;
}

export const socket = {
  ws: null,
  reconnectTimer: null,
  closing: false,

  connect(self) {
    this.closing = false;
    let ws;
    try {
      ws = new WebSocket(`ws://${self.config.host}:${self.config.port}/ws/ui`);
    } catch (e) {
      self.updateStatus(InstanceStatus.ConnectionFailure, e.message);
      this.scheduleReconnect(self);
      return;
    }
    this.ws = ws;

    ws.on("open", () => {
      self.log("info", `Connected to caspar-avd at ${self.config.host}`);
      self.updateStatus(InstanceStatus.Ok);
    });

    ws.on("message", (data) => {
      let snapshot;
      try {
        snapshot = JSON.parse(data.toString());
      } catch {
        return;
      }
      self.applySnapshot(snapshot);
    });

    ws.on("close", () => {
      if (this.closing) return;
      self.updateStatus(InstanceStatus.Disconnected, "caspar-avd disconnected");
      this.scheduleReconnect(self);
    });

    ws.on("error", (err) => {
      self.updateStatus(InstanceStatus.ConnectionFailure, err.message);
    });
  },

  scheduleReconnect(self) {
    if (this.closing || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(self);
    }, RECONNECT_MS);
  },

  close() {
    this.closing = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      try {
        ws.removeAllListeners();
        // close() on a socket still in CONNECTING calls abortHandshake(), which
        // defers the failure: `process.nextTick(emitErrorAndClose, ...)`. That
        // 'error' therefore lands after this function has returned and after the
        // catch below has gone out of scope, on a socket whose listeners we just
        // removed — and Node throws on an unlistened 'error', killing the module
        // process. A no-op listener that outlives close() is what absorbs it.
        ws.on("error", () => {});
        ws.close();
      } catch {
        // Closing a socket that never opened can also throw synchronously;
        // nothing to recover.
      }
    }
  },
};
