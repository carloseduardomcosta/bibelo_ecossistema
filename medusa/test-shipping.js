/**
 * Script de teste para verificar se shipping options estão funcionando após restauração
 * Executar: docker exec bibelo_medusa node /tmp/test-shipping.js
 */
const jwt = require("/app/node_modules/jsonwebtoken");

async function testShippingOptions() {
  console.log("=== TESTE DE SHIPPING OPTIONS ===\n");

  const JWT_SECRET = process.env.JWT_SECRET || "4b24c7a055156af3e652def22c0192847e56360c001fbe519114b17427659c47";

  // Gerar token JWT para admin
  const token = jwt.sign(
    { user_id: "admin", email: "admin@bibelo.com.br", role: "admin" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  try {
    // 1. Criar cart
    console.log("1. Criando cart...");
    let cartId;
    const createRes = await fetch("http://localhost:9000/admin/carts", {
      method: "POST",
      headers,
      body: JSON.stringify({ region_id: "reg_01KN52HV0TQAY4ZC1PEYWAQSY2" }),
    });
    const createData = await createRes.json();
    console.log("   Status:", createRes.status);
    console.log("   Response:", JSON.stringify(createData, null, 2));

    cartId = createData.cart?.id;
    if (!cartId) {
      console.log("   Não foi possível criar cart. Pulando...");
      return;
    }
    console.log("   Cart ID:", cartId);

    // 2. Atualizar endereço
    console.log("\n2. Atualizando endereço...");
    await fetch(`http://localhost:9000/admin/carts/${cartId}`, {
      method: "POST",
      headers,
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

    // 3. Buscar shipping options via Admin API
    console.log("\n3. Buscando shipping options via Admin API...");
    const optsRes = await fetch("http://localhost:9000/admin/shipping-options", {
      method: "POST",
      headers,
      body: JSON.stringify({ cart_id: cartId }),
    });
    const optsData = await optsRes.json();
    console.log("   Status:", optsRes.status);
    if (optsData.shipping_options) {
      console.log("   Total de options:", optsData.shipping_options.length);
      optsData.shipping_options.forEach((opt, i) => {
        console.log(`   ${i + 1}. ${opt.name} - ${opt.amount ? `R$ ${opt.amount / 100}` : 'Calculado'}`);
      });
    } else {
      console.log("   Resposta:", JSON.stringify(optsData));
    }

    // 4. Buscar via custom route
    console.log("\n4. Buscando via custom route (store)...");
    const customRes = await fetch(`http://localhost:9000/store/shipping-options?cart_id=${cartId}`);
    const customData = await customRes.json();
    console.log("   Status:", customRes.status);
    if (customData.shipping_options) {
      console.log("   Total de options:", customData.shipping_options.length);
      customData.shipping_options.forEach((opt, i) => {
        console.log(`   ${i + 1}. ${opt.name} - ${opt.amount ? `R$ ${opt.amount / 100}` : 'Calculado'}`);
      });
    } else {
      console.log("   Resposta:", JSON.stringify(customData));
    }

  } catch (e) {
    console.error("Erro:", e.message);
  }

  console.log("\n=== FIM DO TESTE ===");
}

testShippingOptions().catch(console.error);
