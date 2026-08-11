package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strings"

	comatproto "github.com/bluesky-social/indigo/api/atproto"
	"github.com/bluesky-social/indigo/atproto/data"
	"github.com/bluesky-social/indigo/atproto/syntax"
	"github.com/bluesky-social/indigo/events"
	"github.com/bluesky-social/indigo/events/schedulers/parallel"
	lexutil "github.com/bluesky-social/indigo/lex/util"
	"github.com/bluesky-social/indigo/repo"
	"github.com/bluesky-social/indigo/repomgr"
	"github.com/gorilla/websocket"
	"github.com/pemistahl/lingua-go"
)

func main() {
	cursor := flag.Int("cursor", 0, "cursor to start from")

	ctx := context.Background()

	dialer := websocket.DefaultDialer
	relayHost := os.Getenv("FEEDGEN_SUBSCRIPTION_ENDPOINT")
	if relayHost == "" {
		relayHost = "wss://bsky.network"
	}
	u, err := url.Parse(relayHost)
	if err != nil {
		log.Panic("invalid relay host", relayHost)
	}
	u.Path = "xrpc/com.atproto.sync.subscribeRepos"
	fmt.Println(u)

	if cursor != nil {
		u.RawQuery = fmt.Sprintf("cursor=%d", *cursor)
	}
	con, _, err := dialer.Dial(u.String(), http.Header{})
	if err != nil {
		log.Panic(fmt.Errorf("subscribing to firehose failed (dialing): %w", err))
	}

	rsc := &events.RepoStreamCallbacks{
		RepoCommit: func(evt *comatproto.SyncSubscribeRepos_Commit) error {
			slog.Debug("commit event", "did", evt.Repo, "seq", evt.Seq)
			return handleCommitEvent(ctx, evt)
		},
	}

	scheduler := parallel.NewScheduler(
		1,
		100,
		relayHost,
		rsc.EventHandler,
	)
	slog.Info("starting firehose consumer", "relayHost", relayHost)
	if err := events.HandleRepoStream(ctx, con, scheduler); err != nil {
		log.Panic("stream died unexpectedly")
	}
}

func handleCommitEvent(ctx context.Context, evt *comatproto.SyncSubscribeRepos_Commit) error {
	logger := slog.With("event", "commit", "did", evt.Repo, "rev", evt.Rev, "seq", evt.Seq)

	if evt.TooBig {
		logger.Warn("skipping tooBig events for now")
		return nil
	}

	rr, err := repo.ReadRepoFromCar(ctx, bytes.NewReader(evt.Blocks))
	if err != nil {
		logger.Error("failed to read repo from car", "err", err)
		return nil
	}

	for _, op := range evt.Ops {
		collection, rkey, err := splitRepoPath(op.Path)
		if err != nil {
			logger.Error("invalid path in repo op", "eventKind", op.Action, "path", op.Path)
			return nil
		}
		logger = logger.With("eventKind", op.Action, "collection", collection, "rkey", rkey)

		ek := repomgr.EventKind(op.Action)
		if ek != repomgr.EvtKindCreateRecord {
			continue
		}

		if collection != "app.bsky.feed.post" {
			continue
		}

		out := make(map[string]interface{})
		out["seq"] = evt.Seq
		out["rev"] = evt.Rev
		out["time"] = evt.Time
		out["rkey"] = rkey

		// read the record bytes from blocks, and verify CID
		rc, recCBOR, err := rr.GetRecordBytes(ctx, op.Path)
		if err != nil {
			logger.Error("reading record from event blocks (CAR)", "err", err)
			break
		}
		if op.Cid == nil || lexutil.LexLink(rc) != *op.Cid {
			logger.Error("mismatch between commit op CID and record block", "recordCID", rc, "opCID", op.Cid)
			break
		}

		d, err := data.UnmarshalCBOR(*recCBOR)
		if err != nil {
			slog.Warn("failed to parse record CBOR")
			continue
		}

		if d["reply"] != nil {
			// skipping replies for now
			continue
		}

		detector := lingua.NewLanguageDetectorBuilder().FromAllLanguages().Build()

		str, ok := d["text"].(string)
		if !ok {
			log.Panic("this should never happen")
		}
		if language, exists := detector.DetectLanguageOf(str); !exists || language != lingua.Hebrew {
			continue
		}

		out["cid"] = op.Cid.String()
		out["text"] = d["text"]
		b, err := json.Marshal(out)
		if err != nil {
			return err
		}
		fmt.Println(string(b))
	}
	return nil
}

func splitRepoPath(path string) (syntax.NSID, syntax.RecordKey, error) {
	parts := strings.SplitN(path, "/", 3)
	if len(parts) != 2 {
		return "", "", fmt.Errorf("invalid record path: %s", path)
	}
	collection, err := syntax.ParseNSID(parts[0])
	if err != nil {
		return "", "", err
	}
	rkey, err := syntax.ParseRecordKey(parts[1])
	if err != nil {
		return "", "", err
	}
	return collection, rkey, nil
}
