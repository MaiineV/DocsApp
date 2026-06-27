import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Avatares públicos servidos desde Supabase Storage.
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
  },
  experimental: {
    // El avatar se sube por Server Action (FormData con el File) → subir el límite
    // de body de 1MB para permitir imágenes de hasta ~2MB.
    serverActions: { bodySizeLimit: '4mb' },
  },
};

export default nextConfig;
