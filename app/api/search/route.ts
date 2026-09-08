import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { search } from "@/lib/search";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() || "";

  if (!query) {
    return NextResponse.json({ query, results: [] });
  }

  const results = search(getDb(), query);
  return NextResponse.json({ query, results });
}
