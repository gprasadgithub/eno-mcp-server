#!/usr/bin/env node

/**
 * Eno MCP Server — SSE Transport
 * Capital One Conversational AI Integration
 *
 * Tools: get_balance, get_transactions, lock_card, unlock_card
 *
 * Accounts (mock data):
 *   - Venture X credit card ending in x5660
 *   - Venture credit card ending in 5961
 *   - 360 Checking account ending in x1960
 */

import express from "express";
import cors from "cors";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ─────────────────────────────────────────────
// Mock Data Store (replace with real API calls)
// ─────────────────────────────────────────────

const ACCOUNTS = {
  venture_x: {
    id: "acct_venturex_5660",
    name: "Venture X",
    type: "credit_card",
    last4: "5660",
    balance: 2847.53,
    available_credit: 17152.47,
    credit_limit: 20000.0,
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
    credit_limit: 10000.0,
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
    { id: "txn_001", date: "2025-02-18", merchant: "Delta Airlines",           amount: -342.50, category: "Travel",    status: "posted" },
    { id: "txn_002", date: "2025-02-17", merchant: "Whole Foods Market",       amount: -87.23,  category: "Groceries", status: "posted" },
    { id: "txn_003", date: "2025-02-16", merchant: "Capital One Travel Portal",amount: -520.00, category: "Travel",    status: "posted" },
    { id: "txn_004", date: "2025-02-15", merchant: "Netflix",                  amount: -15.49,  category: "Streaming", status: "posted" },
    { id: "txn_005", date: "2025-02-14", merchant: "Nobu Restaurant",          amount: -210.80, category: "Dining",    status: "posted" },
  ],
  acct_venture_5961: [
    { id: "txn_101", date: "2025-02-18", merchant: "Amazon",         amount: -134.99, category: "Shopping", status: "posted" },
    { id: "txn_102", date: "2025-02-17", merchant: "Shell Gas Station",amount: -62.45, category: "Gas",      status: "posted" },
    { id: "txn_103", date: "2025-02-16", merchant: "Starbucks",      amount: -7.85,   category: "Dining",   status: "posted" },
    { id: "txn_104", date: "2025-02-15", merchant: "Target",         amount: -94.12,  category: "Shopping", status: "posted" },
    { id: "txn_105", date: "2025-02-14", merchant: "Spotify",        amount: -10.99,  category: "Streaming",status: "posted" },
  ],
  acct_360checking_1960: [
    { id: "txn_201", date: "2025-02-18", merchant: "Direct Deposit - Payroll", amount:  3200.00, category: "Income",    status: "posted" },
    { id: "txn_202", date: "2025-02-17", merchant: "Rent Payment - Zelle",     amount: -1850.00, category: "Housing",   status: "posted" },
    { id: "txn_203", date: "2025-02-16", merchant: "Venmo Transfer",           amount: -45.00,   category: "Transfer",  status: "posted" },
    { id: "txn_204", date: "2025-02-15", merchant: "ATM Withdrawal",           amount: -200.00,  category: "Cash",      status: "posted" },
    { id: "txn_205", date: "2025-02-14", merchant: "Utility Bill - AutoPay",   amount: -123.50,  category: "Utilities", status: "posted" },
  ],
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function resolveAccount(identifier) {
  if (!identifier) return null;
  const s = identifier.toLowerCase().replace(/[\s_-]/g, "");
  if (s.includes("venturex") || s.includes("5660")) return ACCOUNTS.venture_x;
  if (s.includes("venture")  || s.includes("5961")) return ACCOUNTS.venture;
  if (s.includes("360")      || s.includes("checking") || s.includes("1960")) return ACCOUNTS.checking;
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
    const summary = Object.values(ACCOUNTS).map((a) => {
      const base = { account_name: a.name, account_type: a.type, last4: a.last4, balance: a.balance, currency: a.currency, status: a.status, locked: a.locked };
      if (a.type === "credit_card") { base.available_credit = a.available_credit; base.credit_limit = a.credit_limit; }
      return base;
    });
    return { success: true, accounts: summary };
  }
  const acct = resolveAccount(account);
  if (!acct) return { success: false, error: `Account not found: "${account}". Available:\n${accountList()}` };
  const result = { success: true, account_name: acct.name, account_type: acct.type, last4: acct.last4, balance: acct.balance, currency: acct.currency, status: acct.status, locked: acct.locked };
  if (acct.type === "credit_card") { result.available_credit = acct.available_credit; result.credit_limit = acct.credit_limit; }
  return result;
}

