// Verifies storage RLS isolation against a running Supabase (local by default).
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!anonKey) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is required");

let failed = 0;
const check = (name, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failed++;
};

async function newUser() {
  const c = createClient(url, anonKey, { auth: { persistSession: false } });
  const email = `rls-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const { data, error } = await c.auth.signUp({ email, password: "password123" });
  if (error) throw error;
  return { c, id: data.user.id };
}

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const a = await newUser();
const b = await newUser();
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

for (const bucket of ["public-assets", "private-files"]) {
  const own = `${a.id}/test.png`;
  let r = await a.c.storage.from(bucket).upload(own, png, { contentType: "image/png" });
  check(`[${bucket}] owner can upload to own folder`, !r.error);

  r = await a.c.storage.from(bucket).upload(`${b.id}/evil.png`, png, { contentType: "image/png" });
  check(`[${bucket}] user cannot upload into another user's folder`, !!r.error);

  r = await a.c.storage.from(bucket).upload(`shared/evil.png`, png, { contentType: "image/png" });
  check(`[${bucket}] user cannot upload outside a user folder`, !!r.error);

  const ownList = await a.c.storage.from(bucket).list(a.id);
  check(`[${bucket}] owner can list own folder`, ownList.data?.some((f) => f.name === "test.png"));

  const otherList = await b.c.storage.from(bucket).list(a.id);
  check(`[${bucket}] other user sees nothing in owner's folder`, (otherList.data ?? []).length === 0);

  const anonList = await anon.storage.from(bucket).list(a.id);
  check(`[${bucket}] anonymous sees nothing via API`, (anonList.data ?? []).length === 0);

  const dl = await b.c.storage.from(bucket).download(own);
  // Objects in a public bucket are world-readable by design (that is what CDN distribution means).
  check(
    `[${bucket}] other user ${bucket === "public-assets" ? "can read public object" : "cannot download via API"}`,
    bucket === "public-assets" ? !dl.error : !!dl.error,
  );

  const signedByOther = await b.c.storage.from(bucket).createSignedUrl(own, 60);
  check(`[${bucket}] other user cannot create signed URL`, !!signedByOther.error);

  await b.c.storage.from(bucket).remove([own]);
  const mv = await b.c.storage.from(bucket).move(own, `${b.id}/stolen.png`);
  check(`[${bucket}] other user cannot move owner's object`, !!mv.error);
  const still = await a.c.storage.from(bucket).list(a.id);
  check(`[${bucket}] other user's delete had no effect`, still.data?.some((f) => f.name === "test.png"));

  const publicUrl = a.c.storage.from(bucket).getPublicUrl(own).data.publicUrl;
  const pub = await fetch(publicUrl);
  check(
    `[${bucket}] public CDN URL ${bucket === "public-assets" ? "is" : "is not"} readable`,
    bucket === "public-assets" ? pub.ok : !pub.ok,
  );

  const signed = await a.c.storage.from(bucket).createSignedUrl(own, 60);
  check(`[${bucket}] owner signed URL works`, signed.data && (await fetch(signed.data.signedUrl)).ok);

  const del = await a.c.storage.from(bucket).remove([own]);
  check(`[${bucket}] owner can delete own object`, !del.error && del.data?.length === 1);
}

const txt = await a.c.storage
  .from("public-assets")
  .upload(`${a.id}/note.txt`, Buffer.from("hi"), { contentType: "text/plain" });
check("[public-assets] non-image MIME rejected by bucket config", !!txt.error);

console.log(failed ? `\n${failed} check(s) failed` : "\nAll RLS checks passed");
process.exit(failed ? 1 : 0);
