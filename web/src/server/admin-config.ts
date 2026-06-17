import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AiConfig, ApiCallFormat, ModelChannel, WebdavSyncConfig } from "@/stores/use-config-store";

export type ServerModelChannel = {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    apiFormat: ApiCallFormat;
    models: string[];
};

export type ServerAdminConfig = {
    channels: ServerModelChannel[];
    defaults: Pick<AiConfig, "model" | "imageModel" | "videoModel" | "textModel" | "audioModel">;
    preferences: Pick<AiConfig, "audioVoice" | "audioFormat" | "audioSpeed" | "audioInstructions" | "videoSeconds" | "vquality" | "videoGenerateAudio" | "videoWatermark" | "systemPrompt" | "quality" | "size" | "count" | "canvasImageCount">;
    webdav: WebdavSyncConfig;
};

export const SERVER_MANAGED_API_KEY = "__server_managed__";
const CHANNEL_MODEL_SEPARATOR = "::";
const OPENAI_BASE_URL = "https://api.openai.com";
const DEFAULT_CONFIG: AiConfig = {
    channelMode: "local",
    baseUrl: OPENAI_BASE_URL,
    apiKey: "",
    apiFormat: "openai",
    channels: [
        {
            id: "default",
            name: "默认渠道",
            baseUrl: OPENAI_BASE_URL,
            apiKey: "",
            apiFormat: "openai",
            models: ["gpt-image-2", "grok-imagine-video", "gpt-5.5", "gpt-4o-mini-tts"],
        },
    ],
    model: "default::gpt-image-2",
    imageModel: "default::gpt-image-2",
    videoModel: "default::grok-imagine-video",
    textModel: "default::gpt-5.5",
    audioModel: "default::gpt-4o-mini-tts",
    audioVoice: "alloy",
    audioFormat: "mp3",
    audioSpeed: "1",
    audioInstructions: "",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    systemPrompt: "",
    models: ["default::gpt-image-2", "default::grok-imagine-video", "default::gpt-5.5", "default::gpt-4o-mini-tts"],
    imageModels: ["default::gpt-image-2"],
    videoModels: ["default::grok-imagine-video"],
    textModels: ["default::gpt-5.5"],
    audioModels: ["default::gpt-4o-mini-tts"],
    quality: "auto",
    size: "1:1",
    count: "1",
    canvasImageCount: "3",
};
const DEFAULT_WEBDAV: WebdavSyncConfig = {
    proxyMode: "nextjs",
    url: "",
    username: "",
    password: "",
    directory: "infinite-canvas",
    lastSyncedAt: "",
};

export async function readAdminConfig() {
    const file = configFilePath();
    try {
        return normalizeAdminConfig(JSON.parse(await readFile(file, "utf8")));
    } catch (error) {
        if (isNotFound(error)) {
            const config = defaultAdminConfig();
            await writeAdminConfig(config);
            return config;
        }
        if (error instanceof SyntaxError) throw new Error(`后台配置 JSON 格式错误：${file}`);
        throw error;
    }
}

export async function writeAdminConfig(config: ServerAdminConfig) {
    const normalized = normalizeAdminConfig(config);
    const file = configFilePath();
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    return normalized;
}

export function buildPublicConfig(config: ServerAdminConfig) {
    const channels = config.channels.map(publicChannel);
    const models = modelOptionsFromChannels(channels);
    return {
        config: {
            ...DEFAULT_CONFIG,
            ...config.preferences,
            ...config.defaults,
            channelMode: "local",
            baseUrl: channels[0]?.baseUrl || DEFAULT_CONFIG.baseUrl,
            apiKey: SERVER_MANAGED_API_KEY,
            apiFormat: channels[0]?.apiFormat || DEFAULT_CONFIG.apiFormat,
            channels,
            models,
            model: normalizeDefaultModel(config.defaults.model, channels, models, DEFAULT_CONFIG.model),
            imageModel: normalizeDefaultModel(config.defaults.imageModel, channels, models, firstByCapability(models, "image") || DEFAULT_CONFIG.imageModel),
            videoModel: normalizeDefaultModel(config.defaults.videoModel, channels, models, firstByCapability(models, "video") || DEFAULT_CONFIG.videoModel),
            textModel: normalizeDefaultModel(config.defaults.textModel, channels, models, firstByCapability(models, "text") || DEFAULT_CONFIG.textModel),
            audioModel: normalizeDefaultModel(config.defaults.audioModel, channels, models, firstByCapability(models, "audio") || DEFAULT_CONFIG.audioModel),
            imageModels: filterModelsByCapability(models, "image"),
            videoModels: filterModelsByCapability(models, "video"),
            textModels: filterModelsByCapability(models, "text"),
            audioModels: filterModelsByCapability(models, "audio"),
        } satisfies AiConfig,
        webdav: publicWebdav(config.webdav),
    };
}

