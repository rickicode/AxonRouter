import { describe, expect, it } from "vitest";
import { checkFallbackError, isFatalAuthError } from "../../open-sse/services/accountFallback.js";

describe("Quota and Credit Exhaustion (30 days lock)", () => {
  const newApiQuotaError = `[403]: {"error":{"message":"预扣费额度失败, 用户剩余额度: Credits748.860000, 需要预扣费额度: Credits956.080000 (request id: 202609081702562085082648268d9d6e73vEkxb)","type":"new_api_error","param":"","code":"insufficient_user_quota"}}`;
  const oneApiNegativeQuota = `[403]: {"error":{"message":"用户额度不足, 剩余额度: Credits-516.880000 (request id: 202609081407141773795708268d9d62Ivj5t1I)","type":"new_api_error","param":"","code":"insufficient_user_quota"}}`;
  const tokenrouterQuotaError = `[403]: {"error":{"message":"User's credit limit is insufficient, remaining credit limit: ＄0.000000 (request id: 20260908070736220368406y8NGXbR2)","type":"api_error","param":"","code":"insufficient_user_quota"},"id":228873,"message":"Your account quota is running low ($0.00), Please recharge to continue using the service.","org_id":"","role":1,"suffer":"money"}`;

  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  it("handles new_api insufficient_user_quota with 30-day lockAll and isExhausted", () => {
    const res = checkFallbackError(403, newApiQuotaError);
    expect(res.shouldFallback).toBe(true);
    expect(res.lockAll).toBe(true);
    expect(res.isExhausted).toBe(true);
    expect(res.disableAccount).toBe(false);
    expect(res.cooldownMs).toBe(THIRTY_DAYS_MS);
    expect(isFatalAuthError(403, newApiQuotaError)).toBe(false);
  });

  it("handles one_api negative quota error with 30-day lockAll and isExhausted", () => {
    const res = checkFallbackError(403, oneApiNegativeQuota);
    expect(res.shouldFallback).toBe(true);
    expect(res.lockAll).toBe(true);
    expect(res.isExhausted).toBe(true);
    expect(res.disableAccount).toBe(false);
    expect(res.cooldownMs).toBe(THIRTY_DAYS_MS);
  });

  it("handles tokenrouter credit limit error with 30-day lockAll and isExhausted", () => {
    const res = checkFallbackError(403, tokenrouterQuotaError);
    expect(res.shouldFallback).toBe(true);
    expect(res.lockAll).toBe(true);
    expect(res.isExhausted).toBe(true);
    expect(res.disableAccount).toBe(false);
    expect(res.cooldownMs).toBe(THIRTY_DAYS_MS);
  });

  it("handles generic credits exhausted with 30-day lockAll and isExhausted", () => {
    const res = checkFallbackError(403, "credits exhausted");
    expect(res.shouldFallback).toBe(true);
    expect(res.lockAll).toBe(true);
    expect(res.isExhausted).toBe(true);
    expect(res.cooldownMs).toBe(THIRTY_DAYS_MS);
  });
});
