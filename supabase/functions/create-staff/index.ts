// Admin-only: create a staff login (email + password) and set name/role.
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
  const { data: me } = await admin.from("profiles").select("role, active").eq("id", user.id).single();
  if (!me || me.role !== "admin" || !me.active) return json({ error: "admin_only" }, 403);

  const { email, password, full_name, role } = await req.json();
  if (!email || !password || password.length < 8) return json({ error: "invalid_input" }, 400);
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name },
  });
  if (error) return json({ error: error.message }, 400);
  await admin.from("profiles").update({ full_name, role: role === "admin" ? "admin" : "staff" }).eq("id", data.user.id);
  return json({ id: data.user.id });
});
