import { assertAdminAuthenticated } from "@/server/admin-auth";
import { deleteAiCallLog } from "@/server/admin-logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
    const unauthorized = await assertAdminAuthenticated();
    if (unauthorized) return unauthorized;
    const { id } = await context.params;
    return Response.json({ ok: await deleteAiCallLog(id) });
}
