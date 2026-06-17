import { assertAdminAuthenticated } from "@/server/admin-auth";
import { readAdminConfig, writeAdminConfig } from "@/server/admin-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const unauthorized = await assertAdminAuthenticated();
    if (unauthorized) return unauthorized;
    try {
        return Response.json(await readAdminConfig());
    } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "读取后台配置失败" }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    const unauthorized = await assertAdminAuthenticated();
    if (unauthorized) return unauthorized;
    try {
        return Response.json(await writeAdminConfig(await request.json()));
    } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "保存后台配置失败" }, { status: 400 });
    }
}
