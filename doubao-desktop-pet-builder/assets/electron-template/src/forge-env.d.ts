declare const PET_WINDOW_WEBPACK_ENTRY: string;
declare const PET_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare const REMINDER_WINDOW_WEBPACK_ENTRY: string;
declare const REMINDER_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare const DASHBOARD_WINDOW_WEBPACK_ENTRY: string;
declare const DASHBOARD_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare const __non_webpack_require__: NodeRequire;

declare namespace NodeJS {
  interface Require {
    context(directory: string, useSubdirectories?: boolean, regExp?: RegExp): {
      keys(): string[];
      (id: string): string;
    };
  }
}
