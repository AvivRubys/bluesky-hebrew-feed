const NEWS_FEED_DID = 'did:plc:4hm6gb7dzobynqrpypif3dck'; // news-feed.bsky.social
const FEED_BOT_DID = 'did:plc:ioo5uzicjxs5i6nfpjcxbugg'; // bot.avivr.dev
const SPAM = [
  'did:plc:aest7xbdwd7twym3pqhyihkf', // mokseoyoon.bsky.social/
  'did:plc:pp5hocntnuobn3hsvsevwl7b', // matanmazor.bsky.social TEMP messing with createdAt until I fix that
];
export const FILTERED_USERS = [NEWS_FEED_DID, FEED_BOT_DID, ...SPAM];
