import { assertAdminAuthenticated } from "@/server/admin-auth";
import { readAdminConfig, testServerImageModel, testServerTextModel } from "@/server/admin-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    const unauthorized = await assertAdminAuthenticated();
    if (unauthorized) return unauthorized;
    try {
        const payload = (await request.json()) as { model?: string; capability?: "text" | "image" };
        if (!payload.model) return Response.json({ error: "请选择要测试的模型" }, { status: 400 });
        const config = await readAdminConfig();
        const content = payload.capability === "image" ? await testServerImageModel(config, payload.model) : await testServerTextModel(config, payload.model);
        return Response.json({ ok: true, content });
    } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "模型测试失败" }, { status: 400 });
    }
}
