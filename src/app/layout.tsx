import "./axonrouter-theme.css";
import "./dashboard-shell.css";
import { ThemeProvider } from "@/shared/components/ThemeProvider";
import "@/lib/network/initOutboundProxy"; // Auto-initialize outbound proxy env
import { initConsoleLogCapture } from "@/lib/consoleLogBuffer";
import { RuntimeI18nProvider } from "@/i18n/RuntimeI18nProvider";
import { SITE_NAME } from "@/shared/constants/site";
import { QueryProvider } from "@/shared/query";

// Auto-initialize app using non-analyzable path to prevent Turbopack NFT tracing
const initMod = ["@/lib", "initApp"].join("/");
void import(initMod);

// Hook console immediately at module load time (server-side only, runs once)
initConsoleLogCapture();

const materialSymbolsHref =
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap";

export const metadata = {
  title: `${SITE_NAME} - AI Infrastructure Management`,
  description: "One endpoint for all your AI providers. Manage keys, monitor usage, and scale effortlessly.",
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport = {
  themeColor: "#201d1d",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preload" href={materialSymbolsHref} as="style" />
        <link href={materialSymbolsHref} rel="stylesheet" />
      </head>
      <body>
        <ThemeProvider>
          <QueryProvider>
            <RuntimeI18nProvider>{children}</RuntimeI18nProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
