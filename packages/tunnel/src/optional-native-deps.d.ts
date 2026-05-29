// Ambient fallback declaration for optional native dependencies.
//
// `@ngrok/ngrok` ships platform-specific native binaries and is only required at runtime
// when a user actually starts an ngrok tunnel (it is loaded via a guarded dynamic import).
// In build environments where the optional package isn't installed, `tsc` would otherwise
// fail the production build with:
//   "Cannot find module '@ngrok/ngrok' or its corresponding type declarations."
//
// This bare module declaration makes the import resolve to `any` when the package is absent.
// When the package IS installed, its real type declarations take precedence (merging with an
// empty body is a no-op), so this shim never reduces type safety.
//
// NOTE: this file is intentionally NOT named after a sibling source module (e.g. `ngrok.d.ts`
// next to `ngrok.ts`), because a matching basename makes TypeScript treat it as that module's
// declaration file instead of a global ambient script, which silently disables the shim.
declare module "@ngrok/ngrok";
