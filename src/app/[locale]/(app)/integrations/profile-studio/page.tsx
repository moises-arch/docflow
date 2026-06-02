import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ locale: string }>;
}

/** Permanent redirect: /integrations/profile-studio → /templates/profile-studio */
export default async function ProfileStudioRedirect({ params }: Props) {
  const { locale } = await params;
  redirect(`/${locale}/templates/profile-studio`);
}
