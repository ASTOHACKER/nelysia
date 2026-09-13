# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML/CSS with vanilla JavaScript (Zero build step, standalone client-side documentation portal).

## Users

TypeScript and JavaScript backend engineers, microservice developers, and fullstack architects building high-throughput APIs on Bun, Node.js 22+, Cloudflare Workers, and Vercel Edge who want Elysia-style fluent ergonomics without runtime bloat or Bun-only lock-in.

## Product Purpose

Nelysia is a compiler-first, high-throughput TypeScript backend framework. It translates fluent, chainable API route declarations into deterministic ahead-of-time compiled dispatch pipelines. The documentation website (docs/index.html) provides an authoritative, bilingual (English and Thai), comprehensive guide covering everything from quickstart to internal route compilation, schema validation, lifecycle hooks, and enterprise production patterns.

## Positioning

Unlike Elysia (which is Bun-first and has runtime JIT compilation overhead) or Express/Fastify (which require manual TypeScript glue and middleware ceremony), Nelysia delivers:
1. Faster than Elysia: +7.0% higher static throughput and +3.1% higher dynamic throughput on Bun in verified 10-round benchmarks.
2. Native Node 22+ Zero-Build: Native execution via Node --experimental-strip-types without ts-node, tsx, or esbuild bundlers.
3. Universal Web Standards: Operates across Bun, Node cluster, Cloudflare Workers, and Vercel Edge with unified Request/Response context.
4. Compiler-First Architecture: Pre-analyzes routes into deterministic arrays and O(1) radix lookups, eliminating regex backtracking and middleware waterfall costs.

## Operating Context

The documentation website (docs/index.html) is accessed by engineers evaluating frameworks, onboarding to Nelysia, or looking up exact API signatures and hook execution sequences. The page must be fast, readable under varying lighting conditions, scan-friendly, keyboard accessible, and readable in both English and Thai.

## Capabilities and Constraints

- Single-file standalone HTML distribution: all CSS and JS embedded or CDN-linked with zero local bundler requirement.
- Full bilingual fidelity: instant client-side switching between English and Thai (data-lang=en / data-lang=th).
- Keyboard-accessible search filter with instant jump to section.
- High visual craft: strict contrast >= 4.5:1, generous hierarchy, refined obsidian/slate dark theme, authentic SVG icons, and mac-style code chrome.

## Brand Commitments

- Brand Name: Nelysia
- Tagline: Compiler-First TypeScript Backend Framework for Bun, Node.js, and Web Standards.
- Voice: Authoritative, direct, engineering-grade, precise, respectful, and free of vague marketing hype.

## Evidence on Hand

- Verified 10-round benchmark results comparing Bun native, Nelysia, Elysia, Fastify, and Express across static and dynamic routes.
- Full test suite passing across Node 22+ and Bun.
- Production modules in packages/* including @narudom96/nelysia, @narudom96/nelysia/client, @narudom96/nelysia/openapi, @narudom96/nelysia/observability.

## Product Principles

1. **Crafted for Comprehension (Read Mode)**: Every concept is explained with concrete code examples, typed signatures, and explicit execution flows.
2. **Deterministic & Fast**: Clean, zero-latency static rendering, smooth transitions, and instant search.
3. **No Slop, True System**: Clean obsidian palette with subtle borders, refined typography, and purposeful micro-interactions.
