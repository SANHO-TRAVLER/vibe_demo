import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // 웹 게임(public/game)은 다시 빌드해도 파일 이름이 같으므로,
  // 브라우저가 예전 게임을 붙들고 있지 않게 매번 새것인지 확인하게 한다.
  headers() {
    return [
      {
        source: "/game/:path*",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;