export function findServerChannel(config: ServerAdminConfig, channelId: string) {
    return config.channels.find((channel) => channel.id === channelId);
}

export function resolveServerModel(config: ServerAdminConfig, value: string) {
    const decoded = decodeChannelModel(value);
    const channel = decoded.channelId ? config.channels.find((item) => item.id === decoded.channelId) : config.channels.find((item) => item.models.includes(decoded.model));
    return { channel, model: decoded.model };
}

export function normalizeProxyBaseUrl(baseUrl: string) {
    return baseUrl.trim().replace(/\/+$/, "");
}

export function buildOpenAiApiUrl(baseUrl: string, apiPath: string) {
    const normalized = normalizeProxyBaseUrl(baseUrl);
    const lower = normalized.toLowerCase();
    const apiBase = lower.endsWith("/v1") || lower.endsWith("/api/v3") || lower.endsWith("/api/plan/v3") ? normalized : `${normalized}/v1`;
    return `${apiBase}${apiPath}`;
}

export async function fetchServerChannelModels(channel: ServerModelChannel) {
    if (!channel.baseUrl.trim()) throw new Error("请先填写 Base URL");
    if (!channel.apiKey.trim()) throw new Error("请先填写 API Key");
    if (channel.apiFormat === "gemini") return fetchGeminiModels(channel);
    return fetchOpenAiModels(channel);
}

export async function testServerTextModel(config: ServerAdminConfig, modelValue: string) {
    const { channel, model } = resolveServerModel(config, modelValue);
    if (!channel) throw new Error("找不到模型对应的渠道");
    if (!channel.baseUrl.trim()) throw new Error("请先填写 Base URL");
    if (!channel.apiKey.trim()) throw new Error("请先填写 API Key");
    if (channel.apiFormat === "gemini") throw new Error("Gemini 文本模型测试暂未接入，请直接在前台 Agent 测试");
    const response = await fetch(buildOpenAiApiUrl(channel.baseUrl, "/chat/completions"), {
        method: "POST",
        headers: {
            Authorization: `Bearer ${channel.apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model,
            messages: [{ role: "user", content: "ping" }],
            stream: false,
        }),
        cache: "no-store",
    });
    const payload = await response.json().catch(() => null) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string }; msg?: string } | null;
    if (!response.ok) throw new Error(payload?.msg || payload?.error?.message || `模型测试失败：${response.status}`);
    return payload?.choices?.[0]?.message?.content || "ok";
}

export async function testServerImageModel(config: ServerAdminConfig, modelValue: string) {
    const { channel, model } = resolveServerModel(config, modelValue);
    if (!channel) throw new Error("找不到模型对应的渠道");
    if (!channel.baseUrl.trim()) throw new Error("请先填写 Base URL");
    if (!channel.apiKey.trim()) throw new Error("请先填写 API Key");
    if (channel.apiFormat === "gemini") throw new Error("Gemini 图片模型测试暂未接入，请直接在前台生图测试");
    const response = await fetch(buildOpenAiApiUrl(channel.baseUrl, "/images/generations"), {
        method: "POST",
        headers: {
            Authorization: `Bearer ${channel.apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model,
            prompt: "test image",
            n: 1,
            size: "1024x1024",
            response_format: "b64_json",
            output_format: "png",
        }),
        cache: "no-store",
    });
    const payload = await response.json().catch(() => null) as { data?: unknown[]; error?: { message?: string }; msg?: string } | null;
    if (!response.ok) throw new Error(payload?.msg || payload?.error?.message || `图片模型测试失败：${response.status}`);
    return Array.isArray(payload?.data) ? `返回 ${payload.data.length} 张图片` : "ok";
}

function configFilePath() {
    return process.env.INFINITE_CANVAS_CONFIG_FILE || path.join(".server-data", "infinite-canvas.config.json");
}

