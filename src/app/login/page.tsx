"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    const { data, error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (!data.session) {
      setInfo("注册成功，请查收确认邮件，点击链接确认后再回来登录。");
      setMode("signin");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl shadow p-8 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">对象存储</h1>
          <p className="text-sm text-slate-500 mt-1">
            {mode === "signin" ? "登录以管理你的文件" : "创建新账号"}
          </p>
        </div>
        <input
          type="email"
          required
          placeholder="邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <input
          type="password"
          required
          minLength={6}
          placeholder="密码（至少 6 位）"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {info && <p className="text-sm text-emerald-700">{info}</p>}
        <button
          disabled={loading}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg py-2 font-medium"
        >
          {loading ? "处理中…" : mode === "signin" ? "登录" : "注册"}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="w-full text-sm text-slate-600 hover:text-slate-900"
        >
          {mode === "signin" ? "没有账号？注册" : "已有账号？登录"}
        </button>
      </form>
    </main>
  );
}
