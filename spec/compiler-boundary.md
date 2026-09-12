# Compiler Boundary

The first compiler operates on a registered `RouteGraph`, not arbitrary source code. This avoids importing user modules for side effects during build.

Analysis is conservative:

- known route metadata is specialized;
- opaque handler and hook functions are retained;
- unknown behavior falls back to the reference execution path;
- optimization metadata must explain why a route was or was not specialized.

Compiled execution is valid only when its observable result matches reference execution. Differential tests are required for every compiler pass.
