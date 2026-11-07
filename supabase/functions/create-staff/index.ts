// Admin-only: create a staff login (email + password) in the admin's own café, within the plan's staff limit.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return json({ error: "not_signed_in" }, 401);
  const { data: me } = await admin.from("profiles").select("role, active, business_id").eq("id", user.id).single();
  if (!me || me.role !== "admin" || !me.active || !me.business_id) return json({ error: "admin_only" }, 403);

  const { data: biz } = await admin.from("businesses").select("plan, status, trial_ends_at, paid_until").eq("id", me.business_id).single();
  const end = Math.max(Date.parse(biz?.trial_ends_at ?? "0"), Date.parse(biz?.paid_until ?? "0") || 0);
  if (!biz || biz.status === "suspended" || end < Date.now()) return json({ error: "subscription_expired" }, 403);
  const { data: price } = await admin.from("plan_prices").select("max_staff").eq("plan", biz.plan).single();
  if (price?.max_staff != null) {
    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true })
      .eq("business_id", me.business_id).eq("active", true);
    // The owner's own login does not count towards the limit.
    if ((count ?? 0) >= price.max_staff + 1) return json({ error: "staff_limit" }, 403);
  }

  const { email, password, full_name, role } = await req.json();
  if (!email || !password || password.length < 8) return json({ error: "invalid_input" }, 400);
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name },
    app_metadata: { business_id: me.business_id, role: role === "admin" ? "admin" : "staff" },
  });
  if (error) return json({ error: error.message }, 400);
  return json({ id: data.user.id });
});
