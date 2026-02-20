#!/usr/bin/env node

/**
 * Eno MCP Server
 * Version: 2.1.0
 * SDK: @modelcontextprotocol/sdk 0.5.0
 * Transport: SSE (MCP spec 2024-11-05)
 *
 * Tools:
 *   get_balance        — balance for one or all accounts
 *   get_transactions   — recent transactions for an account
 *   lock_card          — lock a credit card
 *   unlock_card        — unlock a credit card
 *
 * Accounts (mock):
 *   Venture X   credit card  x5660
 *   Venture     credit card  5961
 *   360 Checking             x1960
 */

import express from "express";
import cors from "cors";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

const SERVER_VERSION = "2.1.0";

// ─────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────

const ACCOUNTS = {
  venture_x: {
    id: "acct_venturex_5660",
    name: "Venture X",
    type: "credit_card",
    last4: "5660",
    balance: 2847.53,
    available_credit: 17152.47,
    credit_limit: 20000.00,
    currency: "USD",
    status: "active",
    locked: false,
  },
  venture: {
    id: "acct_venture_5961",
    name: "Venture",
    type: "credit_card",
    last4: "5961",
    balance: 1204.88,
    available_credit: 8795.12,
    credit_limit: 10000.00,
    currency: "USD",
    status: "active",
    locked: false,
  },
  checking: {
    id: "acct_360checking_1960",
    name: "360 Checking",
    type: "checking",
    last4: "1960",
    balance: 5342.19,
    currency: "USD",
    status: "active",
    locked: false,
  },
};

