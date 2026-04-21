// lib/credits.ts
// In-app credit tracking: 5 credits per email (preview + scheduled).
// Admin sets initial balance; app deducts per email sent.

import { dbList, dbInsert, dbUpdate } from "./db";

export const EMAIL_CREDIT_COST = 5;

interface CreditRecord {
  id: string;
  data: {
    type: "app_credits";
    balance: number;
    last_updated: string;
  };
}

async function getCreditRecord(embedToken: string): Promise<CreditRecord | null> {
  const rows = await dbList<CreditRecord>("items", {}, embedToken);
  return rows.find((r) => r.data.type === "app_credits") ?? null;
}

export async function getCredits(embedToken: string): Promise<number> {
  const record = await getCreditRecord(embedToken);
  return record?.data.balance ?? 0;
}

export async function addCredits(amount: number, embedToken: string): Promise<number> {
  const record = await getCreditRecord(embedToken);
  const newBalance = (record?.data.balance ?? 0) + amount;
  const payload = { type: "app_credits" as const, balance: newBalance, last_updated: new Date().toISOString() };
  if (record) {
    await dbUpdate("items", record.id, { data: payload }, embedToken);
  } else {
    await dbInsert("items", { data: payload }, embedToken);
  }
  return newBalance;
}

export async function checkAndDeductCredits(embedToken: string): Promise<void> {
  const record = await getCreditRecord(embedToken);
  const balance = record?.data.balance ?? 0;

  if (balance < EMAIL_CREDIT_COST) {
    throw Object.assign(
      new Error(`Insufficient credits. Need ${EMAIL_CREDIT_COST}, have ${balance}. Add credits to continue.`),
      { code: "INSUFFICIENT_CREDITS", status: 402 },
    );
  }

  const newBalance = balance - EMAIL_CREDIT_COST;
  const payload = { type: "app_credits" as const, balance: newBalance, last_updated: new Date().toISOString() };
  if (record) {
    await dbUpdate("items", record.id, { data: payload }, embedToken);
  } else {
    await dbInsert("items", { data: payload }, embedToken);
  }
}
