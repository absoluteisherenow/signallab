// Browser-side supabase client — re-exports the shared client from ./supabase.
// Kept as a separate module so imports can distinguish browser vs server usage.
export { supabase } from './supabase'
