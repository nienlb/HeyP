import postgres from "postgres";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sql = postgres(env.DATABASE_URL, { prepare: false, max: 1 });
console.table(await sql`SELECT id, kind, cny_delta, vnd_paid FROM cny_ledger ORDER BY id`);
console.log("tổng ¥:", (await sql`SELECT COALESCE(SUM(cny_delta),0) AS tong FROM cny_ledger`)[0]);
await sql.end();
