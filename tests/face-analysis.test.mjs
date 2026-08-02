import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
test("security boundary keeps permanent key server-only",()=>{const page=fs.readFileSync("app/page.tsx","utf8"),env=fs.readFileSync(".env.example","utf8");assert.equal(page.includes("OPENAI_API_KEY"),false);assert.match(env,/^OPENAI_API_KEY=/m);assert.equal(env.includes("NEXT_PUBLIC_OPENAI"),false)});
test("scripted feedback was removed",()=>{const page=fs.readFileSync("app/page.tsx","utf8");assert.equal(page.includes("That placement is perfect"),false);assert.match(page,/Check my placement/)});
test("studio inspiration uses tutorial video or text, not finished photos",()=>{const page=fs.readFileSync("app/page.tsx","utf8");assert.match(page,/Upload a tutorial/);assert.match(page,/Describe your idea/);assert.equal(page.includes("Upload a reference"),false)});
test("voice coach receives tutorial lesson context",()=>{const page=fs.readFileSync("app/page.tsx","utf8"),route=fs.readFileSync("app/api/realtime-session/route.ts","utf8");assert.match(page,/lessonContext/);assert.match(route,/PERSONALIZED LESSON CONTEXT/);assert.match(page,/Show me where/)});
