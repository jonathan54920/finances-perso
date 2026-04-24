import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kybmucfoklggzvkxbqye.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5Ym11Y2Zva2xnZ3p2a3hicXllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5ODI3MDQsImV4cCI6MjA5MjU1ODcwNH0.YZhyn6T8S2O8GQ4CnpRiJxFm6s5hKRFdVzaiIJzcyiw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
