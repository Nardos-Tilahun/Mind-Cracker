import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest, NextResponse } from "next/server";

const handlers = toNextJsHandler(auth);

export async function GET(request: NextRequest, props: { params: Promise<{ all: string[] }> }) {
    const params = await props.params;
    console.log(`📥 [AUTH API] GET /api/auth/${params.all.join("/")}`);
    try {
        return await handlers.GET(request);
    } catch (error) {
        console.error("🔥 [AUTH API ERROR] GET Request Failed:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(request: NextRequest, props: { params: Promise<{ all: string[] }> }) {
    const params = await props.params;
    console.log(`📥 [AUTH API] POST /api/auth/${params.all.join("/")}`);
    try {
        return await handlers.POST(request);
    } catch (error) {
        console.error("🔥 [AUTH API ERROR] POST Request Failed:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}