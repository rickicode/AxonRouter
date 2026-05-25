import { DEFAULT_AXONROUTER_BASE_URL } from "@/shared/constants/runtimeDefaults";

type ServerCredentials = {
  server: string;
  token: string;
  userId: string;
};

function readEnv(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? value : "";
}

export function getServerCredentials(): ServerCredentials {
  return {
    server: readEnv("AXONROUTER_SERVER_URL") || readEnv("SERVER_URL") || DEFAULT_AXONROUTER_BASE_URL,
    token: readEnv("AXONROUTER_AUTH_TOKEN") || readEnv("AUTH_TOKEN"),
    userId: readEnv("AXONROUTER_USER_ID") || readEnv("USER_ID") || "local",
  };
}
