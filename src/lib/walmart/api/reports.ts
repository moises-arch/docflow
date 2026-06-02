// Walmart Reports API — async report generation pattern.
// Buy Box reports take a few minutes; we request, poll for READY, download.
// Docs: https://developer.walmart.com/doc/us/mp/us-mp-reports/

import { walmartRequest } from "@/lib/walmart/client";

export type ReportRequestResponse = {
  requestId: string;
  reportType?: string;
  requestStatus?: string; // RECEIVED | INPROGRESS | READY | FAILED
};

export type ReportStatus = {
  requestId: string;
  reportType: string;
  requestStatus: "RECEIVED" | "INPROGRESS" | "READY" | "FAILED";
  reportUrl?: string;
  requestSubmissionDate?: string;
  reportGenerationCompletionDate?: string;
};

/**
 * Request a Buy Box insights report. Returns a requestId you must poll.
 */
export async function requestBuyBoxReport(
  correlationId?: string,
): Promise<ReportRequestResponse> {
  return walmartRequest({
    method: "POST",
    path: "/v3/reports/reportRequests/buybox",
    body: {},
    correlationId,
  });
}

export async function requestPerformanceReport(
  options: { reportVersion?: string; correlationId?: string } = {},
): Promise<ReportRequestResponse> {
  return walmartRequest({
    method: "POST",
    path: "/v3/reports/reportRequests/performance",
    body: {
      reportVersion: options.reportVersion ?? "v1",
    },
    correlationId: options.correlationId,
  });
}

export async function getReportStatus(
  requestId: string,
  correlationId?: string,
): Promise<ReportStatus> {
  return walmartRequest({
    path: `/v3/reports/reportRequests/${encodeURIComponent(requestId)}`,
    correlationId,
  });
}

/**
 * Poll a report until READY or FAILED. Useful for cron jobs that need the
 * full result. Default 30 polls × 10s = 5 min total.
 */
export async function pollReport(
  requestId: string,
  options: {
    maxPolls?: number;
    intervalMs?: number;
    correlationId?: string;
  } = {},
): Promise<ReportStatus> {
  const maxPolls = options.maxPolls ?? 30;
  const intervalMs = options.intervalMs ?? 10_000;

  for (let i = 0; i < maxPolls; i++) {
    const status = await getReportStatus(requestId, options.correlationId);
    if (status.requestStatus === "READY") return status;
    if (status.requestStatus === "FAILED") {
      throw new Error(`walmart_report_failed:${requestId}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`walmart_report_timeout:${requestId}`);
}

/**
 * Download report data (typically CSV). Walmart returns a signed URL valid for
 * a short time after the report is READY.
 */
export async function downloadReport(reportUrl: string): Promise<string> {
  const r = await fetch(reportUrl, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) {
    throw new Error(`walmart_report_download_failed:HTTP ${r.status}`);
  }
  return r.text();
}
