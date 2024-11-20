import AtpAgent from "@atproto/api";
import { addMinutes, isAfter } from "date-fns";
import logger from "./logger";
import { Config } from "./config";

const FEED_BOT_DID = 'did:plc:ioo5uzicjxs5i6nfpjcxbugg'; // bot.avivr.dev
const SPAM_DIDS = [
    'did:plc:4hm6gb7dzobynqrpypif3dck', // news-feed.bsky.social
    'did:plc:aest7xbdwd7twym3pqhyihkf', // mokseoyoon.bsky.social
    'did:plc:6tyoa26a4isxgxujdnmzlttg', // mishavanmollusq.bsky.social
];
const FILTERED_USERS_BY_REQUEST_POST = 'at://did:plc:ioo5uzicjxs5i6nfpjcxbugg/app.bsky.feed.post/3lbf7z7lb6c2x'

export class FilteredUsersService {
    private readonly constantFilteredUsers: readonly string[];
    private filteredUsers: readonly string[] = [];
    private nextUpdateDueAt = new Date()

    constructor(private readonly bsky: AtpAgent, private readonly cfg: Config) {
        this.constantFilteredUsers = Array.isArray(cfg.FILTERED_USERS) ? cfg.FILTERED_USERS : []
        void this.updateFilteredUsers()
    }

    getFilteredUsers(): readonly string[] {
        if (isAfter(new Date(), this.nextUpdateDueAt)) {
            this.nextUpdateDueAt = addMinutes(new Date(), 30);
            void this.updateFilteredUsers();
        }

        return this.filteredUsers;
    }

    async updateFilteredUsers(): Promise<void> {
        try {
            const newFilteredUsers = await this.fetchFilteredUsers()
            this.filteredUsers = [...this.constantFilteredUsers, ...newFilteredUsers]
        } catch (err) {
            this.nextUpdateDueAt = addMinutes(new Date(), 1);
            logger.error("Error while fetching filtered users", { err })
        }
    }

    private async fetchFilteredUsers(): Promise<readonly string[]> {
        let cursor: string | undefined = undefined;

        const users: string[] = []
        do {
            const response = await this.bsky.getLikes({ uri: FILTERED_USERS_BY_REQUEST_POST })
            users.push(...response.data.likes.map(like => like.actor.did))
            cursor = response.data.cursor
        } while (cursor !== undefined)

        return users;
    }
}