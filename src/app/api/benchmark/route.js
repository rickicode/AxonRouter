import { NextResponse } from "next/server";
import { getBenchmarkJob, listBenchmarkJobs, requestBenchmarkAdvice, startBenchmark, cancelBenchmark, deleteBenchmarkJob } from "@/lib/benchmark/runner.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const id = new URL(request.url).searchParams.get("id");
  const payload = id ? await getBenchmarkJob(id) : await listBenchmarkJobs();
  if (id && !payload) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  return NextResponse.json(payload);
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  if (body.action === "cancel") {
    try {
      const result = await cancelBenchmark(body.id);
      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }
  if (body.action === "delete") {
    try {
      const result = await deleteBenchmarkJob(body.id);
      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }
  if (body.action === "advice") {
    try {
      const advice = await requestBenchmarkAdvice({ reviewer: body.reviewer, jobIds: body.jobIds || [] });
      return NextResponse.json(advice);
    } catch (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }
  const providers = Array.isArray(body.providers) ? body.providers : [];
  const models = Array.isArray(body.models) && body.models.length ? body.models : null;
  const suites = Array.isArray(body.suites) && body.suites.length ? body.suites : ["pong"];
  try {
    const job = await startBenchmark({ providers, models, suites, reviewer: body.reviewer || null });
    return NextResponse.json(job, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
