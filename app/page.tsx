import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { defaultLocale } from "@/lib/i18n/config";

export default async function RootPage() {
  const cookieStore = await cookies();
  cookieStore.set("NEXT_LOCALE", defaultLocale, { path: "/" });
  redirect(`/${defaultLocale}`);
}
