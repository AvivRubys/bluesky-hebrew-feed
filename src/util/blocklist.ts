const blockedUsers = ["news-feed.bsky.social"]

export function isUserBlocked(user: string) {
  return blockedUsers.has(user)
}
