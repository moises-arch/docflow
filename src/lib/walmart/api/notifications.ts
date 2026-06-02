// Walmart Notifications (Webhooks) API.
// Docs: https://developer.walmart.com/doc/us/mp/us-mp-notifications/

import { walmartRequest } from "@/lib/walmart/client";

export type WebhookSubscription = {
  subscriptionId: string;
  eventType: string;
  destinationUrl: string;
  status: string; // ACTIVE | PAUSED | DELETED
  createdDate?: string;
  modifiedDate?: string;
};

export async function listWebhookSubscriptions(
  correlationId?: string,
): Promise<{ subscriptions: WebhookSubscription[] }> {
  return walmartRequest({
    path: "/v3/notifications/subscriptions",
    correlationId,
  });
}

export async function subscribeWebhook(
  options: {
    eventType: "PO_CREATED" | "PO_CANCELLED" | "RETURN_INITIATED" | string;
    destinationUrl: string;
    correlationId?: string;
  },
): Promise<{ subscriptionId: string }> {
  return walmartRequest({
    method: "POST",
    path: "/v3/notifications/subscriptions",
    body: {
      eventType: options.eventType,
      destinationUrl: options.destinationUrl,
    },
    correlationId: options.correlationId,
  });
}

export async function unsubscribeWebhook(
  subscriptionId: string,
  correlationId?: string,
): Promise<void> {
  await walmartRequest({
    method: "DELETE",
    path: `/v3/notifications/subscriptions/${encodeURIComponent(subscriptionId)}`,
    correlationId,
  });
}
