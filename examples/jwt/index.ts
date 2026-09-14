import { app } from "./app.ts"

app.listen(3000, ({ url }) => {
  console.log(`JWT example running at ${url}`)
})
