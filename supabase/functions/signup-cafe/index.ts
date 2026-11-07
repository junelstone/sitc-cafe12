// Public: a new café signs up for the free trial. Creates the café, its admin login and a starter catalogue.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  let input: Record<string, string>;
  try { input = await req.json(); } catch { return json({ error: "invalid_input" }, 400); }
  const s = (k: string, max = 120) => String(input[k] ?? "").trim().slice(0, max);
  const cafe = s("cafe_name"), owner = s("owner_name"), phone = s("phone", 40), city = s("city", 80);
  const email = s("email", 200).toLowerCase(), password = String(input.password ?? "");
  const plan = input.plan === "starter" ? "starter" : "pro";
  if (cafe.length < 2 || owner.length < 2 || phone.length < 6 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 8)
    return json({ error: "invalid_input" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Simple abuse guard: at most 5 new cafés per hour overall.
  const { count } = await admin.from("businesses").select("id", { count: "exact", head: true })
    .gt("created_at", new Date(Date.now() - 3600_000).toISOString());
  if ((count ?? 0) >= 5) return json({ error: "too_many_signups" }, 429);

  const { data: biz, error: e1 } = await admin.from("businesses")
    .insert({ name: cafe, owner_name: owner, phone, city, email, plan }).select("id").single();
  if (e1 || !biz) return json({ error: "server_error" }, 500);

  const { error: e2 } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: owner },
    app_metadata: { business_id: biz.id, role: "admin" },
  });
  if (e2) {
    await admin.from("businesses").delete().eq("id", biz.id);
    const taken = /already|registered|exists/i.test(e2.message);
    return json({ error: taken ? "email_taken" : "invalid_input" }, 400);
  }
  await admin.rpc("seed_business", { b: biz.id });
  return json({ ok: true });
});
