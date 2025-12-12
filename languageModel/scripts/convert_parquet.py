import pyarrow.parquet as pq
import string

# Path to your downloaded parquet shard
parquet_path = "/Users/andrew/Downloads/train-00000-of-00035-740989fcf50600a6.parquet"

table = pq.read_table(parquet_path)
print("Columns:", table.column_names)

TEXT_COL = "text"  # change this if needed

col_names = table.column_names
if TEXT_COL not in col_names:
    raise SystemExit(f"Column {TEXT_COL!r} not found. Available: {col_names}")

texts = table.column(TEXT_COL).to_pylist()

out_path = "newCorpus.txt"

# Characters available on a standard US keyboard
allowed_chars = set(
    string.ascii_letters +  # A-Z, a-z
    string.digits +         # 0-9
    string.punctuation +    # !"#$%&'()*+,-./:;<=>?@[\]^_`{|}~
    " "                     # space
)

MAX_BYTES = 20 * 1024 * 1024  # ~20 MB

with open(out_path, "w", encoding="utf-8") as f:
    kept = 0
    skipped = 0
    bytes_written = 0

    for t in texts:
        if t is None:
            continue

        # Stop if we've hit the size limit
        if bytes_written >= MAX_BYTES:
            break

        # Skip lines that contain any non-ASCII character
        if any(ord(c) >= 128 for c in t):
            skipped += 1
            continue

        # Flatten newlines to spaces
        t = t.replace("\n", " ")

        # Remove any character not on an American keyboard
        t = "".join(ch for ch in t if ch in allowed_chars)

        # Collapse extraneous whitespace (multiple spaces -> single space)
        t = " ".join(t.split())

        # Skip empty lines after cleaning
        if not t:
            continue

        # How many bytes this line will add (ASCII -> 1 byte per char + newline)
        line_bytes = len(t) + 1

        # If adding this line would exceed the limit by a lot, stop
        # (You said "10 MB or so", so it's okay if we go a bit over,
        # but this keeps us from doubling it with one giant line.)
        if bytes_written + line_bytes > MAX_BYTES and bytes_written > 0:
            break

        f.write(t + "\n")
        bytes_written += line_bytes
        kept += 1

print(
    f"Wrote {kept} cleaned lines to {out_path} "
    f"({bytes_written} bytes, ~{bytes_written / (1024*1024):.2f} MB). "
    f"Skipped {skipped} lines with non-ASCII chars."
)
