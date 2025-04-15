# ATProto Hebrew Feed Generator

This is a hebrew feed generator for bluesky, based on the [Feed Generator Template](https://github.com/bluesky-social/feed-generator).
# Contributing
* Fork the project
* Install dependencies - run `yarn`
* Setup a postgres database on your machine.
* Create a `.env` file with the following variables:
    * a postgres connection string
    * your own DID, you can find this at https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=<your_handle>.bsky.social
    entering your account handle in the url
    * your own username and password to bluesky
    * Subscription endpoint as shown in the example `.env`

    optionally [more configuration options](https://github.com/AvivRubys/bluesky-hebrew-feed/blob/main/src/config.ts#L9) if you like.

* Run the server with `yarn dev`, and it will be available on `localhost:3000` (or a different host/port if you changed that configuration)

Example `.env`
```
FEEDGEN_SUBSCRIPTION_ENDPOINT="wss://bsky.network"
POSTGRES_CONNECTION_STRING=postgres://<username>:<password>@<hostname>:<port>/<database_name>?sslmode=disable
FEEDGEN_PUBLISHER_DID=did:plc:abcd...
BLUESKY_CLIENT_LOGIN_IDENTIFIER=username (for bluesky)
BLUESKY_CLIENT_LOGIN_PASSWORD=password (for bluesky)
```
## Debugging
The feeds can be accessed through this url - `http://localhost:3000/xrpc/app.bsky.feed.getFeedSkeleton?feed=at://YOUR_DID_HERE/app.bsky.feed.generator/FEED_NAME` (replace YOUR_DID_HERE with the DID you configured in the .env file, and FEED_NAME with [one of the feed names](https://github.com/AvivRubys/bluesky-hebrew-feed/blob/321caee2b38b2e7cb53a744522d3b4d084d2c807/src/algos.ts#L124-L129))

You'll end up getting a list with a lot of AtUris that look something like `at://did:plc:uk3v7guqqyvoqzbscgx55tnf/app.bsky.feed.post/3k2gaekme732b`.

I suggest bookmarking this script which will help convert AtUris into web bsky urls - `javascript:void(open(prompt("Enter AtUri").replace('at://', 'https://bsky.app/profile/').replace("app.bsky.feed.post", "post")))`
