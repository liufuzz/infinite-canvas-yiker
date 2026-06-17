import { createAdminSessionResponse, verifyAdminPassword } from "@/server/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    let password = "";
    try {
        const payload = (await request.json()) as { password?: string };
        password = payload.password || "";
    } catch {
        return Response.json({ error: "请求格式错误" }, { status: 400 });
    }

    try {
        if (!verifyAdminPassword(password)) return Response.json({ error: "密码错误" }, { status: 401 });
        return createAdminSessionResponse();
    } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "登录失败" }, { status: 500 });
    }
}