const TRANSACTIONS = {
  acct_venturex_5660: [
    { id: "txn_001", date: "2026-02-18", merchant: "Delta Airlines",            amount: -342.50, category: "Travel",    status: "posted" },
    { id: "txn_002", date: "2026-02-17", merchant: "Whole Foods Market",        amount:  -87.23, category: "Groceries", status: "posted" },
    { id: "txn_003", date: "2026-02-16", merchant: "Capital One Travel Portal", amount: -520.00, category: "Travel",    status: "posted" },
    { id: "txn_004", date: "2026-02-15", merchant: "Netflix",                   amount:  -15.49, category: "Streaming", status: "posted" },
    { id: "txn_005", date: "2026-02-14", merchant: "Nobu Restaurant",           amount: -210.80, category: "Dining",    status: "posted" },
  ],
  acct_venture_5961: [
    { id: "txn_101", date: "2026-02-18", merchant: "Amazon",            amount: -134.99, category: "Shopping", status: "posted" },
    { id: "txn_102", date: "2026-02-17", merchant: "Shell Gas Station", amount:  -62.45, category: "Gas",      status: "posted" },
    { id: "txn_103", date: "2026-02-16", merchant: "Starbucks",         amount:   -7.85, category: "Dining",   status: "posted" },
    { id: "txn_104", date: "2026-02-15", merchant: "Target",            amount:  -94.12, category: "Shopping", status: "posted" },
    { id: "txn_105", date: "2026-02-14", merchant: "Spotify",           amount:  -10.99, category: "Streaming",status: "posted" },
  ],
  acct_360checking_1960: [
    { id: "txn_201", date: "2026-02-18", merchant: "Direct Deposit - Payroll", amount:  3200.00, category: "Income",    status: "posted" },
    { id: "txn_202", date: "2026-02-17", merchant: "Rent Payment - Zelle",     amount: -1850.00, category: "Housing",   status: "posted" },
    { id: "txn_203", date: "2026-02-16", merchant: "Venmo Transfer",           amount:   -45.00, category: "Transfer",  status: "posted" },
    { id: "txn_204", date: "2026-02-15", merchant: "ATM Withdrawal",           amount:  -200.00, category: "Cash",      status: "posted" },
    { id: "txn_205", date: "2026-02-14", merchant: "Utility Bill - AutoPay",   amount:  -123.50, category: "Utilities", status: "posted" },
  ],
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function resolveAccount(identifier) {
  if (!identifier) return null;
  const s = identifier.toLowerCase().replace(/[\s_\-]/g, "");
  if (s.includes("venturex") || s.includes("5660")) return ACCOUNTS.venture_x;
  if (s.includes("venture")  || s.includes("5961")) return ACCOUNTS.venture;
  if (s.includes("360") || s.includes("checking")  || s.includes("1960")) return ACCOUNTS.checking;
  return null;
}

function accountList() {
  return Object.values(ACCOUNTS)
    .map((a) => `• ${a.name} (${a.type}) ending in ${a.last4}`)
    .join("\n");
}

// ─────────────────────────────────────────────
// Tool Handlers
// ─────────────────────────────────────────────

function handleGetBalance({ account } = {}) {
  if (!account) {
    return {
      success: true,
      accounts: Object.values(ACCOUNTS).map((a) => ({
        account_name: a.name,
        account_type: a.type,
        last4: a.last4,
        balance: a.balance,
        currency: a.currency,
        status: a.status,
        locked: a.locked,
        ...(a.type === "credit_card" ? { available_credit: a.available_credit, credit_limit: a.credit_limit } : {}),
      })),
    };
  }
  const a = resolveAccount(account);
  if (!a) return { success: false, error: `Account not found: "${account}".\nAvailable:\n${accountList()}` };
  return {
    success: true,
    account_name: a.name,
    account_type: a.type,
    last4: a.last4,
    balance: a.balance,
    currency: a.currency,
    status: a.status,
    locked: a.locked,
    ...(a.type === "credit_card" ? { available_credit: a.available_credit, credit_limit: a.credit_limit } : {}),
  };
}

function handleGetTransactions({ account, limit = 5 } = {}) {
  if (!account) return { success: false, error: `Please specify an account.\nAvailable:\n${accountList()}` };
  const a = resolveAccount(account);
  if (!a) return { success: false, error: `Account not found: "${account}".\nAvailable:\n${accountList()}` };
  const txns = (TRANSACTIONS[a.id] || []).slice(0, Math.min(Number(limit), 20));
  return { success: true, account_name: a.name, last4: a.last4, transaction_count: txns.length, transactions: txns };
}

function handleLockCard({ account } = {}) {
  if (!account) return { success: false, error: `Please specify a card.\nLockable: Venture X (5660), Venture (5961)` };
  const a = resolveAccount(account);
  if (!a) return { success: false, error: `Card not found: "${account}"` };
  if (a.type !== "credit_card") return { success: false, error: `${a.name} is a ${a.type} — only credit cards can be locked.` };
  if (a.locked) return { success: true, message: `${a.name} ending in ${a.last4} is already locked.`, locked: true };
  a.locked = true;
  a.status = "locked";
  return { success: true, message: `${a.name} ending in ${a.last4} has been locked. No new purchases until unlocked.`, account_name: a.name, last4: a.last4, locked: true };
}

function handleUnlockCard({ account } = {}) {
  if (!account) return { success: false, error: `Please specify a card.\nUnlockable: Venture X (5660), Venture (5961)` };
  const a = resolveAccount(account);
  if (!a) return { success: false, error: `Card not found: "${account}"` };
  if (a.type !== "credit_card") return { success: false, error: `${a.name} is a ${a.type} — only credit cards can be unlocked.` };
  if (!a.locked) return { success: true, message: `${a.name} ending in ${a.last4} is already active.`, locked: false };
  a.locked = false;
  a.status = "active";
  return { success: true, message: `${a.name} ending in ${a.last4} has been unlocked and is ready to use.`, account_name: a.name, last4: a.last4, locked: false };
}

// ─────────────────────────────────────────────
// MCP Server Factory
// ─────────────────────────────────────────────

function createMCPServer() {
  const server = new Server(
    { name: "eno-mcp-server", version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "get_balance",
        description: "Get the current balance for one or all Capital One accounts. Accounts: Venture X (x5660), Venture (5961), 360 Checking (x1960). Omit account to get all.",
        inputSchema: {
          type: "object",
          properties: {
            account: { type: "string", description: "Account identifier e.g. 'Venture X', '5660', '360 Checking'. Omit for all accounts." },
          },
        },
      },
      {
        name: "get_transactions",
        description: "Get recent transactions for a Capital One account.",
        inputSchema: {
          type: "object",
          required: ["account"],
          properties: {
            account: { type: "string", description: "Account identifier e.g. 'Venture X', '5961', '360 Checking'." },
            limit:   { type: "number", description: "Number of transactions to return. Default: 5. Max: 20." },
          },
        },
      },
      {
        name: "lock_card",
        description: "Lock a Capital One credit card to prevent new purchases. Only for Venture X and Venture cards.",
        inputSchema: {
          type: "object",
          required: ["account"],
          properties: {
            account: { type: "string", description: "Card to lock e.g. 'Venture X', '5660', 'Venture', '5961'." },
          },
        },
      },
      {
        name: "unlock_card",
        description: "Unlock a previously locked Capital One credit card. Only for Venture X and Venture cards.",
        inputSchema: {
          type: "object",
          required: ["account"],
          properties: {
            account: { type: "string", description: "Card to unlock e.g. 'Venture X', '5660', 'Venture', '5961'." },
          },
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handlers = {
      get_balance:      handleGetBalance,
      get_transactions: handleGetTransactions,
      lock_card:        handleLockCard,
      unlock_card:      handleUnlockCard,
    };
    const result = handlers[name]
      ? handlers[name](args || {})
      : { success: false, error: `Unknown tool: ${name}` };
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  });

  return server;
}

// ─────────────────────────────────────────────
// Express + SSE
// ─────────────────────────────────────────────

const app = express();
app.use(cors({ origin: "*", methods: ["GET", "POST"], allowedHeaders: ["Content-Type", "Accept"] }));
app.use(express.json());

const transports = new Map();

app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: "eno-mcp-server", version: SERVER_VERSION });
});

app.get("/sse", async (req, res) => {
  console.log(`[SSE] New connection from ${req.ip}`);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const transport = new SSEServerTransport("/message", res);
  transports.set(transport.sessionId, transport);
  console.log(`[SSE] Session: ${transport.sessionId}`);

  res.on("close", () => {
    console.log(`[SSE] Closed: ${transport.sessionId}`);
    transports.delete(transport.sessionId);
  });

  await createMCPServer().connect(transport);
});

app.post("/message", async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports.get(sessionId);
  if (!transport) {
    console.error(`[POST] Session not found: ${sessionId}`);
    return res.status(404).json({ error: "Session not found" });
  }
  try {
    await transport.handlePostMessage(req, res);
  } catch (err) {
    console.error(`[POST] Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Eno MCP Server v${SERVER_VERSION}`);
  console.log(`  Port: ${PORT}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  GET  /health  — status`);
  console.log(`  GET  /sse     — MCP SSE endpoint`);
  console.log(`  POST /message — MCP message handler`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
});
