import { app } from "./app.ts"

app.listen(3000, ({ url }) => {
  console.log(`Upload example running at ${url}`)
})
