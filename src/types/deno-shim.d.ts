/** Minimal Deno global so `tsc -b` can type-check Edge helpers imported from `src`. */
declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
};
