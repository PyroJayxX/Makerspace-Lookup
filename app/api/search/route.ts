import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { search } from "@/lib/search";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() || "";

  if (!query) {
    return NextResponse.json({ query, results: [], message: "No query provided." });
  }

  const results = search(getDb(), query);

  if (results.length === 0) {
    return NextResponse.json({
      query,
      results,
      message: `No matches found for "${query}".`,
    });
  }

  return NextResponse.json({ query, results });
}