function defaultAdminConfig(): ServerAdminConfig {
    const channels = DEFAULT_CONFIG.channels.map((channel) => ({
        id: channel.id,
        name: channel.name,
        baseUrl: channel.baseUrl,
        apiKey: "",
        apiFormat: channel.apiFormat,
        models: channel.models,
    }));
    return {
        channels,
        defaults: {
            model: DEFAULT_CONFIG.model,
            imageModel: DEFAULT_CONFIG.imageModel,
            videoModel: DEFAULT_CONFIG.videoModel,
            textModel: DEFAULT_CONFIG.textModel,
            audioModel: DEFAULT_CONFIG.audioModel,
        },
        preferences: {
            audioVoice: DEFAULT_CONFIG.audioVoice,
            audioFormat: DEFAULT_CONFIG.audioFormat,
            audioSpeed: DEFAULT_CONFIG.audioSpeed,
            audioInstructions: DEFAULT_CONFIG.audioInstructions,
            videoSeconds: DEFAULT_CONFIG.videoSeconds,
            vquality: DEFAULT_CONFIG.vquality,
            videoGenerateAudio: DEFAULT_CONFIG.videoGenerateAudio,
            videoWatermark: DEFAULT_CONFIG.videoWatermark,
            systemPrompt: DEFAULT_CONFIG.systemPrompt,
            quality: DEFAULT_CONFIG.quality,
            size: DEFAULT_CONFIG.size,
            count: DEFAULT_CONFIG.count,
            canvasImageCount: DEFAULT_CONFIG.canvasImageCount,
        },
        webdav: DEFAULT_WEBDAV,
    };
}

function normalizeAdminConfig(value: unknown): ServerAdminConfig {
    const input = isRecord(value) ? value : {};
    const fallback = defaultAdminConfig();
    const channelsInput = Array.isArray(input.channels) ? input.channels : fallback.channels;
    const channels = channelsInput.map(normalizeServerChannel).filter((channel) => channel.id && channel.name);
    if (!channels.length) throw new Error("后台配置至少需要一个渠道");
    return {
        channels,
        defaults: normalizeDefaults(input.defaults, fallback.defaults, channels),
        preferences: { ...fallback.preferences, ...(isRecord(input.preferences) ? input.preferences : {}) },
        webdav: { ...fallback.webdav, ...(isRecord(input.webdav) ? input.webdav : {}) },
    };
}

function normalizeServerChannel(value: unknown, index: number): ServerModelChannel {
    const input = isRecord(value) ? value : {};
    const apiFormat = input.apiFormat === "gemini" ? "gemini" : "openai";
    const id = stringValue(input.id) || (index === 0 ? "default" : `channel-${index + 1}`);
    return {
        id: id.trim(),
        name: stringValue(input.name).trim() || (index === 0 ? "默认渠道" : `渠道 ${index + 1}`),
        baseUrl: stringValue(input.baseUrl).trim(),
        apiKey: stringValue(input.apiKey),
        apiFormat,
        models: uniqueStrings(Array.isArray(input.models) ? input.models : []),
    };
}

function normalizeDefaults(value: unknown, fallback: ServerAdminConfig["defaults"], channels: ServerModelChannel[]) {
    const input = isRecord(value) ? value : {};
    return {
        model: normalizeModelValue(stringValue(input.model) || fallback.model, channels),
        imageModel: normalizeModelValue(stringValue(input.imageModel) || fallback.imageModel, channels),
        videoModel: normalizeModelValue(stringValue(input.videoModel) || fallback.videoModel, channels),
        textModel: normalizeModelValue(stringValue(input.textModel) || fallback.textModel, channels),
        audioModel: normalizeModelValue(stringValue(input.audioModel) || fallback.audioModel, channels),
    };
}

function normalizeModelValue(value: string, channels: ServerModelChannel[]) {
    if (!value) return "";
    const { channelId, model } = decodeChannelModel(value);
    if (channelId && channels.some((channel) => channel.id === channelId && channel.models.includes(model))) return value;
    const channel = channels.find((item) => item.models.includes(model));
    return channel ? encodeChannelModel(channel.id, model) : model;
}

function encodeChannelModel(channelId: string, model: string) {
    return `${channelId}${CHANNEL_MODEL_SEPARATOR}${model.trim()}`;
}

function modelOptionName(value: string) {
    return decodeChannelModel(value).model;
}

function decodeChannelModel(value: string) {
    const index = value.indexOf(CHANNEL_MODEL_SEPARATOR);
    return index < 0 ? { channelId: "", model: value } : { channelId: value.slice(0, index), model: value.slice(index + CHANNEL_MODEL_SEPARATOR.length) };
}

function modelOptionsFromChannels(channels: ModelChannel[]) {
    return uniqueStrings(channels.flatMap((channel) => channel.models.map((model) => encodeChannelModel(channel.id, model))));
}

