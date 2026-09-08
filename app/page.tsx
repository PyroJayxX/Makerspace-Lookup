"use client";

import { useState, type FormEvent } from "react";

type SearchResult = {
  documentId: string;
  content: string;
  title: string | null;
  category: string | null;
  author: string | null;
};

type Status = "idle" | "loading" | "success" | "error";

export default function Home() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [lastQuery, setLastQuery] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setStatus("loading");

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const body = await res.json();
      setResults(body.results ?? []);
      setLastQuery(trimmed);
      setStatus("success");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-16 dark:bg-black">
      <div className="w-full max-w-2xl">
        <h1 className="mb-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Makerspace Knowledge Base
        </h1>
        <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
          Search machine manuals, safety guides, FAQs, and policies.
        </p>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What materials are forbidden on the laser cutter?"
            className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            type="submit"
            disabled={status === "loading"}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
          >
            Search
          </button>
        </form>

        <div className="mt-6 space-y-3">
          {status === "loading" && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Searching…</p>
          )}

          {status === "error" && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {errorMessage}
            </p>
          )}

          {status === "success" && results.length === 0 && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No results for &ldquo;{lastQuery}&rdquo;.
            </p>
          )}

          {status === "success" &&
            results.map((r, i) => (
              <div
                key={`${r.documentId}-${i}`}
                className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <p className="text-sm text-zinc-800 dark:text-zinc-200">{r.content}</p>
                <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-zinc-500 dark:text-zinc-400">
                  <span>{r.title ?? "N/A"}</span>
                  <span>·</span>
                  <span>{r.category ?? "N/A"}</span>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
