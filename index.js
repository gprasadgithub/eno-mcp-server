#!/usr/bin/env node

/**
 * Eno MCP Server — StreamableHTTP + SSE fallback (MCP spec 2025-11-25)
 * Capital One Conversational AI Integration
 */

import express from "express";
import cors from "cors";
import { randomUUID } from "crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema, isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

// ── Mock Data ──────────────────────────────────────────────────────────────

const ACCOUNTS = {
  venture_x: { id: "acct_venturex_5660", name: "Venture X",    type: "credit_card", last4: "5660", balance: 2847.53, available_credit: 17152.47, credit_limit: 20000, currency: "USD", status: "active", locked: false },
  venture:   { id: "acct_venture_5961",  name: "Venture",      type: "credit_card", last4: "5961", balance: 1204.88, available_credit: 8795.12,  credit_limit: 10000, currency: "USD", status: "active", locked: false },
  checking:  { id: "acct_360checking_1960", name: "360 Checking", type: "checking", last4: "1960", balance: 5342.19, currency: "USD", status: "active", locked: false },
};

const TRANSACTIONS = {
  acct_venturex_5660: [
    { id: "txn_001", date: "2025-02-18", merchant: "Delta Airlines",            amount: -342.50, category: "Travel",    status: "posted" },
    { id: "txn_002", date: "2025-02-17", merchant: "Whole Foods Market",        amount:  -87.23, category: "Groceries", status: "posted" },
    { id: "txn_003", date: "2025-02-16", merchant: "Capital One Travel Portal", amount: -520.00, category: "Travel",    status: "posted" },
    { id: "txn_004", date: "2025-02-15", merchant: "Netflix",                   amount:  -15.49, category: "Streaming", status: "posted" },
    { id: "txn_005", date: "2025-02-14", merchant: "Nobu Restaurant",           amount: -210.80, category: "Dining",    status: "posted" },
  ],
  acct_venture_5961: [
    { id: "txn_101", date: "2025-02-18", merchant: "Amazon",            amount: -134.99, category: "Shopping", status: "posted" },
    { id: "txn_102", date: "2025-02-17", merchant: "Shell Gas Station", amount:  -62.45, category: "Gas",      status: "posted" },
    { id: "txn_103", date: "2025-02-16", merchant: "Starbucks",         amount:   -7.85, category: "Dining",   status: "posted" },
    { id: "txn_104", date: "2025-02-15", merchant: "Target",            amount:  -94.12, category: "Shopping", status: "posted" },
    { id: "txn_105", date: "2025-02-14", merchant: "Spotify",           amount:  -10.99, category: "Streaming",status: "posted" },
  ],
  acct_360checking_1960: [
    { id: "txn_201", date: "2025-02-18", merchant: "Direct Deposit - Payroll", amount:  3200.00, category: "Income",    status: "posted" },
    { id: "txn_202", date: "2025-02-17", merchant: "Rent Payment - Zelle",     amount: -1850.00, category: "Housing",   status: "posted" },
    { id: "txn_203", date: "2025-02-16", merchant: "Venmo Transfer",           amount:   -45.00, category: "Transfer",  status: "posted" },
    { id: "txn_204", date: "2025-02-15", merchant: "ATM Withdrawal",           amount:  -200.00, category: "Cash",      status: "posted" },
    { id: "txn_205", date: "2025-02-14", merchant: "Utility Bill - AutoPay",   amount:  -123.50, category: "Utilities", status: "posted" },
  ],
};

// ── Helpers ────────────────────────────────────────────────────────────────

function resolveAccount(id) {
  if (!id) return null;
  const s = id.toLowerCase().replace(/[\s_-]/g, "");
  if (s.includes("venturex") || s.includes("5660")) return ACCOUNTS.venture_x;
  if (s.includes("venture")  || s.includes("5961")) return ACCOUNTS.venture;
  if (s.includes("360") || s.includes("checking")  || s.includes("1960")) return ACCOUNTS.checking;
  return null;
}

function accountList() {
  return Object.values(ACCOUNTS).map(a => `• ${a.name} (${a.type}) ending in ${a.last4}`).join("\n");
}

// ── Tool Handlers ──────────────────────────────────────────────────────────

function handleGetBalance({ account } = {}) {
  if (!account) {
    return { success: true, accounts: Object.values(ACCOUNTS).map(a => ({ account_name: a.name, account_type: a.type, last4: a.last4, balance: a.balance, ...(a.type === "credit_card" ? { available_credit: a.available_credit, credit_limit: a.credit_limit } : {}), currency: a.currency, status: a.status, locked: a.locked })) };
  }
  const a = resolveAccount(account);
  if (!a) return { success: false, error: `Account not found: "${account}". Available:\n${accountList()}` };
  return { success: true, account_name: a.name, account_type: a.type, last4: a.last4, balance: a.balance, ...(a.type === "credit_card" ? { available_credit: a.available_credit, credit_limit: a.credit_limit } : {}), currency: a.currency, status: a.status, locked: a.locked };
}

function handleGetTransactions({ account, limit = 5 } = {}) {
  if (!account) return { success: false, error: `Please specify an account. Available:\n${accountList()}` };
  const a = resolveAccount(account);
  if (!a) return { success: false, error: `Account not found: "${account}". Available:\n${accountList()}` };
  const txns = (TRANSACTIONS[a.id] || []).slice(0, Math.min(limit, 20));
  return { success: true, account_name: a.name, last4: a.last4, transaction_count: txns.length, transactions: txns };
}

