import os, re, json, sys

raw = os.environ.get('SA_RAW', '').strip()
if not raw:
    print("ERROR: SA_RAW env var is empty", file=sys.stderr)
    sys.exit(1)

try:
    data = json.loads(raw)
    print("JSON parsed cleanly")
except json.JSONDecodeError as e:
    print(f"Raw JSON invalid ({e}), attempting private_key newline repair...")
    # iPad copy-paste turns \n escape sequences inside the private_key string
    # value into real newlines. Find the private_key field and collapse them back.
    fixed = re.sub(
        r'"private_key"\s*:\s*"(.*?)"(\s*[,}])',
        lambda m: '"private_key": "' + m.group(1).replace('\n', '\\n') + '"' + m.group(2),
        raw,
        flags=re.DOTALL
    )
    try:
        data = json.loads(fixed)
        print("Repaired successfully")
    except json.JSONDecodeError as e2:
        print(f"Repair failed: {e2}", file=sys.stderr)
        print(f"First 200 chars of raw: {repr(raw[:200])}", file=sys.stderr)
        sys.exit(1)

with open('/tmp/sa.json', 'w') as f:
    json.dump(data, f)
print("Wrote /tmp/sa.json OK")
