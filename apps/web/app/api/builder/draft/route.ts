import { NextResponse } from "next/server";
import { z } from "zod";
import { draftWorkflow } from "@/lib/builder";

const Body = z.object({ prompt: z.string().min(10).max(4000) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Describe the condition in at least a sentence." }, { status: 400 });
  return NextResponse.json(await draftWorkflow(parsed.data.prompt));
}
