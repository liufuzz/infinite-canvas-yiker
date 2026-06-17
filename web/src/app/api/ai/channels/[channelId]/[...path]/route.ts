import { buildOpenAiApiUrl, findServerChannel, normalizeProxyBaseUrl, readAdminConfig, type ServerModelChannel } from "@/server/admin-config";
import { appendAiCallLog, extractModel, extractPrompt, responseLogValue, sanitizeLogValue } from "@/server/admin-logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESPONSE_HEADERS = ["content-type", "cache-control", "x-request-id", "openai-processing-ms"];
const FORWARDED_REQUEST_HEADERS = ["accept", "content-type"];

type RouteContext = { params: Promise<{ channelId: string; path?: string[] }> };

export async function GET(request: Request, context: RouteContext) {
    return proxyAiRequest(request, context);
}

export async function POST(request: Request, context: RouteContext) {
    return proxyAiRequest(request, context);
}

export async function PUT(request: Request, context: RouteContext) {
    return proxyAiRequest(request, context);
}

export async function DELETE(request: Request, context: RouteContext) {
    return proxyAiRequest(request, context);
}

export async function PATCH(request: Request, context: RouteContext) {
    return proxyAiRequest(request, context);
}

async function proxyAiRequest(request: Request, context: RouteContext) {
    const startedAt = Date.now();
    const params = await context.params;
    const config = await readAdminConfig();
    const channel = findServerChannel(config, params.channelId);
    if (!channel) return new Response("Unknown AI channel", { status: 404 });
    if (!channel.baseUrl.trim()) return new Response("Channel Base URL is empty", { status: 400 });
    if (!channel.apiKey.trim()) return new Response("Channel API Key is empty", { status: 400 });

    const path = params.path || [];
    const target = targetUrl(channel, path, request.url);
    const headers = proxyRequestHeaders(request.headers);
    if (channel.apiFormat === "gemini") {
        headers.delete("authorization");
        headers.set("x-goog-api-key", channel.apiKey);
    } else {
        headers.delete("x-goog-api-key");
        headers.set("authorization", `Bearer ${channel.apiKey}`);
    }

    try {
        const requestBody = await readRequestBody(request);
        const response = await fetch(target, {
            method: request.method,
            headers,
            body: requestBody.body,
            duplex: "half",
        } as RequestInit);
        void logAiCall({
            request,
            channel,
            path,
            target,
            status: response.status,
            durationMs: Date.now() - startedAt,
            requestPayload: requestBody.logValue,
            response,
        });
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: proxyResponseHeaders(response.headers),
        });
    } catch (error) {
        void appendAiCallLog({
            channelId: channel.id,
            channelName: channel.name,
            clientIp: clientIpFromHeaders(request.headers),
            method: request.method,
            path: `/${path.join("/")}`,
            targetUrl: target,
            status: 502,
            durationMs: Date.now() - startedAt,
            model: "",
            prompt: "",
            request: null,
            response: null,
            error: error instanceof Error ? error.message : "AI proxy error",
        });
        return new Response(error instanceof Error ? error.message : "AI proxy error", { status: 502 });
    }
}

async function readRequestBody(request: Request) {
    if (request.method === "GET" || request.method === "HEAD") return { body: undefined, logValue: null };
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        const text = await request.text();
        const payload = text ? JSON.parse(text) : null;
        return { body: text, logValue: sanitizeLogValue(payload) };
    }
    const body = await request.arrayBuffer();
    return { body, logValue: `[${contentType || "request body"} ${body.byteLength} bytes]` };
}

async function logAiCall({ request, channel, path, target, status, durationMs, requestPayload, response }: { request: Request; channel: ServerModelChannel; path: string[]; target: string; status: number; durationMs: number; requestPayload: unknown; response: Response }) {
    try {
        const contentType = response.headers.get("content-type") || "";
        const responseText = await response.clone().text();
        await appendAiCallLog({
            channelId: channel.id,
            channelName: channel.name,
            clientIp: clientIpFromHeaders(request.headers),
            method: request.method,
            path: `/${path.join("/")}`,
            targetUrl: target,
            status,
            durationMs,
            model: extractModel(requestPayload),
            prompt: extractPrompt(requestPayload),
            request: requestPayload,
            response: responseLogValue(contentType, responseText),
            error: status >= 400 ? errorMessageFromResponse(contentType, responseText) : undefined,
        });
    } catch {
        // Logging must never break the proxied AI response.
    }
}

function clientIpFromHeaders(headers: Headers) {
    return (
        headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        headers.get("x-real-ip")?.trim() ||
        headers.get("cf-connecting-ip")?.trim() ||
        headers.get("x-client-ip")?.trim() ||
        ""
    );
}

function errorMessageFromResponse(contentType: string, text: string) {
    if (!contentType.includes("json")) return text.slice(0, 500);
    try {
        const payload = JSON.parse(text) as { error?: { message?: string }; msg?: string };
        return payload.msg || payload.error?.message || text.slice(0, 500);
    } catch {
        return text.slice(0, 500);
    }
}

function targetUrl(channel: ServerModelChannel, segments: string[], requestUrl: string) {
    const path = segments.map(encodeURIComponent).join("/");
    const query = new URL(requestUrl).search;
    if (channel.apiFormat === "openai") return buildOpenAiApiUrl(channel.baseUrl, `/${path}${query}`);
    const normalizedBase = normalizeProxyBaseUrl(channel.baseUrl);
    return `${normalizedBase}${path ? `/${path}` : ""}${query}`;
}

function proxyRequestHeaders(source: Headers) {
    const headers = new Headers();
    for (const key of FORWARDED_REQUEST_HEADERS) {
        const value = source.get(key);
        if (value) headers.set(key, value);
    }
    return headers;
}

function proxyResponseHeaders(source: Headers) {
    const headers = new Headers();
    for (const key of RESPONSE_HEADERS) {
        const value = source.get(key);
        if (value) headers.set(key, value);
    }
    return headers;
}
