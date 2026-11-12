#!/usr/bin/env python3
"""Control only the lane's private Unix-socket adb server; never shared 5037."""
import argparse
import json
from pathlib import Path
import socket


def process_start(pid):
    fields = Path(f'/proc/{pid}/stat').read_text().rsplit(') ', 1)[1].split()
    if fields[0] == 'Z':
        raise ProcessLookupError(pid)
    return fields[19]


def owner_socket(path):
    owner = json.loads(Path(path).read_text())
    if process_start(owner['pid']) != owner['start_ticks']:
        raise ProcessLookupError('Private adb PID identity changed')
    value = owner['socket']
    if not value.startswith('localfilesystem:/tmp/opax-adb-'):
        raise ValueError('Expected an owned private adb Unix socket')
    return value


def notify(value, port):
    if not value.startswith('localfilesystem:/tmp/opax-adb-'):
        raise ValueError('Refusing to notify a shared adb server')
    if not 1 <= port <= 65535:
        raise ValueError('Invalid assigned adbd port')
    command = f'host:emulator:{port}'.encode()
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as stream:
        stream.settimeout(2)
        stream.connect(value.removeprefix('localfilesystem:'))
        stream.sendall(f'{len(command):04x}'.encode() + command)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_subparsers(dest='action', required=True)
    write = action.add_parser('owner')
    write.add_argument('output', type=Path); write.add_argument('pid', type=int)
    write.add_argument('socket'); write.add_argument('serial')
    read = action.add_parser('socket'); read.add_argument('owner', type=Path)
    register = action.add_parser('notify')
    register.add_argument('socket'); register.add_argument('port', type=int)
    args = parser.parse_args()
    if args.action == 'owner':
        owner = {'pid': args.pid, 'start_ticks': process_start(args.pid),
                 'socket': args.socket, 'serial': args.serial}
        args.output.write_text(json.dumps(owner, indent=2) + '\n')
    elif args.action == 'socket':
        print(owner_socket(args.owner))
    else:
        notify(args.socket, args.port)
