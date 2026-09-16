# Node Cluster Example

`server.ts` demonstrates the Node clustered adapter and graceful worker
shutdown. It is a Node-only deployment example; import `serveClustered` from
`@narudom96/nelysia/runtime-node-cluster`:

```bash
PORT=4321 WORKERS=2 node --experimental-strip-types examples/cluster/server.ts
```

`PORT` defaults to `4321`, `WORKERS` defaults to `1`. Cluster behavior is
covered by the Node integration suite.
