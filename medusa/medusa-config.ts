import { defineConfig, loadEnv, Modules } from "@medusajs/framework/utils";

loadEnv(process.env.NODE_ENV || "development", process.cwd());

export default defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL!,
    redisUrl: process.env.REDIS_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET!,
      cookieSecret: process.env.COOKIE_SECRET!,
    },
  },
  admin: {
    backendUrl: process.env.MEDUSA_BACKEND_URL || "https://api.papelariabibelo.com.br",
  },
  modules: [
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "./src/modules/mercadopago",
            id: "mercadopago",
            options: {
              accessToken: process.env.MP_ACCESS_TOKEN!,
              webhookSecret: process.env.MP_WEBHOOK_SECRET!,
              sandbox: process.env.MP_SANDBOX === "true",
            },
          },
        ],
      },
    },
    {
      resolve: "@medusajs/medusa/fulfillment",
      options: {
        providers: [
          {
            resolve: "./src/modules/melhorenvio",
            id: "melhorenvio",
            options: {
              storeOriginCep: process.env.STORE_CEP || "89093880",
            },
          },
        ],
      },
    },
  ],
});
