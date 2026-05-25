/// <reference path="../../../src/types/runtime-globals.d.ts" />

import { connect } from "cloudflare:sockets";

type ForwardRawBody = {
	targetUrl?: string;
	headers?: Record<string, string>;
	body?: unknown;
};

type ForwardTarget = {
	host: string;
	port: string;
	path: string;
	isHttps: boolean;
};

type ParsedHttpResponse = {
	status: number;
	body: string;
	headers: Record<string, string>;
};

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

function getErrorStack(error: unknown) {
	return error instanceof Error ? error.stack : undefined;
}

function jsonResponse(body: Record<string, unknown>, status: number) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

async function parseForwardRawRequest(request: Request): Promise<ForwardRawBody> {
	return (await request.json()) as ForwardRawBody;
}

function buildForwardTarget(targetUrl: string): ForwardTarget {
	const url = new URL(targetUrl);
	return {
		host: url.hostname,
		port: url.port || (url.protocol === "https:" ? "443" : "80"),
		path: url.pathname + url.search,
		isHttps: url.protocol === "https:",
	};
}

function createSocket(target: ForwardTarget) {
	if (target.isHttps) {
		console.log("[FORWARD_RAW] Creating TLS socket...");
		const socket = connect(
			{
				hostname: target.host,
				port: Number.parseInt(target.port, 10),
			},
			{ secureTransport: "on" },
		);
		console.log("[FORWARD_RAW] TLS socket created");
		return socket;
	}

	return connect({
		hostname: target.host,
		port: Number.parseInt(target.port, 10),
	});
}

async function waitForSocketOpen(socket: Awaited<ReturnType<typeof createSocket>>) {
	try {
		console.log("[FORWARD_RAW] Waiting for socket to open...");
		await socket.opened;
		console.log("[FORWARD_RAW] Socket opened successfully");
	} catch (openError) {
		console.error("[FORWARD_RAW] Socket open error:", getErrorMessage(openError));
		throw openError;
	}
}

function buildRequestHeaders(
	host: string,
	body: string,
	headers: Record<string, string>,
) {
	return {
		Host: host,
		"Content-Type": "application/json",
		"Content-Length": new TextEncoder().encode(body).length.toString(),
		Connection: "close",
		...headers,
	};
}

function buildHttpRequest(
	path: string,
	requestHeaders: Record<string, string>,
	body: string,
) {
	let httpRequest = `POST ${path} HTTP/1.1\r\n`;
	for (const [key, value] of Object.entries(requestHeaders)) {
		httpRequest += `${key}: ${value}\r\n`;
	}
	return `${httpRequest}\r\n${body}`;
}

async function writeSocketRequest(
	socket: Awaited<ReturnType<typeof createSocket>>,
	httpRequest: string,
) {
	const writer = socket.writable.getWriter();
	try {
		console.log("[FORWARD_RAW] Writing to socket...");
		await writer.write(new TextEncoder().encode(httpRequest));
		console.log("[FORWARD_RAW] Write complete, closing writer...");
		await writer.close();
		console.log("[FORWARD_RAW] Writer closed");
	} catch (writeError) {
		console.error("[FORWARD_RAW] Write error:", getErrorMessage(writeError));
		throw writeError;
	}
}

function hasCompleteHttpResponse(text: string) {
	if (!text.includes("\r\n\r\n")) return false;

	const headerEnd = text.indexOf("\r\n\r\n");
	const headers = text.substring(0, headerEnd).toLowerCase();
	const contentLengthMatch = headers.match(/content-length:\s*(\d+)/);
	if (!contentLengthMatch) return false;

	const expectedLength = Number.parseInt(contentLengthMatch[1], 10);
	const bodyReceived = text.length - headerEnd - 4;
	return bodyReceived >= expectedLength;
}

