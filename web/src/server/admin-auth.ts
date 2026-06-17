import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

const COOKIE_NAME = "infinite_canvas_admin";
const SESSION_VALUE = "authenticated";

export async function isAdminAuthenticated() {
    const cookieStore = await cookies();
    return verifySessionCookie(cookieStore.get(COOKIE_NAME)?.value || "");
}

export async function assertAdminAuthenticated() {
    if (!(await isAdminAuthenticated())) return new Response("Unauthorized", { status: 401 });
    return null;
}

export async function createAdminSessionResponse() {
    const response = Response.json({ ok: true });
    response.headers.append(
        "Set-Cookie",
        `${COOKIE_NAME}=${encodeURIComponent(signSession())}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`,
    );
    return response;
}

export function verifyAdminPassword(password: string) {
    const expected = process.env.INFINITE_CANVAS_ADMIN_PASSWORD;
    if (!expected) throw new Error("请先配置 INFINITE_CANVAS_ADMIN_PASSWORD");
    return constantTimeEqual(password, expected);
}

function signSession() {
    const signature = createHmac("sha256", adminSecret()).update(SESSION_VALUE).digest("base64url");
    return `${SESSION_VALUE}.${signature}`;
}

function verifySessionCookie(value: string) {
    const [session, signature] = value.split(".");
    if (session !== SESSION_VALUE || !signature) return false;
    return constantTimeEqual(signature, createHmac("sha256", adminSecret()).update(session).digest("base64url"));
}

function adminSecret() {
    return process.env.INFINITE_CANVAS_ADMIN_SECRET || process.env.INFINITE_CANVAS_ADMIN_PASSWORD || "infinite-canvas-dev-secret";
}

function constantTimeEqual(a: string, b: string) {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
}
