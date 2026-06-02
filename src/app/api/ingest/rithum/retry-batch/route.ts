// Thin wrapper — see src/lib/ingest/retry-batch.ts for the shared implementation.
import { NextRequest } from "next/server";
import { handleRetryBatch } from "@/lib/ingest/retry-batch";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  return handleRetryBatch(req, {
    table: "rithum_orders",
    workerPath: "/api/ingest/rithum/retry-batch-worker",
    internalTokenHeader: "x-rithum-internal-token",
    internalTokenEnv: "INTAKE_RITHUM_INTERNAL_TOKEN",
    channelName: "rithum",
  });
}
