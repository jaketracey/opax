#!/usr/bin/env bash
# scripts/vm/ec2.sh -- find, start, stop and log in to the opax-refresh EC2 instance from a laptop.
# Not used by the pipeline itself (it runs on the instance); a convenience for the person running it.
#
#   scripts/vm/ec2.sh ip                 # current public IP (it changes at every stop/start)
#   scripts/vm/ec2.sh status             # running / stopped / ...
#   scripts/vm/ec2.sh start              # start and wait until ssh answers
#   scripts/vm/ec2.sh start --maintenance   # ... then at once: touch hold + skip-nightly, stop the run
#   scripts/vm/ec2.sh release            # remove hold and skip-nightly (back to a normal night)
#   scripts/vm/ec2.sh stop               # stop the instance (the disk is kept)
#   scripts/vm/ec2.sh ssh [command...]   # ssh in (starts nothing)
#   scripts/vm/ec2.sh sshopts            # the -i/-o options, for SSH_OPTS="$(scripts/vm/ec2.sh sshopts)"
#
# It only ever names ONE instance (below). The AWS account is shared with unrelated instances:
# every call passes --instance-ids explicitly and there is no listing or wildcard. Credentials
# come from the usual AWS CLI configuration (AWS_PROFILE, default "default").
#
# Starting the instance starts opax-nightly.service (once enabled) because it runs at every boot.
# --maintenance is for when you only want to log in: it races the boot, so the run may have
# begun by the time the skip file lands; it stops the service to be sure (killing a run is
# safe: the next one resumes from its checkpoints).
set -euo pipefail

INSTANCE="${OPAX_EC2_INSTANCE:-i-0d725823966c827b9}"
REGION="${OPAX_EC2_REGION:-ap-southeast-2}"
KEY="${OPAX_EC2_KEY:-$HOME/.ssh/opax-refresh.pem}"
LOGIN="${OPAX_EC2_USER:-ubuntu}"
export AWS_PROFILE="${AWS_PROFILE:-default}"

aws_ec2() { aws ec2 "$@" --region "$REGION"; }
state() { aws_ec2 describe-instances --instance-ids "$INSTANCE" --query 'Reservations[0].Instances[0].State.Name' --output text; }
ip() {
  local v; v=$(aws_ec2 describe-instances --instance-ids "$INSTANCE" --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
  [ -n "$v" ] && [ "$v" != None ] || { echo "no public IP: the instance is $(state) (start it: $0 start)" >&2; return 1; }
  echo "$v"
}
sshopts() { echo "-i $KEY -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15"; }
# shellcheck disable=SC2046
vm_ssh() { ssh $(sshopts) "$LOGIN@$(ip)" "$@"; }

case "${1:-}" in
  ip) ip ;;
  status) state ;;
  start)
    aws_ec2 start-instances --instance-ids "$INSTANCE" --output text --query 'StartingInstances[0].CurrentState.Name'
    aws_ec2 wait instance-running --instance-ids "$INSTANCE"
    echo "running at $(ip); waiting for ssh..." >&2
    for _ in $(seq 1 40); do vm_ssh true 2>/dev/null && break; sleep 5; done
    if [ "${2:-}" = --maintenance ]; then
      vm_ssh 'mkdir -p ~/.config/opax && touch ~/.config/opax/hold ~/.config/opax/skip-nightly && sudo systemctl stop opax-nightly.service 2>/dev/null; echo "hold + skip-nightly set; nightly stopped if it had started"'
    fi
    ip ;;
  release) vm_ssh 'rm -f ~/.config/opax/hold ~/.config/opax/skip-nightly && echo "hold and skip-nightly removed"' ;;
  stop) aws_ec2 stop-instances --instance-ids "$INSTANCE" --output text --query 'StoppingInstances[0].CurrentState.Name' ;;
  ssh) shift; vm_ssh "$@" ;;
  sshopts) sshopts ;;
  *) sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; exit 64 ;;
esac
