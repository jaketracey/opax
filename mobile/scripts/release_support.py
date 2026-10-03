"""Local release support: credentials stay in memory; command logs are redacted."""
import json
import os
from pathlib import Path
import re
import stat
import subprocess


PRIVATE_NAMES = ("ASC_KEY_PATH", "ASC_KEY_ID", "ASC_ISSUER_ID", "APPLE_TEAM_ID")
KEY_BEGIN = "-----BEGIN " + "PRIVATE KEY-----"
KEY_END = "-----END " + "PRIVATE KEY-----"


class ReleaseError(Exception):
    pass


def load_credentials():
    env_file = Path.home() / ".config/opax/asc.env"
    if not env_file.is_file() or stat.S_IMODE(env_file.stat().st_mode) != 0o600:
        raise ReleaseError("The local ASC environment file must exist with mode 600.")
    # Source shell syntax without exposing the file or its values on stdout.
    result = subprocess.run(
        ["bash", "-c", 'set +x; set -a; source "$1" >/dev/null 2>&1 || exit; '
         'python3 -c \'import json,os; print(json.dumps(dict(os.environ)))\'',
         "bash", str(env_file)], capture_output=True, text=True,
    )
    if result.returncode:
        raise ReleaseError("Could not source the local ASC environment file.")
    values = json.loads(result.stdout)
    for name in (*PRIVATE_NAMES, "OPAX_BUNDLE_ID"):
        if not values.get(name):
            raise ReleaseError(f"Missing credential variable: {name}.")
    if values["OPAX_BUNDLE_ID"] != "au.com.opax.app":
        raise ReleaseError("OPAX_BUNDLE_ID must identify the OPAX app.")
    key = Path(values["ASC_KEY_PATH"]).expanduser()
    if not key.is_file():
        raise ReleaseError("ASC_KEY_PATH must identify a readable API key.")
    os.environ.update({name: values[name] for name in (*PRIVATE_NAMES, "OPAX_BUNDLE_ID")})
    if values.get("OPAX_INTERNAL_TESTER_EMAIL"):
        os.environ["OPAX_INTERNAL_TESTER_EMAIL"] = values["OPAX_INTERNAL_TESTER_EMAIL"]
    return values


def redact(text):
    for name in (*PRIVATE_NAMES, "OPAX_BUILD_GATE", "OPAX_SIM_GATE", "OPAX_PASTEBOARD_LOCK"):
        value = os.environ.get(name)
        if value:
            text = text.replace(value, f"[{name} redacted]")
    return re.sub(re.escape(KEY_BEGIN) + r".*?" + re.escape(KEY_END),
                  "[private key redacted]", text, flags=re.S)


def run_logged(command, log, *, public_env=False):
    env = os.environ.copy()
    if public_env:
        for name in (*PRIVATE_NAMES, "OPAX_BUNDLE_ID", "OPAX_INTERNAL_TESTER_EMAIL", "OPAX_BUILD_GATE", "OPAX_SIM_GATE",
                     "OPAX_CAPACITY_CMD", "OPAX_PASTEBOARD_LOCK", "OPAX_ALLOWED_UDIDS"):
            env.pop(name, None)
        for name in list(env):
            if name.startswith("EXPO_PUBLIC_"):
                env.pop(name)
    with Path(log).open("w") as stream:
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                   text=True, errors="replace", env=env)
        inside_key = False
        for line in process.stdout:
            if KEY_BEGIN in line:
                inside_key = True
                stream.write("[private key redacted]\n")
            if inside_key:
                if KEY_END in line:
                    inside_key = False
                continue
            stream.write(redact(line))
        process.stdout.close()
        code = process.wait()
    if code:
        raise ReleaseError(f"Command failed (exit {code}); inspect the redacted log: {log}")


def run_step(step, log):
    if step not in {"dependencies", "prebuild", "archive", "export", "upload"}:
        raise ReleaseError("Unknown release step.")
    cmd = ["bash", "scripts/release-step.sh", step]
    gate = os.environ.get("OPAX_BUILD_GATE")
    if gate and step != "upload":
        cmd = ["bash", gate, "opax-release", *cmd]
    elif step != "upload":
        print("No OPAX_BUILD_GATE configured; running release step directly.")
    run_logged(cmd, log, public_env=True)


def private_values():
    values = {name: os.environ[name] for name in PRIVATE_NAMES}
    key = Path(os.environ["ASC_KEY_PATH"]).expanduser().read_text()
    values["API_PRIVATE_KEY"] = key
    for index, line in enumerate(key.splitlines()):
        if len(line) >= 40 and not line.startswith("-----"):
            values[f"API_PRIVATE_KEY_FRAGMENT_{index}"] = line
    return values


def matches(body, value):
    return any(value.encode(encoding) in body for encoding in ("utf-8", "utf-16-le", "utf-16-be"))


def scan_tracked(root):
    names = subprocess.check_output(["git", "ls-files", "-z"], cwd=root).decode().split("\0")
    for name in filter(None, names):
        path = Path(root) / name
        if not path.is_file():
            continue
        body = path.read_bytes()
        for variable, value in private_values().items():
            if matches(body, value):
                raise ReleaseError(f"Tracked-file privacy scan failed: {name} ({variable}).")
    print("PASS tracked files: no credential path, key ID, issuer ID or team ID")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--log")
    parser.add_argument("--public-env", action="store_true")
    parser.add_argument("--scan-tracked")
    parser.add_argument("--step")
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    try:
        load_credentials()
        if args.scan_tracked:
            scan_tracked(args.scan_tracked)
        elif args.step:
            if not args.log:
                parser.error("--step requires --log")
            run_step(args.step, args.log)
        else:
            command = args.command[1:] if args.command[:1] == ["--"] else args.command
            if not args.log or not command:
                parser.error("--log and a command are required")
            run_logged(command, args.log, public_env=args.public_env)
    except (ReleaseError, OSError, ValueError) as error:
        raise SystemExit(redact(str(error)))
