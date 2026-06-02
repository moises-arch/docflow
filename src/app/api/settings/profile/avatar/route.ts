import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "no file" }, { status: 400 });

  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowed.includes(file.type))
    return NextResponse.json({ error: "Tipo no soportado — usa JPG, PNG, WebP o GIF" }, { status: 400 });

  if (file.size > 2 * 1024 * 1024)
    return NextResponse.json({ error: "Imagen demasiado grande — máx 2MB" }, { status: 400 });

  const ext = file.type.split("/")[1];
  const path = `avatars/${user.id}.${ext}`;
  const svc = createServiceClient();

  const { error } = await svc.storage.from("documents").upload(path, await file.arrayBuffer(), {
    contentType: file.type,
    upsert: true,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = svc.storage.from("documents").getPublicUrl(path);

  const { error: updateErr } = await supabase.auth.updateUser({
    data: { avatar_url: publicUrl },
  });
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ avatarUrl: publicUrl });
}
