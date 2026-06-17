import { buildPublicConfig, readAdminConfig } from "@/server/admin-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        return Response.json(buildPublicConfig(await readAdminConfig()));
    } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "读取后台配置失败" }, { status: 500 });
    }
}
