// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
  namespace App {
    interface User {
      id: number;
      email?: string | null;
      github_id?: string | null;
      github_username?: string | null;
      github_email?: string | null;
      github_access_token?: string | null;
      avatar_url?: string | null;
      gitea_username?: string | null;
      gitea_token?: string | null;
    }

    interface Locals {
      user: User | null;
      tenant?: any | null;
      isStudio?: boolean;
    }

    interface PageData {
      user?: User;
      tenants?: any[];
    }

    // interface Error {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
