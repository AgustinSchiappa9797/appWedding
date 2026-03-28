import { CONFIG } from '../config/constants.js';

export const supabaseClient = window.supabase.createClient(
  CONFIG.supabaseUrl,
  CONFIG.supabaseAnonKey,
);
