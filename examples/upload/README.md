# Upload Example

Multipart upload with in-memory storage (`memoryStorage()`).

Run:

```bash
node --experimental-strip-types examples/upload/index.ts
# or: npm run example:upload
```

Try it (field name must be `avatar`, max 1 file, max 2 MB):

```bash
curl -F avatar=@photo.png http://localhost:3000/upload
```
