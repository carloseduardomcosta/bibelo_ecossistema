/**
 * Script de teste para verificar se shipping options estão funcionando
 * Executar: docker exec bibelo_medusa node /tmp/diagnose.js
 */
const { Pool } = require("/app/node_modules/pg");

async function testShippingOptions() {
  console.log("=== TESTE DE SHIPPING OPTIONS ===\n");

  // Criar cart via API
  console.log("1. Criando cart...");
  let cartId;
  try {
    const res = await fetch("http://localhost:9000/admin/carts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from("admin:supersecret").toString("base64")}`,
      },
      body: JSON.stringify({
        region_id: "reg_01KN52HV0TQAY4ZC1PEYWAQSY2"
      }),
    });
    const data = await res.json();
    cartId = data.cart?.id;
    console.log("   Cart ID:", cartId);

    if (!cartId) {
      console.log("   Erro ao criar cart:", data);
      return;
    }

    // Atualizar endereço
    console.log("\n2. Atualizando endereço...");
    await fetch(`http://localhost:9000/admin/carts/${cartId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from("admin:supersecret").toString("base64")}`,
      },
      body: JSON.stringify({
        shipping_address: {
          first_name: "Teste",
          last_name: "Usuario",
          address_1: "Rua Teste",
          city: "Timbó",
          province: "SC",
          postal_code: "89093880",
          country_code: "br",
        },
      }),
    });
    console.log("   Endereço atualizado");

    // Buscar shipping options via Admin API
    console.log("\n3. Buscando shipping options via Admin API...");
    const optsRes = await fetch("http://localhost:9000/admin/shipping-options", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from("admin:supersecret").toString("base64")}`,
      },
      body: JSON.stringify({ cart_id: cartId }),
    });
    const optsData = await optsRes.json();
    console.log("   Status:", optsRes.status);
    console.log("   Shipping options:", JSON.stringify(optsData, null, 2));

    // Buscar via custom route
    console.log("\n4. Buscando via custom route...");
    const customRes = await fetch(`http://localhost:9000/store/shipping-options?cart_id=${cartId}`);
    const customData = await customRes.json();
    console.log("   Status:", customRes.status);
    console.log("   Shipping options:", JSON.stringify(customData, null, 2));

  } catch (e) {
    console.error("Erro:", e.message);
  }

  console.log("\n=== FIM DO TESTE ===");
}

testShippingOptions().catch(console.error);

const { Pool } = require("/app/node_modules/pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function diagnose() {
  console.log("=== DIAGNÓSTICO DE SHIPPING OPTIONS ===\n");

  try {
    // 1. Verificar shipping_options
    console.log("1. Shipping Options no banco:");
    const opts = await pool.query(`
      SELECT id, name, provider_id, service_zone_id, price_type, data, metadata
      FROM shipping_option
      WHERE deleted_at IS NULL
    `);
    console.log(`   Total: ${opts.rows.length}`);
    opts.rows.forEach(r => console.log("   -", r.id, r.name));
    console.log("   Provider:", opts.rows[0]?.provider_id);
    console.log("   Service Zone:", opts.rows[0]?.service_zone_id);
    console.log("   Price Type:", opts.rows[0]?.price_type);

    // 2. Verificar fulfillment_providers
    console.log("\n2. Fulfillment Providers:");
    const fp = await pool.query(`
      SELECT id, is_enabled FROM fulfillment_provider WHERE deleted_at IS NULL
    `);
    fp.rows.forEach(r => console.log("   -", r.id, "| enabled:", r.is_enabled));

    // 3. Verificar stock_locations
    console.log("\n3. Stock Locations:");
    const sl = await pool.query(`SELECT id, name FROM stock_location WHERE deleted_at IS NULL`);
    sl.rows.forEach(r => console.log("   -", r.id, r.name));

    // 4. Verificar fulfillment_sets
    console.log("\n4. Fulfillment Sets:");
    const fset = await pool.query(`SELECT id, name, type FROM fulfillment_set WHERE deleted_at IS NULL`);
    fset.rows.forEach(r => console.log("   -", r.id, r.name, "| type:", r.type));

    // 5. Verificar service_zones
    console.log("\n5. Service Zones:");
    const sz = await pool.query(`SELECT id, name, fulfillment_set_id FROM service_zone WHERE deleted_at IS NULL`);
    sz.rows.forEach(r => console.log("   -", r.id, r.name));

    // 6. Verificar geo_zones
    console.log("\n6. Geo Zones:");
    const gz = await pool.query(`SELECT id, country_code, service_zone_id FROM geo_zone WHERE deleted_at IS NULL`);
    gz.rows.forEach(r => console.log("   -", r.id, "| country:", r.country_code, "| zone:", r.service_zone_id));

    // 7. Verificar links location_fulfillment_set
    console.log("\n7. Location-FulfillmentSet links:");
    const lfs = await pool.query(`
      SELECT stock_location_id, fulfillment_set_id
      FROM location_fulfillment_set
      WHERE deleted_at IS NULL
    `);
    lfs.rows.forEach(r => console.log("   - Stock:", r.stock_location_id, "| FSet:", r.fulfillment_set_id));

    // 8. Verificar links location_fulfillment_provider
    console.log("\n8. Location-FulfillmentProvider links:");
    const lfp = await pool.query(`
      SELECT stock_location_id, fulfillment_provider_id
      FROM location_fulfillment_provider
      WHERE deleted_at IS NULL
    `);
    lfp.rows.forEach(r => console.log("   - Stock:", r.stock_location_id, "| Provider:", r.fulfillment_provider_id));

    // 9. Verificar se há regionais/pickup有关系
    console.log("\n9. Verificando shipping_option_type:");
    const sotype = await pool.query(`SELECT * FROM shipping_option_type LIMIT 5`);
    sotype.rows.forEach(r => console.log("   -", JSON.stringify(r)));

    // 10. Verificar shipping_profile
    console.log("\n10. Shipping Profiles:");
    const sp = await pool.query(`SELECT id, name, type FROM shipping_profile WHERE deleted_at IS NULL`);
    sp.rows.forEach(r => console.log("   -", r.id, r.name, "| type:", r.type));

    // Verificar se as shipping_options têm shipping_profile
    console.log("\n11. Shipping Options com Profile:");
    const optsWithProfile = await pool.query(`
      SELECT so.id, so.name, so.shipping_profile_id, sp.name as profile_name
      FROM shipping_option so
      LEFT JOIN shipping_profile sp ON sp.id = so.shipping_profile_id
      WHERE so.deleted_at IS NULL
    `);
    optsWithProfile.rows.forEach(r => console.log("   -", r.name, "| profile:", r.shipping_profile_id, r.profile_name));

  } finally {
    await pool.end();
  }

  console.log("\n=== FIM DO DIAGNÓSTICO ===");
}

diagnose().catch(console.error);
