declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  pid: number;
  platform: string;
  arch: string;
  version: string;
  cwd(): string;
  exit(code?: number): never;
};

declare const console: {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

declare const Bun: {
  version: string;
};

declare const __dirname: string;

interface ImportMeta {
  main?: boolean;
}

declare module 'util' {
  export function parseArgs(options: unknown): {
    values: Record<string, unknown>;
    positionals: string[];
  };
}

declare module 'path' {
  export function resolve(...paths: string[]): string;
  export function dirname(path: string): string;
  export function extname(path: string): string;
}

declare module 'dotenv' {
  export function config(options?: { path?: string }): { error?: Error };
}

declare module 'fs' {
  export function readFileSync(path: string, encoding: string): string;
  export function writeFileSync(path: string, data: string, encoding?: string): void;
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): string | undefined;
}
