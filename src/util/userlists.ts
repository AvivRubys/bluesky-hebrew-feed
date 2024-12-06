const FEED_BOT_DID = 'did:plc:ioo5uzicjxs5i6nfpjcxbugg'; // bot.avivr.dev

const SPAM = [
  'did:plc:aest7xbdwd7twym3pqhyihkf', // mokseoyoon.bsky.social
  'did:plc:6tyoa26a4isxgxujdnmzlttg', // mishavanmollusq.bsky.social
  'did:plc:4hm6gb7dzobynqrpypif3dck', // news-feed.bsky.social
  'did:plc:l6fkbpyc72a5mmoh4jwxuw2r', // shedim.org
  'did:plc:4xi4clnyqn2z7hnu6mtlwf7q', // newsil.bsky.social
];

const TWITTER_REPOSTERS = [
  'did:plc:54jnwvnp7arbuh65i7ulg6gh', // yinonmagal1.bsky.social
  'did:plc:bktiotjbtrqnijcbmpqxzrdo', // abunur.bsky.social - idan landau
];

export const FILTERED_USERS = [FEED_BOT_DID, ...SPAM, ...TWITTER_REPOSTERS];
