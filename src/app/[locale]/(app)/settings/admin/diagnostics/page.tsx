import { requireSettingsAccess } from "../../_lib";
import { DiagnosticsTerminal } from "../../diagnostics/diagnostics-terminal";

export default async function AdminDiagnosticsPage() {
  await requireSettingsAccess();
  return <DiagnosticsTerminal />;
}
