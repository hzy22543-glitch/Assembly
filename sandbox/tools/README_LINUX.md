# Linux Server Deployment Guide (Tencent Cloud / Docker)

To run the backend on a Linux server (e.g., Ubuntu/CentOS), you need the Linux versions of the build tools.

## 1. Install Tools

You need to place two executable files in this `sandbox/tools/` directory:
1.  `jwasm` (Linux binary)
2.  `wlink` (Linux binary)

### Download Links (Examples)

**JWasm:**
- GitHub: https://github.com/JWasm/JWasm/releases
- Download the Linux binary (e.g., `jwasm_linux`) and rename it to `jwasm`.
- Ensure it is executable: `chmod +x jwasm`

**Open Watcom (WLink):**
- You can use the `wlink` from Open Watcom v2.
- GitHub: https://github.com/open-watcom/open-watcom-v2/releases
- Download the Linux release, extract `bin/wlink` (or `binl/wlink`).
- Rename/Copy to `sandbox/tools/wlink`.
- Ensure it is executable: `chmod +x wlink`

## 2. Verify

Run in terminal:
```bash
cd sandbox/tools
./jwasm -?
./wlink -?
```

## 3. Run Service

```bash
# Install dependencies
python -m pip install -r sandbox/requirements.txt

# Start API
python sandbox/api_endpoint.py
```
