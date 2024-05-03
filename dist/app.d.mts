import { MessageHandler, RedisClient, DB, HubSubscriber, HubEventStreamConsumer } from '@farcaster/shuttle';

declare class App implements MessageHandler {
    private readonly db;
    private hubSubscriber;
    private streamConsumer;
    redis: RedisClient;
    private readonly hubId;
    constructor(db: DB, redis: RedisClient, hubSubscriber: HubSubscriber, streamConsumer: HubEventStreamConsumer);
    static create(dbUrl: string, redisUrl: string, hubUrl: string, hubSSL?: boolean): App;
    handleMessageMerge(): Promise<void>;
    startStream(): Promise<void>;
    reconcileFids(fids: number[]): Promise<void>;
    ensureMigrations(): Promise<void>;
    backfill(): Promise<void>;
    private processHubEvent;
    stop(): Promise<void>;
}

export { App };
