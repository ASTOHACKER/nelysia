import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({ plugins: [tanstackStart(), TanStackRouterVite(), react()] })
