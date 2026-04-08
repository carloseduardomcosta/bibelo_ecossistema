import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.medusajs.com" },
      { protocol: "https", hostname: "medusa-public-images.s3.eu-west-1.amazonaws.com" },
      { protocol: "http", hostname: "localhost" },
      { protocol: "https", hostname: "**.papelariabibelo.com.br" },
      { protocol: "https", hostname: "d2c0db5b8fb27c1c.cdn.nuvemshop.com.br" },
      { protocol: "https", hostname: "**.nuvemshop.com.br" },
    ],
  },
}

export default nextConfig
