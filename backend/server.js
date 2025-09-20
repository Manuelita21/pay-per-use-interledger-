import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const PORT = process.env.PORT || 3000;
const OPEN_PAYMENTS_BASE = process.env.OPEN_PAYMENTS_BASE || ""; 
const OPEN_PAYMENTS_API_KEY = process.env.OPEN_PAYMENTS_API_KEY || "TEST_KEY";

const app = express();
app.use(cors());
app.use(bodyParser.json());


const db = new Database("db.sqlite");
db.prepare(`
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    local_id TEXT,
    amount REAL,
    currency TEXT,
    payee TEXT,
    status TEXT,
    resource_url TEXT,
    op_response TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

async function callApi(url, method = "POST", body = null, extraHeaders = {}) {
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      
      "Authorization": `Bearer ${OPEN_PAYMENTS_API_KEY}`,
      ...extraHeaders
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  try {
    return { status: res.status, headers: res.headers.raw(), json: JSON.parse(text) };
  } catch (e) {
    return { status: res.status, headers: res.headers.raw(), text };
  }
}


app.get("/", (req, res) => res.send({ ok: true, service: "pay-per-use-backend-openpayments" }));


app.post("/create-payment", async (req, res) => {
  try {
    const { amount, currency = "MXN", payee, memo, expiresInSeconds } = req.body;
    if (!amount || !payee) return res.status(400).json({ success: false, error: "amount and payee required" });

    const parsed = Number(amount);
    if (Number.isNaN(parsed) || parsed <= 0) return res.status(400).json({ success: false, error: "invalid amount" });

    const assetScale = 2;
    const valueInt = Math.round(parsed * Math.pow(10, assetScale)).toString();

    const payload = {
      walletAddress: payee, 
      incomingAmount: {
        value: valueInt,
        assetCode: currency,
        assetScale: assetScale
      },
      metadata: {
        localId: randomUUID(),
        memo: memo || `Pago por servicio (${amount} ${currency})`
      }
    };

    if (expiresInSeconds && Number(expiresInSeconds) > 0) {
      const expiresAt = new Date(Date.now() + Number(expiresInSeconds) * 1000).toISOString();
      payload.expiresAt = expiresAt;
    }

 
    const targetUrl = `${payee.replace(/\/+$/, "")}/incoming-payments`; 
    const op = await callApi(targetUrl, "POST", payload);

    const localDbId = randomUUID();
    const insert = db.prepare(`
      INSERT INTO payments (id, local_id, amount, currency, payee, status, resource_url, op_response)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const statusText = (op.status === 201 || op.status === 200) ? "created" : "pending";
    const resource_url = (op.json && (op.json.id || (op.headers && op.headers.location && op.headers.location[0]))) ?
                          (op.json?.id || (op.headers.location && op.headers.location[0])) : null;

    insert.run(localDbId, payload.metadata.localId, parsed, currency, payee, statusText, resource_url, JSON.stringify(op));

    return res.json({
      success: true,
      localId: payload.metadata.localId,
      localDbId,
      resource_url,
      op
    });

  } catch (err) {
    console.error("create-payment error:", err);
    return res.status(500).json({ success: false, error: String(err) });
  }
});


app.get("/status/*", async (req, res) => {
  try {
  
    const raw = req.params[0]; 
    if (!raw) return res.status(400).json({ success: false, error: "resource path required" });

    const isUrl = raw.startsWith("http://") || raw.startsWith("https://");
    const url = isUrl ? raw : ((OPEN_PAYMENTS_BASE ? OPEN_PAYMENTS_BASE.replace(/\/+$/, "") : "") + "/" + raw.replace(/^\/+/, ""));

    const op = await callApi(url, "GET");

    try {
      const opJson = op.json || null;
      const localId = opJson?.metadata?.localId || null;
      const newStatus = opJson?.status || (opJson?.receiveAmount ? "received" : null) || null;
      if (localId && newStatus) {
        const update = db.prepare(`UPDATE payments SET status = ?, op_response = ? WHERE local_id = ?`);
        update.run(newStatus, JSON.stringify(op), localId);
      }
    } catch (e) {
    }

    return res.json({ success: true, op });
  } catch (err) {
    console.error("status error:", err);
    return res.status(500).json({ success: false, error: String(err) });
  }
});

app.post("/webhook", async (req, res) => {
  try {
    const payload = req.body;
    console.log("Webhook recibido:", payload);

    try {
      const localId = payload?.data?.metadata?.localId || payload?.metadata?.localId || payload?.metadata?.local_id || null;
      const newStatus = payload?.data?.status || payload?.status || "webhook_updated";
      const resource_url = payload?.data?.id || payload?.id || null;
      if (localId) {
        const update = db.prepare(`UPDATE payments SET status = ?, op_response = ?, resource_url = ? WHERE local_id = ?`);
        update.run(newStatus, JSON.stringify(payload), resource_url, localId);
      }
    } catch (e) {
      console.warn("Webhook update failed:", e);
    }

    res.status(200).send("ok");
  } catch (err) {
    console.error("webhook error:", err);
    res.status(500).send("error");
  }
});

app.get("/payments", (req, res) => {
  const rows = db.prepare(`SELECT * FROM payments ORDER BY created_at DESC LIMIT 100`).all();
  res.json({ count: rows.length, rows });
});

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
