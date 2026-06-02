import {
  Cable,
  Building2,
  Cloud,
  Calculator,
  Inbox,
  Receipt,
  ShoppingBag,
  Store,
  Package,
  type LucideIcon,
} from "lucide-react";

export type IntegrationStatus = "connected" | "available" | "coming-soon";
export type IntegrationCategory = "erp" | "ecommerce" | "marketplace" | "accounting" | "tools";
export type IntegrationTabId =
  | "overview"
  | "connection"
  | "sync"
  | "mappings"
  | "profiles"
  | "runs";

export type IntegrationAccent = "blue" | "teal" | "violet" | "amber" | "rose" | "slate";

export interface IntegrationDescriptor {
  id: string;
  slug: string;
  name: string;
  category: IntegrationCategory;
  status: IntegrationStatus;
  logoSrc: string;
  fallbackIcon: LucideIcon;
  accent: IntegrationAccent;
  tabs: IntegrationTabId[];
  docsUrl?: string;
}

const ODOO_TABS: IntegrationTabId[] = [
  "overview",
  "connection",
  "sync",
  "mappings",
  "profiles",
  "runs",
];
const COMING_SOON_TABS: IntegrationTabId[] = ["overview"];

export const INTEGRATIONS_REGISTRY: IntegrationDescriptor[] = [
  {
    id: "odoo",
    slug: "odoo",
    name: "Odoo",
    category: "erp",
    status: "available",
    logoSrc: "/integrations/odoo.svg",
    fallbackIcon: Cable,
    accent: "violet",
    tabs: ODOO_TABS,
    docsUrl: "https://www.odoo.com/documentation/19.0/",
  },
  {
    id: "email-inbound",
    slug: "email-inbound",
    name: "Email Inbound",
    category: "tools",
    status: "available",
    logoSrc: "/integrations/email-inbound.svg",
    fallbackIcon: Inbox,
    accent: "blue",
    tabs: ["overview"],
  },
  {
    id: "sap-business-one",
    slug: "sap-business-one",
    name: "SAP Business One",
    category: "erp",
    status: "coming-soon",
    logoSrc: "/integrations/sap-business-one.svg",
    fallbackIcon: Building2,
    accent: "blue",
    tabs: COMING_SOON_TABS,
  },
  {
    id: "netsuite",
    slug: "netsuite",
    name: "NetSuite",
    category: "erp",
    status: "coming-soon",
    logoSrc: "/integrations/netsuite.svg",
    fallbackIcon: Cloud,
    accent: "slate",
    tabs: COMING_SOON_TABS,
  },
  {
    id: "quickbooks",
    slug: "quickbooks",
    name: "QuickBooks",
    category: "accounting",
    status: "coming-soon",
    logoSrc: "/integrations/quickbooks.svg",
    fallbackIcon: Calculator,
    accent: "teal",
    tabs: COMING_SOON_TABS,
  },
  {
    id: "xero",
    slug: "xero",
    name: "Xero",
    category: "accounting",
    status: "coming-soon",
    logoSrc: "/integrations/xero.svg",
    fallbackIcon: Receipt,
    accent: "blue",
    tabs: COMING_SOON_TABS,
  },
  {
    id: "shopify",
    slug: "shopify",
    name: "Shopify",
    category: "ecommerce",
    status: "coming-soon",
    logoSrc: "/integrations/shopify.svg",
    fallbackIcon: ShoppingBag,
    accent: "teal",
    tabs: COMING_SOON_TABS,
  },
  {
    id: "tiendanube",
    slug: "tiendanube",
    name: "Tiendanube",
    category: "ecommerce",
    status: "coming-soon",
    logoSrc: "/integrations/tiendanube.svg",
    fallbackIcon: Store,
    accent: "blue",
    tabs: COMING_SOON_TABS,
  },
  {
    id: "mercadolibre",
    slug: "mercadolibre",
    name: "MercadoLibre",
    category: "marketplace",
    status: "coming-soon",
    logoSrc: "/integrations/mercadolibre.svg",
    fallbackIcon: Package,
    accent: "amber",
    tabs: COMING_SOON_TABS,
  },
];

export function getIntegrationBySlug(slug: string): IntegrationDescriptor | null {
  return INTEGRATIONS_REGISTRY.find((descriptor) => descriptor.slug === slug) ?? null;
}

export function getIntegrationsByCategory(
  category: IntegrationCategory | "all",
): IntegrationDescriptor[] {
  if (category === "all") return INTEGRATIONS_REGISTRY;
  return INTEGRATIONS_REGISTRY.filter((descriptor) => descriptor.category === category);
}

export const INTEGRATION_CATEGORIES: Array<IntegrationCategory | "all"> = [
  "all",
  "erp",
  "ecommerce",
  "marketplace",
  "accounting",
];
