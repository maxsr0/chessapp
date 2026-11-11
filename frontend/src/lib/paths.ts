/** The site's base path (see next.config.ts). Prefix it onto URLs of files in public/. */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const asset = (p: string) => `${BASE_PATH}${p}`;
