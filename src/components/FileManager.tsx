"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FileObject } from "@supabase/storage-js";
import { createClient } from "@/lib/supabase/client";

const BUCKETS = [
  { id: "public-assets", label: "公开资源 (CDN)", hint: "仅图片，≤10MB，通过公开 CDN URL 分发" },
  { id: "private-files", label: "私有文件", hint: "任意类型，≤50MB，通过限时签名 URL 访问" },
] as const;
type BucketId = (typeof BUCKETS)[number]["id"];

const PLACEHOLDER = ".emptyFolderPlaceholder";
const SIGNED_URL_TTL = 3600;

type Entry = {
  name: string;
  isFolder: boolean;
  size: number;
  mimetype: string;
  updatedAt: string | null;
  thumb?: string;
  thumbFallback?: string;
};

function formatSize(bytes: number) {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
}

function safeObjectName(name: string) {
  const cleaned = name.normalize("NFKD").replace(/[^a-zA-Z0-9._\-()]/g, "_");
  return cleaned === name ? name : `${Date.now()}-${cleaned}`;
}

function isImage(mime: string) {
  return mime.startsWith("image/");
}

export default function FileManager({ userId, email }: { userId: string; email: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [bucket, setBucket] = useState<BucketId>("public-assets");
  const [path, setPath] = useState<string[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [preview, setPreview] = useState<{ entry: Entry; url: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const prefix = [userId, ...path].join("/");
  const storage = supabase.storage.from(bucket);
  const isPublic = bucket === "public-assets";

  const notify = useCallback((kind: "ok" | "err", text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const store = supabase.storage.from(bucket);
    const { data, error } = await store.list(prefix, {
      limit: 1000,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      notify("err", error.message);
      setEntries([]);
      setLoading(false);
      return;
    }
    const list: Entry[] = (data as FileObject[])
      .filter((f) => f.name !== PLACEHOLDER)
      .map((f) => ({
        name: f.name,
        isFolder: f.id === null,
        size: (f.metadata?.size as number) ?? 0,
        mimetype: (f.metadata?.mimetype as string) ?? "",
        updatedAt: f.updated_at ?? null,
      }))
      .sort((a, b) => Number(b.isFolder) - Number(a.isFolder));

    const images = list.filter((e) => !e.isFolder && isImage(e.mimetype));
    if (bucket === "public-assets") {
      images.forEach((e) => {
        const full = `${prefix}/${e.name}`;
        e.thumb = store.getPublicUrl(full, {
          transform: { width: 320, height: 320, resize: "cover" },
        }).data.publicUrl;
        e.thumbFallback = store.getPublicUrl(full).data.publicUrl;
      });
    } else if (images.length) {
      const { data: signed } = await store.createSignedUrls(
        images.map((e) => `${prefix}/${e.name}`),
        SIGNED_URL_TTL,
      );
      signed?.forEach((s, i) => {
        if (s.signedUrl) images[i].thumb = s.signedUrl;
      });
    }
    setEntries(list);
    setLoading(false);
  }, [supabase, bucket, prefix, notify]);

  useEffect(() => {
    load();
  }, [load]);

  async function urlFor(entry: Entry, opts?: { download?: boolean }) {
    const full = `${prefix}/${entry.name}`;
    if (isPublic) {
      return storage.getPublicUrl(full, opts?.download ? { download: entry.name } : undefined).data
        .publicUrl;
    }
    const { data, error } = await storage.createSignedUrl(
      full,
      SIGNED_URL_TTL,
      opts?.download ? { download: entry.name } : undefined,
    );
    if (error) throw error;
    return data.signedUrl;
  }

  async function upload(files: FileList | File[]) {
    const arr = Array.from(files);
    if (!arr.length) return;
    let ok = 0;
    for (const [i, file] of arr.entries()) {
      setBusy(`上传中 ${i + 1}/${arr.length}：${file.name}`);
      const { error } = await storage.upload(`${prefix}/${safeObjectName(file.name)}`, file, {
        cacheControl: "3600",
        contentType: file.type || undefined,
        upsert: false,
      });
      if (error) notify("err", `${file.name}：${error.message}`);
      else ok++;
    }
    setBusy(null);
    if (ok) notify("ok", `已上传 ${ok} 个文件`);
    load();
  }

  async function createFolder() {
    const name = window.prompt("新文件夹名称（仅字母、数字、-、_）");
    if (!name) return;
    if (!/^[a-zA-Z0-9_\-]+$/.test(name)) return notify("err", "文件夹名称不合法");
    const { error } = await storage.upload(`${prefix}/${name}/${PLACEHOLDER}`, new Blob([""]), {
      contentType: "text/plain",
    });
    if (error) return notify("err", error.message);
    load();
  }

  async function collectPaths(folder: string): Promise<string[]> {
    const { data, error } = await storage.list(folder, { limit: 1000 });
    if (error) throw error;
    const nested = await Promise.all(
      (data as FileObject[]).map((f) =>
        f.id === null ? collectPaths(`${folder}/${f.name}`) : Promise.resolve([`${folder}/${f.name}`]),
      ),
    );
    return nested.flat();
  }

  async function remove(entry: Entry) {
    if (!window.confirm(`确定删除「${entry.name}」${entry.isFolder ? "及其全部内容" : ""}？`)) return;
    setBusy("删除中…");
    try {
      const full = `${prefix}/${entry.name}`;
      const paths = entry.isFolder ? await collectPaths(full) : [full];
      if (paths.length) {
        const { error } = await storage.remove(paths);
        if (error) throw error;
      }
      notify("ok", "已删除");
    } catch (e) {
      notify("err", (e as Error).message);
    }
    setBusy(null);
    load();
  }

  async function rename(entry: Entry) {
    const next = window.prompt("新名称", entry.name);
    if (!next || next === entry.name) return;
    const { error } = await storage.move(`${prefix}/${entry.name}`, `${prefix}/${safeObjectName(next)}`);
    if (error) return notify("err", error.message);
    notify("ok", "已重命名");
    load();
  }

  async function copyLink(entry: Entry) {
    try {
      const url = await urlFor(entry);
      try {
        await navigator.clipboard.writeText(url);
        notify("ok", isPublic ? "已复制 CDN 公开链接" : `已复制签名链接（${SIGNED_URL_TTL / 60} 分钟有效）`);
      } catch {
        window.prompt("复制链接", url);
      }
    } catch (e) {
      notify("err", (e as Error).message);
    }
  }

  async function download(entry: Entry) {
    try {
      window.open(await urlFor(entry, { download: true }), "_blank");
    } catch (e) {
      notify("err", (e as Error).message);
    }
  }

  async function open(entry: Entry) {
    if (entry.isFolder) return setPath([...path, entry.name]);
    try {
      setPreview({ entry, url: await urlFor(entry) });
    } catch (e) {
      notify("err", (e as Error).message);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const files = entries.filter((e) => !e.isFolder);
  const totalSize = files.reduce((s, e) => s + e.size, 0);
  const bucketInfo = BUCKETS.find((b) => b.id === bucket)!;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <span className="inline-block w-6 h-6 rounded bg-emerald-500" />
            Supabase 对象存储
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500">{email}</span>
            <button onClick={signOut} className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100">
              退出
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          {BUCKETS.map((b) => (
            <button
              key={b.id}
              onClick={() => {
                setBucket(b.id);
                setPath([]);
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                bucket === b.id
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white border-slate-300 hover:bg-slate-100"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm text-slate-600 flex flex-wrap gap-x-6 gap-y-1">
          <span>
            存储桶：<code className="text-slate-900">{bucket}</code>
          </span>
          <span>{bucketInfo.hint}</span>
          <span>
            RLS：仅可读写 <code className="text-slate-900">{userId.slice(0, 8)}…/</code> 下的对象
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav className="flex items-center gap-1 text-sm">
            <button onClick={() => setPath([])} className="hover:underline font-medium">
              根目录
            </button>
            {path.map((seg, i) => (
              <span key={i} className="flex items-center gap-1">
                <span className="text-slate-400">/</span>
                <button onClick={() => setPath(path.slice(0, i + 1))} className="hover:underline">
                  {seg}
                </button>
              </span>
            ))}
          </nav>
          <div className="flex gap-2">
            <button onClick={createFolder} className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-sm">
              新建文件夹
            </button>
            <button
              onClick={() => fileInput.current?.click()}
              className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium"
            >
              上传文件
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              accept={isPublic ? "image/*" : undefined}
              onChange={(e) => {
                if (e.target.files) upload(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            upload(e.dataTransfer.files);
          }}
          className={`rounded-xl border-2 border-dashed min-h-[320px] p-4 transition ${
            dragging ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white"
          }`}
        >
          {loading ? (
            <p className="text-center text-slate-400 py-24">加载中…</p>
          ) : entries.length === 0 ? (
            <p className="text-center text-slate-400 py-24">拖拽文件到此处上传，或点击「上传文件」</p>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {entries.map((e) => (
                <li key={e.name} className="group rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
                  <button onClick={() => open(e)} className="block w-full aspect-square bg-slate-100">
                    {e.isFolder ? (
                      <span className="flex h-full items-center justify-center text-5xl">📁</span>
                    ) : e.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={e.thumb}
                        alt={e.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(ev) => {
                          if (e.thumbFallback && ev.currentTarget.src !== e.thumbFallback) {
                            ev.currentTarget.src = e.thumbFallback;
                          }
                        }}
                      />
                    ) : (
                      <span className="flex h-full items-center justify-center text-sm font-mono text-slate-500 uppercase">
                        {e.name.split(".").pop()}
                      </span>
                    )}
                  </button>
                  <div className="p-2 space-y-1">
                    <p className="text-sm truncate" title={e.name}>
                      {e.name}
                    </p>
                    <p className="text-xs text-slate-500">{e.isFolder ? "文件夹" : formatSize(e.size)}</p>
                    <div className="flex flex-wrap gap-x-2 text-xs text-emerald-700">
                      {!e.isFolder && (
                        <>
                          <button onClick={() => copyLink(e)} className="hover:underline">链接</button>
                          <button onClick={() => download(e)} className="hover:underline">下载</button>
                          <button onClick={() => rename(e)} className="hover:underline">重命名</button>
                        </>
                      )}
                      <button onClick={() => remove(e)} className="hover:underline text-red-600">删除</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs text-slate-500">
          当前目录：{entries.length - files.length} 个文件夹，{files.length} 个文件，共 {formatSize(totalSize)}
        </p>
      </main>

      {preview && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b">
              <p className="font-medium truncate">{preview.entry.name}</p>
              <button onClick={() => setPreview(null)} className="text-slate-500 hover:text-slate-900 px-2">✕</button>
            </div>
            <div className="p-4 flex justify-center bg-slate-100">
              {isImage(preview.entry.mimetype) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview.url} alt={preview.entry.name} className="max-h-[65vh] object-contain" />
              ) : preview.entry.mimetype.startsWith("video/") ? (
                <video src={preview.url} controls className="max-h-[65vh]" />
              ) : preview.entry.mimetype === "application/pdf" || preview.entry.mimetype.startsWith("text/") ? (
                <iframe src={preview.url} className="w-full h-[65vh] bg-white" />
              ) : (
                <p className="py-16 text-slate-500">该类型不支持预览，请下载查看</p>
              )}
            </div>
            <div className="p-3 text-xs text-slate-600 space-y-1">
              <p>类型：{preview.entry.mimetype || "未知"} · 大小：{formatSize(preview.entry.size)}</p>
              <p className="break-all">
                {isPublic ? "CDN 公开链接" : "签名链接"}：
                <a href={preview.url} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">
                  {preview.url}
                </a>
              </p>
            </div>
          </div>
        </div>
      )}

      {(busy || toast) && (
        <div
          className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow text-sm text-white ${
            busy ? "bg-slate-800" : toast?.kind === "ok" ? "bg-emerald-600" : "bg-red-600"
          }`}
        >
          {busy ?? toast?.text}
        </div>
      )}
    </div>
  );
}
