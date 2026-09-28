#!/bin/bash
# =============================================================================
# deploy.sh — Script deploy AN TOÀN cho AssetFlow Pro
#
# Cách dùng:
#   ./deploy.sh          # rebuild app + keep DB
#   ./deploy.sh --full   # pull + rebuild tất cả (vẫn giữ DB)
#
# ⚠️  KHÔNG BAO GIỜ dùng docker-compose down -v — sẽ xóa toàn bộ database!
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== AssetFlow Pro — Deploy ===${NC}"
echo ""

# Kiểm tra volume DB còn sống không
DB_VOLUME=$(docker volume ls --format '{{.Name}}' | grep 'db.data\|db-data' | head -1)
if [ -z "$DB_VOLUME" ]; then
  echo -e "${YELLOW}[WARN] Không tìm thấy volume db-data — DB sẽ được khởi tạo mới từ seed.${NC}"
else
  echo -e "${GREEN}[OK] Volume DB: $DB_VOLUME — dữ liệu được giữ nguyên.${NC}"
fi

echo ""

# Backup nhẹ trước khi deploy (dump danh sách bảng để verify sau)
if docker ps --format '{{.Names}}' | grep -q 'assetflow-db'; then
  USER_COUNT=$(docker exec assetflow-db psql -U assetflow -d assetflow -tAc "SELECT count(*) FROM users;" 2>/dev/null || echo "N/A")
  echo -e "[INFO] Số user trước deploy: ${YELLOW}$USER_COUNT${NC}"
fi

echo ""
echo -e "[STEP 1] Pull code mới nhất (nếu dùng git)..."
# git pull  # Bỏ comment nếu muốn tự động pull

echo -e "[STEP 2] Build image app..."
docker-compose build app

echo -e "[STEP 3] Restart app container (giữ nguyên DB)..."
docker-compose up -d --no-deps app

echo ""
echo -e "[STEP 4] Chờ app khởi động..."
sleep 5

# Verify sau deploy
if docker ps --format '{{.Names}}' | grep -q 'assetflow-db'; then
  USER_COUNT_AFTER=$(docker exec assetflow-db psql -U assetflow -d assetflow -tAc "SELECT count(*) FROM users;" 2>/dev/null || echo "N/A")
  echo -e "[INFO] Số user sau deploy:  ${GREEN}$USER_COUNT_AFTER${NC}"
fi

echo ""
echo -e "${GREEN}=== Deploy hoàn tất! ===${NC}"
echo -e "Log app: ${YELLOW}docker logs assetflow-app --tail=50${NC}"
