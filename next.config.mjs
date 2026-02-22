const isDevServer = process.env.NODE_ENV === 'development';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep dev and production builds in separate directories so local `next build`
  // checks do not invalidate an active `next dev` session's chunk URLs.
  distDir: process.env.NEXT_DIST_DIR || (isDevServer ? '.next-dev' : '.next'),
};

export default nextConfig;
