/**
 * M8 Audio Capture - libusb isochronous audio to stdout
 * Based on m8c/src/backends/audio_libusb.c
 * Compile: gcc -o m8-audio-capture m8-audio-capture.c -lusb-1.0
 */

#include <libusb-1.0/libusb.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <unistd.h>

#define VID 0x16c0
#define PID_MODEL02 0x048a
#define PID_HEADLESS 0x048b

#define EP_ISO_IN 0x85
#define IFACE_NUM 4
#define ALT_SETTING 1

#define NUM_TRANSFERS 64
#define PACKET_SIZE 180
#define NUM_PACKETS 2

static libusb_device_handle *devh = NULL;
static struct libusb_transfer *xfr[NUM_TRANSFERS];
static volatile int running = 1;

static void signal_handler(int sig) {
    (void)sig;
    running = 0;
}

static void cb_xfr(struct libusb_transfer *transfer) {
    if (!running) return;

    for (int i = 0; i < transfer->num_iso_packets; i++) {
        struct libusb_iso_packet_descriptor *pack = &transfer->iso_packet_desc[i];

        if (pack->status == LIBUSB_TRANSFER_COMPLETED && pack->actual_length > 0) {
            const unsigned char *data = libusb_get_iso_packet_buffer_simple(transfer, i);
            // Write raw PCM to stdout
            fwrite(data, 1, pack->actual_length, stdout);
            fflush(stdout);
        }
    }

    // Resubmit transfer
    if (running) {
        if (libusb_submit_transfer(transfer) < 0) {
            running = 0;
        }
    }
}

int main(void) {
    int rc;

    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);
    signal(SIGPIPE, SIG_IGN);

    // Initialize libusb
    rc = libusb_init(NULL);
    if (rc < 0) {
        fprintf(stderr, "libusb_init failed: %s\n", libusb_error_name(rc));
        return 1;
    }

    // Find M8 device
    devh = libusb_open_device_with_vid_pid(NULL, VID, PID_MODEL02);
    if (!devh) {
        devh = libusb_open_device_with_vid_pid(NULL, VID, PID_HEADLESS);
    }
    if (!devh) {
        fprintf(stderr, "M8 device not found (VID:PID 16c0:048a/048b)\n");
        libusb_exit(NULL);
        return 1;
    }

    fprintf(stderr, "M8 audio capture started\n");

    // Detach kernel driver if active
    if (libusb_kernel_driver_active(devh, IFACE_NUM) == 1) {
        rc = libusb_detach_kernel_driver(devh, IFACE_NUM);
        if (rc < 0) {
            fprintf(stderr, "Failed to detach kernel driver: %s\n", libusb_error_name(rc));
            goto cleanup;
        }
    }

    // Claim interface
    rc = libusb_claim_interface(devh, IFACE_NUM);
    if (rc < 0) {
        fprintf(stderr, "Failed to claim interface: %s\n", libusb_error_name(rc));
        goto cleanup;
    }

    // Set alt setting for audio streaming
    rc = libusb_set_interface_alt_setting(devh, IFACE_NUM, ALT_SETTING);
    if (rc < 0) {
        fprintf(stderr, "Failed to set alt setting: %s\n", libusb_error_name(rc));
        goto release;
    }

    // Allocate and submit transfers
    for (int i = 0; i < NUM_TRANSFERS; i++) {
        xfr[i] = libusb_alloc_transfer(NUM_PACKETS);
        if (!xfr[i]) {
            fprintf(stderr, "Failed to allocate transfer\n");
            goto cancel;
        }

        unsigned char *buffer = malloc(PACKET_SIZE * NUM_PACKETS);
        if (!buffer) {
            fprintf(stderr, "Failed to allocate buffer\n");
            goto cancel;
        }

        libusb_fill_iso_transfer(xfr[i], devh, EP_ISO_IN, buffer,
                                  PACKET_SIZE * NUM_PACKETS, NUM_PACKETS,
                                  cb_xfr, NULL, 0);
        libusb_set_iso_packet_lengths(xfr[i], PACKET_SIZE);

        rc = libusb_submit_transfer(xfr[i]);
        if (rc < 0) {
            fprintf(stderr, "Failed to submit transfer: %s\n", libusb_error_name(rc));
            free(buffer);
            goto cancel;
        }
    }

    fprintf(stderr, "Streaming audio to stdout (S16_LE, 44100Hz, stereo)\n");

    // Event loop
    while (running) {
        rc = libusb_handle_events(NULL);
        if (rc < 0 && rc != LIBUSB_ERROR_INTERRUPTED) {
            fprintf(stderr, "Event handling error: %s\n", libusb_error_name(rc));
            break;
        }
    }

cancel:
    for (int i = 0; i < NUM_TRANSFERS; i++) {
        if (xfr[i]) {
            libusb_cancel_transfer(xfr[i]);
            // Wait for cancellation (simplified)
            libusb_handle_events(NULL);
            if (xfr[i]->buffer) free(xfr[i]->buffer);
            libusb_free_transfer(xfr[i]);
        }
    }

release:
    libusb_release_interface(devh, IFACE_NUM);

cleanup:
    libusb_close(devh);
    libusb_exit(NULL);

    fprintf(stderr, "M8 audio capture stopped\n");
    return 0;
}
