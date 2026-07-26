/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Misafir foto\u011fraflar\u0131 R2 presigned URL'lerinden geldi\u011fi i\u00e7in <img> ile serve ediyoruz.
    unoptimized: true,
  },
};

export default nextConfig;
