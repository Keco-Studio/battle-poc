/** User profile type matching keco-studio `profiles` table schema. */
export type UserProfile = {
  id: string
  email: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}
