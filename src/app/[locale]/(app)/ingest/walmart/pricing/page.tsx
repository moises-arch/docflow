// Pricing tab — fetches live from API since dataset is small.
import { PricingClient } from "./pricing-client";

export const dynamic = "force-dynamic";

export default function PricingPage() {
  return <PricingClient />;
}
