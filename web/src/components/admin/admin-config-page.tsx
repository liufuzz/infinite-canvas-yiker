"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, Form, Input, InputNumber, message, Select, Space, Tabs, Typography } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined, MinusCircleOutlined, PlusOutlined, ReloadOutlined, SaveOutlined } from "@ant-design/icons";

import type { AiConfig, ApiCallFormat, WebdavSyncConfig } from "@/stores/use-config-store";

type ServerModelChannel = {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    apiFormat: ApiCallFormat;
    models: string[];
};

type ServerAdminConfig = {
    channels: ServerModelChannel[];
    defaults: Pick<AiConfig, "model" | "imageModel" | "videoModel" | "textModel" | "audioModel">;
    preferences: Pick<AiConfig, "audioVoice" | "audioFormat" | "audioSpeed" | "audioInstructions" | "videoSeconds" | "vquality" | "videoGenerateAudio" | "videoWatermark" | "systemPrompt" | "quality" | "size" | "count" | "canvasImageCount">;
    webdav: WebdavSyncConfig;
};

export function AdminConfigPage() {
    const [form] = Form.useForm<ServerAdminConfig>();
    const [loginForm] = Form.useForm<{ password: string }>();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadingModelIndex, setLoadingModelIndex] = useState<number | null>(null);
    const [testingTextModel, setTestingTextModel] = useState(false);
    const [testingImageModel, setTestingImageModel] = useState(false);
    const [authenticated, setAuthenticated] = useState(false);
    const [messageApi, contextHolder] = message.useMessage();

    const channels = Form.useWatch("channels", form) || [];
    const modelOptions = useMemo(
        () =>
            channels.flatMap((channel) =>
                (channel?.models || []).map((model) => ({
                    label: `${model}（${channel.name || channel.id}）`,
                    value: `${channel.id}::${model}`,
                })),
            ),
        [channels],
    );

    useEffect(() => {
        void loadConfig();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function loadConfig() {
        setLoading(true);
        const response = await fetch("/api/admin/config", { cache: "no-store" });
        setLoading(false);
        if (response.status === 401) {
            setAuthenticated(false);
            return;
        }
        if (!response.ok) {
            messageApi.error(await readError(response, "读取后台配置失败"));
            return;
        }
        form.setFieldsValue(await response.json());
        setAuthenticated(true);
    }

    async function login(values: { password: string }) {
        const response = await fetch("/api/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(values),
        });
        if (!response.ok) {
            messageApi.error(await readError(response, "登录失败"));
            return;
        }
        messageApi.success("已登录");
        await loadConfig();
        loginForm.resetFields();
    }

    async function saveConfig() {
        const values = normalizeFormValues(await form.validateFields());
        setSaving(true);
        const response = await fetch("/api/admin/config", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(values),
        });
        setSaving(false);
        if (!response.ok) {
            messageApi.error(await readError(response, "保存失败"));
            return;
        }
        form.setFieldsValue(await response.json());
        messageApi.success("配置已保存");
    }

    if (!authenticated) {
        return (
            <main className="h-dvh overflow-y-auto bg-neutral-50 px-6 py-12 text-neutral-950">
                {contextHolder}
                <Card className="mx-auto max-w-md" loading={loading}>
                    <Typography.Title level={3} className="!mb-1">
                        后台配置
                    </Typography.Title>
                    <Typography.Paragraph type="secondary">输入管理员密码后管理渠道、模型和同步配置。</Typography.Paragraph>
                    <Form form={loginForm} layout="vertical" onFinish={login}>
                        <Form.Item name="password" label="管理员密码" rules={[{ required: true, message: "请输入管理员密码" }]}>
                            <Input.Password autoComplete="current-password" />
                        </Form.Item>
                        <Button type="primary" htmlType="submit" block>
                            登录
                        </Button>
                    </Form>
                </Card>
            </main>
        );
    }

    return (
        <main className="h-dvh overflow-y-auto bg-neutral-50 px-6 py-8 text-neutral-950">
            {contextHolder}
            <div className="mx-auto max-w-6xl">
                <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <Typography.Title level={2} className="!mb-1">
                            后台配置
                        </Typography.Title>
                        <Typography.Text type="secondary">真实 Base URL、API Key 和 WebDAV 凭据仅保存在服务端。</Typography.Text>
                    </div>
                    <Space>
                        <Button href="/admin/logs">调用日志</Button>
                        <Button onClick={loadConfig}>重新读取</Button>
                        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={saveConfig}>
                            保存配置
                        </Button>
                    </Space>
                </div>

                <Form form={form} layout="vertical" disabled={loading}>
                    <Tabs
                        items={[
                            {
                                key: "channels",
                                label: "渠道",
                                children: <ChannelsForm loadingModelIndex={loadingModelIndex} onFetchModels={fetchChannelModels} />,
                            },
                            {
                                key: "models",
                                label: "默认模型",
                                children: <DefaultsForm modelOptions={modelOptions} testingTextModel={testingTextModel} testingImageModel={testingImageModel} onTestTextModel={testTextModel} onTestImageModel={testImageModel} />,
                            },
                            {
                                key: "preferences",
                                label: "生成偏好",
                                children: <PreferencesForm />,
                            },
                            {
                                key: "webdav",
                                label: "WebDAV",
                                children: <WebdavForm />,
                            },
                        ]}
                    />
                </Form>
            </div>
        </main>
    );

    async function fetchChannelModels(index: number) {
        const channel = form.getFieldValue(["channels", index]) as ServerModelChannel | undefined;
        if (!channel) return;
        setLoadingModelIndex(index);
        const response = await fetch("/api/admin/models", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(channel),
        });
        setLoadingModelIndex(null);
        if (!response.ok) {
            messageApi.error(await readError(response, "读取模型失败"));
            return;
        }
        const payload = (await response.json()) as { models: string[] };
        form.setFieldValue(["channels", index, "models"], payload.models);
        messageApi.success(`已拉取 ${payload.models.length} 个模型`);
    }

    async function testTextModel() {
        const model = form.getFieldValue(["defaults", "textModel"]) as string | undefined;
        setTestingTextModel(true);
        await testModel(model, "text");
        setTestingTextModel(false);
    }

    async function testImageModel() {
        const model = form.getFieldValue(["defaults", "imageModel"]) as string | undefined;
        setTestingImageModel(true);
        await testModel(model, "image");
        setTestingImageModel(false);
    }

    async function testModel(model: string | undefined, capability: "text" | "image") {
        const response = await fetch("/api/admin/test-model", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model, capability }),
        });
        if (!response.ok) {
            messageApi.error(await readError(response, "模型测试失败"));
            return;
        }
        messageApi.success(capability === "image" ? "图片模型可用" : "文本模型可用");
    }
}

