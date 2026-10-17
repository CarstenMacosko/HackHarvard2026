import { NextResponse } from "next/server";
import { backend } from "@/lib/backend";

export async function GET() {
  return NextResponse.json(await backend().models());
}
