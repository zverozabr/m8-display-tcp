#!/bin/bash
# M8 Direct Serial Control
# Usage: m8-direct.sh <command> [args]

PORT="/dev/ttyACM0"

# Key bitmasks
KEY_EDIT=0x01
KEY_OPT=0x02
KEY_RIGHT=0x04
KEY_START=0x08
KEY_SHIFT=0x10
KEY_DOWN=0x20
KEY_UP=0x40
KEY_LEFT=0x80

# Send raw bitmask
send_raw() {
    printf '\x43%b' "\\x$(printf '%02x' $1)" > "$PORT"
}

# Press and release key
press() {
    local mask=$1
    local hold_ms=${2:-50}
    send_raw $mask
    sleep $(echo "scale=3; $hold_ms/1000" | bc)
    send_raw 0
}

# Hold key (no release)
hold() {
    send_raw $1
}

# Release all
release() {
    send_raw 0
}

# Combo: hold + press
combo() {
    local hold_mask=$1
    local press_mask=$2
    local hold_ms=${3:-50}

    send_raw $hold_mask
    sleep 0.02
    send_raw $((hold_mask | press_mask))
    sleep $(echo "scale=3; $hold_ms/1000" | bc)
    send_raw $hold_mask
    sleep 0.02
    send_raw 0
}

# Named key press
key() {
    case "$1" in
        up)    press $KEY_UP $2 ;;
        down)  press $KEY_DOWN $2 ;;
        left)  press $KEY_LEFT $2 ;;
        right) press $KEY_RIGHT $2 ;;
        edit)  press $KEY_EDIT $2 ;;
        opt)   press $KEY_OPT $2 ;;
        shift) press $KEY_SHIFT $2 ;;
        start) press $KEY_START $2 ;;
        *) echo "Unknown key: $1" >&2; return 1 ;;
    esac
}

# Main command handler
case "$1" in
    raw)    send_raw $2 ;;
    press)  press $2 $3 ;;
    hold)   hold $2 ;;
    release) release ;;
    combo)  combo $2 $3 $4 ;;
    key)    key $2 $3 ;;
    up|down|left|right|edit|opt|shift|start)
        key $1 $2 ;;
    *)
        echo "M8 Direct Serial Control"
        echo "Usage: $0 <command> [args]"
        echo ""
        echo "Commands:"
        echo "  up/down/left/right [holdMs]  - Direction keys"
        echo "  edit/opt/shift/start [holdMs] - Function keys"
        echo "  raw <bitmask>                - Send raw bitmask"
        echo "  hold <bitmask>               - Hold keys down"
        echo "  release                      - Release all keys"
        echo "  combo <hold> <press> [holdMs] - Key combo"
        echo ""
        echo "Bitmasks: edit=1, opt=2, right=4, start=8, shift=16, down=32, up=64, left=128"
        ;;
esac
