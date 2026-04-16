#!/bin/bash
# Script para verificar e restaurar service zones de shipping
# Adicionar ao crontab: 0 */6 * * * /opt/bibelocrm/scripts/fix-shipping-zones.sh

DB_CONN="postgresql://bibelocrm:HIsuQhnt8PwK7erxL1GR9phd8M6yoN52@postgres:5432/medusa_db"

# IDs fixos das zonas de shipping
SHIPPING_ZONE_ID="serzo_01KN53E0MMFQ5DWHJ1JA4W79VJ"
PICKUP_ZONE_ID="serzo_01KN53FA8H2FE9G5RNEG8V744N"

echo "[$(date)] Verificando service zones..."

# Verificar se a zona de shipping está deletada
SHIPPING_DELETED=$(psql "$DB_CONN" -t -c "SELECT COUNT(*) FROM service_zone WHERE id = '$SHIPPING_ZONE_ID' AND deleted_at IS NOT NULL;" 2>/dev/null | tr -d ' ')

if [ "$SHIPPING_DELETED" -gt 0 ]; then
    echo "[$(date)] ATENÇÃO: Service zone de shipping está deletada! Restaurando..."
    psql "$DB_CONN" -c "UPDATE service_zone SET deleted_at = NULL WHERE id = '$SHIPPING_ZONE_ID';" 2>/dev/null

    # Restaurar geo zone associada
    psql "$DB_CONN" -c "UPDATE geo_zone SET deleted_at = NULL WHERE service_zone_id = '$SHIPPING_ZONE_ID';" 2>/dev/null
    echo "[$(date)] Service zone restaurada com sucesso"
else
    echo "[$(date)] Service zone OK"
fi

# Verificar shipping options
OPTIONS=$(psql "$DB_CONN" -t -c "SELECT COUNT(*) FROM shipping_option WHERE deleted_at IS NULL;" 2>/dev/null | tr -d ' ')
echo "[$(date)] Shipping options ativas: $OPTIONS"

if [ "$OPTIONS" -lt 2 ]; then
    echo "[$(date)] ATENÇÃO: Menos de 2 shipping options ativas!"
fi