function filterModelsByCapability(models: string[], capability: "image" | "video" | "text" | "audio") {
    return models.filter((model) => modelMatchesCapability(model, capability));
}

function modelMatchesCapability(model: string, capability: "image" | "video" | "text" | "audio") {
    if (capability === "image") return isImageModelName(model);
    if (capability === "video") return isVideoModelName(model);
    if (capability === "audio") return isAudioModelName(model);
    return !isImageModelName(model) && !isVideoModelName(model) && !isAudioModelName(model);
}

function isVideoModelName(model: string) {
    const value = modelOptionName(model).toLowerCase();
    return value.includes("seedance") || value.includes("video") || value.includes("sora") || value.includes("veo") || value.includes("kling") || value.includes("wan") || value.includes("hailuo");
}

function isImageModelName(model: string) {
    const value = modelOptionName(model).toLowerCase();
    return !isVideoModelName(model) && !isAudioModelName(model) && (value.includes("seedream") || value.includes("gpt-image") || value.includes("image") || value.includes("dall-e") || value.includes("dalle") || value.includes("imagen") || value.includes("flux") || value.includes("sdxl") || value.includes("stable-diffusion") || value.includes("midjourney"));
}

function isAudioModelName(model: string) {
    const value = modelOptionName(model).toLowerCase();
    return value.includes("audio") || value.includes("tts") || value.includes("speech") || value.includes("voice") || value.includes("music") || value.includes("sound");
}

function publicChannel(channel: ServerModelChannel): ModelChannel {
    return {
        id: channel.id,
        name: channel.name,
        baseUrl: `/api/ai/channels/${encodeURIComponent(channel.id)}`,
        apiKey: SERVER_MANAGED_API_KEY,
        apiFormat: channel.apiFormat,
        models: channel.models,
    };
}

function publicWebdav(webdav: WebdavSyncConfig): WebdavSyncConfig {
    return {
        ...webdav,
        proxyMode: "nextjs",
        url: webdav.url ? "__server_managed__" : "",
        username: webdav.username ? "__server_managed__" : "",
        password: webdav.password ? SERVER_MANAGED_API_KEY : "",
    };
}

async function fetchOpenAiModels(channel: ServerModelChannel) {
    const response = await fetch(buildOpenAiApiUrl(channel.baseUrl, "/models"), {
        headers: { Authorization: `Bearer ${channel.apiKey}` },
        cache: "no-store",
    });
    const payload = await response.json().catch(() => null) as { data?: Array<{ id?: string }>; error?: { message?: string }; msg?: string } | null;
    if (!response.ok) throw new Error(payload?.msg || payload?.error?.message || `读取模型失败：${response.status}`);
    return uniqueStrings((payload?.data || []).map((model) => model.id)).sort((a, b) => a.localeCompare(b));
}

async function fetchGeminiModels(channel: ServerModelChannel) {
    const response = await fetch(`${geminiBaseUrl(channel.baseUrl)}/models`, {
        headers: { "x-goog-api-key": channel.apiKey },
        cache: "no-store",
    });
    const payload = await response.json().catch(() => null) as { models?: Array<{ name?: string }>; error?: { message?: string } } | null;
    if (!response.ok) throw new Error(payload?.error?.message || `读取模型失败：${response.status}`);
    return uniqueStrings((payload?.models || []).map((model) => model.name?.replace(/^models\//, ""))).sort((a, b) => a.localeCompare(b));
}

function geminiBaseUrl(baseUrl: string) {
    const normalized = normalizeProxyBaseUrl(baseUrl);
    const lower = normalized.toLowerCase();
    return lower.endsWith("/v1") || lower.endsWith("/v1beta") ? normalized : `${normalized}/v1beta`;
}

function normalizeDefaultModel(value: string, channels: ModelChannel[], models: string[], fallback: string) {
    if (models.includes(value)) return value;
    const raw = value.includes("::") ? value.split("::").slice(1).join("::") : value;
    const channel = channels.find((item) => item.models.includes(raw));
    if (channel) return encodeChannelModel(channel.id, raw);
    return models[0] || fallback;
}

function firstByCapability(models: string[], capability: "image" | "video" | "text" | "audio") {
    return filterModelsByCapability(models, capability)[0] || "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown) {
    return typeof value === "string" ? value : "";
}

function uniqueStrings(values: unknown[]) {
    return Array.from(new Set(values.map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean)));
}

function isNotFound(error: unknown) {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
