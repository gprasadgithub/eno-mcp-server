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
import { SSEServerTransport } from "./sse-transport.js";

const SERVER_VERSION = "2.2.0";

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
// MCP-UI HTML Generators (Capital One styled)
// ─────────────────────────────────────────────

function buildBalanceHTML(data) {
  const accounts = data.accounts || [data];
  const cards = accounts.map(a => {
    const isCredit = a.account_type === "credit_card";
    const usedPct = isCredit ? Math.round(((a.credit_limit - a.available_credit) / a.credit_limit) * 100) : 0;
    const icon = isCredit ? "💳" : "🏦";
    const tagColor = a.locked ? "#dc2626" : (a.status === "active" ? "#16a34a" : "#d97706");
    const tagLabel = a.locked ? "🔒 Locked" : a.status.charAt(0).toUpperCase() + a.status.slice(1);

    return `
      <div class="card">
        <div class="card-header">
          <div class="card-icon">${icon}</div>
          <div class="card-info">
            <div class="card-name">${a.account_name || a.name}</div>
            <div class="card-last4">•••• ${a.last4}</div>
          </div>
          <div class="status-tag" style="background:${tagColor}20;color:${tagColor};border:1px solid ${tagColor}40">${tagLabel}</div>
        </div>
        <div class="balance-row">
          <div class="balance-label">${isCredit ? "Current Balance" : "Available Balance"}</div>
          <div class="balance-amount">$${a.balance.toLocaleString("en-US", {minimumFractionDigits:2})}</div>
        </div>
        ${isCredit ? `
        <div class="credit-section">
          <div class="credit-row">
            <span>Available Credit</span>
            <span class="credit-available">$${a.available_credit.toLocaleString("en-US",{minimumFractionDigits:2})}</span>
          </div>
          <div class="credit-row">
            <span>Credit Limit</span>
            <span>$${a.credit_limit.toLocaleString("en-US",{minimumFractionDigits:2})}</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width:${usedPct}%;background:${usedPct > 80 ? "#dc2626" : usedPct > 50 ? "#d97706" : "#004977"}"></div>
          </div>
          <div class="credit-used-label">${usedPct}% used</div>
        </div>` : ""}
      </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f0f4f8; padding: 16px; }
  h2 { font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 12px; }
  .card { background: #fff; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  .card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
  .card-icon { font-size: 24px; }
  .card-info { flex: 1; }
  .card-name { font-weight: 700; font-size: 15px; color: #1e293b; }
  .card-last4 { font-size: 12px; color: #94a3b8; margin-top: 2px; }
  .status-tag { font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 20px; }
  .balance-label { font-size: 12px; color: #64748b; margin-bottom: 4px; }
  .balance-amount { font-size: 28px; font-weight: 800; color: #004977; letter-spacing: -.5px; }
  .credit-section { margin-top: 14px; border-top: 1px solid #f1f5f9; padding-top: 12px; }
  .credit-row { display: flex; justify-content: space-between; font-size: 13px; color: #475569; margin-bottom: 6px; }
  .credit-available { font-weight: 600; color: #16a34a; }
  .progress-bar-bg { background: #e2e8f0; border-radius: 999px; height: 6px; margin-top: 8px; overflow: hidden; }
  .progress-bar-fill { height: 100%; border-radius: 999px; transition: width .3s; }
  .credit-used-label { font-size: 11px; color: #94a3b8; margin-top: 4px; text-align: right; }
</style>
</head>
<body>
  <h2>Account Balances</h2>
  ${cards}
  <script>
    new ResizeObserver(e => window.parent.postMessage({type:"ui-size-change",payload:{height:e[0].contentRect.height+32}},"*")).observe(document.documentElement);
  </script>
</body>
</html>`;
}

function buildTransactionsHTML(data) {
  const txns = data.transactions || [];
  const categoryColors = {
    Travel: "#6366f1", Groceries: "#16a34a", Streaming: "#8b5cf6",
    Dining: "#f59e0b", Shopping: "#ec4899", Gas: "#f97316",
    Income: "#16a34a", Housing: "#3b82f6", Transfer: "#64748b",
    Cash: "#94a3b8", Utilities: "#0ea5e9",
  };
  const categoryIcons = {
    Travel: "✈️", Groceries: "🛒", Streaming: "📺", Dining: "🍽️",
    Shopping: "🛍️", Gas: "⛽", Income: "💰", Housing: "🏠",
    Transfer: "↔️", Cash: "💵", Utilities: "💡",
  };

  const rows = txns.map(t => {
    const isDebit = t.amount < 0;
    const color = categoryColors[t.category] || "#64748b";
    const icon = categoryIcons[t.category] || "💳";
    const amt = Math.abs(t.amount).toLocaleString("en-US", {minimumFractionDigits:2});
    const date = new Date(t.date).toLocaleDateString("en-US", {month:"short",day:"numeric"});
    return `
      <div class="txn-row">
        <div class="txn-icon" style="background:${color}18;color:${color}">${icon}</div>
        <div class="txn-details">
          <div class="txn-merchant">${t.merchant}</div>
          <div class="txn-meta">
            <span class="txn-cat" style="background:${color}15;color:${color}">${t.category}</span>
            <span class="txn-date">${date}</span>
          </div>
        </div>
        <div class="txn-amount ${isDebit ? "debit" : "credit"}">${isDebit ? "-" : "+"}$${amt}</div>
      </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f0f4f8; padding: 16px; }
  .header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
  .header-title { font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
  .header-account { font-size: 13px; color: #004977; font-weight: 700; }
  .card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.08); overflow: hidden; }
  .txn-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #f8fafc; }
  .txn-row:last-child { border-bottom: none; }
  .txn-icon { width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
  .txn-details { flex: 1; min-width: 0; }
  .txn-merchant { font-weight: 600; font-size: 14px; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .txn-meta { display: flex; align-items: center; gap: 6px; margin-top: 3px; }
  .txn-cat { font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 20px; }
  .txn-date { font-size: 11px; color: #94a3b8; }
  .txn-amount { font-weight: 700; font-size: 15px; flex-shrink: 0; }
  .debit { color: #1e293b; }
  .credit { color: #16a34a; }
  .summary { display: flex; gap: 8px; margin-top: 10px; }
  .summary-pill { flex: 1; background: #fff; border-radius: 10px; padding: 10px 12px; box-shadow: 0 1px 3px rgba(0,0,0,.08); text-align: center; }
  .summary-label { font-size: 11px; color: #64748b; margin-bottom: 3px; }
  .summary-value { font-size: 16px; font-weight: 800; color: #004977; }
</style>
</head>
<body>
  <div class="header">
    <span class="header-title">Recent Transactions</span>
    <span class="header-account">${data.account_name} ••${data.last4}</span>
  </div>
  <div class="card">${rows}</div>
  ${(() => {
    const total = txns.reduce((s,t) => s + t.amount, 0);
    const spent = txns.filter(t=>t.amount<0).reduce((s,t)=>s+Math.abs(t.amount),0);
    const earned = txns.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0);
    return `<div class="summary">
      <div class="summary-pill"><div class="summary-label">Total Spent</div><div class="summary-value" style="color:#dc2626">$${spent.toFixed(2)}</div></div>
      ${earned > 0 ? `<div class="summary-pill"><div class="summary-label">Income</div><div class="summary-value" style="color:#16a34a">$${earned.toFixed(2)}</div></div>` : ""}
      <div class="summary-pill"><div class="summary-label">Net</div><div class="summary-value" style="color:${total>=0?"#16a34a":"#1e293b"}">${total>=0?"+":""}$${Math.abs(total).toFixed(2)}</div></div>
    </div>`;
  })()}
  <script>
    new ResizeObserver(e => window.parent.postMessage({type:"ui-size-change",payload:{height:e[0].contentRect.height+32}},"*")).observe(document.documentElement);
  </script>
</body>
</html>`;
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

    // Base text content (works everywhere including Claude Desktop)
    const content = [{ type: "text", text: JSON.stringify(result, null, 2) }];

    // Add MCP-UI resource for hosts that support it (Goose, MCP Apps compatible clients)
    if (result.success) {
      if (name === "get_balance") {
        const html = buildBalanceHTML(result);
        content.push({
          type: "resource",
          resource: {
            uri: `ui://eno/balance-${Date.now()}`,
            mimeType: "text/html;profile=mcp-app",
            text: html,
          }
        });
      } else if (name === "get_transactions") {
        const html = buildTransactionsHTML(result);
        content.push({
          type: "resource",
          resource: {
            uri: `ui://eno/transactions-${Date.now()}`,
            mimeType: "text/html;profile=mcp-app",
            text: html,
          }
        });
      }
    }

    return { content };
  });

  return server;
}

// ─────────────────────────────────────────────
// Express + SSE
// ─────────────────────────────────────────────

const app = express();
app.use(cors({ origin: "*", methods: ["GET", "POST"], allowedHeaders: ["Content-Type", "Accept"] }));
// NOTE: Do NOT use express.json() globally - it consumes req stream before MCP SDK can read it

const transports = new Map();

app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: "eno-mcp-server", version: SERVER_VERSION });
});

