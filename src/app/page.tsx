import { redirect } from "next/navigation";

// Root → redirect to default locale sign-in
// next-intl middleware handles locale detection
export default function RootPage() {
  redirect("/en/sign-in");
}
