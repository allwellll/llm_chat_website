import { AuthorizedAccount } from '../types';
// Deliberately disabled: private chats and profiles never sync to a third party.
export const isSupabaseConfigured = false;
export const supabase = null;
export async function fetchSupabaseAuthorizedUsers(): Promise<AuthorizedAccount[] | null> { return null; }
export async function saveSupabaseAuthorizedUser(_account: AuthorizedAccount): Promise<boolean> { return false; }
export async function deleteSupabaseAuthorizedUser(_email: string): Promise<boolean> { return false; }
