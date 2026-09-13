# TechEmpower Benchmark Submission for Nelysia

This directory contains the production-grade, self-contained files for submitting **Nelysia** to the official [TechEmpower FrameworkBenchmarks](https://github.com/TechEmpower/FrameworkBenchmarks) repository.

---

## 📁 Submission Bundle Structure

```text
frameworks/TypeScript/nelysia/
├── benchmark_config.json   # TechEmpower test definitions (Plaintext & JSON)
├── Dockerfile              # Production Docker image using oven/bun:1.4.0
├── package.json            # Framework package manifest
├── server.ts               # Nelysia entrypoint using compiled Bun handler
└── packages/               # Self-contained Nelysia framework core & compiler
```

---

## How to Submit to TechEmpower (Step-by-Step)

### Step 1: Generate the Bundle
Run the bundle generator script from the Nelysia root directory:

```bash
npm run benchmark:teb:bundle
```

This compiles and validates all files into `dist-techempower/nelysia/`.

---

### Step 2: Fork and Clone TechEmpower Repository

```bash
# 1. Fork https://github.com/TechEmpower/FrameworkBenchmarks on GitHub
# 2. Clone your forked repository:
git clone https://github.com/<your-username>/FrameworkBenchmarks.git
cd FrameworkBenchmarks
```

---

### Step 3: Copy Nelysia into the Framework Directory

```bash
# Create the target framework folder
mkdir -p frameworks/TypeScript/nelysia

# Copy the generated bundle from Nelysia repo
cp -r /path/to/Nelysia/dist-techempower/nelysia/* frameworks/TypeScript/nelysia/
```

---

### Step 4: Test Locally with TechEmpower Toolset (Optional)

If you have Docker and Python installed, you can test locally using the official TechEmpower `tfb` tool:

```bash
./tfb --mode verify --test nelysia
```

---

### Step 5: Commit and Open a Pull Request

```bash
git checkout -b add-nelysia-framework
git add frameworks/TypeScript/nelysia
git commit -m "Add Nelysia (TypeScript/Bun) framework"
git push origin add-nelysia-framework
```

Then open a Pull Request to `TechEmpower/FrameworkBenchmarks:master`.

Once merged by the TechEmpower maintainers:
- Nelysia will run automatically in the next Continuous Run on physical hardware.
- Results will be visible on the official [TechEmpower Benchmarks](https://www.techempower.com/benchmarks/) dashboard!
