"use client";

import { useEffect, useRef, useState, type SubmitEvent } from "react";

type SearchResult = {
  documentId: string;
  content: string;
  title: string | null;
  category: string | null;
  author: string | null;
};

type Status = "idle" | "loading" | "success" | "error";

const DEBOUNCE_MS = 300;

export default function Home() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [lastQuery, setLastQuery] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  async function runSearch(trimmed: string) {
    // Cancel any in-flight request so a slow response for an earlier,
    // shorter query can't resolve after a newer one and overwrite it
    // with stale results.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("loading");

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Search didn't respond (${res.status}). Try again.`);
      const body = await res.json();
      setResults(body.results ?? []);
      setLastQuery(trimmed);
      setStatus("success");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const message =
        err instanceof Error
          ? err.message
          : "Search didn't respond. Check your connection and try again.";
      setErrorMessage(message);
      setStatus("error");
    }
  }

  // Live search: debounced so it doesn't fire on every keystroke.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      abortRef.current?.abort();
      setStatus("idle");
      setResults([]);
      return;
    }

    const timeout = setTimeout(() => runSearch(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) runSearch(trimmed);
  }

  return (
    <div className="flex h-full min-h-0 flex-1 justify-center bg-surface">
      <div className="flex h-full min-h-0 w-full max-w-2xl flex-col px-6 py-10">
        <div className="shrink-0 border-b border-line pb-6">
          <h1 className="font-display text-[2rem] leading-none font-black text-ink uppercase">
            Makerspace Knowledge Base
          </h1>
          <p className="mt-2 text-[0.9rem] leading-snug text-ink-muted">
            Search the machine manuals, safety guides, FAQs, and policies on file.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 flex items-end gap-4">
            <label className="flex-1">
              <span className="sr-only">Search</span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="What are you trying to find out?"
                className="w-full border-b-2 border-ink bg-transparent pb-2 text-lg text-ink placeholder:text-ink-muted focus:border-signal focus:outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={status === "loading"}
              className="shrink-0 border-b-2 border-signal pb-2 text-sm font-medium text-signal disabled:opacity-40"
            >
              Search
            </button>
          </form>
        </div>

        <div className="results-scroll min-h-0 flex-1 overflow-y-auto">
          {status === "idle" && (
            <p className="pt-8 text-sm text-ink-muted">
              Try a real question, like &ldquo;what materials are forbidden on the laser
              cutter?&rdquo;
            </p>
          )}

          {status === "loading" && <p className="pt-8 text-sm text-ink-muted">Searching…</p>}

          {status === "error" && (
            <p className="mt-8 border-l-2 border-danger py-1 pl-3 text-sm text-danger">
              {errorMessage}
            </p>
          )}

          {status === "success" && results.length === 0 && (
            <p className="pt-8 text-sm text-ink-muted">
              No matches for &ldquo;{lastQuery}&rdquo;. Try different words, or check the
              spelling.
            </p>
          )}

          {status === "success" &&
            results.map((r, i) => (
              <div key={`${r.documentId}-${i}`} className="border-t border-line py-5 first:border-t-0">
                <p className="text-[0.95rem] leading-relaxed text-ink">{r.content}</p>
                <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-ink-muted">
                  <span className="font-medium text-ink">{r.title ?? "N/A"}</span>
                  <span>{r.category ?? "N/A"}</span>
                  <span className="font-mono text-[0.7rem]">{r.documentId}</span>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