function handleGetTransactions({ account, limit = 5 } = {}) {
  if (!account) return { success: false, error: `Please specify an account. Available:\n${accountList()}` };
  const acct = resolveAccount(account);
  if (!acct) return { success: false, error: `Account not found: "${account}". Available:\n${accountList()}` };
  const txns = (TRANSACTIONS[acct.id] || []).slice(0, Math.min(limit, 20));
  return { success: true, account_name: acct.name, last4: acct.last4, transaction_count: txns.length, transactions: txns };
}

function handleLockCard({ account } = {}) {
  if (!account) return { success: false, error: `Please specify a card to lock.\n• Venture X ending in 5660\n• Venture ending in 5961` };
  const acct = resolveAccount(account);
  if (!acct) return { success: false, error: `Card not found: "${account}"` };
  if (acct.type !== "credit_card") return { success: false, error: `${acct.name} is a ${acct.type} — only credit cards can be locked.` };
  if (acct.locked) return { success: false, message: `Your ${acct.name} card ending in ${acct.last4} is already locked.` };
  acct.locked = true;
  acct.status = "locked";
  return { success: true, message: `Your ${acct.name} card ending in ${acct.last4} has been locked. No new purchases can be made until you unlock it.`, account_name: acct.name, last4: acct.last4, locked: true };
}

function handleUnlockCard({ account } = {}) {
  if (!account) return { success: false, error: `Please specify a card to unlock.\n• Venture X ending in 5660\n• Venture ending in 5961` };
  const acct = resolveAccount(account);
  if (!acct) return { success: false, error: `Card not found: "${account}"` };
  if (acct.type !== "credit_card") return { success: false, error: `${acct.name} is a ${acct.type} — only credit cards can be unlocked.` };
  if (!acct.locked) return { success: false, message: `Your ${acct.name} card ending in ${acct.last4} is already active.` };
  acct.locked = false;
  acct.status = "active";
  return { success: true, message: `Your ${acct.name} card ending in ${acct.last4} has been unlocked and is ready to use.`, account_name: acct.name, last4: acct.last4, locked: false };
}

// ─────────────────────────────────────────────
// MCP Server
// ─────────────────────────────────────────────

function createMCPServer() {
  const server = new Server(
    { name: "eno-mcp-server", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "get_balance",
        description: "Get the current balance for one or all Capital One accounts. Accounts: Venture X (x5660), Venture (5961), 360 Checking (x1960). Omit account to get all balances.",
        inputSchema: {
          type: "object",
          properties: {
            account: { type: "string", description: 'Account identifier. Examples: "Venture X", "5660", "360 Checking". Omit for all accounts.' },
          },
        },
      },
      {
        name: "get_transactions",
        description: "Get recent transactions for a Capital One account.",
        inputSchema: {
          type: "object",
          properties: {
            account: { type: "string", description: 'Account identifier. Examples: "Venture X", "5961", "checking".' },
            limit:   { type: "number", description: "Number of transactions to return (default: 5, max: 20)." },
          },
          required: ["account"],
        },
      },
      {
        name: "lock_card",
        description: "Lock a Capital One credit card to prevent new purchases. Only applies to credit cards (Venture X, Venture).",
        inputSchema: {
          type: "object",
          properties: {
            account: { type: "string", description: 'Card to lock. Examples: "Venture X", "5660", "Venture", "5961".' },
          },
          required: ["account"],
        },
      },
      {
        name: "unlock_card",
        description: "Unlock a previously locked Capital One credit card. Only applies to credit cards (Venture X, Venture).",
        inputSchema: {
          type: "object",
          properties: {
            account: { type: "string", description: 'Card to unlock. Examples: "Venture X", "5660", "Venture", "5961".' },
          },
          required: ["account"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handlers = { get_balance: handleGetBalance, get_transactions: handleGetTransactions, lock_card: handleLockCard, unlock_card: handleUnlockCard };
    const handler = handlers[name];
    const result = handler ? handler(args || {}) : { success: false, error: `Unknown tool: ${name}` };
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  });

  return server;
}

// ─────────────────────────────────────────────
// Express + SSE
// ─────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

// Store active transports keyed by session ID
const transports = new Map();

app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: "eno-mcp-server", version: "1.0.0" });
});

app.get("/sse", async (req, res) => {
  console.log(`[SSE] New connection from ${req.ip}`);
  const transport = new SSEServerTransport("/message", res);
  transports.set(transport.sessionId, transport);

  res.on("close", () => {
    console.log(`[SSE] Connection closed: ${transport.sessionId}`);
    transports.delete(transport.sessionId);
  });

  const server = createMCPServer();
  await server.connect(transport);
});

app.post("/message", async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports.get(sessionId);
  if (!transport) {
    return res.status(404).json({ error: "Session not found" });
  }
  await transport.handlePostMessage(req, res);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Eno MCP Server listening on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`SSE:    http://localhost:${PORT}/sse`);
});
