import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://phrsradwrsjtzfwyaqut.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBocnNyYWR3cnNqdHpmd3lhcXV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNzA5NjgsImV4cCI6MjA5MTc0Njk2OH0.sPzrLde-iyPjool5meZkPDPVh-dONrZCZS57jRn-rvk'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export type Post = {
  id: string
  content: string
  likes: number
  dislikes: number
  created_at: string
}

export type Comment = {
  id: string
  post_id: string
  content: string
  created_at: string
}
