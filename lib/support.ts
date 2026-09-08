// The public support address. It appears on /support, /privacy and /terms, and is the
// same address published as the EU Digital Services Act trader contact, so keep the three
// in sync by importing this rather than hardcoding an address in a page.
//
// The environment variable wins when set, so the address can be changed in Vercel without
// a code deploy; the fallback keeps the pages complete if it is ever missing.
export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "hello.makeupbestiesupport@gmail.com";