function handleLockCard({ account } = {}) {
  if (!account) return { success: false, error: `Specify a card. Cards: Venture X (5660), Venture (5961)` };
  const a = resolveAccount(account);
  if (!a) return { success: false, error: `Card not found: "${account}"` };
  if (a.type !== "credit_card") return { success: false, error: `${a.name} is a ${a.type} — only credit cards can be locked.` };
  if (a.locked) return { success: false, message: `${a.name} ending in ${a.last4} is already locked.` };
  a.locked = true; a.status = "locked";
  return { success: true, message: `${a.name} ending in ${a.last4} has been locked. No new purchases until unlocked.`, locked: true };
}

function handleUnlockCard({ account } = {}) {
  if (!account) return { success: false, error: `Specify a card. Cards: Venture X (5660), Venture (5961)` };
  const a = resolveAccount(account);
  if (!a) return { success: false, error: `Card not found: "${account}"` };
  if (a.type !== "credit_card") return { success: false, error: `${a.name} is a ${a.type} — only credit cards can be unlocked.` };
  if (!a.locked) return { success: false, message: `${a.name} ending in ${a.last4} is already active.` };
  a.locked = false; a.status = "active";
  return { success: true, message: `${a.name} ending in ${a.last4} has been unlocked and is ready to use.`, locked: false };
}

// ── MCP Server Factory ─────────────────────────────────────────────────────

function createMCPServer() {
  const server = new Server({ name: "eno-mcp-server", version: "1.0.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      { name: "get_balance",      description: "Get balance for one or all Capital One accounts (Venture X x5660, Venture 5961, 360 Checking x1960). Omit account for all.", inputSchema: { type: "object", properties: { account: { type: "string", description: "Account identifier e.g. 'Venture X', '5660', '360 Checking'. Omit for all." } } } },
      { name: "get_transactions", description: "Get recent transactions for a Capital One account.", inputSchema: { type: "object", required: ["account"], properties: { account: { type: "string", description: "Account identifier" }, limit: { type: "number", description: "Number to return (default 5, max 20)" } } } },
      { name: "lock_card",        description: "Lock a Venture X or Venture credit card to block new purchases.", inputSchema: { type: "object", required: ["account"], properties: { account: { type: "string", description: "Card to lock e.g. 'Venture X', 'Venture', '5660'" } } } },
      { name: "unlock_card",      description: "Unlock a previously locked Venture X or Venture credit card.", inputSchema: { type: "object", required: ["account"], properties: { account: { type: "string", description: "Card to unlock e.g. 'Venture X', 'Venture', '5961'" } } } },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const map = { get_balance: handleGetBalance, get_transactions: handleGetTransactions, lock_card: handleLockCard, unlock_card: handleUnlockCard };
    const result = map[name] ? map[name](args || {}) : { success: false, error: `Unknown tool: ${name}` };
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  });

  return server;
}

// ── Express App ────────────────────────────────────────────────────────────

const app = express();
app.use(cors({ origin: "*", methods: ["GET", "POST", "DELETE"], allowedHeaders: ["Content-Type", "Accept", "Mcp-Session-Id"] }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", server: "eno-mcp-server", version: "1.0.0" }));

// ── StreamableHTTP (modern MCP 2025-11-25) ──
const sessions = new Map();

app.all("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];

  if (req.method === "DELETE") {
    if (sessionId && sessions.has(sessionId)) {
      sessions.delete(sessionId);
      console.log(`[MCP] Session deleted: ${sessionId}`);
    }
    return res.status(200).json({ ok: true });
  }

  if (req.method === "GET") {
    if (!sessionId || !sessions.has(sessionId)) return res.status(400).json({ error: "Invalid session" });
    return sessions.get(sessionId).handleRequest(req, res);
  }

  // POST
  if (sessionId && sessions.has(sessionId)) {
    return sessions.get(sessionId).handleRequest(req, res, req.body);
  }

  if (!isInitializeRequest(req.body)) {
    return res.status(400).json({ error: "Expected initialize request" });
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      sessions.set(id, transport);
      console.log(`[MCP] Session created: ${id}`);
    },
  });

  transport.onclose = () => {
    if (transport.sessionId) sessions.delete(transport.sessionId);
  };

  await createMCPServer().connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// ── Legacy SSE (fallback) ──
const sseTransports = new Map();

app.get("/sse", async (req, res) => {
  console.log(`[SSE] New connection`);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const transport = new SSEServerTransport("/message", res);
  sseTransports.set(transport.sessionId, transport);
  res.on("close", () => sseTransports.delete(transport.sessionId));

  await createMCPServer().connect(transport);
});

app.post("/message", async (req, res) => {
  const transport = sseTransports.get(req.query.sessionId);
  if (!transport) return res.status(404).json({ error: "Session not found" });
  try { await transport.handlePostMessage(req, res); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Start ──────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Eno MCP Server on port ${PORT}`);
  console.log(`  /health  — status check`);
  console.log(`  /mcp     — StreamableHTTP (MCP 2025-11-25)`);
  console.log(`  /sse     — SSE legacy fallback`);
});
