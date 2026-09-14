import type { ReactNode } from "react"
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router"

export const Route = createRootRoute({ component: RootComponent })

function RootComponent() {
  return <html lang="en"><head><HeadContent /></head><body><Outlet /><Scripts /></body></html>
}

export function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return <>{children}</>
}
