import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FileManager from "@/components/FileManager";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <FileManager userId={user.id} email={user.email ?? ""} />;
}
