# Execution Model

For every matched request, Nelysia runs:

1. Route matching.
2. Request-local context creation.
3. Before-handle hooks in registration order.
4. The route handler unless a hook returned a response.
5. Response normalization.

An exception is converted to a 500 response by the adapter unless an application error handler is added. A hook that returns a response is an early response and prevents later hooks and the handler from running. Hook ordering and early responses are observable behavior.

The context is request-local. It must never be reused between requests.
