import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/app/components/AppShell";

interface Props {
  params: Promise<{ userId: string }>;
}

export default async function UserWorkspace({ params }: Props) {
  const { userId: currentUserId } = await auth();
  const { userId } = await params;
  if (currentUserId !== userId) redirect("/");
  return <AppShell namespace={userId} />;
}
