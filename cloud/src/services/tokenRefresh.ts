// Re-export from open-sse with worker logger
import * as log from "../utils/logger.js";
import {
	TOKEN_EXPIRY_BUFFER_MS as BUFFER_MS,
	refreshTokenByProvider as _refreshTokenByProvider,
} from "open-sse/services/tokenRefresh.js";

export const TOKEN_EXPIRY_BUFFER_MS = BUFFER_MS;

type RefreshCredentials = Record<string, unknown>;

export const refreshTokenByProvider = (
	provider: string,
	credentials: RefreshCredentials,
) => _refreshTokenByProvider(provider, credentials, log);
