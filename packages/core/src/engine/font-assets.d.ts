declare module "*?url" {
  const url: string;
  export default url;
}

declare module "wawoff2/decompress.js" {
  export default function decompress(bytes: Uint8Array): Promise<Uint8Array>;
}

declare module "wawoff2/compress.js" {
  export default function compress(bytes: Uint8Array): Promise<Uint8Array>;
}
