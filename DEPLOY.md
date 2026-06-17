# 服务器部署

本文档用于部署当前带后台配置、同源代理和调用日志的版本。

## 1. 准备服务器

服务器需要安装 Docker 和 Docker Compose。

```bash
docker --version
docker compose version
```

## 2. 上传代码

把当前项目上传到服务器，例如：

```bash
git clone <your-repo-url> infinite-canvas
cd infinite-canvas
```

如果没有推送到 Git，也可以用 `rsync` 或压缩包上传当前目录。

## 3. 配置环境变量

```bash
cp .env.example .env
openssl rand -base64 48
```

编辑 `.env`：

```env
INFINITE_CANVAS_ADMIN_PASSWORD=你的后台密码
INFINITE_CANVAS_ADMIN_SECRET=上一步生成的随机字符串
INFINITE_CANVAS_CONFIG_FILE=/data/infinite-canvas/config.json
INFINITE_CANVAS_LOG_FILE=/data/infinite-canvas/ai-call-logs.json
```

`docker-compose.yml` 会把宿主机 `./data` 挂载到容器 `/data/infinite-canvas`，后台配置和调用日志会持久保存在这里。

## 4. 启动

```bash
mkdir -p data
docker compose up -d --build
docker compose logs -f app
```

访问：

```text
http://服务器IP:3000
http://服务器IP:3000/admin/config
http://服务器IP:3000/admin/logs
```

## 5. Nginx 反向代理示例

```nginx
server {
    listen 80;
    server_name your-domain.com;

    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}
```

如果图片生成耗时较长，`proxy_read_timeout` 不要设置太短。

## 6. 更新部署

```bash
git pull
docker compose up -d --build
```

`./data` 不会被镜像重建覆盖。

## 7. 备份

至少备份以下文件：

```text
data/config.json
data/ai-call-logs.json
.env
```
