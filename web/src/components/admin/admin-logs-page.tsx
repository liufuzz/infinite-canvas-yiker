"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, Descriptions, Drawer, Image, Input, message, Popconfirm, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DeleteOutlined, PictureOutlined, ReloadOutlined } from "@ant-design/icons";

type AiCallLogEntry = {
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

type LogsResponse = {
    total: number;
    items: AiCallLogEntry[];
};

export function AdminLogsPage() {
    const [items, setItems] = useState<AiCallLogEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<AiCallLogEntry | null>(null);
    const [messageApi, contextHolder] = message.useMessage();
    const pageSize = 50;

    useEffect(() => {
        void loadLogs(page);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page]);

    const columns: ColumnsType<AiCallLogEntry> = useMemo(
        () => [
            {
                title: "时间",
                dataIndex: "createdAt",
                width: 150,
                render: (value: string) => <span className="text-[13px] text-slate-600">{new Date(value).toLocaleString("zh-CN")}</span>,
            },
            {
                title: "详情",
                dataIndex: "path",
                width: 120,
                render: (_, record) => (
                    <button type="button" className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-900 transition hover:bg-slate-200" onClick={() => setSelected(record)}>
                        调用日志
                    </button>
                ),
            },
            {
                title: "IP",
                dataIndex: "clientIp",
                width: 140,
                render: (value: string | undefined) => <span className="font-mono text-[13px] text-slate-500">{value || "-"}</span>,
            },
            {
                title: "渠道",
                dataIndex: "channelName",
                width: 120,
                render: (value: string) => <span className="text-[13px] text-slate-700">{value || "中转"}</span>,
            },
            {
                title: "模型",
                dataIndex: "model",
                width: 150,
                ellipsis: true,
                render: (value: string) => <span className="text-[13px] text-slate-500">{value || "-"}</span>,
            },
            {
                title: "耗时",
                dataIndex: "durationMs",
                width: 110,
                render: (value: number) => <span className="font-mono text-[13px] text-slate-700">{formatSeconds(value)}</span>,
            },
            {
                title: "状态",
                dataIndex: "status",
                width: 100,
                render: (_, record) => <StatusPill log={record} />,
            },
            {
                title: "图片",
                dataIndex: "response",
                width: 120,
                render: (_, record) => <ImageCell log={record} />,
            },
            {
                title: "结果",
                dataIndex: "prompt",
                ellipsis: true,
                render: (_, record) => <span className="text-[13px] text-slate-600">{resultLabel(record)}</span>,
            },
            {
                title: "操作",
                width: 70,
                render: (_, record) => (
                    <Popconfirm title="删除这条日志？" onConfirm={() => deleteLog(record.id)}>
                        <Button danger type="text" size="small" icon={<DeleteOutlined />} />
                    </Popconfirm>
                ),
            },
        ],
        [],
    );

    async function loadLogs(nextPage = page) {
        setLoading(true);
        const response = await fetch(`/api/admin/logs?limit=${pageSize}&offset=${(nextPage - 1) * pageSize}`, { cache: "no-store" });
        setLoading(false);
        if (response.status === 401) {
            messageApi.error("请先登录后台配置页");
            return;
        }
        if (!response.ok) {
            messageApi.error("读取日志失败");
            return;
        }
        const payload = (await response.json()) as LogsResponse;
        setItems(payload.items);
        setTotal(payload.total);
    }

    async function deleteLog(id: string) {
        const response = await fetch(`/api/admin/logs/${encodeURIComponent(id)}`, { method: "DELETE" });
        if (!response.ok) {
            messageApi.error("删除失败");
            return;
        }
        messageApi.success("已删除");
        if (selected?.id === id) setSelected(null);
        await loadLogs();
    }

    async function clearLogs() {
        const response = await fetch("/api/admin/logs", { method: "DELETE" });
        if (!response.ok) {
            messageApi.error("清空失败");
            return;
        }
        messageApi.success("已清空日志");
        setSelected(null);
        setPage(1);
        await loadLogs(1);
    }

    return (
        <main className="h-dvh overflow-y-auto bg-neutral-50 px-6 py-8 text-neutral-950">
            {contextHolder}
            <div className="mx-auto max-w-7xl">
                <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <Typography.Title level={2} className="!mb-1">
                            调用日志
                        </Typography.Title>
                        <Typography.Text type="secondary">记录后台代理的 AI 接口调用、提示词、状态和返回摘要。</Typography.Text>
                    </div>
                    <Space>
                        <Button href="/admin/config">后台配置</Button>
                        <Button icon={<ReloadOutlined />} onClick={() => loadLogs()}>
                            刷新
                        </Button>
                        <Popconfirm title="清空全部调用日志？" onConfirm={clearLogs}>
                            <Button danger icon={<DeleteOutlined />}>
                                清空
                            </Button>
                        </Popconfirm>
                    </Space>
                </div>
                <Card styles={{ body: { padding: 0 } }} className="overflow-hidden border-slate-100 shadow-sm">
                    <Table
                        rowKey="id"
                        columns={columns}
                        dataSource={items}
                        loading={loading}
                        showHeader={false}
                        rowClassName="admin-log-row"
                        pagination={{
                            current: page,
                            pageSize,
                            total,
                            showSizeChanger: false,
                            onChange: setPage,
                        }}
                        scroll={{ x: 1120 }}
                    />
                </Card>
            </div>
            <Drawer title="调用详情" size={720} open={Boolean(selected)} onClose={() => setSelected(null)}>
                {selected ? <LogDetail log={selected} /> : null}
            </Drawer>
        </main>
    );
}

function StatusPill({ log }: { log: AiCallLogEntry }) {
    const ok = isSuccess(log);
    return <span className={ok ? "inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-0.5 text-xs font-medium text-emerald-600" : "inline-flex rounded-full border border-rose-200 bg-rose-50 px-3 py-0.5 text-xs font-medium text-rose-600"}>{ok ? "成功" : "失败"}</span>;
}

function ImageCell({ log }: { log: AiCallLogEntry }) {
    const images = extractImageSources(log.response);
    const first = images[0];
    if (!first) {
        return (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                <PictureOutlined />
                <span>-</span>
            </span>
        );
    }
    return (
        <Image.PreviewGroup items={images}>
            <Image src={first} alt="调用结果" width={34} height={34} className="!h-[34px] !w-[34px] rounded-lg object-cover shadow-sm ring-1 ring-black/5" />
        </Image.PreviewGroup>
    );
}

function LogDetail({ log }: { log: AiCallLogEntry }) {
    return (
        <div className="space-y-4">
            <Descriptions bordered size="small" column={1}>
                <Descriptions.Item label="时间">{new Date(log.createdAt).toLocaleString("zh-CN")}</Descriptions.Item>
                <Descriptions.Item label="调用者 IP">{log.clientIp || "-"}</Descriptions.Item>
                <Descriptions.Item label="渠道">{log.channelName}</Descriptions.Item>
                <Descriptions.Item label="接口">
                    {log.method} {log.path}
                </Descriptions.Item>
                <Descriptions.Item label="状态">{log.status}</Descriptions.Item>
                <Descriptions.Item label="耗时">{log.durationMs}ms</Descriptions.Item>
                <Descriptions.Item label="模型">{log.model || "-"}</Descriptions.Item>
                <Descriptions.Item label="目标 URL">{log.targetUrl}</Descriptions.Item>
                {log.error ? <Descriptions.Item label="错误">{log.error}</Descriptions.Item> : null}
            </Descriptions>
            <DetailBlock title="提示词" value={log.prompt || ""} />
            <div>
                <Typography.Text strong>结果</Typography.Text>
                <div className="mt-2">
                    <ResultPreview log={log} />
                </div>
            </div>
            <DetailBlock title="请求" value={JSON.stringify(log.request, null, 2)} />
            <DetailBlock title="返回" value={JSON.stringify(log.response, null, 2)} />
        </div>
    );
}

function ResultPreview({ log, compact = false }: { log: AiCallLogEntry; compact?: boolean }) {
    const images = extractImageSources(log.response);
    if (images.length > 0) {
        const visibleImages = compact ? images.slice(0, 3) : images;
        return (
            <Image.PreviewGroup items={images}>
                <div className={compact ? "flex max-w-52 gap-2 overflow-hidden" : "grid grid-cols-2 gap-3 sm:grid-cols-3"}>
                    {visibleImages.map((src, index) => (
                        <Image
                            key={`${src.slice(0, 48)}-${index}`}
                            src={src}
                            alt={`调用结果 ${index + 1}`}
                            width={compact ? 52 : "100%"}
                            height={compact ? 52 : undefined}
                            className={compact ? "!h-13 !w-13 rounded-md object-cover" : "aspect-square rounded-lg object-cover"}
                        />
                    ))}
                    {compact && images.length > visibleImages.length ? <span className="flex h-13 min-w-13 items-center justify-center rounded-md bg-neutral-100 text-xs text-neutral-500">+{images.length - visibleImages.length}</span> : null}
                </div>
            </Image.PreviewGroup>
        );
    }

    const summary = resultSummary(log);
    if (!summary) return <Typography.Text type="secondary">-</Typography.Text>;
    return <Typography.Text className={compact ? "line-clamp-2 text-xs" : "whitespace-pre-wrap"}>{summary}</Typography.Text>;
}

function DetailBlock({ title, value }: { title: string; value: string }) {
    return (
        <div>
            <Typography.Text strong>{title}</Typography.Text>
            <Input.TextArea className="mt-2 !font-mono" rows={title === "提示词" ? 4 : 12} value={value} readOnly />
        </div>
    );
}

function resultSummary(log: AiCallLogEntry) {
    if (log.error) return log.error;
    return summarizeValue(log.response);
}

function isSuccess(log: AiCallLogEntry) {
    return log.status >= 200 && log.status < 400 && !log.error;
}

function formatSeconds(ms: number) {
    return `${(ms / 1000).toFixed(2)} s`;
}

function resultLabel(log: AiCallLogEntry) {
    const imageAction = log.path.includes("/images/");
    if (imageAction) return isSuccess(log) ? "图生图调用完成" : "图生图调用失败";
    if (log.path.includes("/responses") || log.path.includes("/chat/completions")) return isSuccess(log) ? "文本调用完成" : "文本调用失败";
    return isSuccess(log) ? "调用完成" : "调用失败";
}

function summarizeValue(value: unknown): string {
    if (typeof value === "string") return compactText(extractSseText(value) || value);
    if (!value || typeof value !== "object") return value === undefined || value === null ? "" : String(value);
    const record = value as Record<string, unknown>;
    const error = record.error;
    if (error && typeof error === "object") {
        const message = (error as Record<string, unknown>).message;
        if (typeof message === "string") return compactText(message);
    }
    for (const key of ["output_text", "text", "message", "content", "data"]) {
        const summary = summarizeValue(record[key]);
        if (summary) return summary;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            const summary = summarizeValue(item);
            if (summary) return summary;
        }
        return "";
    }
    return compactText(JSON.stringify(value));
}

