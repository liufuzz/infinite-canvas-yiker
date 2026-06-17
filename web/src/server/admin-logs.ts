import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";

export type AiCallLogEntry = {
    id: string;
    createdAt: string;
    channelId: string;
    channelName: string;
    clientIp?: string;
    method: string;
    path: string;
    targetUrl: string;
    status: number;
    durationMs: number;
    model: string;
    prompt: string;
    request: unknown;
    response: unknown;
    error?: string;
};

type ListLogsOptions = {
    limit?: number;
    offset?: number;
};

const MAX_TEXT_LENGTH = 8000;

export async function appendAiCallLog(entry: Omit<AiCallLogEntry, "id" | "createdAt">) {
    const log = { ...entry, id: nanoid(), createdAt: new Date().toISOString() };
    const file = logFilePath();
    await mkdir(path.dirname(file), { recursive: true });
    const current = await readLogEntries();
    current.unshift(log);
    await writeLogEntries(current.slice(0, 2000));
    return log;
}

export async function listAiCallLogs(options: ListLogsOptions = {}) {
    const limit = Math.max(1, Math.min(200, options.limit || 50));
    const offset = Math.max(0, options.offset || 0);
    const entries = await readLogEntries();
    return {
        total: entries.length,
        items: entries.slice(offset, offset + limit),
    };
}

export async function deleteAiCallLog(id: string) {
    const entries = await readLogEntries();
    const next = entries.filter((entry) => entry.id !== id);
    await writeLogEntries(next);
    return entries.length !== next.length;
}

export async function clearAiCallLogs() {
    await writeLogEntries([]);
}

export function sanitizeLogValue(value: unknown): unknown {
    if (typeof value === "string") return sanitizeString(value);
    if (Array.isArray(value)) return value.map(sanitizeLogValue);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => {
            const lower = key.toLowerCase();
            if (lower.includes("authorization") || lower.includes("apikey") || lower.includes("api_key") || lower === "key") return [key, "[redacted]"];
            return [key, sanitizeLogValue(item)];
        }),
    );
}

export function extractPrompt(value: unknown) {
    const payload = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const direct = stringValue(payload.prompt) || stringValue(payload.input);
    if (direct) return truncateText(direct);
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const lastUser = [...messages].reverse().find((item) => item && typeof item === "object" && (item as Record<string, unknown>).role === "user") as Record<string, unknown> | undefined;
    return truncateText(contentToText(lastUser?.content) || contentToText(payload.input));
}

export function extractModel(value: unknown) {
    return typeof value === "object" && value ? stringValue((value as Record<string, unknown>).model) : "";
}

export function responseLogValue(contentType: string, text: string) {
    if (contentType.includes("json")) {
        try {
            return sanitizeResponseLogValue(JSON.parse(text));
        } catch {
            return truncateText(text);
        }
    }
    if (contentType.startsWith("text/") || contentType.includes("event-stream")) return truncateText(text);
    return `[binary ${contentType || "unknown"} ${text.length} chars]`;
}

function sanitizeResponseLogValue(value: unknown, key = ""): unknown {
    if (typeof value === "string") return sanitizeResponseString(key, value);
    if (Array.isArray(value)) return value.map((item) => sanitizeResponseLogValue(item));
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([itemKey, item]) => {
            const lower = itemKey.toLowerCase();
            if (lower.includes("authorization") || lower.includes("apikey") || lower.includes("api_key") || lower === "key") return [itemKey, "[redacted]"];
            return [itemKey, sanitizeResponseLogValue(item, itemKey)];
        }),
    );
}

async function readLogEntries(): Promise<AiCallLogEntry[]> {
    try {
        const text = await readFile(logFilePath(), "utf8");
        if (!text.trim()) return [];
        const parsed = JSON.parse(text) as AiCallLogEntry[];
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
        throw error;
    }
}

async function writeLogEntries(entries: AiCallLogEntry[]) {
    const file = logFilePath();
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

function logFilePath() {
    return process.env.INFINITE_CANVAS_LOG_FILE || path.join(".server-data", "ai-call-logs.json");
}

function contentToText(content: unknown): string {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";
    return content
        .map((item) => {
            if (!item || typeof item !== "object") return "";
            const record = item as Record<string, unknown>;
            return stringValue(record.text) || stringValue(record.input_text) || "";
        })
        .filter(Boolean)
        .join("\n");
}

function sanitizeString(value: string) {
    if (value.startsWith("data:")) return "[data-url redacted]";
    return truncateText(value);
}

function sanitizeResponseString(key: string, value: string) {
    if (isImageResultValue(key, value)) return value;
    return sanitizeString(value);
}

function isImageResultValue(key: string, value: string) {
    const lower = key.toLowerCase();
    if (value.startsWith("data:image/")) return true;
    if (lower === "b64_json") return true;
    if ((lower === "url" || lower.includes("image")) && /^https?:\/\//i.test(value)) return true;
    return false;
}

function truncateText(value: string) {
    return value.length > MAX_TEXT_LENGTH ? `${value.slice(0, MAX_TEXT_LENGTH)}... [truncated]` : value;
}

function stringValue(value: unknown) {
    return typeof value === "string" ? value : "";
}
