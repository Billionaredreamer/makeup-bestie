import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
test("security boundary keeps permanent key server-only",()=>{const page=fs.readFileSync("app/page.tsx","utf8"),env=fs.readFileSync(".env.example","utf8");assert.equal(page.includes("OPENAI_API_KEY"),false);assert.match(env,/^OPENAI_API_KEY=/m);assert.equal(env.includes("NEXT_PUBLIC_OPENAI"),false)});
test("scripted feedback was removed",()=>{const page=fs.readFileSync("app/page.tsx","utf8");assert.equal(page.includes("That placement is perfect"),false);assert.match(page,/Check my placement/)});