function compactText(value: string) {
    return value.replace(/\s+/g, " ").trim().slice(0, 300);
}

function extractSseText(value: string) {
    if (!value.includes("\ndata:")) return "";
    const parts: string[] = [];
    for (const line of value.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
            collectTextFragments(JSON.parse(data), parts);
        } catch {
            // Ignore non-JSON SSE chunks.
        }
    }
    return parts.join("");
}

function collectTextFragments(value: unknown, parts: string[]) {
    if (typeof value === "string") return;
    if (Array.isArray(value)) {
        value.forEach((item) => collectTextFragments(item, parts));
        return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    for (const key of ["delta", "text", "output_text", "content"]) {
        const item = record[key];
        if (typeof item === "string") parts.push(item);
    }
    Object.values(record).forEach((item) => collectTextFragments(item, parts));
}

function extractImageSources(value: unknown): string[] {
    const sources = new Set<string>();
    collectImageSources(value, sources);
    return Array.from(sources);
}

function collectImageSources(value: unknown, sources: Set<string>, key = "") {
    if (typeof value === "string") {
        const source = imageSourceFromString(key, value);
        if (source) sources.add(source);
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((item) => collectImageSources(item, sources));
        return;
    }
    if (!value || typeof value !== "object") return;
    Object.entries(value as Record<string, unknown>).forEach(([itemKey, item]) => collectImageSources(item, sources, itemKey));
}

function imageSourceFromString(key: string, value: string) {
    const lowerKey = key.toLowerCase();
    if (value.startsWith("data:image/")) return value;
    if (lowerKey === "b64_json" && value.length > 100 && !value.includes("[truncated]")) return `data:image/png;base64,${value}`;
    if ((lowerKey === "url" || lowerKey.includes("image")) && /^https?:\/\//i.test(value)) return value;
    return "";
}
