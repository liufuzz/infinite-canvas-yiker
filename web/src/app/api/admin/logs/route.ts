import { assertAdminAuthenticated } from "@/server/admin-auth";
import { clearAiCallLogs, listAiCallLogs } from "@/server/admin-logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const unauthorized = await assertAdminAuthenticated();
    if (unauthorized) return unauthorized;
    const url = new URL(request.url);
    return Response.json(
        await listAiCallLogs({
            limit: Number(url.searchParams.get("limit")) || 50,
            offset: Number(url.searchParams.get("offset")) || 0,
        }),
    );
}

export async function DELETE() {
    const unauthorized = await assertAdminAuthenticated();
    if (unauthorized) return unauthorized;
    await clearAiCallLogs();
    return Response.json({ ok: true });
}
