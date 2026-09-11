import { redirect } from "@sveltejs/kit";
import { defaultLocale } from "$lib/i18n/config";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.tenant) {
    return {
      isTenant: true,
      tenant: locals.tenant,
    };
  }
  redirect(307, `/${defaultLocale}`);
};
