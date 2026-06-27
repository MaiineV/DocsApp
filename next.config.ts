import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Avatares públicos servidos desde Supabase Storage (listo para cuando se
      // reactive la subida de foto; hoy el avatar se muestra como inicial).
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
  },
};

export default nextConfig;
