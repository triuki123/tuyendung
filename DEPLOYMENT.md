# 🚀 Hướng Dẫn Deploy AssetFlow Pro

## 📋 Yêu Cầu
- **Docker & Docker Compose** cài đặt sẵn
- **Git** (pull code từ repository)
- **Server có 2GB RAM** tối thiểu

---

## ✅ Cách Deploy

### **Cách 1: Docker Compose (Recommended)**

```bash
# 1. Clone code
git clone <repo_url> /home/deploy/FADOAssetFlowPro
cd /home/deploy/FADOAssetFlowPro

# 2. Checkout branch
git checkout afterdeploy
git pull origin afterdeploy

# 3. Setup .env (copy từ template + sửa production values)
cp .env.local.example .env

# Edit .env — chỉnh sửa:
# - DATABASE_URL = production postgres
# - NEXT_PUBLIC_APP_URL = https://assetflow.fadoai.com
# - ZIMBRA_ADMIN_URL, ZIMBRA_ADMIN_USER, ZIMBRA_ADMIN_PASSWORD
# - AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (nếu dùng SES)

# 4. Start services
docker-compose up -d

# 5. Check status
docker ps
curl http://localhost:4028  # Expect HTTP 200
```

### **Cách 2: Manual (Node + Postgres local)**

```bash
# 1. Ensure PostgreSQL running
systemctl start postgresql
# OR docker run -d -p 5432:5432 postgres:16-alpine ...

# 2. Clone + setup
git clone <repo_url> /home/deploy/FADOAssetFlowPro
cd /home/deploy/FADOAssetFlowPro
cp .env.local.example .env

# 3. Build + start
npm ci
npm run build
npm start  # Production mode, port 4028
```

---

## 🌐 Setup Reverse Proxy (Nginx)

```nginx
# /etc/nginx/sites-available/asset.fadoai.com
upstream assetflow {
    server localhost:4028;
}

server {
    listen 443 ssl http2;
    server_name asset.fadoai.com;

    ssl_certificate /etc/letsencrypt/live/asset.fadoai.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/asset.fadoai.com/privkey.pem;

    location / {
        proxy_pass http://assetflow;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}

server {
    listen 80;
    server_name asset.fadoai.com;
    return 301 https://$server_name$request_uri;
}
```

**Enable:**
```bash
ln -s /etc/nginx/sites-available/asset.fadoai.com /etc/nginx/sites-enabled/
nginx -s reload
```

---

## 📊 Monitoring

```bash
# Check logs
docker logs assetflow-app -f
# OR
tail -f /home/deploy/FADOAssetFlowPro/logs/app.log

# Check PostgreSQL
docker logs assetflow-db
docker exec assetflow-db psql -U assetflow -d assetflow -c "SELECT COUNT(*) FROM users;"

# Check process
ps aux | grep node
```

---

## 🔧 Troubleshooting

| Vấn đề | Giải pháp |
|--------|----------|
| Port 4028 refused | Docker/app không chạy → `docker-compose logs` |
| DB connection error | Check DATABASE_URL + PostgreSQL running |
| Out of disk | Clean logs: `docker system prune` |
| High memory | Tăng Node memory: `NODE_OPTIONS=--max-old-space-size=2048` |

---

## 🆘 Support

- **Code issues?** Check: `git log --oneline -10` (recent commits)
- **DB issues?** Check migration: `docker exec assetflow-db psql -d assetflow -l`
- **Port conflict?** Kill: `sudo lsof -i :4028` → `kill -9 <PID>`

---

**Version:** v0.1.0  
**Last Updated:** 2026-06-02  
**Branch:** `afterdeploy`
