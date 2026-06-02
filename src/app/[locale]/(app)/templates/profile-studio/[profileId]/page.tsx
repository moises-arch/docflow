import { redirect } from "next/navigation";

export default async function ProfileIndexPage({
  params,
}: {
  params: Promise<{ profileId: string; locale: string }>;
}) {
  const { profileId, locale } = await params;
  redirect(`/${locale}/templates/profile-studio/${profileId}/configuration`);
}