async function readSocketResponse(
	socket: Awaited<ReturnType<typeof createSocket>>,
	maxAttempts = 100,
) {
	console.log("[FORWARD_RAW] Starting to read response...");
	const reader = socket.readable.getReader();
	let responseData = new Uint8Array(0);
	let attempts = 0;

	while (attempts < maxAttempts) {
		console.log("[FORWARD_RAW] Reading attempt:", attempts);
		const { done, value } = await reader.read();
		console.log(
			"[FORWARD_RAW] Read result - done:",
			done,
			"value length:",
			value?.length,
		);
		if (done) break;
		if (value) {
			const newData = new Uint8Array(responseData.length + value.length);
			newData.set(responseData);
			newData.set(value, responseData.length);
			responseData = newData;

			const text = new TextDecoder().decode(responseData);
			if (hasCompleteHttpResponse(text)) {
				console.log("[FORWARD_RAW] Complete response received");
				break;
			}
		}
		attempts++;
	}

	console.log(
		"[FORWARD_RAW] Read loop finished, total bytes:",
		responseData.length,
	);
	return new TextDecoder().decode(responseData);
}

function parseHttpResponse(responseText: string): ParsedHttpResponse {
	console.log(
		"[FORWARD_RAW] Response received:",
		responseText.substring(0, 500),
	);

	const headerEndIndex = responseText.indexOf("\r\n\r\n");
	if (headerEndIndex === -1) {
		console.log("[FORWARD_RAW] Full response data:", responseText);
		throw new Error("Invalid HTTP response - no header end found");
	}

	const headerPart = responseText.substring(0, headerEndIndex);
	const bodyPart = responseText.substring(headerEndIndex + 4);
	const statusLine = headerPart.split("\r\n")[0];
	const statusMatch = statusLine.match(/HTTP\/[\d.]+ (\d+)/);
	const status = statusMatch ? Number.parseInt(statusMatch[1], 10) : 200;
	const responseHeaders: Record<string, string> = {};
	const headerLines = headerPart.split("\r\n").slice(1);

	for (const line of headerLines) {
		const colonIndex = line.indexOf(":");
		if (colonIndex > 0) {
			const key = line.substring(0, colonIndex).trim();
			const value = line.substring(colonIndex + 1).trim();
			responseHeaders[key.toLowerCase()] = value;
		}
	}

	return {
		status,
		body: bodyPart,
		headers: responseHeaders,
	};
}

function logSocketConnection(target: ForwardTarget) {
	console.log(
		"[FORWARD_RAW] Connecting to:",
		target.host,
		target.port,
		target.isHttps ? "(TLS)" : "",
	);
}

function buildErrorResponse(error: unknown) {
	const errorMessage = getErrorMessage(error);
	console.error("[FORWARD_RAW] Error:", errorMessage, getErrorStack(error));
	return jsonResponse({ error: errorMessage || "Unknown error" }, 500);
}

// Forward request via raw TCP socket (bypasses CF auto headers)
export async function handleForwardRaw(request: Request) {
	try {
		const { targetUrl, headers = {}, body } = await parseForwardRawRequest(request);
		if (!targetUrl) {
			return jsonResponse({ error: "targetUrl is required" }, 400);
		}

		const target = buildForwardTarget(targetUrl);
		logSocketConnection(target);
		const socket = createSocket(target);
		console.log("[FORWARD_RAW] Socket object:", socket);
		console.log("[FORWARD_RAW] Socket opened:", socket.opened);
		await waitForSocketOpen(socket);
		console.log("[FORWARD_RAW] Getting writer and reader...");
		console.log("[FORWARD_RAW] Writer and reader obtained");

		const bodyStr = JSON.stringify(body);
		const requestHeaders = buildRequestHeaders(target.host, bodyStr, headers);
		const httpRequest = buildHttpRequest(target.path, requestHeaders, bodyStr);
		console.log(
			"[FORWARD_RAW] Sending request:",
			httpRequest.substring(0, 300),
		);
		console.log("[FORWARD_RAW] Full request length:", httpRequest.length);

		await writeSocketRequest(socket, httpRequest);
		const responseText = await readSocketResponse(socket);
		const parsedResponse = parseHttpResponse(responseText);

		return new Response(parsedResponse.body, {
			status: parsedResponse.status,
			headers: {
				"Content-Type":
					parsedResponse.headers["content-type"] || "application/json",
			},
		});
	} catch (error) {
		return buildErrorResponse(error);
	}
}