function normalizeFormValues(values: ServerAdminConfig): ServerAdminConfig {
    const preferences = values.preferences || {};
    return {
        ...values,
        preferences: {
            ...preferences,
            count: String(preferences.count || "1"),
            canvasImageCount: String(preferences.canvasImageCount || "3"),
            audioSpeed: String(preferences.audioSpeed || "1"),
            videoSeconds: String(preferences.videoSeconds || "6"),
            vquality: String(preferences.vquality || "720"),
        },
    };
}

function ChannelsForm({ loadingModelIndex, onFetchModels }: { loadingModelIndex: number | null; onFetchModels: (index: number) => void }) {
    return (
        <Form.List name="channels">
            {(fields, { add, remove, move }) => (
                <div className="space-y-4">
                    {fields.map((field) => (
                        <Card
                            key={field.key}
                            size="small"
                            title={`渠道 ${field.name + 1}`}
                            extra={
                                <Space>
                                    <Button type="text" icon={<ArrowUpOutlined />} disabled={field.name === 0} onClick={() => move(field.name, field.name - 1)}>
                                        上移
                                    </Button>
                                    <Button type="text" icon={<ArrowDownOutlined />} disabled={field.name === fields.length - 1} onClick={() => move(field.name, field.name + 1)}>
                                        下移
                                    </Button>
                                    <Button type="text" icon={<ReloadOutlined />} loading={loadingModelIndex === field.name} onClick={() => onFetchModels(field.name)}>
                                        拉取模型
                                    </Button>
                                    <Button danger type="text" icon={<MinusCircleOutlined />} onClick={() => remove(field.name)}>
                                        删除
                                    </Button>
                                </Space>
                            }
                        >
                            <div className="grid gap-4 md:grid-cols-2">
                                <Form.Item name={[field.name, "id"]} label="渠道 ID" rules={[{ required: true, message: "请输入渠道 ID" }]}>
                                    <Input placeholder="share-api" />
                                </Form.Item>
                                <Form.Item name={[field.name, "name"]} label="渠道名称" rules={[{ required: true, message: "请输入渠道名称" }]}>
                                    <Input placeholder="shareApi" />
                                </Form.Item>
                                <Form.Item name={[field.name, "baseUrl"]} label="Base URL" rules={[{ required: true, message: "请输入 Base URL" }]}>
                                    <Input placeholder="https://api.example.com/v1" />
                                </Form.Item>
                                <Form.Item name={[field.name, "apiFormat"]} label="API 格式" rules={[{ required: true }]}>
                                    <Select
                                        options={[
                                            { label: "OpenAI Compatible", value: "openai" },
                                            { label: "Gemini", value: "gemini" },
                                        ]}
                                    />
                                </Form.Item>
                                <Form.Item name={[field.name, "apiKey"]} label="API Key" rules={[{ required: true, message: "请输入 API Key" }]}>
                                    <Input.Password autoComplete="off" />
                                </Form.Item>
                                <Form.Item name={[field.name, "models"]} label="模型列表" rules={[{ required: true, message: "请至少填写一个模型" }]}>
                                    <Select mode="tags" tokenSeparators={[",", "\n"]} placeholder="gpt-image-2" />
                                </Form.Item>
                            </div>
                        </Card>
                    ))}
                    <Button
                        icon={<PlusOutlined />}
                        onClick={() =>
                            add({
                                id: `channel-${fields.length + 1}`,
                                name: `渠道 ${fields.length + 1}`,
                                baseUrl: "",
                                apiKey: "",
                                apiFormat: "openai",
                                models: [],
                            })
                        }
                    >
                        新增渠道
                    </Button>
                </div>
            )}
        </Form.List>
    );
}

