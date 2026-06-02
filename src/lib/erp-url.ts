// Base URL del ERP externo. Configurable vía NEXT_PUBLIC_ERP_BASE_URL.
// Se usa para construir enlaces directos a las órdenes de venta en el ERP.
export const ERP_BASE_URL =
  process.env.NEXT_PUBLIC_ERP_BASE_URL ?? "https://erp.example.com";
