import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("drivers")
    .select("id, name, phone")
    .eq("status", "Active")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