function DefaultsForm({ modelOptions, testingTextModel, testingImageModel, onTestTextModel, onTestImageModel }: { modelOptions: Array<{ label: string; value: string }>; testingTextModel: boolean; testingImageModel: boolean; onTestTextModel: () => void; onTestImageModel: () => void }) {
    return (
        <Card size="small">
            <div className="grid gap-4 md:grid-cols-2">
                {[
                    ["model", "通用默认模型"],
                    ["imageModel", "默认图片模型"],
                    ["videoModel", "默认视频模型"],
                    ["textModel", "默认文本模型"],
                    ["audioModel", "默认音频模型"],
                ].map(([name, label]) => (
                    <Form.Item key={name} name={["defaults", name]} label={label}>
                        <Select showSearch options={modelOptions} />
                    </Form.Item>
                ))}
            </div>
            <Space className="mt-2">
                <Button loading={testingImageModel} onClick={onTestImageModel}>
                    测试默认图片模型
                </Button>
                <Button loading={testingTextModel} onClick={onTestTextModel}>
                    测试默认文本模型
                </Button>
            </Space>
        </Card>
    );
}

function PreferencesForm() {
    return (
        <Card size="small">
            <div className="grid gap-4 md:grid-cols-3">
                <Form.Item name={["preferences", "quality"]} label="图片质量">
                    <Input placeholder="auto" />
                </Form.Item>
                <Form.Item name={["preferences", "size"]} label="尺寸">
                    <Input placeholder="1:1" />
                </Form.Item>
                <Form.Item name={["preferences", "count"]} label="生成数量">
                    <InputNumber min={1} max={15} className="!w-full" stringMode />
                </Form.Item>
                <Form.Item name={["preferences", "canvasImageCount"]} label="画布图片数量">
                    <InputNumber min={1} max={15} className="!w-full" stringMode />
                </Form.Item>
                <Form.Item name={["preferences", "videoSeconds"]} label="视频秒数">
                    <Input placeholder="6" />
                </Form.Item>
                <Form.Item name={["preferences", "vquality"]} label="视频清晰度">
                    <Input placeholder="720" />
                </Form.Item>
                <Form.Item name={["preferences", "videoGenerateAudio"]} label="视频生成音频">
                    <Select
                        options={[
                            { label: "true", value: "true" },
                            { label: "false", value: "false" },
                        ]}
                    />
                </Form.Item>
                <Form.Item name={["preferences", "videoWatermark"]} label="视频水印">
                    <Select
                        options={[
                            { label: "true", value: "true" },
                            { label: "false", value: "false" },
                        ]}
                    />
                </Form.Item>
                <Form.Item name={["preferences", "audioVoice"]} label="音频声音">
                    <Input placeholder="alloy" />
                </Form.Item>
                <Form.Item name={["preferences", "audioFormat"]} label="音频格式">
                    <Input placeholder="mp3" />
                </Form.Item>
                <Form.Item name={["preferences", "audioSpeed"]} label="音频速度">
                    <Input placeholder="1" />
                </Form.Item>
                <Form.Item name={["preferences", "audioInstructions"]} label="音频指令" className="md:col-span-3">
                    <Input.TextArea rows={3} />
                </Form.Item>
                <Form.Item name={["preferences", "systemPrompt"]} label="系统提示词" className="md:col-span-3">
                    <Input.TextArea rows={4} />
                </Form.Item>
            </div>
        </Card>
    );
}

function WebdavForm() {
    return (
        <Card size="small">
            <div className="grid gap-4 md:grid-cols-2">
                <Form.Item name={["webdav", "proxyMode"]} label="代理模式">
                    <Select
                        options={[
                            { label: "Next.js 代理", value: "nextjs" },
                            { label: "浏览器直连", value: "direct" },
                        ]}
                    />
                </Form.Item>
                <Form.Item name={["webdav", "url"]} label="WebDAV 地址">
                    <Input />
                </Form.Item>
                <Form.Item name={["webdav", "username"]} label="用户名">
                    <Input />
                </Form.Item>
                <Form.Item name={["webdav", "password"]} label="密码">
                    <Input.Password autoComplete="off" />
                </Form.Item>
                <Form.Item name={["webdav", "directory"]} label="远程目录">
                    <Input placeholder="infinite-canvas" />
                </Form.Item>
            </div>
        </Card>
    );
}

async function readError(response: Response, fallback: string) {
    try {
        const payload = (await response.json()) as { error?: string };
        return payload.error || fallback;
    } catch {
        return (await response.text()) || fallback;
    }
}
