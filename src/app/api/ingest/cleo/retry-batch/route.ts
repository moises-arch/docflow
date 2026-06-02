// Thin wrapper — see src/lib/ingest/retry-batch.ts for the shared implementation.
import { NextRequest } from "next/server";
import { handleRetryBatch } from "@/lib/ingest/retry-batch";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  return handleRetryBatch(req, {
    table: "cleo_orders",
    workerPath: "/api/ingest/cleo/retry-batch-worker",
    internalTokenHeader: "x-cleo-internal-token",
    internalTokenEnv: "INTAKE_CLEO_INTERNAL_TOKEN",
    channelName: "cleo",
  });
}
