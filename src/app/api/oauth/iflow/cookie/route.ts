import { NextResponse } from "next/server";
import { createCurrentProviderConnection } from "@/lib/connectionAccess";
import { finalizePostConnectValidation } from "@/lib/oauth/postConnectValidation";

type IFlowCookieRequestBody = {
  cookie?: unknown;
};

type IFlowApiKeyInfoResponse = {
  success?: boolean;
  message?: string;
  data?: {
    name?: string;
  };
};

type IFlowRefreshApiKeyResponse = {
  success?: boolean;
  message?: string;
  data?: {
    name?: string;
    apiKey?: string;
    expireTime?: unknown;
  };
};

/**
 * iFlow Cookie-Based Authentication
 * POST /api/oauth/iflow/cookie
 * Body: { cookie: "BXAuth=xxx; ..." }
 */
export async function POST(request: Request) {
  try {
    const { cookie } = (await request.json()) as IFlowCookieRequestBody;

    if (!cookie || typeof cookie !== "string") {
      return NextResponse.json({ error: "Cookie is required" }, { status: 400 });
    }

    const trimmed = cookie.trim();
    if (!trimmed.includes("BXAuth=")) {
      return NextResponse.json({ error: "Cookie must contain BXAuth field" }, { status: 400 });
    }

    let normalizedCookie = trimmed;
    if (!normalizedCookie.endsWith(";")) {
      normalizedCookie += ";";
    }

    const getResponse = await fetch("https://platform.iflow.cn/api/openapi/apikey", {
      method: "GET",
      headers: {
        Cookie: normalizedCookie,
        Accept: "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
      },
    });

    if (!getResponse.ok) {
      const errorText = await getResponse.text();
      return NextResponse.json(
        { error: `Failed to fetch API key info: ${errorText}` },
        { status: getResponse.status }
      );
    }

    const getResult = (await getResponse.json()) as IFlowApiKeyInfoResponse;
    if (!getResult.success) {
      return NextResponse.json(
        { error: `API key fetch failed: ${getResult.message}` },
        { status: 400 }
      );
    }

    const keyData = getResult.data ?? {};
    if (!keyData.name) {
      return NextResponse.json({ error: "Missing name in API key info" }, { status: 400 });
    }

    const postResponse = await fetch("https://platform.iflow.cn/api/openapi/apikey", {
      method: "POST",
      headers: {
        Cookie: normalizedCookie,
        "Content-Type": "application/json",
        Accept: "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
        Origin: "https://platform.iflow.cn",
        Referer: "https://platform.iflow.cn/",
      },
      body: JSON.stringify({ name: keyData.name }),
    });

    if (!postResponse.ok) {
      const errorText = await postResponse.text();
      return NextResponse.json(
        { error: `Failed to refresh API key: ${errorText}` },
        { status: postResponse.status }
      );
    }

    const postResult = (await postResponse.json()) as IFlowRefreshApiKeyResponse;
    if (!postResult.success) {
      return NextResponse.json(
        { error: `API key refresh failed: ${postResult.message}` },
        { status: 400 }
      );
    }

    const refreshedKey = postResult.data ?? {};
    if (!refreshedKey.apiKey) {
      return NextResponse.json({ error: "Missing API key in response" }, { status: 400 });
    }

    const bxAuthMatch = normalizedCookie.match(/BXAuth=([^;]+)/);
    const bxAuth = bxAuthMatch ? bxAuthMatch[1] : "";
    const cookieToSave = bxAuth ? `BXAuth=${bxAuth};` : "";

    const connection = await createCurrentProviderConnection({
      provider: "iflow",
      authType: "cookie",
      name: refreshedKey.name || keyData.name,
      email: refreshedKey.name || keyData.name,
      apiKey: refreshedKey.apiKey,
      providerSpecificData: {
        cookie: cookieToSave,
        expireTime: refreshedKey.expireTime,
      },
      isActive: true,
    });

    const latestConnection = await finalizePostConnectValidation(connection, "iFlow Cookie");

    return NextResponse.json({
      success: true,
      connection: {
        id: latestConnection.id,
        provider: latestConnection.provider,
        email: latestConnection.email,
        displayName: latestConnection.displayName,
        apiKey: refreshedKey.apiKey.substring(0, 10) + "...",
        expireTime: refreshedKey.expireTime,
        routingStatus: latestConnection.routingStatus,
        healthStatus: latestConnection.healthStatus,
        quotaState: latestConnection.quotaState,
        authState: latestConnection.authState,
        reasonCode: latestConnection.reasonCode,
        reasonDetail: latestConnection.reasonDetail,
        lastCheckedAt: latestConnection.lastCheckedAt,
      },
    });
  } catch (error) {
    console.error("iFlow cookie auth error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