app.get("/sse", async (req, res) => {
  console.log(`[SSE] New connection from ${req.ip}`);

  // Keep Railway proxy from closing idle SSE connections
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const transport = new SSEServerTransport("/message", res);
  transports.set(transport.sessionId, transport);
  console.log(`[SSE] Session created: ${transport.sessionId}`);

  // Heartbeat every 15s to keep Railway proxy alive
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      res.write(": ping\n\n");
      console.log(`[SSE] Heartbeat: ${transport.sessionId}`);
    }
  }, 15000);

  res.on("close", () => {
    clearInterval(heartbeat);
    console.log(`[SSE] Connection closed: ${transport.sessionId}`);
    transports.delete(transport.sessionId);
  });

  try {
    await createMCPServer().connect(transport);
    console.log(`[SSE] MCP connected: ${transport.sessionId}`);
  } catch (err) {
    console.error(`[SSE] Connect error:`, err.message);
  }
});

// mcp-remote POSTs to /sse during http-first probe
app.post("/sse", (req, res) => {
  console.log(`[SSE] POST probe — returning 405`);
  res.status(405).set("Allow", "GET").json({ error: "SSE is GET only. POST messages to /message?sessionId=<id>" });
});

app.post("/message", async (req, res) => {
  const sessionId = req.query.sessionId;
  console.log(`[POST] session=${sessionId} active=${transports.size}`);
  const transport = transports.get(sessionId);
  if (!transport) {
    console.error(`[POST] Not found: ${sessionId}. Known: ${[...transports.keys()].join(", ")}`);
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
