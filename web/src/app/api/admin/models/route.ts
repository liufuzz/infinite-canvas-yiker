import { assertAdminAuthenticated } from "@/server/admin-auth";
import { fetchServerChannelModels, type ServerModelChannel } from "@/server/admin-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    const unauthorized = await assertAdminAuthenticated();
    if (unauthorized) return unauthorized;
    try {
        const channel = (await request.json()) as ServerModelChannel;
        return Response.json({ models: await fetchServerChannelModels(channel) });
    } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "读取模型失败" }, { status: 400 });
    }
}
